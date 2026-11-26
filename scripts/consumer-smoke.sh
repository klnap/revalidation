#!/usr/bin/env bash
# Installs the packed tarball and tests Payload plus a Next.js production cache.
# Usage: scripts/consumer-smoke.sh [path-to-tarball]
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pack_work=''
if [[ -n "${1:-}" ]]; then
  tarball="$(realpath "$1")"
else
  pack_work="$(mktemp -d)"
  (cd "$repo_root" && npm pack --pack-destination "$pack_work" --silent >/dev/null)
  tarball="$pack_work/$(node -p "require('$repo_root/package.json').name.replace('@','').replace('/','-')")-$(node -p "require('$repo_root/package.json').version").tgz"
fi
next_version="${NEXT_VERSION:-$(node -e 'console.log(require(process.argv[1]).devDependencies.next)' "$repo_root/package.json")}"
payload_version="$(node -e 'console.log(require(process.argv[1]).devDependencies.payload)' "$repo_root/package.json")"
sqlite_version="$(node -e "console.log(require(process.argv[1]).devDependencies['@payloadcms/db-sqlite'])" "$repo_root/package.json")"
work="$(mktemp -d)"
next_pid=''
export NODE_ENV=test
cleanup() {
  if [[ -n "$next_pid" ]]; then
    kill "$next_pid" 2>/dev/null || true
    wait "$next_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
  if [[ -n "$pack_work" ]]; then rm -rf "$pack_work"; fi
}
trap cleanup EXIT
cd "$work"
mkdir -p "$work/minimal"
cd "$work/minimal"
cat > package.json <<'JSON'
{ "name": "consumer-smoke-minimal", "private": true, "type": "module" }
JSON
npm install --no-audit --no-fund "$tarball" >/dev/null
cat > minimal-smoke.mjs <<'JS'
import assert from 'node:assert/strict'
import * as core from '@klnap/revalidation'
import { http } from '@klnap/revalidation/dispatchers/http'
import { payloadSchema } from '@klnap/revalidation/sources/payload'

assert.equal(typeof core, 'object')
assert.equal(typeof http, 'function')
assert.equal(typeof payloadSchema['~standard'].validate, 'function')
assert.equal(await import('next/cache.js').then(() => true, () => false), false)
assert.equal(await import('payload').then(() => true, () => false), false)
console.log('optional peer isolation OK')
JS
node minimal-smoke.mjs
cd "$work"
cat > package.json <<'JSON'
{ "name": "consumer-smoke", "private": true, "type": "module" }
JSON
npm install --no-audit --no-fund \
  "$tarball" "payload@$payload_version" "@payloadcms/db-sqlite@$sqlite_version" "next@$next_version" \
  react@19.3.1 react-dom@19.3.1 graphql@16.15.0 >/dev/null
cp "$repo_root/tests/fixtures/consumer/consumer.mts" "$work/consumer.mts"
cp "$repo_root/tests/fixtures/consumer/runtime.mjs" "$work/runtime.mjs"
cat > "$work/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["consumer.mts"]
}
JSON
"$repo_root/node_modules/.bin/tsc" --project "$work/tsconfig.json"
node "$work/runtime.mjs"
cat > smoke.mjs <<'JS'
import assert from 'node:assert/strict'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { http } from '@klnap/revalidation/dispatchers/http'
import { revalidation } from '@klnap/revalidation/producers/payload'
import { payloadSchema, payloadSource } from '@klnap/revalidation/sources/payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, getPayload } from 'payload'

assert.equal(typeof defineRevalidation, 'function')
assert.equal(typeof http, 'function')
assert.equal(typeof payloadSchema['~standard'].validate, 'function')
assert.equal(payloadSource, 'urn:klnap:revalidation:payload')

const secret = `whsec_${Buffer.from('smoke-secret').toString('base64')}`
const { tags, POST } = defineRevalidation({
  secret,
  sources: { [payloadSource]: payloadSchema },
  tags: { page: '[locale]:page:[slug]' },
  paths: { page: '/[locale]/[slug]' },
  rules: ({ tags, paths, on }) => [
    on({ source: payloadSource }, ({ affected }) => ({
      tags: affected.flatMap(({ resource }) =>
        resource.locale && resource.slug
          ? [tags.page({ locale: resource.locale, slug: resource.slug })]
          : [],
      ),
      paths: affected.flatMap(({ resource }) =>
        resource.locale && resource.slug
          ? [paths.page({ locale: resource.locale, slug: resource.slug })]
          : [],
      ),
    })),
  ],
})
assert.equal(typeof POST, 'function')
assert.equal(tags.page({ locale: 'en', slug: 'about' }), 'en:page:about')
assert.throws(() => tags.page({ locale: 'en' }), /missing param\(s\): slug/)

const dispatches = []
const dispatcher = {
  async dispatch(input) {
    dispatches.push(input)
    return { status: 'accepted', results: [] }
  },
}
const config = await buildConfig({
  secret: 's',
  plugins: [revalidation({ dispatcher })],
  db: sqliteAdapter({
    client: { url: `file:${process.cwd()}/smoke.db` },
    push: true,
  }),
  typescript: { autoGenerate: false },
  collections: [
    {
      slug: 'articles',
      custom: { revalidation: { identifier: 'slug' } },
      fields: [{ name: 'slug', type: 'text', required: true }],
    },
  ],
})
const payload = await getPayload({ config, key: process.cwd() })
await payload.create({ collection: 'articles', data: { slug: 'hello' } })
for (let i = 0; i < 100 && dispatches.length === 0; i++) await new Promise((r) => setTimeout(r, 50))
assert.ok(dispatches.length > 0, 'producer dispatched an event')
await payload.destroy()
console.log('consumer smoke OK')
JS
node smoke.mjs

# Build and exercise the installed package inside a real Next.js production runtime.
cp -R "$repo_root/tests/fixtures/next-production/." "$work/"
printf '{"target":"old-target","other":"old-other","stale":"old-stale"}' > "$work/data.json"
export NODE_ENV=production
export DATA_FILE="$work/data.json"
if ! ./node_modules/.bin/next build --webpack >"$work/next-build.log" 2>&1; then
  cat "$work/next-build.log"
  exit 1
fi
port="$(node --input-type=module -e "
  import { createServer } from 'node:net'
  const server = createServer()
  server.listen(0, '127.0.0.1', () => {
    console.log(server.address().port)
    server.close()
  })
")"
./node_modules/.bin/next start --hostname 127.0.0.1 -p "$port" >"$work/next-start.log" 2>&1 &
next_pid=$!
ready=false
for ((attempt = 0; attempt < 100; attempt += 1)); do
  if node --input-type=module -e "
    fetch('http://127.0.0.1:$port/api/data?key=target', {
      signal: AbortSignal.timeout(1000),
    })
      .then((response) => process.exit(response.ok ? 0 : 1))
      .catch(() => process.exit(1))
  " >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  cat "$work/next-start.log"
  exit 1
fi
node "$repo_root/tests/fixtures/next-production/verify.mjs" "$port"
