#!/usr/bin/env bash
# Institution Portal — People live smoke (staff merge + profiles).
#
# Proves against the running API + seeded portal users:
#   1. permission gating  — students.{view,create,update,delete}; staff/parents.{view,manage}
#   2. full CRUD          — students, staff (teaching + non-teaching), parents + guardian links
#   3. teaching pickers   — class teacher, dept head, subject teacher resolve staff names
#   4. staff login mirror — create staff with createLogin + roleKeys mints institution_users row
#   5. profiles           — staff profile + class roster endpoints return 200
#   6. tenancy/refs       — unknown FKs -> 400; stale version -> 409; scope isolation -> 403
#
# Prereqs: API on :3001, DB migrated + `pnpm --filter @edrion/database seed:portal`,
# PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B
API="${API:-http://localhost:3001/v1}"
PP="$API/portal/people"
AC="$API/portal/academics"
OWNER='owner@greenwood.edu'
TEACHER='teacher@greenwood.edu'
PARENT='parent@greenwood.edu'
CAMPUS='campus.north@greenwood.edu'
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

echo "== 1. Permission gating =="
chk "owner GET students -> 200"   "$(code "$(req GET "$PP/students" "$OWNER" "$INST")")" 200
chk "teacher GET students -> 200" "$(code "$(req GET "$PP/students" "$TEACHER" "$INST")")" 200
chk "parent GET students -> 403"  "$(code "$(req GET "$PP/students" "$PARENT" "$INST")")" 403
chk "teacher POST student -> 403" "$(code "$(req POST "$PP/students" "$TEACHER" "$INST" "{\"admissionNo\":\"x\",\"firstName\":\"x\",\"lastName\":\"y\"}")")" 403
chk "teacher POST staff -> 403"   "$(code "$(req POST "$PP/staff" "$TEACHER" "$INST" "{\"firstName\":\"x\",\"lastName\":\"y\"}")")" 403
chk "teachers route gone -> 404"  "$(code "$(req GET "$PP/teachers" "$OWNER" "$INST")")" 404

echo "== 2. CRUD happy path =="
R="$(req POST "$PP/staff" "$OWNER" "$INST" "{\"firstName\":\"Tara $RUN\",\"lastName\":\"Teach\",\"employeeNo\":\"EMP-$RUN\",\"email\":\"tara-$RUN@smoke.test\",\"designation\":\"Senior Teacher\",\"createLogin\":true,\"roleKeys\":[\"teacher\"]}")"
chk "create teaching staff -> 200/201" "$([ "$(code "$R")" = 200 ] || [ "$(code "$R")" = 201 ] && echo ok)" ok
TEACHING_STAFF_ID="$(body "$R" | field id)"
INST_USER_ID="$(body "$R" | field institutionUserId)"
chk "  returns staff id" "$([ -n "$TEACHING_STAFF_ID" ] && echo ok)" ok
chk "  links institution_user" "$([ -n "$INST_USER_ID" ] && echo ok)" ok

R="$(req POST "$PP/staff" "$OWNER" "$INST" "{\"firstName\":\"Sam $RUN\",\"lastName\":\"Staff\",\"designation\":\"Accountant\",\"createLogin\":false}")"
STAFF_ID="$(body "$R" | field id)"
chk "create non-teaching staff" "$([ -n "$STAFF_ID" ] && echo ok)" ok

R="$(req POST "$PP/parents" "$OWNER" "$INST" "{\"firstName\":\"Pam $RUN\",\"lastName\":\"Parent\",\"phone\":\"+12025550100\"}")"
PARENT_ID="$(body "$R" | field id)"
chk "create parent" "$([ -n "$PARENT_ID" ] && echo ok)" ok

R="$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"status\":\"enrolled\"}")"
STUDENT_ID="$(body "$R" | field id)"
chk "create student" "$([ -n "$STUDENT_ID" ] && echo ok)" ok

echo "== 3. Teaching staff pickers (FKs resolve via staff) =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GRADE_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
SUBJ_ID="$(body "$(req POST "$AC/subjects" "$OWNER" "$INST" "{\"name\":\"Algebra $RUN\",\"code\":\"ALG-$RUN\"}")" | field id)"

R="$(req POST "$AC/departments" "$OWNER" "$INST" "{\"name\":\"Science $RUN\",\"code\":\"SCI-$RUN\",\"headUserId\":\"$TEACHING_STAFF_ID\"}")"
DEPT_ID="$(body "$R" | field id)"
chk "department head = staff" "$([ -n "$DEPT_ID" ] && echo ok)" ok
HEAD="$(req GET "$AC/departments?search=Science%20$RUN" "$OWNER" "$INST" | sed '$d' | field items.0.headUserName)"
chk "  head name resolves" "$([ -n "$HEAD" ] && echo ok)" ok

R="$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GRADE_ID\",\"classTeacherId\":\"$TEACHING_STAFF_ID\"}")"
CLASS_ID="$(body "$R" | field id)"
chk "class teacher = staff" "$([ -n "$CLASS_ID" ] && echo ok)" ok
CTNAME="$(req GET "$AC/classes?search=Class%20$RUN" "$OWNER" "$INST" | sed '$d' | field items.0.classTeacherName)"
chk "  class teacher name resolves" "$([ -n "$CTNAME" ] && echo ok)" ok

R="$(req POST "$AC/classes/$CLASS_ID/subjects" "$OWNER" "$INST" "{\"subjectId\":\"$SUBJ_ID\",\"teacherId\":\"$TEACHING_STAFF_ID\"}")"
ASSIGN_ID="$(body "$R" | field id)"
chk "class-subject teacher assigned" "$([ -n "$ASSIGN_ID" ] && echo ok)" ok

chk "teaching-options includes new staff" "$(req GET "$PP/staff/teaching-options" "$OWNER" "$INST" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const id=process.argv[1];const o=JSON.parse(s);const items=o.items||o;console.log(items.some(x=>x.id===id)?'yes':'no')}catch{console.log('no')}})" "$TEACHING_STAFF_ID")" yes

echo "== 4. Profiles + roster =="
chk "staff profile -> 200" "$(code "$(req GET "$PP/staff/$TEACHING_STAFF_ID/profile" "$OWNER" "$INST")")" 200
chk "parent profile -> 200" "$(code "$(req GET "$PP/parents/$PARENT_ID/profile" "$OWNER" "$INST")")" 200
chk "class roster -> 200" "$(code "$(req GET "$AC/classes/$CLASS_ID/roster" "$OWNER" "$INST")")" 200

echo "== 5. Filters =="
chk "staff filter status=active -> 200" "$(code "$(req GET "$PP/staff?status=active" "$OWNER" "$INST")")" 200
chk "staff filter teaching=true -> 200" "$(code "$(req GET "$PP/staff?teaching=true" "$OWNER" "$INST")")" 200

echo "== 6. Validation + concurrency =="
chk "staff unknown departmentId -> 400" "$(code "$(req POST "$PP/staff" "$OWNER" "$INST" "{\"firstName\":\"x\",\"lastName\":\"y\",\"departmentId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
chk "staff update bumps version -> 200" "$(code "$(req PATCH "$PP/staff/$TEACHING_STAFF_ID" "$OWNER" "$INST" "{\"designation\":\"Lead\",\"version\":0}")")" 200
chk "staff update stale version (retry) -> 409" "$(code "$(req PATCH "$PP/staff/$TEACHING_STAFF_ID" "$OWNER" "$INST" "{\"designation\":\"Nope\",\"version\":0}")")" 409

echo "== 7. Scope isolation =="
chk "campus-admin GET staff -> 200" "$(code "$(req GET "$PP/staff" "$CAMPUS" "$INST")")" 200
R="$(req POST "$PP/staff" "$CAMPUS" "$INST" "{\"firstName\":\"Cara $RUN\",\"lastName\":\"Campus\",\"createLogin\":false}")"
CSTAFF_ID="$(body "$R" | field id)"
chk "campus-admin create in scope" "$([ -n "$CSTAFF_ID" ] && echo ok)" ok
R="$(req GET "$PP/staff" "$CAMPUS" "campus:00000000-0000-0000-0000-000000000000")"
chk "foreign campus -> 403" "$(code "$R")" 403

echo "== 8. Guardian links =="
R="$(req POST "$PP/students/$STUDENT_ID/guardians" "$OWNER" "$INST" "{\"parentId\":\"$PARENT_ID\",\"relationship\":\"mother\",\"isPrimary\":true}")"
LINK_ID="$(body "$R" | field id)"
chk "link guardian" "$([ -n "$LINK_ID" ] && echo ok)" ok
[ -n "$LINK_ID" ] && chk "remove guardian -> 200" "$(code "$(req DELETE "$PP/students/$STUDENT_ID/guardians/$LINK_ID" "$OWNER" "$INST")")" 200

echo "== 9. Cleanup =="
delv(){ local base="$1" lp="$2" id="$3" e="$4"
  local v; v="$(req GET "$base/$lp?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  $lp/$id"; return; }
  chk "delete $lp/${id:0:8}" "$(code "$(req DELETE "$base/$lp/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$ASSIGN_ID" ] && chk "remove class subject" "$(code "$(req DELETE "$AC/classes/$CLASS_ID/subjects/$ASSIGN_ID" "$OWNER" "$INST")")" 200
[ -n "$CLASS_ID" ] && delv "$AC" "classes" "$CLASS_ID" "$OWNER"
[ -n "$SUBJ_ID" ] && delv "$AC" "subjects" "$SUBJ_ID" "$OWNER"
[ -n "$DEPT_ID" ] && delv "$AC" "departments" "$DEPT_ID" "$OWNER"
[ -n "$GRADE_ID" ] && delv "$AC" "grade-levels" "$GRADE_ID" "$OWNER"
[ -n "$YEAR_ID" ] && delv "$AC" "academic-years" "$YEAR_ID" "$OWNER"
[ -n "$STUDENT_ID" ] && delv "$PP" "students" "$STUDENT_ID" "$OWNER"
[ -n "$PARENT_ID" ] && delv "$PP" "parents" "$PARENT_ID" "$OWNER"
[ -n "$STAFF_ID" ] && delv "$PP" "staff" "$STAFF_ID" "$OWNER"
[ -n "$TEACHING_STAFF_ID" ] && delv "$PP" "staff" "$TEACHING_STAFF_ID" "$OWNER"
[ -n "$CSTAFF_ID" ] && delv "$PP" "staff" "$CSTAFF_ID" "$OWNER"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
