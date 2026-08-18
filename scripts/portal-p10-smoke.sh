#!/usr/bin/env bash
# Phase 10 (Institution Portal — Copilot) live smoke.
#
# Proves, against the running API + seeded portal users, that the guardrailed AI Copilot is real and
# the portal's boundary discipline holds for an agent/tool-calling surface (not a CRUD directory):
#   1. permission gating  — every endpoint is gated by `ai.use`; a user WITHOUT it -> 403 on the runs
#      log. A user WITH `ai.use` can start runs.
#   2. read-only auto-run  — a search/analysis tool resolves ALLOW and executes immediately (no
#      confirmation), exactly within the user's own permissions.
#   3. confirmation lifecycle — a state-changing tool (draft an announcement) resolves
#      NEEDS_CONFIRMATION, lands the run in awaiting_confirmation and executes NOTHING until the human
#      confirms; confirm -> the real audited announcements service runs and the row appears.
#   4. reject  — a prepared run can be rejected (terminal, nothing runs).
#   5. publish flow — a second mutating tool (publish an existing draft) goes awaiting -> confirm -> the
#      publish->notify bridge fires via the real service.
#   6. in-AI permission boundary — a user with `ai.use` but NOT `announcements.send` who asks to draft
#      gets a BLOCKED tool call (decision=blocked, layer=permission): the AI never reaches past the
#      user. The same user CAN run the read-only student search (they hold students.view).
#   7. scope isolation — a confined campus-admin can start a run in its own campus; a foreign campus -> 403.
#   8. audit — every run writes audit_events rows under module=portal-copilot (needs DATABASE_URL).
#
# Self-cleaning + idempotent: runs + announcements created carry a unique suffix and are deleted at the
# end; the two seeded test users are (re)seeded at the start and removed at the end.
#
# Prereqs: API on :3007 (with the P10 module), DB migrated to 0020, and in .env PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3007/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
CP="$API/portal/copilot"
AN="$API/portal/announcements"
OWNER='owner@greenwood.edu'           # institution_owner (wildcard) — full access
CAMPUS='campus.north@greenwood.edu'   # campus_admin, 1 campus, ai.use + announcements.send
NOAI='noai.p10@greenwood.edu'         # seeded: portal.dashboard.view only — NO ai.use
VIEWER='aiviewer.p10@greenwood.edu'   # seeded: ai.use + students.view — NO announcements.send
RUN="smoke-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
req(){ local m="$1" p="$2" e="$3" sc="$4" b="${5:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc"
  fi
}
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }
INST='institution'
FAKE='00000000-0000-0000-0000-000000000000'

echo "== 0. Seed test users (no-ai + ai-viewer) =="
psql "$DBURL" -v ON_ERROR_STOP=1 -q <<SQL 2>/dev/null
delete from institution_users where email in ('$NOAI','$VIEWER');
insert into institution_users (institution_id, email, full_name, status, direct_grants)
select institution_id, '$NOAI', 'No Copilot', 'active', '["portal.dashboard.view"]'::jsonb
from institution_users where email = '$OWNER' limit 1;
insert into institution_users (institution_id, email, full_name, status, direct_grants)
select institution_id, '$VIEWER', 'Ai Viewer', 'active', '["ai.use","students.view"]'::jsonb
from institution_users where email = '$OWNER' limit 1;
SQL
chk "no-ai user seeded"    "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email='$NOAI'" 2>/dev/null)" 1
chk "ai-viewer user seeded" "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email='$VIEWER'" 2>/dev/null)" 1

echo "== 1. Permission gating (ai.use) =="
chk "owner GET runs -> 200"        "$(code "$(req GET "$CP/runs" "$OWNER" "$INST")")" 200
chk "no-ai GET runs -> 403"        "$(code "$(req GET "$CP/runs" "$NOAI" "$INST")")" 403
chk "ai-viewer GET runs -> 200"    "$(code "$(req GET "$CP/runs" "$VIEWER" "$INST")")" 200
chk "no-ai POST run -> 403"        "$(code "$(req POST "$CP/runs" "$NOAI" "$INST" "{\"prompt\":\"hi\"}")")" 403

echo "== 2. Read-only auto-run (ALLOW, no confirmation) =="
R="$(req POST "$CP/runs" "$OWNER" "$INST" "{\"prompt\":\"find students named test $RUN\",\"context\":{\"query\":\"$RUN\"}}")"
SR_ID="$(body "$R" | field run.id)"
chk "search run created -> id"           "$([ -n "$SR_ID" ] && echo ok)" ok
chk "  tool decision == allow"           "$(body "$R" | field toolCalls.0.decision)" allow
chk "  run status executed (auto-ran)"   "$(body "$R" | field run.status)" executed
chk "  tool key students.search"         "$(body "$R" | field toolCalls.0.toolKey)" students.search

echo "== 3. Confirmation lifecycle (draft announcement: NEEDS_CONFIRMATION -> confirm -> executed) =="
R="$(req POST "$CP/runs" "$OWNER" "$INST" "{\"prompt\":\"draft an announcement\",\"context\":{\"title\":\"AI Notice $RUN\"}}")"
DR_ID="$(body "$R" | field run.id)"
TC_KEY="$(body "$R" | field toolCalls.0.toolKey)"
chk "draft run created -> id"               "$([ -n "$DR_ID" ] && echo ok)" ok
chk "  tool key announcements.draft"        "$TC_KEY" announcements.draft
chk "  tool decision needs_confirmation"    "$(body "$R" | field toolCalls.0.decision)" needs_confirmation
chk "  run status awaiting_confirmation"    "$(body "$R" | field run.status)" awaiting_confirmation
# Nothing should exist yet — the announcement is created only on confirm.
chk "  no announcement created pre-confirm" "$(psql "$DBURL" -tA -c "select count(*) from announcements where title='AI Notice $RUN'" 2>/dev/null)" 0
R="$(req POST "$CP/runs/$DR_ID/confirm" "$OWNER" "$INST" "{\"reason\":\"Confirmed by smoke $RUN\"}")"
chk "confirm -> run status executed"        "$(body "$R" | field run.status)" executed
chk "  tool status executed"                "$(body "$R" | field toolCalls.0.status)" executed
chk "  announcement now exists"             "$(psql "$DBURL" -tA -c "select count(*) from announcements where title='AI Notice $RUN'" 2>/dev/null)" 1
chk "  confirmation row recorded"           "$(body "$R" | field confirmations.0.method)" recent_auth
chk "confirm again -> 409 (NOT_AWAITING)"   "$(body "$(req POST "$CP/runs/$DR_ID/confirm" "$OWNER" "$INST" "{\"reason\":\"again $RUN\"}")" | field code)" NOT_AWAITING_CONFIRMATION
DRAFT_ANN_ID="$(psql "$DBURL" -tA -c "select id from announcements where title='AI Notice $RUN' limit 1" 2>/dev/null)"

echo "== 4. Reject a prepared run (nothing runs) =="
R="$(req POST "$CP/runs" "$OWNER" "$INST" "{\"prompt\":\"draft an announcement\",\"context\":{\"title\":\"AI Reject $RUN\"}}")"
RJ_ID="$(body "$R" | field run.id)"
chk "draft run awaiting"                    "$(body "$R" | field run.status)" awaiting_confirmation
R="$(req POST "$CP/runs/$RJ_ID/reject" "$OWNER" "$INST" "{\"reason\":\"Not now $RUN\"}")"
chk "reject -> run status rejected"         "$(body "$R" | field run.status)" rejected
chk "  no announcement from rejected run"   "$(psql "$DBURL" -tA -c "select count(*) from announcements where title='AI Reject $RUN'" 2>/dev/null)" 0

echo "== 5. Publish flow (mutating tool via publish->notify bridge) =="
R="$(req POST "$AN" "$OWNER" "$INST" "{\"title\":\"Publish Me $RUN\",\"referenceCode\":\"CPUB-$RUN\"}")"
PUB_ANN_ID="$(body "$R" | field id)"
chk "seed a draft announcement -> id"       "$([ -n "$PUB_ANN_ID" ] && echo ok)" ok
R="$(req POST "$CP/runs" "$OWNER" "$INST" "{\"prompt\":\"publish the announcement\",\"context\":{\"announcementId\":\"$PUB_ANN_ID\"}}")"
PR_ID="$(body "$R" | field run.id)"
chk "publish run awaiting"                  "$(body "$R" | field run.status)" awaiting_confirmation
chk "  tool key announcements.publish"      "$(body "$R" | field toolCalls.0.toolKey)" announcements.publish
R="$(req POST "$CP/runs/$PR_ID/confirm" "$OWNER" "$INST" "{\"reason\":\"Publish it $RUN\"}")"
chk "confirm publish -> executed"           "$(body "$R" | field run.status)" executed
chk "  announcement is now published"        "$(psql "$DBURL" -tA -c "select status from announcements where id='$PUB_ANN_ID'" 2>/dev/null)" published

echo "== 6. In-AI permission boundary (ai.use, no announcements.send) =="
R="$(req POST "$CP/runs" "$VIEWER" "$INST" "{\"prompt\":\"draft an announcement\",\"context\":{\"title\":\"Viewer Blocked $RUN\"}}")"
VB_ID="$(body "$R" | field run.id)"
chk "viewer draft -> tool decision blocked" "$(body "$R" | field toolCalls.0.decision)" blocked
chk "  block layer == permission"           "$(body "$R" | field toolCalls.0.decisionLayer)" permission
chk "  no announcement created"             "$(psql "$DBURL" -tA -c "select count(*) from announcements where title='Viewer Blocked $RUN'" 2>/dev/null)" 0
R="$(req POST "$CP/runs" "$VIEWER" "$INST" "{\"prompt\":\"find students $RUN\",\"context\":{\"query\":\"$RUN\"}}")"
chk "viewer student search -> allow"        "$(body "$R" | field toolCalls.0.decision)" allow
chk "  viewer search run executed"          "$(body "$R" | field run.status)" executed

echo "== 7. Scope isolation (confined campus admin) =="
R="$(req POST "$CP/runs" "$CAMPUS" "$INST" "{\"prompt\":\"find students $RUN\",\"context\":{\"query\":\"$RUN\"}}")"
chk "campus-admin can start a run in scope" "$(body "$R" | field run.status)" executed
R="$(req GET "$CP/runs" "$CAMPUS" "campus:$FAKE")"
chk "campus-admin foreign campus -> 403"    "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN"        "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 8. Audit rows written (needs DATABASE_URL/local DB) =="
acount(){ psql "$DBURL" -tA -c "select case when count(*)>0 then 'ok' else 'no' end from audit_events where module = '$1'" 2>/dev/null; }
chk "portal-copilot audit rows exist"       "$(acount portal-copilot)" ok

echo "== 9. Cleanup =="
# Delete the announcements created during the run, then every portal_ai_run for this suffix
# (tool_calls + confirmations cascade). Done directly in the DB (the portal has no run-delete endpoint).
psql "$DBURL" -q <<SQL 2>/dev/null
delete from announcements where title like '%$RUN%' or reference_code like 'CPUB-$RUN';
delete from notifications where title like '%$RUN%';
delete from portal_ai_runs where prompt like '%$RUN%';
delete from institution_users where email in ('$NOAI','$VIEWER');
SQL
chk "runs cleaned up"        "$(psql "$DBURL" -tA -c "select count(*) from portal_ai_runs where prompt like '%$RUN%'" 2>/dev/null)" 0
chk "announcements cleaned"  "$(psql "$DBURL" -tA -c "select count(*) from announcements where title like '%$RUN%' or reference_code like 'CPUB-$RUN'" 2>/dev/null)" 0
chk "test users removed"     "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email in ('$NOAI','$VIEWER')" 2>/dev/null)" 0

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
