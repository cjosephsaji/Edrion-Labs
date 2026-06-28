#!/usr/bin/env bash
# Phase 4 (Institution Portal — People) live smoke.
#
# Proves, against the running API + seeded portal users, that the people verticals are real and the
# portal's guarantees hold for them:
#   1. permission gating  — per-resource keys: students.{view,create,update,delete}; teachers/staff/
#                           parents.{view,manage} (teacher can view students, not create; parent: none).
#   2. full CRUD          — students, teachers, staff, parents + student↔guardian links.
#   3. teacher pickers    — the P2-deferred FKs now resolve to teachers: a class teacher, a department
#                           head and a class-subject teacher all accept a teachers.id and echo the name.
#   4. tenancy/refs       — unknown foreign keys -> 400 (not 500); unknown teacher -> 400.
#   5. optimistic concurrency — a stale version on update -> 409.
#   6. scope isolation    — confined campus-admin can work in its campus; a foreign campus -> 403.
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end.
#
# Prereqs: API on :3001, DB seeded + `pnpm --filter @edrion/database seed:portal`, migration 0014
# applied, and in .env PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B  # disable brace expansion so JSON bodies like {"a":1,"b":2} aren't split on commas
API="${API:-http://localhost:3001/v1}"
PP="$API/portal/people"
AC="$API/portal/academics"
OWNER='owner@greenwood.edu'      # institution_owner (wildcard)
TEACHER='teacher@greenwood.edu'  # students.view only (no create); no teachers.manage
PARENT='parent@greenwood.edu'    # no people permissions
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, teachers.manage + students.create
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
chk "teacher POST student -> 403 (no students.create)" "$(code "$(req POST "$PP/students" "$TEACHER" "$INST" "{\"admissionNo\":\"x\",\"firstName\":\"x\",\"lastName\":\"y\"}")")" 403
chk "teacher POST teacher -> 403 (no teachers.manage)" "$(code "$(req POST "$PP/teachers" "$TEACHER" "$INST" "{\"firstName\":\"x\",\"lastName\":\"y\"}")")" 403

echo "== 2. CRUD happy path (owner, institution scope) =="
R="$(req POST "$PP/teachers" "$OWNER" "$INST" "{\"firstName\":\"Tara $RUN\",\"lastName\":\"Teach\",\"employeeNo\":\"EMP-$RUN\",\"designation\":\"Senior Teacher\"}")"
chk "create teacher -> 200/201" "$([ "$(code "$R")" = 200 ] || [ "$(code "$R")" = 201 ] && echo ok)" ok
TEACHER_ID="$(body "$R" | field id)"
chk "  returns an id" "$([ -n "$TEACHER_ID" ] && echo ok)" ok

R="$(req POST "$PP/staff" "$OWNER" "$INST" "{\"firstName\":\"Sam $RUN\",\"lastName\":\"Staff\",\"designation\":\"Accountant\"}")"
STAFF_ID="$(body "$R" | field id)"
chk "create staff" "$([ -n "$STAFF_ID" ] && echo ok)" ok

R="$(req POST "$PP/parents" "$OWNER" "$INST" "{\"firstName\":\"Pam $RUN\",\"lastName\":\"Parent\",\"phone\":\"+1 555 0100\"}")"
PARENT_ID="$(body "$R" | field id)"
chk "create parent" "$([ -n "$PARENT_ID" ] && echo ok)" ok

R="$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"status\":\"enrolled\"}")"
STUDENT_ID="$(body "$R" | field id)"
chk "create student" "$([ -n "$STUDENT_ID" ] && echo ok)" ok

echo "== 3. Teacher pickers (P2-deferred FKs now resolve to teachers) =="
# academic scaffolding
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GRADE_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
SUBJ_ID="$(body "$(req POST "$AC/subjects" "$OWNER" "$INST" "{\"name\":\"Algebra $RUN\",\"code\":\"ALG-$RUN\"}")" | field id)"

R="$(req POST "$AC/departments" "$OWNER" "$INST" "{\"name\":\"Science $RUN\",\"code\":\"SCI-$RUN\",\"headUserId\":\"$TEACHER_ID\"}")"
DEPT_ID="$(body "$R" | field id)"
chk "department head = teacher -> 200/201" "$([ -n "$DEPT_ID" ] && echo ok)" ok
HEAD="$(req GET "$AC/departments?search=Science%20$RUN" "$OWNER" "$INST" | sed '$d' | field items.0.headUserName)"
chk "  head name resolves" "$([ -n "$HEAD" ] && echo ok)" ok

R="$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GRADE_ID\",\"classTeacherId\":\"$TEACHER_ID\"}")"
CLASS_ID="$(body "$R" | field id)"
chk "class teacher = teacher -> created" "$([ -n "$CLASS_ID" ] && echo ok)" ok
CTNAME="$(req GET "$AC/classes?search=Class%20$RUN" "$OWNER" "$INST" | sed '$d' | field items.0.classTeacherName)"
chk "  class teacher name resolves" "$([ -n "$CTNAME" ] && echo ok)" ok

R="$(req POST "$AC/classes/$CLASS_ID/subjects" "$OWNER" "$INST" "{\"subjectId\":\"$SUBJ_ID\",\"teacherId\":\"$TEACHER_ID\"}")"
ASSIGN_ID="$(body "$R" | field id)"
chk "class-subject teacher = teacher -> assigned" "$([ -n "$ASSIGN_ID" ] && echo ok)" ok
STNAME="$(req GET "$AC/classes/$CLASS_ID/subjects" "$OWNER" "$INST" | sed '$d' | field 0.teacherName)"
chk "  subject teacher name resolves" "$([ -n "$STNAME" ] && echo ok)" ok
chk "class teacher = unknown id -> 400" "$(code "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"bad $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GRADE_ID\",\"classTeacherId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400

echo "== 4. Validation + tenancy guards =="
chk "student unknown classId -> 400" "$(code "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADMX-$RUN\",\"firstName\":\"x\",\"lastName\":\"y\",\"classId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
chk "teacher unknown departmentId -> 400" "$(code "$(req POST "$PP/teachers" "$OWNER" "$INST" "{\"firstName\":\"x\",\"lastName\":\"y\",\"departmentId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400

echo "== 5. Optimistic concurrency =="
chk "teacher update current version -> 200" "$(code "$(req PATCH "$PP/teachers/$TEACHER_ID" "$OWNER" "$INST" "{\"designation\":\"Lead Teacher\",\"version\":0}")")" 200
chk "teacher update stale version -> 409"   "$(code "$(req PATCH "$PP/teachers/$TEACHER_ID" "$OWNER" "$INST" "{\"designation\":\"Nope\",\"version\":0}")")" 409

echo "== 6. Scope isolation (confined campus admin) =="
chk "campus-admin GET teachers -> 200" "$(code "$(req GET "$PP/teachers" "$CAMPUS" "$INST")")" 200
R="$(req POST "$PP/teachers" "$CAMPUS" "$INST" "{\"firstName\":\"Cara $RUN\",\"lastName\":\"Campus\"}")"
CTEACHER_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CTEACHER_ID" ] && echo ok)" ok
CTEACHER_CAMPUS="$(body "$R" | field campusId)"
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$CTEACHER_CAMPUS" ] && echo ok)" ok
R="$(req GET "$PP/teachers" "$CAMPUS" "campus:00000000-0000-0000-0000-000000000000")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 7. Student ↔ guardian links =="
R="$(req POST "$PP/students/$STUDENT_ID/guardians" "$OWNER" "$INST" "{\"parentId\":\"$PARENT_ID\",\"relationship\":\"mother\",\"isPrimary\":true}")"
LINK_ID="$(body "$R" | field id)"
chk "link guardian -> created" "$([ -n "$LINK_ID" ] && echo ok)" ok
GLEN="$(req GET "$PP/students/$STUDENT_ID/guardians" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(-1)}})')"
chk "guardians length == 1" "$GLEN" 1
chk "unknown parentId -> 400" "$(code "$(req POST "$PP/students/$STUDENT_ID/guardians" "$OWNER" "$INST" "{\"parentId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
[ -n "$LINK_ID" ] && chk "remove guardian -> 200" "$(code "$(req DELETE "$PP/students/$STUDENT_ID/guardians/$LINK_ID" "$OWNER" "$INST")")" 200

echo "== 8. Cleanup (re-read versions, delete) =="
delv(){ # delv <basePath> <listPath> <id> <email>
  local base="$1" lp="$2" id="$3" e="$4"
  local v; v="$(req GET "$base/$lp?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  $lp/$id (not found)"; return; }
  chk "delete $lp/${id:0:8} -> 200" "$(code "$(req DELETE "$base/$lp/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$ASSIGN_ID" ] && chk "remove class subject -> 200" "$(code "$(req DELETE "$AC/classes/$CLASS_ID/subjects/$ASSIGN_ID" "$OWNER" "$INST")")" 200
[ -n "$CLASS_ID" ] && delv "$AC" "classes" "$CLASS_ID" "$OWNER"
[ -n "$SUBJ_ID" ] && delv "$AC" "subjects" "$SUBJ_ID" "$OWNER"
[ -n "$DEPT_ID" ] && delv "$AC" "departments" "$DEPT_ID" "$OWNER"
[ -n "$GRADE_ID" ] && delv "$AC" "grade-levels" "$GRADE_ID" "$OWNER"
[ -n "$YEAR_ID" ] && delv "$AC" "academic-years" "$YEAR_ID" "$OWNER"
[ -n "$STUDENT_ID" ] && delv "$PP" "students" "$STUDENT_ID" "$OWNER"
[ -n "$PARENT_ID" ] && delv "$PP" "parents" "$PARENT_ID" "$OWNER"
[ -n "$STAFF_ID" ] && delv "$PP" "staff" "$STAFF_ID" "$OWNER"
[ -n "$TEACHER_ID" ] && delv "$PP" "teachers" "$TEACHER_ID" "$OWNER"
[ -n "$CTEACHER_ID" ] && delv "$PP" "teachers" "$CTEACHER_ID" "$OWNER"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
