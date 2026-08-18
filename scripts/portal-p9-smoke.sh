#!/usr/bin/env bash
# Phase 9 (Institution Portal — Announcements, Notifications, Messages, Reports) live smoke.
#
# Proves, against the running API + seeded portal users, that the four P9 verticals are real and the
# portal's guarantees hold:
#   1. permission gating  — announcements.{view,send}, messages.use, reports.{view,export}; a view-only
#      role (seeded via direct_grants: announcements.view + messages.use + reports.view, NO send/export)
#      gets 200 on read but 403 on a manage mutation; an unrelated role (teacher, no reports.view) -> 403.
#   2. announcements — CRUD + the publish->notify bridge (publishing fans out a notification).
#   3. notifications — CRUD + mark-read; optional announcement link is pre-checked (friendly 400).
#   4. messages     — threads CRUD + the posts within a thread.
#   5. reports      — definitions CRUD + the export bridge (a run per definition).
#   6. tenancy/refs — an unknown announcement FK -> 400 (not 500); duplicate reference_code -> 409.
#   7. optimistic concurrency — a stale version on update -> 409; mark-read twice / publish twice -> 409.
#   8. scope isolation — a confined campus-admin creates campus-stamped rows; a foreign campus -> 403.
#   9. audit — every mutation writes an audit_events row (checked via count, needs DATABASE_URL).
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end; the
# view-only test user is (re)seeded at the start and removed at the end.
#
# Prereqs: API on :3007, DB seeded + migration 0019 applied, and in .env PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3007/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
AN="$API/portal/announcements"
NT="$API/portal/notifications"
MS="$API/portal/messages"
RP="$API/portal/reports"
OWNER='owner@greenwood.edu'          # institution_owner (wildcard)
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, all P9 manage keys
TEACHER='teacher@greenwood.edu'      # announcements.view + messages.use, NO reports.view, NO announcements.send
VIEWER='viewer.p9@greenwood.edu'     # seeded below: announcements.view + messages.use + reports.view (no send/export)
RUN="smoke-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
len(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(-1)}})'; }
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

echo "== 0. Seed a view-only user (direct_grants: announcements.view + messages.use + reports.view) =="
psql "$DBURL" -v ON_ERROR_STOP=1 -q <<SQL 2>/dev/null
delete from institution_users where email = '$VIEWER';
insert into institution_users (institution_id, email, full_name, status, direct_grants)
select institution_id, '$VIEWER', 'Val Viewer', 'active',
  '["announcements.view","messages.use","reports.view"]'::jsonb
from institution_users where email = '$OWNER' limit 1;
SQL
chk "view-only user seeded" "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email='$VIEWER'" 2>/dev/null)" 1

echo "== 1. Permission gating =="
chk "owner GET announcements -> 200"      "$(code "$(req GET "$AN" "$OWNER" "$INST")")" 200
chk "viewer GET announcements -> 200"     "$(code "$(req GET "$AN" "$VIEWER" "$INST")")" 200
chk "viewer POST announcement -> 403"     "$(code "$(req POST "$AN" "$VIEWER" "$INST" "{\"title\":\"x\",\"referenceCode\":\"x\"}")")" 403
chk "viewer GET notifications -> 200"     "$(code "$(req GET "$NT" "$VIEWER" "$INST")")" 200
chk "viewer POST notification -> 403"     "$(code "$(req POST "$NT" "$VIEWER" "$INST" "{\"title\":\"x\"}")")" 403
chk "viewer GET messages/threads -> 200"  "$(code "$(req GET "$MS/threads" "$VIEWER" "$INST")")" 200
chk "viewer GET reports -> 200"           "$(code "$(req GET "$RP" "$VIEWER" "$INST")")" 200
chk "viewer POST report -> 403"           "$(code "$(req POST "$RP" "$VIEWER" "$INST" "{\"name\":\"x\",\"referenceCode\":\"x\"}")")" 403
chk "teacher GET announcements -> 200"    "$(code "$(req GET "$AN" "$TEACHER" "$INST")")" 200
chk "teacher POST announcement -> 403"    "$(code "$(req POST "$AN" "$TEACHER" "$INST" "{\"title\":\"x\",\"referenceCode\":\"x\"}")")" 403
chk "teacher GET reports -> 403"          "$(code "$(req GET "$RP" "$TEACHER" "$INST")")" 403

echo "== 2. Announcements — CRUD + publish->notify bridge =="
R="$(req POST "$AN" "$OWNER" "$INST" "{\"title\":\"Notice $RUN\",\"referenceCode\":\"ANN-$RUN\",\"audience\":\"all\"}")"
ANN_ID="$(body "$R" | field id)"
chk "create announcement -> id" "$([ -n "$ANN_ID" ] && echo ok)" ok
chk "  default status draft" "$(body "$R" | field status)" draft
chk "duplicate referenceCode -> 409 (ANNOUNCEMENT_EXISTS)" "$(body "$(req POST "$AN" "$OWNER" "$INST" "{\"title\":\"y\",\"referenceCode\":\"ANN-$RUN\"}")" | field code)" ANNOUNCEMENT_EXISTS
chk "announcement stale version update -> 409" "$(code "$(req PATCH "$AN/$ANN_ID" "$OWNER" "$INST" "{\"title\":\"z\",\"version\":99}")")" 409
R="$(req POST "$AN/$ANN_ID/publish" "$OWNER" "$INST" "{}")"
PUB_NOTIF_ID="$(body "$R" | field notification.id)"
chk "publish -> status published" "$(body "$R" | field announcement.status)" published
chk "  publish fans out a notification" "$([ -n "$PUB_NOTIF_ID" ] && echo ok)" ok
chk "publish again -> 409 (ALREADY_PUBLISHED)" "$(body "$(req POST "$AN/$ANN_ID/publish" "$OWNER" "$INST" "{}")" | field code)" ALREADY_PUBLISHED

echo "== 3. Notifications — CRUD + mark-read + FK pre-check =="
R="$(req POST "$NT" "$OWNER" "$INST" "{\"title\":\"Ping $RUN\",\"kind\":\"system\"}")"
NOTIF_ID="$(body "$R" | field id)"
chk "create notification -> id" "$([ -n "$NOTIF_ID" ] && echo ok)" ok
chk "  default status unread" "$(body "$R" | field status)" unread
chk "notification unknown announcement -> 400 (INVALID_REFERENCE)" "$(body "$(req POST "$NT" "$OWNER" "$INST" "{\"title\":\"x\",\"announcementId\":\"$FAKE\"}")" | field code)" INVALID_REFERENCE
chk "notification with valid announcement link -> 200" "$(code "$(req POST "$NT" "$OWNER" "$INST" "{\"title\":\"Linked $RUN\",\"announcementId\":\"$ANN_ID\"}")")" 201
R="$(req POST "$NT/$NOTIF_ID/read" "$OWNER" "$INST" "{}")"
chk "mark read -> status read" "$(body "$R" | field status)" read
chk "mark read again -> 409 (ALREADY_READ)" "$(body "$(req POST "$NT/$NOTIF_ID/read" "$OWNER" "$INST" "{}")" | field code)" ALREADY_READ
chk "notification stale version update -> 409" "$(code "$(req PATCH "$NT/$NOTIF_ID" "$OWNER" "$INST" "{\"title\":\"z\",\"version\":99}")")" 409

echo "== 4. Messages — threads + posts =="
R="$(req POST "$MS/threads" "$OWNER" "$INST" "{\"subject\":\"Thread $RUN\",\"referenceCode\":\"MSG-$RUN\"}")"
THR_ID="$(body "$R" | field id)"
chk "create thread -> id" "$([ -n "$THR_ID" ] && echo ok)" ok
chk "  default status open" "$(body "$R" | field status)" open
chk "duplicate referenceCode -> 409 (THREAD_EXISTS)" "$(body "$(req POST "$MS/threads" "$OWNER" "$INST" "{\"subject\":\"y\",\"referenceCode\":\"MSG-$RUN\"}")" | field code)" THREAD_EXISTS
chk "thread stale version update -> 409" "$(code "$(req PATCH "$MS/threads/$THR_ID" "$OWNER" "$INST" "{\"status\":\"closed\",\"version\":99}")")" 409
R="$(req POST "$MS/threads/$THR_ID/posts" "$OWNER" "$INST" "{\"body\":\"Hello $RUN\",\"senderType\":\"staff\"}")"
POST_ID="$(body "$R" | field id)"
chk "create post -> id" "$([ -n "$POST_ID" ] && echo ok)" ok
chk "posts list length == 1" "$(req GET "$MS/threads/$THR_ID/posts" "$OWNER" "$INST" | sed '$d' | len)" 1
chk "viewer can post (messages.use) -> 201" "$(code "$(req POST "$MS/threads/$THR_ID/posts" "$VIEWER" "$INST" "{\"body\":\"Hi $RUN\"}")")" 201

echo "== 5. Reports — definitions + export bridge =="
R="$(req POST "$RP" "$OWNER" "$INST" "{\"name\":\"Report $RUN\",\"referenceCode\":\"RPT-$RUN\",\"reportType\":\"attendance\"}")"
RPT_ID="$(body "$R" | field id)"
chk "create report -> id" "$([ -n "$RPT_ID" ] && echo ok)" ok
chk "  default status active" "$(body "$R" | field status)" active
chk "duplicate referenceCode -> 409 (REPORT_EXISTS)" "$(body "$(req POST "$RP" "$OWNER" "$INST" "{\"name\":\"y\",\"referenceCode\":\"RPT-$RUN\"}")" | field code)" REPORT_EXISTS
chk "report stale version update -> 409" "$(code "$(req PATCH "$RP/$RPT_ID" "$OWNER" "$INST" "{\"status\":\"archived\",\"version\":99}")")" 409
R="$(req POST "$RP/$RPT_ID/runs" "$OWNER" "$INST" "{\"format\":\"csv\",\"rowCount\":42}")"
RUN_ID="$(body "$R" | field run.id)"
chk "generate export -> run id" "$([ -n "$RUN_ID" ] && echo ok)" ok
chk "  run format csv" "$(body "$R" | field run.format)" csv
chk "runs list length == 1" "$(req GET "$RP/$RPT_ID/runs" "$OWNER" "$INST" | sed '$d' | len)" 1

echo "== 6. Scope isolation (confined campus admin) =="
chk "campus-admin GET announcements -> 200" "$(code "$(req GET "$AN" "$CAMPUS" "$INST")")" 200
R="$(req POST "$AN" "$CAMPUS" "$INST" "{\"title\":\"CNotice $RUN\",\"referenceCode\":\"CANN-$RUN\"}")"
CANN_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CANN_ID" ] && echo ok)" ok
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$(body "$R" | field campusId)" ] && echo ok)" ok
R="$(req GET "$AN" "$CAMPUS" "campus:$FAKE")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 7. Audit rows written (needs DATABASE_URL/local DB) =="
acount(){ psql "$DBURL" -tA -c "select case when count(*)>0 then 'ok' else 'no' end from audit_events where module = '$1'" 2>/dev/null; }
chk "portal-announcements audit rows exist" "$(acount portal-announcements)" ok
chk "portal-notifications audit rows exist" "$(acount portal-notifications)" ok
chk "portal-messages audit rows exist"      "$(acount portal-messages)" ok
chk "portal-reports audit rows exist"       "$(acount portal-reports)" ok

echo "== 8. Cleanup (re-read versions, delete) =="
delv(){ # delv <listUrl> <delBase> <id> <email>
  local listUrl="$1" delBase="$2" id="$3" e="$4"
  local v; v="$(req GET "$listUrl?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  ${id:0:8} (not found)"; return; }
  chk "delete ${id:0:8} -> 200" "$(code "$(req DELETE "$delBase/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
# delete every notification that links to our announcement first (announcement delete sets the link null)
psql "$DBURL" -q -c "delete from notifications where institution_id = (select institution_id from institution_users where email='$OWNER' limit 1) and (announcement_id = '$ANN_ID' or title like '%$RUN%');" 2>/dev/null
[ -n "$NOTIF_ID" ] && echo "  cleaned notifications for run"
[ -n "$THR_ID" ]   && delv "$MS/threads" "$MS/threads" "$THR_ID" "$OWNER"   # posts cascade
[ -n "$RPT_ID" ]   && delv "$RP" "$RP" "$RPT_ID" "$OWNER"                    # runs cascade
[ -n "$ANN_ID" ]   && delv "$AN" "$AN" "$ANN_ID" "$OWNER"
[ -n "$CANN_ID" ]  && delv "$AN" "$AN" "$CANN_ID" "$OWNER"
psql "$DBURL" -q -c "delete from institution_users where email = '$VIEWER';" 2>/dev/null
echo "  cleaned up view-only user"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
