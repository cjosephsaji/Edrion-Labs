#!/usr/bin/env bash
# Phase 6 (Institution Portal — Exams, Gradebook, Assignments) live smoke.
#
# Proves, against the running API + seeded portal users, that the three P6 verticals are real and the
# portal's guarantees hold:
#   1. permission gating  — exams.{view,manage}, gradebook.{view,manage}, assignments.{view,manage}.
#   2. exams — exam CRUD + nested scheduled papers; duplicate paper -> 409; end<=start -> 400.
#   3. gradebook — flat marks CRUD; duplicate (student,subject,exam) -> 409; marks>max -> 400.
#   4. assignments — assignment CRUD + bulk per-student submissions; points>max -> 400.
#   5. tenancy/refs — unknown foreign keys -> 400 (not 500).
#   6. optimistic concurrency — a stale version on update -> 409.
#   7. scope isolation — confined campus-admin works in its campus; a foreign campus -> 403.
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end.
#
# Prereqs: API on :3007, DB seeded + `pnpm --filter @edrion/database seed:portal`, migration 0016
# applied, and in .env PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B
API="${API:-http://localhost:3007/v1}"
EX="$API/portal/exams"
GB="$API/portal/gradebook"
AS="$API/portal/assignments"
AC="$API/portal/academics"
PP="$API/portal/people"
OWNER='owner@greenwood.edu'          # institution_owner (wildcard)
TEACHER='teacher@greenwood.edu'      # exams.view (NO exams.manage); gradebook+assignments manage
PARENT='parent@greenwood.edu'        # gradebook.view only; NO exams, NO assignments, NO manage
STUDENT='student@greenwood.edu'      # exams/gradebook/assignments view; NO manage
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, exams manage
RUN="smoke-$(date +%s)"
TODAY="$(date +%F)"

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

echo "== 1. Permission gating =="
chk "owner GET exams -> 200"          "$(code "$(req GET "$EX" "$OWNER" "$INST")")" 200
chk "parent GET exams -> 403"         "$(code "$(req GET "$EX" "$PARENT" "$INST")")" 403
chk "teacher GET exams -> 200"        "$(code "$(req GET "$EX" "$TEACHER" "$INST")")" 200
chk "teacher POST exam -> 403"        "$(code "$(req POST "$EX" "$TEACHER" "$INST" "{\"name\":\"x\"}")")" 403
chk "owner GET gradebook -> 200"      "$(code "$(req GET "$GB" "$OWNER" "$INST")")" 200
chk "parent GET gradebook -> 200"     "$(code "$(req GET "$GB" "$PARENT" "$INST")")" 200
chk "parent POST grade -> 403"        "$(code "$(req POST "$GB" "$PARENT" "$INST" "{\"studentId\":\"00000000-0000-0000-0000-000000000000\",\"subjectId\":\"00000000-0000-0000-0000-000000000000\",\"assessmentName\":\"x\"}")")" 403
chk "student GET assignments -> 200"  "$(code "$(req GET "$AS" "$STUDENT" "$INST")")" 200
chk "student POST assignment -> 403"  "$(code "$(req POST "$AS" "$STUDENT" "$INST" "{\"title\":\"x\",\"classId\":\"00000000-0000-0000-0000-000000000000\"}")")" 403
chk "owner GET assignments -> 200"    "$(code "$(req GET "$AS" "$OWNER" "$INST")")" 200

echo "== 2. Academic + people scaffolding (owner, institution scope) =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GLVL_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
SUBJ_ID="$(body "$(req POST "$AC/subjects" "$OWNER" "$INST" "{\"name\":\"Algebra $RUN\",\"code\":\"ALG-$RUN\"}")" | field id)"
TEACHER_ID="$(body "$(req POST "$PP/teachers" "$OWNER" "$INST" "{\"firstName\":\"Tara $RUN\",\"lastName\":\"Teach\"}")" | field id)"
CLASS_ID="$(body "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GLVL_ID\"}")" | field id)"
STU_ID="$(body "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"classId\":\"$CLASS_ID\"}")" | field id)"
chk "scaffolding created (year/grade/subject/teacher/class/student)" \
  "$([ -n "$YEAR_ID$GLVL_ID$SUBJ_ID$TEACHER_ID$CLASS_ID" ] && [ -n "$STU_ID" ] && echo ok)" ok

echo "== 3. Exams CRUD + scheduled papers =="
R="$(req POST "$EX" "$OWNER" "$INST" "{\"name\":\"Exam $RUN\",\"examType\":\"term\",\"academicYearId\":\"$YEAR_ID\",\"termLabel\":\"Term 1\"}")"
EXAM_ID="$(body "$R" | field id)"
chk "create exam -> id" "$([ -n "$EXAM_ID" ] && echo ok)" ok
chk "  default status draft" "$(body "$R" | field status)" draft
chk "exam unknown academicYearId -> 400" "$(code "$(req POST "$EX" "$OWNER" "$INST" "{\"name\":\"x\",\"academicYearId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
chk "update exam -> scheduled (v0) -> 200" "$(code "$(req PATCH "$EX/$EXAM_ID" "$OWNER" "$INST" "{\"status\":\"scheduled\",\"version\":0}")")" 200
R="$(req POST "$EX/$EXAM_ID/schedules" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"subjectId\":\"$SUBJ_ID\",\"examDate\":\"$TODAY\",\"startTime\":\"09:00\",\"endTime\":\"11:00\",\"maxMarks\":80}")"
SCHED_ID="$(body "$R" | field id)"
chk "create paper -> id" "$([ -n "$SCHED_ID" ] && echo ok)" ok
chk "duplicate paper (same class+subject) -> 409 (SCHEDULE_EXISTS)" "$(body "$(req POST "$EX/$EXAM_ID/schedules" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"subjectId\":\"$SUBJ_ID\",\"maxMarks\":50}")" | field code)" SCHEDULE_EXISTS
chk "paper unknown classId -> 400" "$(code "$(req POST "$EX/$EXAM_ID/schedules" "$OWNER" "$INST" "{\"classId\":\"00000000-0000-0000-0000-000000000000\",\"subjectId\":\"$SUBJ_ID\"}")")" 400
chk "paper end<=start -> 400" "$(code "$(req POST "$EX/$EXAM_ID/schedules" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"subjectId\":\"$SUBJ_ID\",\"startTime\":\"10:00\",\"endTime\":\"09:00\"}")")" 400
chk "papers length == 1" "$(req GET "$EX/$EXAM_ID/schedules" "$OWNER" "$INST" | sed '$d' | len)" 1
chk "exam stale version update -> 409" "$(code "$(req PATCH "$EX/$EXAM_ID" "$OWNER" "$INST" "{\"name\":\"nope\",\"version\":0}")")" 409

echo "== 4. Gradebook CRUD + validation =="
R="$(req POST "$GB" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\",\"subjectId\":\"$SUBJ_ID\",\"examId\":\"$EXAM_ID\",\"assessmentName\":\"Term 1\",\"marksObtained\":72,\"maxMarks\":80,\"letterGrade\":\"A\"}")"
GRADE_ID="$(body "$R" | field id)"
chk "create grade -> id" "$([ -n "$GRADE_ID" ] && echo ok)" ok
chk "  student name resolves" "$(req GET "$GB?studentId=$STU_ID" "$OWNER" "$INST" | sed '$d' | field items.0.studentName)" "Stu $RUN Dent"
chk "duplicate (student,subject,exam) -> 409 (GRADE_EXISTS)" "$(body "$(req POST "$GB" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\",\"subjectId\":\"$SUBJ_ID\",\"examId\":\"$EXAM_ID\",\"assessmentName\":\"dup\",\"marksObtained\":10,\"maxMarks\":80}")" | field code)" GRADE_EXISTS
chk "grade unknown studentId -> 400" "$(code "$(req POST "$GB" "$OWNER" "$INST" "{\"studentId\":\"00000000-0000-0000-0000-000000000000\",\"subjectId\":\"$SUBJ_ID\",\"assessmentName\":\"x\",\"marksObtained\":5,\"maxMarks\":10}")")" 400
chk "marks > max -> 400 (INVALID_MARKS)" "$(body "$(req POST "$GB" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\",\"subjectId\":\"$SUBJ_ID\",\"assessmentName\":\"over\",\"marksObtained\":150,\"maxMarks\":100}")" | field code)" INVALID_MARKS
chk "grade update current version -> 200" "$(code "$(req PATCH "$GB/$GRADE_ID" "$OWNER" "$INST" "{\"marksObtained\":75,\"version\":0}")")" 200
chk "grade update stale version -> 409" "$(code "$(req PATCH "$GB/$GRADE_ID" "$OWNER" "$INST" "{\"marksObtained\":1,\"version\":0}")")" 409

echo "== 5. Assignments CRUD + submissions =="
R="$(req POST "$AS" "$OWNER" "$INST" "{\"title\":\"Worksheet $RUN\",\"classId\":\"$CLASS_ID\",\"subjectId\":\"$SUBJ_ID\",\"teacherId\":\"$TEACHER_ID\",\"dueDate\":\"$TODAY\",\"maxPoints\":20}")"
ASSIGN_ID="$(body "$R" | field id)"
chk "create assignment -> id" "$([ -n "$ASSIGN_ID" ] && echo ok)" ok
chk "  default status draft" "$(body "$R" | field status)" draft
chk "assignment unknown classId -> 400" "$(code "$(req POST "$AS" "$OWNER" "$INST" "{\"title\":\"x\",\"classId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
GR="$(code "$(req POST "$AS/$ASSIGN_ID/submissions" "$OWNER" "$INST" "{\"submissions\":[{\"studentId\":\"$STU_ID\",\"status\":\"graded\",\"pointsAwarded\":18}]}")")"
chk "grade submission -> 200/201" "$([ "$GR" = 200 ] || [ "$GR" = 201 ] && echo ok)" ok
chk "submissions length == 1" "$(req GET "$AS/$ASSIGN_ID/submissions" "$OWNER" "$INST" | sed '$d' | len)" 1
chk "submit unknown studentId -> 400" "$(code "$(req POST "$AS/$ASSIGN_ID/submissions" "$OWNER" "$INST" "{\"submissions\":[{\"studentId\":\"00000000-0000-0000-0000-000000000000\",\"status\":\"submitted\"}]}")")" 400
chk "points > max -> 400 (INVALID_POINTS)" "$(body "$(req POST "$AS/$ASSIGN_ID/submissions" "$OWNER" "$INST" "{\"submissions\":[{\"studentId\":\"$STU_ID\",\"status\":\"graded\",\"pointsAwarded\":150}]}")" | field code)" INVALID_POINTS
chk "assignment update current version -> 200" "$(code "$(req PATCH "$AS/$ASSIGN_ID" "$OWNER" "$INST" "{\"status\":\"published\",\"version\":0}")")" 200
chk "assignment update stale version -> 409" "$(code "$(req PATCH "$AS/$ASSIGN_ID" "$OWNER" "$INST" "{\"status\":\"closed\",\"version\":0}")")" 409

echo "== 6. Scope isolation (confined campus admin) =="
chk "campus-admin GET exams -> 200" "$(code "$(req GET "$EX" "$CAMPUS" "$INST")")" 200
R="$(req POST "$EX" "$CAMPUS" "$INST" "{\"name\":\"CExam $RUN\",\"examType\":\"quiz\"}")"
CEXAM_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CEXAM_ID" ] && echo ok)" ok
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$(body "$R" | field campusId)" ] && echo ok)" ok
R="$(req GET "$EX" "$CAMPUS" "campus:00000000-0000-0000-0000-000000000000")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 7. Cleanup (re-read versions, delete) =="
delv(){ # delv <listUrl> <delBase> <id> <email>
  local listUrl="$1" delBase="$2" id="$3" e="$4"
  local v; v="$(req GET "$listUrl?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  ${id:0:8} (not found)"; return; }
  chk "delete ${id:0:8} -> 200" "$(code "$(req DELETE "$delBase/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$GRADE_ID" ] && delv "$GB" "$GB" "$GRADE_ID" "$OWNER"
[ -n "$ASSIGN_ID" ] && delv "$AS" "$AS" "$ASSIGN_ID" "$OWNER"   # submissions cascade
[ -n "$EXAM_ID" ] && delv "$EX" "$EX" "$EXAM_ID" "$OWNER"        # papers cascade
[ -n "$CEXAM_ID" ] && delv "$EX" "$EX" "$CEXAM_ID" "$OWNER"
[ -n "$STU_ID" ] && delv "$PP/students" "$PP/students" "$STU_ID" "$OWNER"
[ -n "$CLASS_ID" ] && delv "$AC/classes" "$AC/classes" "$CLASS_ID" "$OWNER"
[ -n "$SUBJ_ID" ] && delv "$AC/subjects" "$AC/subjects" "$SUBJ_ID" "$OWNER"
[ -n "$GLVL_ID" ] && delv "$AC/grade-levels" "$AC/grade-levels" "$GLVL_ID" "$OWNER"
[ -n "$YEAR_ID" ] && delv "$AC/academic-years" "$AC/academic-years" "$YEAR_ID" "$OWNER"
[ -n "$TEACHER_ID" ] && delv "$PP/teachers" "$PP/teachers" "$TEACHER_ID" "$OWNER"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
