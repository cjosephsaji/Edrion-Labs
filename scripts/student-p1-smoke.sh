#!/usr/bin/env bash
# Student Portal Plan 01 smoke — foundations (auth, me, home, preferences, storage).
#
# Prereqs: API :3001, DB seeded (`pnpm --filter @edrion/database seed:portal`),
# STUDENT_AUTH_DEV_HEADER=true, student@greenwood.edu in seed.
set -u
API="${API:-http://localhost:3001/v1}"
STU="${STUDENT_EMAIL:-student@greenwood.edu}"
RUN="p1-$(date +%s)"
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
sreq(){ local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$API/student$p" -H "x-student-email: $STU" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$API/student$p" -H "x-student-email: $STU"; fi; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== Student P1 smoke ($STU) =="

echo "== 1. Auth gating =="
chk "no header GET /me -> 401" "$(curl -s -o /dev/null -w '%{http_code}' "$API/student/me")" 401
chk "dev header GET /me -> 200" "$(code "$(sreq GET /me)")" 200

echo "== 2. Profile + home =="
ME="$(body "$(sreq GET /me)")"
chk "me has email" "$(body "$ME" | field email)" "$STU"
chk "me has persona" "$([ -n "$(body "$ME" | field persona)" ] && echo ok)" ok
chk "GET /home -> 200" "$(code "$(sreq GET /home)")" 200
chk "home has tiles array" "$([ "$(body "$(sreq GET /home)" | field tiles | wc -c)" -gt 2 ] && echo ok)" ok

echo "== 3. Preferences =="
PREF="$(body "$(sreq GET /preferences)")"
chk "GET /preferences -> 200" "$(code "$(sreq GET /preferences)")" 200
VER="$(body "$PREF" | field version)"
chk "PATCH preferences theme" "$(code "$(sreq PATCH /preferences "{\"theme\":\"dark\",\"version\":$VER}")")" 200

echo "== 4. Surfaces =="
chk "GET surfaces/governance-default -> 200" "$(code "$(sreq GET /surfaces/governance-default)")" 200

echo "== 5. Storage upload (tiny PDF) =="
PDF='/tmp/st-smoke-'"$RUN"'.pdf'
printf '%%PDF-1.4\n%%EOF' > "$PDF"
UP="$(curl -s -w '\n%{http_code}' -X POST "$API/student/uploads?kind=library_upload&filename=smoke.pdf" \
  -H "x-student-email: $STU" -H 'content-type: application/pdf' --data-binary @"$PDF")"
OBJ_ID="$(body "$UP" | field id)"
chk "upload returns object id" "$([ -n "$OBJ_ID" ] && echo ok)" ok
rm -f "$PDF"

echo "== 6. Schedule =="
chk "GET /schedule/today -> 200" "$(code "$(sreq GET /schedule/today)")" 200

echo "== Summary =="
echo "  pass=$pass fail=$fail (target >= 30 assertions — expand as seeds grow)"
[ "$fail" -eq 0 ] && [ "$pass" -ge 10 ] && exit 0 || exit 1
