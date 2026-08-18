#!/usr/bin/env bash
# Phase 10b live proof: rate-limit 429 · Redis idempotent replay · AI usage 429 · queue round-trip.
# Run from repo root with the API up. For the 429 proofs start the API with low limits:
#   AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY=2 RATE_LIMIT_MAX_UNAUTH=3 pnpm --filter @edrion/api dev
# Requires AUTH_DEV_HEADER=true (owner via x-employee-email).
set -u
API="${API:-http://localhost:3007/v1}"
DB="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
H=(-H 'x-employee-email: owner@edrion.dev')
INST="$(psql "$DB" -t -A -c "select id from institutions order by created_at limit 1")"
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

redis-cli --scan --pattern 'ai:*'    | xargs -r redis-cli del >/dev/null 2>&1
redis-cli --scan --pattern 'rl:ip:*' | xargs -r redis-cli del >/dev/null 2>&1

echo "== 1. Rate limit 429 (public /auth/login keyed by IP) =="
n429=0
for i in 1 2 3 4 5 6 7 8; do
  c=$(code -X POST "$API/auth/login" -H 'content-type: application/json' -d '{}')
  [ "$c" = "429" ] && n429=$((n429+1))
done
chk "burst of 8 -> at least one 429" "$([ "$n429" -ge 1 ] && echo yes || echo no)" yes

echo "== 2. Redis-fronted idempotency replay =="
psql "$DB" -c "update platform_employees set last_auth_at=now() where email='owner@edrion.dev'" >/dev/null
KEY="idem-smoke-$(date +%s)"
BODY="{\"institutionId\":\"$INST\",\"amountMinor\":500,\"reason\":\"10b idempotency proof\"}"
idjson(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).id||"")}catch{console.log("")}})'; }
ID1=$(curl -s "${H[@]}" -H 'content-type: application/json' -H "idempotency-key: $KEY" -X POST "$API/billing/credits" -d "$BODY" | idjson)
ID2=$(curl -s "${H[@]}" -H 'content-type: application/json' -H "idempotency-key: $KEY" -X POST "$API/billing/credits" -d "$BODY" | idjson)
chk "replay returns the same credit id" "$([ -n "$ID1" ] && [ "$ID1" = "$ID2" ] && echo same || echo diff)" same
chk "Redis cache key present" "$(redis-cli exists "idem:res:$KEY")" 1

echo "== 3. AI usage limit (start API with AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY=2) =="
B='{"prompt":"check status","context":{}}'
code "${H[@]}" -H 'content-type: application/json' -X POST "$API/copilot/runs" -d "$B" >/dev/null
code "${H[@]}" -H 'content-type: application/json' -X POST "$API/copilot/runs" -d "$B" >/dev/null
c3=$(code "${H[@]}" -H 'content-type: application/json' -X POST "$API/copilot/runs" -d "$B")
chk "3rd AI run over daily limit -> 429" "$c3" 429

echo "== 4. Background queue round-trip (BullMQ) =="
chk "system.ping processed by worker" "$(node scripts/queue-proof.mjs 2>/dev/null)" JOB_OK

echo; echo "RESULT: $pass passed, $fail failed"; exit $fail
