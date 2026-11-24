#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo 'Usage: scripts/pack-reproducible.sh <destination>' >&2
  exit 2
fi

destination="$(mkdir -p "$1" && cd "$1" && pwd)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for pass in first second; do
  cd "$repo_root"
  bun run build
  mkdir "$work/$pass"
  npm pack --ignore-scripts --silent --pack-destination "$work/$pass" >/dev/null
done

# Keep this JavaScript literal single-quoted for shell safety.
# shellcheck disable=SC2016
filename="$(node -e 'const p=require(process.argv[1]); console.log(`${p.name.replace(/^@/, "").replace("/", "-")}-${p.version}.tgz`)' "$repo_root/package.json")"
cmp "$work/first/$filename" "$work/second/$filename"
install -m 644 "$work/first/$filename" "$destination/$filename"
sha256sum "$destination/$filename"
