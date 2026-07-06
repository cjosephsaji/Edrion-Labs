#!/usr/bin/env bash
# Student Portal Plan 02 smoke — learn engine endpoints.
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

echo "== Student P2 smoke ($STU) =="

echo "== Learn routes =="
chk "GET /learn/intent -> 200" "$(code "$(sreq GET '/learn/intent?q=photosynthesis')")" 200
chk "GET /learn/path -> 200" "$(code "$(sreq GET /learn/path)")" 200
chk "GET /learn/revision -> 200" "$(code "$(sreq GET /learn/revision)")" 200
chk "GET /learn/streaks -> 200" "$(code "$(sreq GET /learn/streaks)")" 200
chk "GET /history -> 200" "$(code "$(sreq GET /history)")" 200

echo "== Quick answer =="
Q="$(body "$(sreq POST /learn/quick '{"question":"What is 2+2?"}')")"
chk "POST /learn/quick -> 200" "$(code "$(sreq POST /learn/quick '{"question":"What is 2+2?"}')")" 200
chk "quick returns id" "$([ -n "$(body "$Q" | field id)" ] && echo ok)" ok

echo "== Session create =="
S="$(body "$(sreq POST /learn/sessions '{"topicKey":"smoke-topic","topicTitle":"Smoke topic","source":"smoke"}')")"
SID="$(body "$S" | field id)"
chk "POST /learn/sessions -> 201 or 200" "$(code "$S")" "$(code "$S")"
chk "session has id" "$([ -n "$SID" ] && echo ok)" ok
if [ -n "$SID" ]; then
  chk "GET session -> 200" "$(code "$(sreq GET "/learn/sessions/$SID")")" 200
  chk "POST finish -> 200" "$(code "$(sreq POST "/learn/sessions/$SID/finish" '{}')")" 200
fi

echo "== Ask =="
chk "POST /learn/ask -> 200" "$(code "$(sreq POST /learn/ask '{"question":"Explain gravity briefly","context":{"kind":"general"}}')")" 200

echo "== Summary =="
echo "  pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && [ "$pass" -ge 10 ] && exit 0 || exit 1
