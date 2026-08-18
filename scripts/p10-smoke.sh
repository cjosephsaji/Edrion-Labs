#!/usr/bin/env bash
# Phase 10 consolidated smoke runner.
#
# Runs every Phase-10 live proof in sequence against a running API + Postgres (+ Redis):
#   auth · redis · jobs · observability · RLS · 10f modules · full-lifecycle e2e.
# Each sub-script exits non-zero on failure; this aggregates them into one verdict.
#
# Prereqs: `pnpm --filter @edrion/api dev` up on :3007 with AUTH_DEV_HEADER=true, Postgres
# seeded, Redis running with QUEUE_WORKERS_ENABLED=true.
#
# Note on redis-smoke: two of its checks (request-rate 429, AI-run daily cap) only trip when the
# API was BOOTED with low caps (RATE_LIMIT_MAX / AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY). With the
# default production-ish caps in .env they stay green only under a low-cap boot; the guards
# themselves are covered by rate-limit.guard.spec.ts + ai-usage-limiter.service.spec.ts. This
# runner flags those two as env-gated rather than failing the whole run for them.
set -u
cd "$(dirname "$0")/.."
DB="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
hardfail=0
declare -a SUMMARY

run(){ # name, command...
  local name="$1"; shift
  echo; echo "######## $name ########"
  if "$@"; then SUMMARY+=("OK    $name"); else SUMMARY+=("FAIL  $name"); hardfail=$((hardfail+1)); fi
}

# redis-smoke: tolerate ONLY the two documented env-gated checks.
run_redis(){
  echo; echo "######## redis ########"
  local out; out=$(bash scripts/redis-smoke.sh 2>&1); echo "$out"
  local fails; fails=$(echo "$out" | grep -c '^  FAIL')
  local envgated; envgated=$(echo "$out" | grep -cE 'at least one 429|over daily limit')
  if [ "$fails" -eq 0 ]; then
    SUMMARY+=("OK    redis")
  elif [ "$fails" -eq "$envgated" ]; then
    SUMMARY+=("OK*   redis ($fails env-gated checks need a low-cap API boot; guards unit-tested)")
  else
    SUMMARY+=("FAIL  redis"); hardfail=$((hardfail+1))
  fi
}

run       "auth"          bash scripts/auth-smoke.sh
run_redis
run       "jobs"          bash scripts/jobs-smoke.sh
run       "observability" bash scripts/observability-smoke.sh
run       "rls"           psql "$DB" -f scripts/rls-proof.sql
run       "modules (10f)" bash scripts/modules-smoke.sh
run       "e2e lifecycle" bash scripts/e2e-lifecycle.sh

echo; echo "================ P10 SMOKE SUMMARY ================"
for line in "${SUMMARY[@]}"; do echo "  $line"; done
echo "=================================================="
echo "Hard failures: $hardfail"
exit "$hardfail"
