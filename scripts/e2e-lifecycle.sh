#!/usr/bin/env bash
# Phase 10g — full-lifecycle e2e against a live API + DB.
#
# Walks the audited cross-portal story end to end and asserts the correlated audit trail:
#   create institution → start support-access session → enter portal → in-portal audited
#   action (stamped with the session id) → end session → suspend a seeded active institution.
#
# The plan-change, feature-config and AI-confirm audited paths are exercised by their vitest
# suites (subscriptions / feature-controls / copilot *.spec.ts); this script proves the live,
# server-side audit-correlation that ties platform-side and portal-side activity together —
# the platform's core differentiator.
#
# Run from repo root with the API up (AUTH_DEV_HEADER=true) and Postgres seeded.
set -u
API="${API:-http://localhost:3001/v1}"
DB="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
EMAIL="${EMPLOYEE_EMAIL:-owner@edrion.dev}"
H=(-H "x-employee-email: $EMAIL" -H 'Content-Type: application/json')
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
chkge(){ if [ "${2:-0}" -ge "$3" ]; then echo "  PASS  $1 ($2>=$3)"; pass=$((pass+1)); else echo "  FAIL  $1 expected>=$3 got=$2"; fail=$((fail+1)); fi; }
jget(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
freshauth(){ psql "$DB" -tAc "update platform_employees set last_auth_at=now() where email='$EMAIL'" >/dev/null; }

echo "== step 1: identity =="
ME=$(curl -s "${H[@]}" "$API/auth/me")
chk "authenticated as owner" "$(echo "$ME" | jget "['email']")" "$EMAIL"

echo "== step 2: create institution (audited) =="
freshauth
INST=$(curl -s "${H[@]}" -X POST "$API/institutions" \
  -d '{"legalName":"E2E Test School","displayName":"E2E Test","type":"school","country":"US","primaryContact":{"name":"Pat E2E","email":"pat@e2e.test"}}')
IID=$(echo "$INST" | jget "['id']")
IVER=$(echo "$INST" | jget "['version']")
chk "institution created as lead" "$(echo "$INST" | jget "['status']")" "lead"
chk "institution.create audit row" \
  "$(psql "$DB" -tAc "select count(*) from audit_events where action='institution.create' and institution_id='$IID'")" "1"

echo "== step 3: start support-access session (sensitive → recent auth) =="
freshauth
SESS=$(curl -s "${H[@]}" -X POST "$API/support-access/start" \
  -d "{\"institutionId\":\"$IID\",\"reason\":\"e2e lifecycle walkthrough\",\"durationMinutes\":30}")
SID=$(echo "$SESS" | jget "['id']")
chk "session started" "$([ -n "$SID" ] && echo yes || echo no)" "yes"

echo "== step 4: enter portal =="
curl -s "${H[@]}" -X POST "$API/support-access/$SID/portal-entered" -o /dev/null
chk "portal-entered audit row" \
  "$(psql "$DB" -tAc "select count(*) from audit_events where action='support_access.portal_entered' and support_session_id='$SID'")" "1"

echo "== step 5: in-portal action correlates to the session =="
freshauth
curl -s "${H[@]}" -H "x-support-session-id: $SID" -X PATCH "$API/institutions/$IID" \
  -d "{\"internalNotes\":\"touched during support session\",\"version\":$IVER}" -o /dev/null
chk "institution.update stamped with support_session_id" \
  "$(psql "$DB" -tAc "select count(*) from audit_events where action='institution.update' and institution_id='$IID' and support_session_id='$SID'")" "1"

echo "== step 6: end session =="
curl -s "${H[@]}" -X POST "$API/support-access/$SID/end" -d '{"reason":"e2e walkthrough done"}' -o /dev/null
chk "session-ended audit row" \
  "$(psql "$DB" -tAc "select count(*) from audit_events where action='support_access.ended' and support_session_id='$SID'")" "1"

echo "== step 7: suspend + restore a seeded active institution (audited status workflow) =="
freshauth
ROW=$(psql "$DB" -tAc "select id||'|'||version from institutions where status='active' and id <> '$IID' limit 1")
SUID="${ROW%%|*}"; SUVER="${ROW##*|}"
if [ -n "$SUID" ]; then
  curl -s "${H[@]}" -X POST "$API/institutions/$SUID/suspend" -d "{\"reason\":\"e2e suspend step\",\"version\":$SUVER}" -o /dev/null
  chkge "institution.suspend audit row" \
    "$(psql "$DB" -tAc "select count(*) from audit_events where action='institution.suspend' and institution_id='$SUID'")" "1"
  # Restore via the audited activate path so re-runs stay green.
  freshauth
  NEWVER=$(psql "$DB" -tAc "select version from institutions where id='$SUID'")
  curl -s "${H[@]}" -X POST "$API/institutions/$SUID/activate" -d "{\"reason\":\"e2e restore\",\"version\":$NEWVER}" -o /dev/null
  chk "institution restored to active" \
    "$(psql "$DB" -tAc "select status from institutions where id='$SUID'")" "active"
else
  echo "  SKIP  no seeded active institution available"
fi

echo "== correlated audit trail for the new institution =="
psql "$DB" -c "select action, (support_session_id is not null) as in_session, result
               from audit_events where institution_id='$IID' order by occurred_at"

echo
echo "NOTE: plan-change, feature-config and AI-confirm audited paths are covered by"
echo "      subscriptions / feature-controls / copilot *.spec.ts (vitest)."
echo
echo "RESULT: $pass passed, $fail failed"
exit "$fail"
