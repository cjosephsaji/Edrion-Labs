#!/usr/bin/env bash
# Phase 10d proof: a request's correlation id is echoed in the response AND a client render crash
# reported to /v1/observability/client-error produces a correlated structured log + error capture.
# Run from repo root with the API up; pass the API log path so the script can grep it:
#   API_LOG=/path/to/api.log bash scripts/observability-smoke.sh
set -u
API="${API:-http://localhost:3001/v1}"
LOG="${API_LOG:-}"
CORR="corr-proof-$(date +%s)"
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }

echo "== correlation id echoed in response =="
ECHO=$(curl -s -D - -o /dev/null -H "x-correlation-id: $CORR" "$API/health" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-correlation-id"{print $2}')
chk "x-correlation-id round-trips" "$ECHO" "$CORR"

echo "== client render crash captured + correlated =="
st=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/observability/client-error" \
  -H 'content-type: application/json' -H "x-correlation-id: $CORR" \
  -d '{"message":"TypeError: render crash","url":"http://localhost:3000/x"}')
chk "client-error accepted" "$st" 204

if [ -n "$LOG" ] && [ -f "$LOG" ]; then
  sleep 1
  chk "structured client.render_error logged with correlation id" \
    "$(grep "$CORR" "$LOG" | grep -c client.render_error)" 1
  chk "error captured to reporter sink" \
    "$(grep "$CORR" "$LOG" | grep -c message.captured)" 1
else
  echo "  (set API_LOG to also assert the log lines)"
fi

echo; echo "RESULT: $pass passed, $fail failed"; exit $fail
