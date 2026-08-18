#!/usr/bin/env bash
# Phase 10f module proofs — employees, platform-roles, independent-users, support-cases,
# integrations/webhooks — against a live API + DB. Re-runnable (unique fixtures per run).
# Run from repo root with the API up (AUTH_DEV_HEADER=true) and Postgres seeded.
#
# Note: JSON bodies are built as single-quote-concatenated variables and passed as -d "$BODY".
# A literal {"a":1,"b":2} inline can be word-split in some shells; a variable value never is.
set -u
API="${API:-http://localhost:3007/v1}"
DB="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
EMAIL="${EMPLOYEE_EMAIL:-owner@edrion.dev}"
H=(-H "x-employee-email: $EMAIL" -H 'Content-Type: application/json')
TS=$(date +%s)
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
chkge(){ if [ "${2:-0}" -ge "$3" ]; then echo "  PASS  $1 ($2>=$3)"; pass=$((pass+1)); else echo "  FAIL  $1 expected>=$3 got=$2"; fail=$((fail+1)); fi; }
jget(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
jlen(){ python3 -c "import sys,json;print(len(json.load(sys.stdin)$1))" 2>/dev/null; }
post(){ curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X POST "$1" -d "$2"; }
get(){ curl -s "${H[@]}" "$1"; }
stale(){ psql "$DB" -tAc "update platform_employees set last_auth_at=now()-interval '1 hour' where email='$EMAIL'" >/dev/null; }
fresh(){ psql "$DB" -tAc "update platform_employees set last_auth_at=now() where email='$EMAIL'" >/dev/null; }

echo "== employees =="
stale
chk "create blocked by stale recent-auth" "$(post "$API/employees" '{"email":"smoke'"$TS"'@edrion.dev","fullName":"Smoke"}')" "403"
fresh
EID=$(curl -s "${H[@]}" -X POST "$API/employees" -d '{"email":"smoke'"$TS"'@edrion.dev","fullName":"Smoke '"$TS"'","title":"QA"}' | jget "['id']")
chk "employee created" "$([ -n "$EID" ] && echo yes || echo no)" "yes"
ROLEID=$(get "$API/platform-roles" | python3 -c "import sys,json;print(next(r['id'] for r in json.load(sys.stdin)['items'] if r['key']=='read_only_auditor'))")
ASSIGN='{"roleIds":["'"$ROLEID"'"],"reason":"smoke assign role"}'
chk "assign role" "$(post "$API/employees/$EID/roles" "$ASSIGN")" "201"
chk "role visible on detail" "$(get "$API/employees/$EID" | jget "['roles'][0]['key']")" "read_only_auditor"
chk "disable" "$(post "$API/employees/$EID/disable" '{"reason":"smoke disable employee","version":0}')" "201"
ME=$(get "$API/auth/me" | jget "['employeeId']")
chk "cannot disable self" "$(post "$API/employees/$ME/disable" '{"reason":"smoke self disable guard","version":0}')" "409"
chkge "employees audit rows" "$(psql "$DB" -tAc "select count(*) from audit_events where module='employees'")" "3"

echo "== platform-roles =="
chkge "roles listed" "$(get "$API/platform-roles" | jlen "['items']")" "5"
chkge "permission catalogue exposed" "$(get "$API/platform-roles/permissions" | jlen "['items']")" "10"

echo "== independent-users =="
IU=$(get "$API/independent-users?pageSize=1" | python3 -c "import sys,json;d=json.load(sys.stdin);i=d['items'];print((i[0]['id']+'|'+str(i[0]['version'])) if i else '')")
if [ -n "$IU" ]; then
  IUID="${IU%%|*}"; IUVER="${IU##*|}"
  chk "disable independent user" "$(post "$API/independent-users/$IUID/disable" '{"reason":"smoke disable iu","version":'"$IUVER"'}')" "201"
  chk "restore independent user" "$(post "$API/independent-users/$IUID/restore" '{"reason":"smoke restore iu","version":'"$((IUVER+1))"'}')" "201"
else
  echo "  SKIP  no independent users seeded"
fi

echo "== support-cases =="
CID=$(curl -s "${H[@]}" -X POST "$API/support-cases" -d '{"subject":"Smoke case '"$TS"'","category":"technical","priority":"normal","body":"opening note"}' | jget "['id']")
chk "support case created" "$([ -n "$CID" ] && echo yes || echo no)" "yes"
chk "add message" "$(post "$API/support-cases/$CID/messages" '{"body":"internal note","internal":true}')" "201"
chk "change status" "$(post "$API/support-cases/$CID/status" '{"status":"resolved","reason":"smoke resolve"}')" "201"
chkge "messages on detail" "$(get "$API/support-cases/$CID" | jlen "['messages']")" "2"

echo "== integrations / webhooks =="
stale
chk "create endpoint blocked by stale recent-auth" "$(post "$API/integrations" '{"url":"http://127.0.0.1:9/sink","events":["invoice.paid"]}')" "403"
fresh
EP=$(curl -s "${H[@]}" -X POST "$API/integrations" -d '{"url":"http://127.0.0.1:9/sink","events":["invoice.paid"],"description":"smoke '"$TS"'"}')
EPID=$(echo "$EP" | jget "['id']")
chk "endpoint created" "$([ -n "$EPID" ] && echo yes || echo no)" "yes"
chk "full secret returned once on create" "$(echo "$EP" | jget "['secret'][:6]")" "whsec_"
chk "secret redacted in list" "$(get "$API/integrations?pageSize=100" | python3 -c "import sys,json;print(any('secret' in e for e in json.load(sys.stdin)['items']))")" "False"
post "$API/integrations/$EPID/test" '{}' >/dev/null
N=0
for i in $(seq 1 15); do
  N=$(psql "$DB" -tAc "select count(*) from webhook_deliveries where endpoint_id='$EPID'")
  [ "$N" -ge 1 ] && break; sleep 1
done
chkge "signed delivery recorded by worker" "$N" "1"
NEWSECRET=$(curl -s "${H[@]}" -X POST "$API/integrations/$EPID/rotate-secret" -d '{"reason":"smoke rotate secret","version":0}' | jget "['secret'][:6]")
chk "rotate secret returns a new secret once" "$NEWSECRET" "whsec_"
BLOCKED=$(psql "$DB" -tAc "update webhook_deliveries set status='pending' where endpoint_id='$EPID'" 2>&1 | grep -c "append-only")
chk "webhook_deliveries is append-only" "$BLOCKED" "1"

echo
echo "RESULT: $pass passed, $fail failed"
exit "$fail"
