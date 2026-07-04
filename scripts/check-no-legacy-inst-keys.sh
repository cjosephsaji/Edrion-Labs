#!/usr/bin/env bash
# Phase 0 gate: the legacy `inst.*` permission keys must never reappear outside the
# consolidation migration and the schema spec that asserts they are rejected.
set -euo pipefail
cd "$(dirname "$0")/.."

hits=$(grep -rn "'inst\." apps packages --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules \
  | grep -v "packages/database/migrations/" \
  | grep -v "packages/schemas/src/institution-users.spec.ts" || true)

if [[ -n "$hits" ]]; then
  echo "FAIL: legacy inst.* permission keys found:"
  echo "$hits"
  exit 1
fi
echo "OK: no legacy inst.* permission keys."
