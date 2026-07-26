#!/usr/bin/env bash
# Admissions ADMIN (staff-side) live smoke — the portal-submitted-application review workflow.
#
# Proves, against the running API + seeded portal users, the staff-side additions on top of the
# Phase-5 admissions vertical:
#   1. permission gating — admissions.{view,manage}.
#   2. academic_year_id on create/update (assertOptional against academic_years; unknown FK -> 400).
#   3. list facets — status filter + submittedVia filter; free-text search.
#   4. decision workflow — POST :id/decision (accept/reject/waitlist/info_requested) stamps
#      status + decision_date + decision_note; version-guarded (stale -> 409).
#   5. decision -> guardian notification bridge (a portal notification row is created; suppressible).
#   6. accept -> enrol bridge still works after a decision.
#
# Self-cleaning + idempotent: unique run suffix, everything deleted at the end.
#
# Prereqs: API on :3001, portal users seeded (`pnpm --filter @edrion/database seed:portal`),
# migrations through 0031 applied, and in .env PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B
API="${API:-http://localhost:3001/v1}"
ADM="$API/portal/admissions"
AC="$API/portal/academics"
NOTIF="$API/portal/notifications"
OWNER="${OWNER:-owner@greenwood.edu}"      # institution_owner (wildcard)
TEACHER="${TEACHER:-teacher@greenwood.edu}" # no admissions perms
INST='institution'
RUN="admsmoke-$(date +%s)"
TODAY="$(date +%F)"
ZERO='00000000-0000-0000-0000-000000000000'

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

echo "== 1. Permission gating =="
chk "owner GET admissions -> 200"   "$(code "$(req GET "$ADM" "$OWNER" "$INST")")" 200
chk "teacher GET admissions -> 403" "$(code "$(req GET "$ADM" "$TEACHER" "$INST")")" 403
chk "teacher POST decision -> 403"  "$(code "$(req POST "$ADM/$ZERO/decision" "$TEACHER" "$INST" "{\"decision\":\"accepted\",\"version\":0}")")" 403

echo "== 2. Scaffolding (academic year + grade) =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2033-06-01\",\"endDate\":\"2034-05-31\"}")" | field id)"
GRADE_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
chk "scaffolding created" "$([ -n "$YEAR_ID" ] && [ -n "$GRADE_ID" ] && echo ok)" ok

echo "== 3. Create with academic_year_id =="
R="$(req POST "$ADM" "$OWNER" "$INST" "{\"applicationNo\":\"APP-$RUN\",\"firstName\":\"Andy $RUN\",\"lastName\":\"Apply\",\"gradeLevelId\":\"$GRADE_ID\",\"academicYearId\":\"$YEAR_ID\",\"guardianName\":\"Gina $RUN\",\"guardianEmail\":\"gina.$RUN@example.com\",\"appliedDate\":\"$TODAY\"}")"
APP_ID="$(body "$R" | field id)"
chk "create application -> id" "$([ -n "$APP_ID" ] && echo ok)" ok
chk "  academicYearId persisted" "$(body "$R" | field academicYearId)" "$YEAR_ID"
chk "create unknown academicYearId -> 400" "$(code "$(req POST "$ADM" "$OWNER" "$INST" "{\"applicationNo\":\"APPX-$RUN\",\"firstName\":\"x\",\"lastName\":\"y\",\"academicYearId\":\"$ZERO\"}")")" 400

echo "== 4. List facets (status / submittedVia / search) =="
chk "list ?status=submitted finds it"      "$(req GET "$ADM?status=submitted&search=$RUN" "$OWNER" "$INST" | sed '$d' | field items.0.applicationNo)" "APP-$RUN"
chk "list ?submittedVia=staff finds it"    "$(req GET "$ADM?submittedVia=staff&search=$RUN" "$OWNER" "$INST" | sed '$d' | field items.0.applicationNo)" "APP-$RUN"
chk "list ?submittedVia=portal excludes"   "$(req GET "$ADM?submittedVia=portal&search=$RUN" "$OWNER" "$INST" | sed '$d' | field total)" 0
chk "list ?status=accepted excludes (still submitted)" "$(req GET "$ADM?status=accepted&search=$RUN" "$OWNER" "$INST" | sed '$d' | field total)" 0

echo "== 5. Decision workflow (info_requested, then accept) =="
NOTIF_BEFORE="$(req GET "$NOTIF?pageSize=1" "$OWNER" "$INST" | sed '$d' | field total)"
R="$(req POST "$ADM/$APP_ID/decision" "$OWNER" "$INST" "{\"decision\":\"info_requested\",\"note\":\"Need birth certificate\",\"version\":0}")"
C="$(code "$R")"; chk "decision info_requested -> 2xx" "$([ "$C" = 200 ] || [ "$C" = 201 ] && echo ok)" ok
chk "  status now info_requested"        "$(body "$R" | field application.status)" info_requested
chk "  decision_date stamped"            "$(body "$R" | field application.decisionDate)" "$TODAY"
chk "  guardian notified (notificationId)" "$([ -n "$(body "$R" | field notificationId)" ] && echo ok)" ok
NOTIF_AFTER="$(req GET "$NOTIF?pageSize=1" "$OWNER" "$INST" | sed '$d' | field total)"
chk "  notifications feed grew by 1"     "$((NOTIF_AFTER - NOTIF_BEFORE))" 1
chk "decision stale version -> 409"      "$(code "$(req POST "$ADM/$APP_ID/decision" "$OWNER" "$INST" "{\"decision\":\"rejected\",\"version\":0}")")" 409
R="$(req POST "$ADM/$APP_ID/decision" "$OWNER" "$INST" "{\"decision\":\"accepted\",\"note\":\"Welcome\",\"notify\":false,\"version\":1}")"
C="$(code "$R")"; chk "decision accepted (notify=false) -> 2xx" "$([ "$C" = 200 ] || [ "$C" = 201 ] && echo ok)" ok
chk "  status now accepted"              "$(body "$R" | field application.status)" accepted
chk "  no notification emitted"          "$(body "$R" | field notificationId)" ""

echo "== 6. Accept -> enrol bridge still works =="
R="$(req POST "$ADM/$APP_ID/enrol" "$OWNER" "$INST" "{\"admissionNo\":\"ENR-$RUN\"}")"
ENR_STU_ID="$(body "$R" | field student.id)"
chk "enrol accepted applicant -> student" "$([ -n "$ENR_STU_ID" ] && echo ok)" ok
chk "  application now enrolled"          "$(body "$R" | field application.status)" enrolled
chk "decision after enrolled -> 400 (ALREADY_ENROLLED)" "$(body "$(req POST "$ADM/$APP_ID/decision" "$OWNER" "$INST" "{\"decision\":\"rejected\",\"version\":3}")" | field code)" ALREADY_ENROLLED

echo "== 7. Cleanup =="
delv(){ local listUrl="$1" delBase="$2" id="$3"
  local v; v="$(req GET "$listUrl?pageSize=100&search=$RUN" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  ${id:0:8} (not found)"; return; }
  chk "delete ${id:0:8} -> 200" "$(code "$(req DELETE "$delBase/$id" "$OWNER" "$INST" "{\"version\":$v}")")" 200
}
[ -n "${APP_ID:-}" ] && delv "$ADM" "$ADM" "$APP_ID"
[ -n "${ENR_STU_ID:-}" ] && delv "$API/portal/people/students" "$API/portal/people/students" "$ENR_STU_ID"
[ -n "${GRADE_ID:-}" ] && delv "$AC/grade-levels" "$AC/grade-levels" "$GRADE_ID"
[ -n "${YEAR_ID:-}" ] && delv "$AC/academic-years" "$AC/academic-years" "$YEAR_ID"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
