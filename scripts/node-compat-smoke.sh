#!/usr/bin/env bash
set -euo pipefail
tarball="$(realpath "$1")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
printf '{"name":"node-compat-smoke","private":true,"type":"module"}' > package.json
npm install --no-audit --no-fund "$tarball" >/dev/null
node --input-type=module <<'JS'
import assert from 'node:assert/strict'
import { createPipeline } from '@klnap/revalidation'
import { http } from '@klnap/revalidation/dispatchers'

assert.equal(typeof createPipeline, 'function')
assert.equal(typeof http, 'function')
console.log(`core package smoke passed on Node ${process.version}`)
JS
