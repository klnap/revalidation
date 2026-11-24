#!/usr/bin/env bash
# Installs the packed tarball into an empty project and runs Payload against it.
# Usage: scripts/consumer-smoke.sh <path-to-tarball>
set -euo pipefail
tarball="$(realpath "$1")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
cat > package.json <<'JSON'
{ "name": "consumer-smoke", "private": true, "type": "module" }
JSON
npm install --no-audit --no-fund \
  "$tarball" payload@3.94.1 @payloadcms/db-sqlite@3.94.1 next@16.4.6 \
  react@19.3.1 react-dom@19.3.1 graphql@16 >/dev/null
cat > smoke.mjs <<'JS'
import assert from 'node:assert/strict'
import { createPipeline } from '@klnap/revalidation'
import { POST, defineRevalidation } from '@klnap/revalidation/consumers/next'
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
  db: sqliteAdapter({ client: { url: 'file:./smoke.db' }, push: true }),
  collections: [
    {
      slug: 'articles',
      custom: { revalidation: { identifier: 'slug' } },
      fields: [{ name: 'slug', type: 'text', required: true }],
    },
  ],
})
const payload = await getPayload({ config })
await payload.create({ collection: 'articles', data: { slug: 'hello' } })
for (let i = 0; i < 100 && dispatches.length === 0; i++) await new Promise((r) => setTimeout(r, 50))
assert.ok(dispatches.length > 0, 'producer dispatched an event')
await payload.destroy()
console.log('consumer smoke OK')
process.exit(0)
JS
node smoke.mjs
