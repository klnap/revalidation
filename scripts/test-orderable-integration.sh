#!/usr/bin/env bash
set -euo pipefail

orderable_dir="${PAYLOAD_ORDERABLE_PACKAGE_DIR:?Set PAYLOAD_ORDERABLE_PACKAGE_DIR to the actual payload-orderable package directory}"
if [[ ! -f "$orderable_dir/scripts/with-ephemeral-postgres.mjs" ]]; then
  echo "No PostgreSQL test harness found in $orderable_dir" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bun "$orderable_dir/scripts/with-ephemeral-postgres.mjs" \
  "$orderable_dir/scripts/ephemeral-postgres.config.mjs" \
  -- env PAYLOAD_ORDERABLE_PACKAGE_DIR="$orderable_dir" \
  bun test "$repo_root/tests/integration/orderable-revalidation.int.test.ts" \
  --max-concurrency 1 --timeout 120000
