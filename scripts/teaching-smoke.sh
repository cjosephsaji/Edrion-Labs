#!/usr/bin/env bash
# Teaching workspace live smoke (migration 0203 — subject-scoped teaching content).
#
# Covers the three defects the old /class-content page had:
#   1. it listed every class in the institution instead of the ones you teach;
#   2. it accepted contextId and subjectId in the query and silently ignored both, so picking a
#      class changed nothing and unrelated content appeared in the list;
#   3. uploading a file and publishing it were two steps, so a file could be uploaded and never
#      published while looking like it had been.
#
# Self-cleaning apart from the storage object each upload leaves behind (no delete path exists).
# Prereqs: API on :3007, PORTAL_AUTH_DEV_HEADER=true, STUDENT_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3007/v1}"
CC="$API/portal/course-content"
TEACHER="${TEACHER:-vmarysaji@gmail.com}"
ADMIN="${ADMIN:-cjosephsaji@gmail.com}"
STU="${STU:-student.test@toch.edrion.local}"
SCOPE='institution'
RUN="teach-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
count(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);console.log((o.items||[]).filter(i=>i.id===process.argv[1]).length)}catch{console.log("err")}})' "$1"; }

req(){ local m="$1" p="$2" e="$3" b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $SCOPE" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $SCOPE"
  fi
}
sreq(){ curl -s -w '\n%{http_code}' -X GET "$API/student${1}" -H "x-student-email: $STU"; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== 1. a teacher lands on the subjects they teach =="
r=$(req GET "$API/portal/teaching/mine" "$TEACHER")
chk "teacher can list their teaching" "$(code "$r")" "200"
chk "scoped to their own subjects" "$(body "$r" | field scope)" "own"
N=$(body "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).items||[]).length)}catch{console.log(0)}})')
chk "has at least two subjects to distinguish" "$([ "$N" -ge 2 ] && echo yes || echo no)" "yes"

CLASS=$(body "$r" | field items.0.classId)
SUBJ_A=$(body "$r" | field items.0.subjectId)
SUBJ_B=$(body "$r" | field items.1.subjectId)
chk "each row carries its subject" "$([ -n "$SUBJ_A" ] && [ -n "$SUBJ_B" ] && echo yes || echo no)" "yes"
chk "subject A and B are different" "$([ "$SUBJ_A" != "$SUBJ_B" ] && echo yes || echo no)" "yes"

echo "== 2. an admin with no staff row sees whose subject it is =="
r=$(req GET "$API/portal/teaching/mine" "$ADMIN")
chk "admin can list" "$(code "$r")" "200"
chk "admin sees every assignment" "$(body "$r" | field scope)" "all"
chk "each is labelled with its teacher" "$([ -n "$(body "$r" | field items.0.teacherName)" ] && echo yes || echo no)" "yes"
chk "admin is not the teacher of record" "$(body "$r" | field items.0.isMine)" "false"

echo "== 3. upload and publish is one action =="
r=$(curl -s -w '\n%{http_code}' -X POST \
  "$CC/materials/publish?filename=hypervisors-$RUN.txt&contextType=class&contextId=$CLASS&subjectId=$SUBJ_A" \
  -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $SCOPE" \
  -H 'content-type: text/plain' --data-binary "Type 1 vs type 2 hypervisors")
MAT_A=$(body "$r" | field id); MAT_A_V=$(body "$r" | field version)
chk "one call uploads and publishes" "$(code "$r")" "201"
chk "title defaults to the file name" "$(body "$r" | field title)" "hypervisors-$RUN"
chk "type is read from the file" "$(body "$r" | field kindLabel)" "Notes"
chk "filed under the chosen subject" "$(body "$r" | field subjectId)" "$SUBJ_A"

echo "== 4. the subject filter actually filters =="
r=$(curl -s -w '\n%{http_code}' -X POST \
  "$CC/materials/publish?filename=other-$RUN.txt&contextType=class&contextId=$CLASS&subjectId=$SUBJ_B" \
  -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $SCOPE" \
  -H 'content-type: text/plain' --data-binary "A different subject entirely")
MAT_B=$(body "$r" | field id); MAT_B_V=$(body "$r" | field version)
chk "publish to a second subject" "$(code "$r")" "201"

Q="page=1&pageSize=50&sortDir=desc&contextType=class&contextId=$CLASS"
r=$(req GET "$CC/materials?$Q&subjectId=$SUBJ_A" "$TEACHER")
chk "subject A list contains A" "$(body "$r" | count "$MAT_A")" "1"
chk "subject A list excludes B" "$(body "$r" | count "$MAT_B")" "0"
r=$(req GET "$CC/materials?$Q&subjectId=$SUBJ_B" "$TEACHER")
chk "subject B list contains B" "$(body "$r" | count "$MAT_B")" "1"
chk "subject B list excludes A" "$(body "$r" | count "$MAT_A")" "0"

echo "== 5. notes are filed under the subject too =="
r=$(req POST "$CC/notes" "$TEACHER" "{\"contextType\":\"class\",\"contextId\":\"$CLASS\",\"subjectId\":\"$SUBJ_A\",\"title\":\"Hypervisors $RUN\",\"body\":\"A type 1 hypervisor runs on bare metal.\"}")
NOTE=$(body "$r" | field id); NOTE_V=$(body "$r" | field version)
chk "note created under subject A" "$(body "$r" | field subjectId)" "$SUBJ_A"
r=$(req GET "$CC/notes?$Q&subjectId=$SUBJ_B" "$TEACHER")
chk "it does not leak into subject B" "$(body "$r" | count "$NOTE")" "0"

echo "== 6. the student sees the subject =="
r=$(sreq "/materials")
chk "student list responds" "$(code "$r")" "200"
SUBJ_NAME=$(body "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const m=(o.items||[]).find(i=>i.id===process.argv[1]);console.log(m&&m.subjectName?m.subjectName:"")})' "$MAT_A")
chk "the file carries its subject name" "$([ -n "$SUBJ_NAME" ] && echo yes || echo no)" "yes"

echo "== 7. content filed against the course is still found =="
# A college has both a class and a course for the same subject. Content attached to the course
# used to be invisible in the workspace, which keys on the class.
r=$(req GET "$API/portal/teaching/mine" "$TEACHER")
CTX=$(body "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=(JSON.parse(s).items||[]).find(i=>i.contextIds.length>1);console.log(a?a.contextIds.length:0)})')
chk "a subject with a course exposes both contexts" "$([ "$CTX" -ge 2 ] && echo yes || echo no)" "yes"

echo "== 8. an assignment you do not teach is refused =="
r=$(req GET "$API/portal/teaching/$CLASS/00000000-0000-0000-0000-000000000000" "$TEACHER")
chk "unknown subject is a 404, not an empty page" "$(code "$r")" "404"

echo "== cleanup =="
r=$(req DELETE "$CC/notes/$NOTE" "$TEACHER" "{\"version\":$NOTE_V}")
chk "delete note" "$(code "$r")" "200"
r=$(req DELETE "$CC/materials/$MAT_A" "$TEACHER" "{\"version\":$MAT_A_V}")
chk "delete material A" "$(code "$r")" "200"
r=$(req DELETE "$CC/materials/$MAT_B" "$TEACHER" "{\"version\":$MAT_B_V}")
chk "delete material B" "$(code "$r")" "200"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
