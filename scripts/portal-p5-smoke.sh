#!/usr/bin/env bash
# Phase 5 (Institution Portal — Admissions, Attendance, Timetable) live smoke.
#
# Proves, against the running API + seeded portal users, that the three P5 verticals are real and the
# portal's guarantees hold:
#   1. permission gating  — admissions.{view,manage}, attendance.{view,manage}, timetable.{view,manage}.
#   2. admissions CRUD + the accept→enrol→student bridge (creates a students row, links it back).
#   3. attendance — registers (sessions) + bulk per-student marking; duplicate register -> 409.
#   4. timetable  — recurring slot CRUD + end<start validation.
#   5. tenancy/refs — unknown foreign keys -> 400 (not 500).
#   6. optimistic concurrency — a stale version on update -> 409.
#   7. scope isolation — confined campus-admin works in its campus; a foreign campus -> 403.
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end.
#
# Prereqs: API on :3007, DB seeded + `pnpm --filter @edrion/database seed:portal`, migration 0015
# applied, and in .env PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B
API="${API:-http://localhost:3007/v1}"
ADM="$API/portal/admissions"
ATT="$API/portal/attendance"
TT="$API/portal/timetable"
AC="$API/portal/academics"
PP="$API/portal/people"
OWNER='owner@greenwood.edu'          # institution_owner (wildcard)
TEACHER='teacher@greenwood.edu'      # attendance.view+manage, timetable.view; NO admissions
PARENT='parent@greenwood.edu'        # attendance.view; NO admissions, NO timetable.view
STUDENT='student@greenwood.edu'      # timetable.view; NO timetable.manage
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, admissions/attendance/timetable manage
RUN="smoke-$(date +%s)"
TODAY="$(date +%F)"

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

echo "== 1. Permission gating =="
chk "owner GET admissions -> 200"        "$(code "$(req GET "$ADM" "$OWNER" "$INST")")" 200
chk "teacher GET admissions -> 403"      "$(code "$(req GET "$ADM" "$TEACHER" "$INST")")" 403
chk "teacher POST admission -> 403"      "$(code "$(req POST "$ADM" "$TEACHER" "$INST" "{\"applicationNo\":\"x\",\"firstName\":\"x\",\"lastName\":\"y\"}")")" 403
chk "parent GET admissions -> 403"       "$(code "$(req GET "$ADM" "$PARENT" "$INST")")" 403
chk "owner GET attendance -> 200"        "$(code "$(req GET "$ATT/sessions" "$OWNER" "$INST")")" 200
chk "parent GET attendance -> 200"       "$(code "$(req GET "$ATT/sessions" "$PARENT" "$INST")")" 200
chk "student GET timetable -> 200"       "$(code "$(req GET "$TT" "$STUDENT" "$INST")")" 200
chk "student POST timetable -> 403"      "$(code "$(req POST "$TT" "$STUDENT" "$INST" "{\"classId\":\"00000000-0000-0000-0000-000000000000\",\"dayOfWeek\":1,\"startTime\":\"09:00\",\"endTime\":\"09:45\"}")")" 403
chk "parent GET timetable -> 403"        "$(code "$(req GET "$TT" "$PARENT" "$INST")")" 403

echo "== 2. Academic + people scaffolding (owner, institution scope) =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GRADE_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
SUBJ_ID="$(body "$(req POST "$AC/subjects" "$OWNER" "$INST" "{\"name\":\"Algebra $RUN\",\"code\":\"ALG-$RUN\"}")" | field id)"
TEACHER_ID="$(body "$(req POST "$PP/teachers" "$OWNER" "$INST" "{\"firstName\":\"Tara $RUN\",\"lastName\":\"Teach\"}")" | field id)"
CLASS_ID="$(body "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GRADE_ID\"}")" | field id)"
STU_ID="$(body "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"classId\":\"$CLASS_ID\"}")" | field id)"
chk "scaffolding created (year/grade/subject/teacher/class/student)" \
  "$([ -n "$YEAR_ID$GRADE_ID$SUBJ_ID$TEACHER_ID$CLASS_ID$STU_ID" ] && [ -n "$STU_ID" ] && echo ok)" ok

echo "== 3. Admissions CRUD + accept -> enrol bridge =="
R="$(req POST "$ADM" "$OWNER" "$INST" "{\"applicationNo\":\"APP-$RUN\",\"firstName\":\"Andy $RUN\",\"lastName\":\"Apply\",\"gradeLevelId\":\"$GRADE_ID\",\"appliedDate\":\"$TODAY\"}")"
APP_ID="$(body "$R" | field id)"
chk "create application -> id" "$([ -n "$APP_ID" ] && echo ok)" ok
chk "  default status submitted" "$(body "$R" | field status)" submitted
chk "application unknown gradeLevelId -> 400" "$(code "$(req POST "$ADM" "$OWNER" "$INST" "{\"applicationNo\":\"APPX-$RUN\",\"firstName\":\"x\",\"lastName\":\"y\",\"gradeLevelId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
chk "enrol before accepted -> 400 (NOT_ACCEPTED)" "$(body "$(req POST "$ADM/$APP_ID/enrol" "$OWNER" "$INST" "{}")" | field code)" NOT_ACCEPTED
chk "update status -> accepted (v0) -> 200" "$(code "$(req PATCH "$ADM/$APP_ID" "$OWNER" "$INST" "{\"status\":\"accepted\",\"version\":0}")")" 200
R="$(req POST "$ADM/$APP_ID/enrol" "$OWNER" "$INST" "{\"admissionNo\":\"ENR-$RUN\"}")"
ENR_STU_ID="$(body "$R" | field student.id)"
chk "enrol -> created student" "$([ -n "$ENR_STU_ID" ] && echo ok)" ok
chk "  application now enrolled" "$(body "$R" | field application.status)" enrolled
chk "enrol again -> 400 (ALREADY_ENROLLED)" "$(body "$(req POST "$ADM/$APP_ID/enrol" "$OWNER" "$INST" "{}")" | field code)" ALREADY_ENROLLED

echo "== 4. Attendance registers + marking =="
R="$(req POST "$ATT/sessions" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"date\":\"$TODAY\",\"period\":\"1\",\"takenById\":\"$TEACHER_ID\"}")"
SESSION_ID="$(body "$R" | field id)"
chk "create register -> id" "$([ -n "$SESSION_ID" ] && echo ok)" ok
chk "duplicate register -> 409 (SESSION_EXISTS)" "$(body "$(req POST "$ATT/sessions" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"date\":\"$TODAY\",\"period\":\"1\"}")" | field code)" SESSION_EXISTS
chk "register unknown classId -> 400" "$(code "$(req POST "$ATT/sessions" "$OWNER" "$INST" "{\"classId\":\"00000000-0000-0000-0000-000000000000\",\"date\":\"$TODAY\",\"period\":\"x-$RUN\"}")")" 400
MK="$(code "$(req POST "$ATT/sessions/$SESSION_ID/records" "$OWNER" "$INST" "{\"marks\":[{\"studentId\":\"$STU_ID\",\"status\":\"present\"}]}")")"
chk "mark register (student present) -> 200/201" "$([ "$MK" = 200 ] || [ "$MK" = 201 ] && echo ok)" ok
RLEN="$(req GET "$ATT/sessions/$SESSION_ID/records" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(-1)}})')"
chk "records length == 1" "$RLEN" 1
chk "mark unknown studentId -> 400" "$(code "$(req POST "$ATT/sessions/$SESSION_ID/records" "$OWNER" "$INST" "{\"marks\":[{\"studentId\":\"00000000-0000-0000-0000-000000000000\",\"status\":\"absent\"}]}")")" 400
chk "session update current version -> 200" "$(code "$(req PATCH "$ATT/sessions/$SESSION_ID" "$OWNER" "$INST" "{\"notes\":\"updated\",\"version\":0}")")" 200
chk "session update stale version -> 409" "$(code "$(req PATCH "$ATT/sessions/$SESSION_ID" "$OWNER" "$INST" "{\"notes\":\"nope\",\"version\":0}")")" 409

echo "== 5. Timetable CRUD + validation =="
R="$(req POST "$TT" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"subjectId\":\"$SUBJ_ID\",\"teacherId\":\"$TEACHER_ID\",\"dayOfWeek\":1,\"startTime\":\"09:00\",\"endTime\":\"09:45\",\"room\":\"R-$RUN\"}")"
SLOT_ID="$(body "$R" | field id)"
chk "create slot -> id" "$([ -n "$SLOT_ID" ] && echo ok)" ok
chk "  teacher name resolves" "$(req GET "$TT?classId=$CLASS_ID" "$OWNER" "$INST" | sed '$d' | field items.0.teacherName)" "Tara $RUN Teach"
chk "end<=start -> 400" "$(code "$(req POST "$TT" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"dayOfWeek\":2,\"startTime\":\"10:00\",\"endTime\":\"09:00\"}")")" 400
chk "unknown teacherId -> 400" "$(code "$(req POST "$TT" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"dayOfWeek\":3,\"startTime\":\"11:00\",\"endTime\":\"11:45\",\"teacherId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
chk "slot update current version -> 200" "$(code "$(req PATCH "$TT/$SLOT_ID" "$OWNER" "$INST" "{\"room\":\"R2-$RUN\",\"version\":0}")")" 200
chk "slot update stale version -> 409" "$(code "$(req PATCH "$TT/$SLOT_ID" "$OWNER" "$INST" "{\"room\":\"nope\",\"version\":0}")")" 409

echo "== 6. Scope isolation (confined campus admin) =="
chk "campus-admin GET admissions -> 200" "$(code "$(req GET "$ADM" "$CAMPUS" "$INST")")" 200
R="$(req POST "$ADM" "$CAMPUS" "$INST" "{\"applicationNo\":\"CAPP-$RUN\",\"firstName\":\"Cara $RUN\",\"lastName\":\"Campus\"}")"
CAPP_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CAPP_ID" ] && echo ok)" ok
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$(body "$R" | field campusId)" ] && echo ok)" ok
R="$(req GET "$ATT/sessions" "$CAMPUS" "campus:00000000-0000-0000-0000-000000000000")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 7. Cleanup (re-read versions, delete) =="
delv(){ # delv <listUrl> <delBase> <id> <email>
  local listUrl="$1" delBase="$2" id="$3" e="$4"
  local v; v="$(req GET "$listUrl?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  ${id:0:8} (not found)"; return; }
  chk "delete ${id:0:8} -> 200" "$(code "$(req DELETE "$delBase/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$SLOT_ID" ] && delv "$TT" "$TT" "$SLOT_ID" "$OWNER"
[ -n "$SESSION_ID" ] && delv "$ATT/sessions" "$ATT/sessions" "$SESSION_ID" "$OWNER"   # records cascade
[ -n "$APP_ID" ] && delv "$ADM" "$ADM" "$APP_ID" "$OWNER"
[ -n "$CAPP_ID" ] && delv "$ADM" "$ADM" "$CAPP_ID" "$OWNER"
[ -n "$ENR_STU_ID" ] && delv "$PP/students" "$PP/students" "$ENR_STU_ID" "$OWNER"
[ -n "$STU_ID" ] && delv "$PP/students" "$PP/students" "$STU_ID" "$OWNER"
[ -n "$CLASS_ID" ] && delv "$AC/classes" "$AC/classes" "$CLASS_ID" "$OWNER"
[ -n "$SUBJ_ID" ] && delv "$AC/subjects" "$AC/subjects" "$SUBJ_ID" "$OWNER"
[ -n "$GRADE_ID" ] && delv "$AC/grade-levels" "$AC/grade-levels" "$GRADE_ID" "$OWNER"
[ -n "$YEAR_ID" ] && delv "$AC/academic-years" "$AC/academic-years" "$YEAR_ID" "$OWNER"
[ -n "$TEACHER_ID" ] && delv "$PP/teachers" "$PP/teachers" "$TEACHER_ID" "$OWNER"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
