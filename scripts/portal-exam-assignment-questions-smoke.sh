#!/usr/bin/env bash
# Exams & assignments questions: author → target → attempt → auto-grade → manual-grade smoke.
#
# Prereqs: API on :3001, DB migrated (0062), seeded portal users, PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3001/v1}"
EX="$API/portal/exams"
AS="$API/portal/assignments"
AC="$API/portal/academics"
PP="$API/portal/people"
STU_API="$API/student"
OWNER='owner@greenwood.edu'
RUN="qa-$(date +%s)"
TODAY="$(date +%F)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
req(){ local m="$1" p="$2" e="$3" sc="$4" b="${5:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc"; fi; }
stu(){ local m="$1" p="$2" e="$3" b="${4:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-student-email: $e" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-student-email: $e"; fi; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }
INST='institution'
STUDENT='student@greenwood.edu'

echo "== 1. Scaffolding =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GLVL_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
SUBJ_ID="$(body "$(req POST "$AC/subjects" "$OWNER" "$INST" "{\"name\":\"Math $RUN\",\"code\":\"M-$RUN\"}")" | field id)"
CLASS_ID="$(body "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GLVL_ID\"}")" | field id)"
STU_ID="$(body "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"classId\":\"$CLASS_ID\"}")" | field id)"
chk "scaffolding" "$([ -n "$CLASS_ID$STU_ID" ] && echo ok)" ok

echo "== 2. Exam with audience + question =="
R="$(req POST "$EX" "$OWNER" "$INST" "{\"name\":\"Quiz $RUN\",\"audience\":[{\"kind\":\"class\",\"refId\":\"$CLASS_ID\"}],\"durationMin\":30}")"
EXAM_ID="$(body "$R" | field id)"
chk "create exam" "$([ -n "$EXAM_ID" ] && echo ok)" ok
R="$(req POST "$EX/audience/preview" "$OWNER" "$INST" "{\"targets\":[{\"kind\":\"class\",\"refId\":\"$CLASS_ID\"}]}")"
chk "audience preview -> 200" "$(code "$R")" 200
R="$(req POST "$EX/$EXAM_ID/schedules" "$OWNER" "$INST" "{\"classId\":\"$CLASS_ID\",\"subjectId\":\"$SUBJ_ID\",\"examDate\":\"$TODAY\"}")"
SCHED_ID="$(body "$R" | field id)"
chk "create paper" "$([ -n "$SCHED_ID" ] && echo ok)" ok
R="$(req POST "$EX/$EXAM_ID/schedules/$SCHED_ID/questions" "$OWNER" "$INST" "{\"qtype\":\"mcq_single\",\"prompt\":\"2+2=?\",\"options\":[{\"key\":\"A\",\"label\":\"4\"},{\"key\":\"B\",\"label\":\"5\"}],\"correctKey\":\"A\",\"marks\":5,\"sequence\":1}")"
QID="$(body "$R" | field id)"
chk "create MCQ" "$([ -n "$QID" ] && echo ok)" ok

echo "== 3. Student attempt + auto-grade =="
R="$(stu GET "$STU_API/exam-papers/$SCHED_ID" "$STUDENT")"
chk "student get paper -> 200" "$(code "$R")" 200
R="$(stu POST "$STU_API/exam-papers/$SCHED_ID/start" "$STUDENT")"
chk "start attempt -> 200" "$(code "$R")" 200
R="$(stu PUT "$STU_API/exam-papers/$SCHED_ID/answers/$QID" "$STUDENT" "{\"choiceKey\":\"A\"}")"
chk "save answer -> 200" "$(code "$R")" 200
R="$(stu POST "$STU_API/exam-papers/$SCHED_ID/finish" "$STUDENT")"
SCORE="$(body "$R" | field autoScore)"
chk "finish + auto-score" "$([ "$SCORE" = "5" ] && echo ok)" ok

echo "== 4. Quiz assignment =="
R="$(req POST "$AS" "$OWNER" "$INST" "{\"title\":\"HW $RUN\",\"classId\":\"$CLASS_ID\",\"deliveryMode\":\"quiz\",\"durationMin\":20,\"audience\":[{\"kind\":\"class\",\"refId\":\"$CLASS_ID\"}]}")"
ASN_ID="$(body "$R" | field id)"
chk "create quiz assignment" "$([ -n "$ASN_ID" ] && echo ok)" ok
R="$(req POST "$AS/$ASN_ID/questions" "$OWNER" "$INST" "{\"qtype\":\"true_false\",\"prompt\":\"Earth is round\",\"options\":[{\"key\":\"T\",\"label\":\"True\"},{\"key\":\"F\",\"label\":\"False\"}],\"correctKey\":\"T\",\"marks\":2,\"sequence\":1}")"
AQID="$(body "$R" | field id)"
chk "assignment question" "$([ -n "$AQID" ] && echo ok)" ok

echo "== 5. Cleanup =="
[ -n "$EXAM_ID" ] && req DELETE "$EX/$EXAM_ID" "$OWNER" "$INST" '{"version":0}' >/dev/null
[ -n "$ASN_ID" ] && req DELETE "$AS/$ASN_ID" "$OWNER" "$INST" '{"version":0}' >/dev/null

echo ""
echo "Results: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
