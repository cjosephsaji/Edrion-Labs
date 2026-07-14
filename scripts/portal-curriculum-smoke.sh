#!/usr/bin/env bash
# Academic-setup hierarchy live smoke (migration 0065 — programme_subjects).
#
# Proves, against the running API, the four gaps this change closes:
#   1. curriculum   — a subject can be placed in a (programme, year, semester) slot and read back
#                     with its full lineage; the slot is unique; the placement shows on the subject.
#   2. semesters    — an academic term carries its programme + year, so it stops being an orphan
#                     and reports how many curriculum subjects and classes hang off it.
#   3. classes      — a class carries its programme year + semester, and "apply curriculum" seeds
#                     its subjects from that slot (idempotent: pressing it twice adds nothing).
#   4. roster       — students can be bulk-added to / removed from a class in one write, with
#                     capacity enforced and foreign students rejected.
#
# Self-cleaning: everything is created under a unique run suffix and deleted at the end.
# Prereqs: API on :3001, portal seed, PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3001/v1}"
AC="$API/portal/academics"
OWNER="${OWNER:-owner@greenwood.edu}"
TEACHER="${TEACHER:-teacher@greenwood.edu}"   # academics.view only — must not be able to mutate
SCOPE='institution'
RUN="curr-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
req(){ local m="$1" p="$2" e="$3" b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $SCOPE" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $SCOPE"
  fi
}
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== setup: programme -> year -> semester =="

r=$(req POST "$AC/departments" "$OWNER" "{\"name\":\"Applied Psychology $RUN\",\"code\":\"AP-$RUN\"}")
DEPT=$(body "$r" | field id); chk "create programme" "$(code "$r")" "201"

r=$(req POST "$AC/grade-levels" "$OWNER" "{\"name\":\"Year 1 $RUN\",\"level\":1,\"departmentId\":\"$DEPT\"}")
GRADE=$(body "$r" | field id); chk "create year" "$(code "$r")" "201"

r=$(req POST "$AC/department-grade-levels" "$OWNER" "{\"departmentId\":\"$DEPT\",\"gradeLevelId\":\"$GRADE\",\"sequence\":1,\"durationLabel\":\"3 years\"}")
LEVEL=$(body "$r" | field id); chk "link programme<->year" "$(code "$r")" "201"

r=$(req GET "$AC/academic-years?page=1&pageSize=1&sortDir=desc&sortBy=startDate" "$OWNER")
YEAR=$(body "$r" | field items.0.id)
[ -n "$YEAR" ] || { echo "  FATAL no academic year seeded"; exit 1; }

# The semester now carries its programme + year — this is what made terms "orphans" before.
r=$(req POST "$AC/academic-terms" "$OWNER" "{\"academicYearId\":\"$YEAR\",\"programmeLevelId\":\"$LEVEL\",\"name\":\"Semester 1 $RUN\",\"kind\":\"semester\",\"sequence\":1,\"startDate\":\"2026-06-01\",\"endDate\":\"2026-11-30\"}")
TERM=$(body "$r" | field id); chk "create semester with programme link" "$(code "$r")" "201"
chk "semester back-fills departmentId from the link" "$(body "$r" | field departmentId)" "$DEPT"

echo "== 1. curriculum: place a subject in (programme, year, semester) =="

r=$(req POST "$AC/subjects" "$OWNER" "{\"name\":\"Discrete Mathematics $RUN\",\"code\":\"DM-$RUN\",\"kind\":\"core\",\"departmentId\":\"$DEPT\"}")
SUBJ=$(body "$r" | field id); chk "create subject" "$(code "$r")" "201"

r=$(req POST "$AC/programme-subjects" "$OWNER" "{\"subjectId\":\"$SUBJ\",\"programmeLevelId\":\"$LEVEL\",\"semesterSequence\":1,\"credits\":4}")
PS=$(body "$r" | field id); PSV=$(body "$r" | field version)
chk "place subject in semester 1" "$(code "$r")" "201"
chk "placement derives departmentId" "$(body "$r" | field departmentId)" "$DEPT"

r=$(req POST "$AC/programme-subjects" "$OWNER" "{\"subjectId\":\"$SUBJ\",\"programmeLevelId\":\"$LEVEL\",\"semesterSequence\":1}")
chk "same subject twice in one slot -> 409" "$(code "$r")" "409"

r=$(req GET "$AC/programme-subjects?programmeLevelId=$LEVEL&semesterSequence=1&page=1&pageSize=20&sortDir=asc" "$OWNER")
chk "curriculum list finds it" "$(body "$r" | field items.0.subjectId)" "$SUBJ"
chk "curriculum row states the programme" "$(body "$r" | field items.0.departmentName)" "Applied Psychology $RUN"
chk "curriculum row states the year" "$(body "$r" | field items.0.gradeLevelName)" "Year 1 $RUN"

# The subjects list now answers "what year/semester is this taught in?" — the original complaint.
r=$(req GET "$AC/subjects?search=DM-$RUN&page=1&pageSize=5&sortDir=asc" "$OWNER")
chk "subject row carries its placement" "$(body "$r" | field items.0.placements.0.semesterSequence)" "1"
chk "placement names the programme" "$(body "$r" | field items.0.placements.0.departmentName)" "Applied Psychology $RUN"

r=$(req GET "$AC/subjects?programmeLevelId=$LEVEL&semesterSequence=1&page=1&pageSize=20&sortDir=asc" "$OWNER")
chk "subjects filter by year+semester" "$(body "$r" | field items.0.id)" "$SUBJ"

r=$(req POST "$AC/programme-subjects" "$TEACHER" "{\"subjectId\":\"$SUBJ\",\"programmeLevelId\":\"$LEVEL\",\"semesterSequence\":2}")
chk "view-only user cannot write curriculum" "$(code "$r")" "403"

echo "== 2. the semester reports what hangs off it =="

r=$(req GET "$AC/academic-terms?programmeLevelId=$LEVEL&page=1&pageSize=5&sortDir=asc" "$OWNER")
chk "term list states its programme" "$(body "$r" | field items.0.departmentName)" "Applied Psychology $RUN"
chk "term counts its curriculum subjects" "$(body "$r" | field items.0.subjectCount)" "1"

echo "== 3. class: placed in the structure, curriculum applied =="

r=$(req POST "$AC/classes" "$OWNER" "{\"academicYearId\":\"$YEAR\",\"gradeLevelId\":\"$GRADE\",\"programmeLevelId\":\"$LEVEL\",\"termId\":\"$TERM\",\"name\":\"Section A $RUN\",\"section\":\"A\",\"capacity\":2}")
CLS=$(body "$r" | field id); chk "create class in the semester" "$(code "$r")" "201"

r=$(req GET "$AC/classes?programmeLevelId=$LEVEL&page=1&pageSize=5&sortDir=asc" "$OWNER")
chk "class row states its programme" "$(body "$r" | field items.0.departmentName)" "Applied Psychology $RUN"
chk "class row states its semester" "$(body "$r" | field items.0.termName)" "Semester 1 $RUN"

r=$(req GET "$AC/classes/$CLS/curriculum" "$OWNER")
chk "class inherits the curriculum" "$(body "$r" | field 0.subjectId)" "$SUBJ"
chk "…and knows it isn't teaching it yet" "$(body "$r" | field 0.assigned)" "false"

r=$(req POST "$AC/classes/$CLS/curriculum/apply" "$OWNER" '{}')
chk "apply curriculum adds the subject" "$(body "$r" | field added)" "1"

r=$(req POST "$AC/classes/$CLS/curriculum/apply" "$OWNER" '{}')
chk "applying twice is a no-op" "$(body "$r" | field added)" "0"

r=$(req GET "$AC/classes/$CLS/subjects" "$OWNER")
chk "class now teaches the subject" "$(body "$r" | field 0.subjectId)" "$SUBJ"

echo "== 4. roster: bulk add / remove =="

PEOPLE="$API/portal/people"
mkstudent(){ # mkstudent <n> -> prints the new student's id
  local n="$1" out
  out=$(req POST "$PEOPLE/students" "$OWNER" "{\"admissionNo\":\"ADM-$RUN-$n\",\"firstName\":\"Test$n\",\"lastName\":\"Student $RUN\",\"dateOfBirth\":\"2007-01-0$n\",\"gradeLevelId\":\"$GRADE\",\"status\":\"enrolled\"}")
  body "$out" | field id
}
S1=$(mkstudent 1); S2=$(mkstudent 2); S3=$(mkstudent 3)
chk "seeded 3 students" "$([ -n "$S1" ] && [ -n "$S2" ] && [ -n "$S3" ] && echo yes || echo no)" "yes"

r=$(req GET "$AC/classes/$CLS/roster/candidates?search=$RUN" "$OWNER")
chk "unassigned students are candidates" "$(body "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log("")}})')" "3"

r=$(req PATCH "$AC/classes/$CLS/roster" "$OWNER" "{\"add\":[\"$S1\",\"$S2\"]}")
chk "bulk add 2 students" "$(body "$r" | field added)" "2"

r=$(req GET "$AC/classes/$CLS/roster" "$OWNER")
chk "roster now holds 2" "$(body "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log("")}})')" "2"

r=$(req GET "$AC/classes?search=$RUN&page=1&pageSize=1&sortDir=asc" "$OWNER")
chk "class row reports the new student count" "$(body "$r" | field items.0.studentCount)" "2"

# Capacity is 2 and 2 seats are taken, so a third must be refused rather than silently overfilling.
r=$(req PATCH "$AC/classes/$CLS/roster" "$OWNER" "{\"add\":[\"$S3\"]}")
chk "over capacity (2) -> 400" "$(code "$r")" "400"

r=$(req PATCH "$AC/classes/$CLS/roster" "$OWNER" "{\"add\":[\"00000000-0000-0000-0000-000000000000\"]}")
chk "foreign student -> 400" "$(code "$r")" "400"

r=$(req PATCH "$AC/classes/$CLS/roster" "$TEACHER" "{\"add\":[\"$S1\"]}")
chk "view-only user cannot change the roster" "$(code "$r")" "403"

# Already-seated students only surface as candidates when you ask to move them.
r=$(req GET "$AC/classes/$CLS/roster/candidates?search=$RUN" "$OWNER")
chk "seated students drop out of the candidate list" "$(body "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log("")}})')" "1"

r=$(req PATCH "$AC/classes/$CLS/roster" "$OWNER" "{\"remove\":[\"$S1\",\"$S2\"]}")
chk "bulk remove" "$(body "$r" | field removed)" "2"

echo "== 5. programme structure tree carries subjects =="

r=$(req GET "$AC/programme-structure?departmentId=$DEPT" "$OWNER")
chk "tree: semester lists its subject" "$(body "$r" | field 0.levels.0.terms.0.subjects.0.subjectId)" "$SUBJ"
chk "tree: semester lists its class" "$(body "$r" | field 0.levels.0.terms.0.sections.0.id)" "$CLS"

echo "== cleanup =="
# ver <url> <jsonpath> -> current version of a row, so cleanup survives version drift.
ver(){ local out; out=$(req GET "$1" "$OWNER"); body "$out" | field "$2"; }
for s in "$S1" "$S2" "$S3"; do
  [ -n "$s" ] && req DELETE "$PEOPLE/students/$s" "$OWNER" "{\"version\":$(ver "$PEOPLE/students/$s" version)}" >/dev/null
done
req DELETE "$AC/classes/$CLS" "$OWNER" "{\"version\":$(ver "$AC/classes?search=$RUN&page=1&pageSize=1&sortDir=asc" items.0.version)}" >/dev/null
req DELETE "$AC/programme-subjects/$PS" "$OWNER" "{\"version\":$PSV}" >/dev/null
req DELETE "$AC/academic-terms/$TERM" "$OWNER" "{\"version\":0}" >/dev/null
req DELETE "$AC/subjects/$SUBJ" "$OWNER" "{\"version\":0}" >/dev/null
req DELETE "$AC/department-grade-levels/$LEVEL" "$OWNER" "{\"version\":0}" >/dev/null
req DELETE "$AC/grade-levels/$GRADE" "$OWNER" "{\"version\":0}" >/dev/null
req DELETE "$AC/departments/$DEPT" "$OWNER" "{\"version\":0}" >/dev/null
echo "  cleaned"

echo
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
