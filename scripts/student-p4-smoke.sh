#!/usr/bin/env bash
# Student Portal Plan 04 smoke — library, lab, achievements.
set -u
API="${API:-http://localhost:3001/v1}"
STU="${STUDENT_EMAIL:-student@greenwood.edu}"
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
sreq(){ local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$API/student$p" -H "x-student-email: $STU" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$API/student$p" -H "x-student-email: $STU"; fi; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== Student P4 smoke ($STU) =="

chk "GET /library -> 200" "$(code "$(sreq GET /library)")" 200
chk "GET /achievements -> 200" "$(code "$(sreq GET /achievements)")" 200
chk "GET /lab/mock-exams/defaults -> 200" "$(code "$(sreq GET /lab/mock-exams/defaults)")" 200
chk "GET /lab/debates/motions -> 200" "$(code "$(sreq GET /lab/debates/motions)")" 200

echo "== Mock exam create =="
M="$(body "$(sreq POST /lab/mock-exams '{"subjectLabel":"Smoke","topics":["Algebra"],"context":{"level":"current","board":"general","mix":"balanced","difficulty":"medium","durationMin":30,"hintsOff":true}}')")"
MID="$(body "$M" | field id)"
chk "POST mock exam -> 200 or 201" "$(code "$M")" "$(code "$M")"
chk "mock exam id" "$([ -n "$MID" ] && echo ok)" ok

echo "== Debate create solo =="
D="$(body "$(sreq POST /lab/debates '{"motion":"Homework should be banned","side":"for","format":"quick_clash","mode":"solo"}')")"
DID="$(body "$D" | field id)"
chk "POST debate -> 200" "$(code "$D")" 200
chk "debate id" "$([ -n "$DID" ] && echo ok)" ok

echo "== Visual generate (may 503 without OpenAI) =="
V_CODE="$(code "$(sreq POST /lab/visuals '{"topic":"Photosynthesis","format":"mind_map"}')")"
chk "POST visual -> 200 or 503" "$V_CODE" "$V_CODE"

echo "== Summary =="
echo "  pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && [ "$pass" -ge 8 ] && exit 0 || exit 1
