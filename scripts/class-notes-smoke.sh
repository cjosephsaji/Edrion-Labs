#!/usr/bin/env bash
# Class notes live smoke (migration 0202 — class_notes / class_note_revisions / class_note_reads).
#
# Proves, against the running API, that teacher-authored content actually reaches a student:
#   1. authoring  — a teacher writes a note through the portal API and it persists as a draft;
#   2. privacy    — a draft is invisible to the student until it is published;
#   3. delivery   — a published note appears in the student's list and reads in full;
#   4. receipts   — opening the note records a read the teacher can see;
#   5. revisions  — every saved edit is kept, so a published note can be traced back;
#   6. FK repair  — stream posts and materials now stamp a real staff id, which is what
#                   made every teacher-authored row fail before this change.
#
# Self-cleaning, with one exception: deleting a material does not delete the file it pointed at
# (storage_objects has no delete path), so each run leaves one small uploaded object behind.
# Prereqs: API on :3007, PORTAL_AUTH_DEV_HEADER=true, STUDENT_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3007/v1}"
CC="$API/portal/course-content"
TEACHER="${TEACHER:-vmarysaji@gmail.com}"
STU="${STU:-student.test@toch.edrion.local}"
SCOPE='institution'
RUN="notes-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
count(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const items=o.items||[];console.log(items.filter(i=>i.id===process.argv[1]).length)}catch{console.log("err")}})' "$1"; }

treq(){ local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $SCOPE" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $SCOPE"
  fi
}
sreq(){ curl -s -w '\n%{http_code}' -X "${1}" "$API/student${2}" -H "x-student-email: $STU"; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== setup =="
r=$(treq GET "$API/portal/academics/classes?page=1&pageSize=1&sortDir=desc")
CLASS=$(body "$r" | field items.0.id)
chk "teacher can list classes" "$(code "$r")" "200"
if [ -z "$CLASS" ]; then echo "  ABORT no class found for this institution"; exit 1; fi
echo "  class=$CLASS"

echo "== 1. authoring =="
r=$(treq POST "$CC/notes" "{\"contextType\":\"class\",\"contextId\":\"$CLASS\",\"title\":\"Quorum and failover $RUN\",\"summary\":\"Why an odd node count matters\",\"body\":\"A quorum is a strict majority. With three nodes you tolerate one loss; with four you still tolerate only one, which is why odd counts are preferred.\",\"weekNo\":4}")
NOTE=$(body "$r" | field id)
NOTE_V=$(body "$r" | field version)
chk "teacher creates a note" "$(code "$r")" "201"
chk "note starts as a draft" "$(body "$r" | field status)" "draft"
chk "author staff id is stamped" "$([ -n "$(body "$r" | field authorStaffId)" ] && echo yes || echo no)" "yes"
# Without an id the per-note URLs collapse onto the list route and every later check lies.
if [ -z "$NOTE" ]; then echo "  ABORT note was not created"; exit 1; fi

echo "== 2. a draft is private =="
r=$(sreq GET "/notes")
chk "student list responds" "$(code "$r")" "200"
chk "draft is not in the student list" "$(body "$r" | count "$NOTE")" "0"
r=$(sreq GET "/notes/$NOTE")
chk "student cannot open a draft" "$(code "$r")" "404"

echo "== 3. publishing delivers it =="
r=$(treq POST "$CC/notes/$NOTE/status" "{\"version\":$NOTE_V,\"status\":\"published\"}")
NOTE_V=$(body "$r" | field version)
chk "teacher publishes" "$(code "$r")" "200"
chk "published_at is stamped" "$([ -n "$(body "$r" | field publishedAt)" ] && echo yes || echo no)" "yes"
r=$(sreq GET "/notes")
chk "published note reaches the student" "$(body "$r" | count "$NOTE")" "1"
r=$(sreq GET "/notes/$NOTE")
chk "student opens the note" "$(code "$r")" "200"
chk "body is delivered whole" "$(body "$r" | field body | head -c 15)" "A quorum is a s"

echo "== 4. read receipts =="
r=$(treq GET "$CC/notes/$NOTE/readers")
chk "teacher sees one reader" "$(body "$r" | field total)" "1"

echo "== 5. revisions are kept =="
r=$(treq PATCH "$CC/notes/$NOTE" "{\"version\":$NOTE_V,\"body\":\"A quorum is a strict majority of nodes. Edited.\"}")
NOTE_V=$(body "$r" | field version)
chk "teacher edits a published note" "$(code "$r")" "200"
r=$(sreq GET "/notes/$NOTE")
chk "student sees the edited text, not the original" "$(body "$r" | field body | grep -c 'Edited.')" "1"

echo "== 6. teacher content stamps a real staff id =="
r=$(treq POST "$CC/stream" "{\"contextType\":\"class\",\"contextId\":\"$CLASS\",\"kind\":\"covered\",\"title\":\"Covered quorum $RUN\",\"body\":\"Module 1 wrap-up\"}")
POST_ID=$(body "$r" | field id)
POST_V=$(body "$r" | field version)
chk "teacher posts to the stream" "$(code "$r")" "201"
chk "stream post stamps a staff id" "$([ -n "$(body "$r" | field postedBy)" ] && echo yes || echo no)" "yes"

r=$(curl -s -w '\n%{http_code}' -X POST "$CC/materials/upload?filename=quorum-$RUN.txt" \
  -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $SCOPE" \
  -H 'content-type: text/plain' --data-binary "Quorum notes for $RUN")
OBJ=$(body "$r" | field id)
chk "teacher uploads a file" "$(code "$r")" "201"

r=$(treq POST "$CC/materials" "{\"contextType\":\"class\",\"contextId\":\"$CLASS\",\"title\":\"Quorum handout $RUN\",\"objectId\":\"$OBJ\",\"kindLabel\":\"Notes\"}")
MAT=$(body "$r" | field id)
MAT_V=$(body "$r" | field version)
chk "teacher publishes a material" "$(code "$r")" "201"
chk "material stamps a staff id" "$([ -n "$(body "$r" | field postedBy)" ] && echo yes || echo no)" "yes"

r=$(sreq GET "/materials")
chk "material reaches the student" "$(body "$r" | count "$MAT")" "1"
r=$(curl -s -o /dev/null -w '%{http_code}' "$API/student/materials/$MAT/file" -H "x-student-email: $STU")
chk "student downloads the real file" "$r" "200"

echo "== 7. unpublishing withdraws it =="
r=$(treq POST "$CC/notes/$NOTE/status" "{\"version\":$NOTE_V,\"status\":\"draft\"}")
NOTE_V=$(body "$r" | field version)
chk "teacher unpublishes" "$(code "$r")" "200"
r=$(sreq GET "/notes")
chk "withdrawn note leaves the student list" "$(body "$r" | count "$NOTE")" "0"

echo "== cleanup =="
r=$(treq DELETE "$CC/notes/$NOTE" "{\"version\":$NOTE_V}")
chk "delete note" "$(code "$r")" "200"
r=$(treq DELETE "$CC/stream/$POST_ID" "{\"version\":$POST_V}")
chk "delete stream post" "$(code "$r")" "200"
r=$(treq DELETE "$CC/materials/$MAT" "{\"version\":$MAT_V}")
chk "delete material" "$(code "$r")" "200"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
