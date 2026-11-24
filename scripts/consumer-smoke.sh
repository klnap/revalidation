#!/usr/bin/env bash
# Installs the packed tarball and tests Payload plus a Next.js production cache.
# Usage: scripts/consumer-smoke.sh <path-to-tarball>
set -euo pipefail
tarball="$(realpath "$1")"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
}
trap cleanup EXIT
cd "$work"
cat > package.json <<'JSON'
{ "name": "consumer-smoke", "private": true, "type": "module" }
JSON
npm install --no-audit --no-fund \
  "$tarball" "payload@$payload_version" "@payloadcms/db-sqlite@$sqlite_version" "next@$next_version" \
  react@19.3.1 react-dom@19.3.1 graphql@16.15.0 >/dev/null
cat > smoke.mjs <<'JS'
import assert from 'node:assert/strict'
import { createPipeline } from '@klnap/revalidation'
import { POST, defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next'
import { http } from '@klnap/revalidation/dispatchers/http'
import { revalidation } from '@klnap/revalidation/producers/payload'
import { payloadRevalidationSource } from '@klnap/revalidation/sources/payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, getPayload } from 'payload'

assert.equal(typeof createPipeline, 'function')
assert.equal(typeof POST, 'function')
assert.equal(typeof defineRevalidation, 'function')
assert.equal(typeof http, 'function')
assert.equal(typeof payloadRevalidationSource, 'function')

// Quick start declarations from the packed package: tag strings match the events they invalidate.
const { tags } = defineRevalidation({
  secret: 'smoke-secret',
  tags: { page: '[locale]:page:[slug]', siteSettings: '[locale]:site-settings' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (t) => ({ pages: [t.page], 'site-settings': [t.siteSettings] }),
})
assert.equal(tags.page({ locale: 'en', slug: 'about' }), 'en:page:about')
assert.equal(tags.siteSettings({ locale: 'en' }), 'en:site-settings')
assert.throws(() => tags.page({ locale: 'en' }), /missing param\(s\): slug/)

const dispatches = []
const dispatcher = {
  async dispatch(input) {
    dispatches.push(input)
    return { status: 'accepted' }
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
printf '{"target":"old-target","other":"old-other"}' > "$work/data.json"
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
