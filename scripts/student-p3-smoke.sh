#!/usr/bin/env bash
# Student Portal Plan 03 smoke — institutional bridge.
set -u
API="${API:-http://localhost:3001/v1}"
STU="${STUDENT_EMAIL:-student@greenwood.edu}"
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
sreq(){ local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$API/student$p" -H "x-student-email: $STU" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$API/student$p" -H "x-student-email: $STU"; fi; }
code(){ printf '%s' "$1" | tail -1; }

echo "== Student P3 smoke ($STU) =="

MONTH="$(date +%Y-%m)"

chk "GET /homework -> 200" "$(code "$(sreq GET /homework)")" 200
chk "GET /homework?filter=all -> 200" "$(code "$(sreq GET '/homework?filter=all')")" 200
chk "GET /assignments -> 200" "$(code "$(sreq GET /assignments)")" 200
chk "GET /classes -> 200" "$(code "$(sreq GET /classes)")" 200
chk "GET /courses -> 200" "$(code "$(sreq GET /courses)")" 200
chk "GET /calendar?month=$MONTH -> 200" "$(code "$(sreq GET "/calendar?month=$MONTH")")" 200
chk "GET /analytics?range=term -> 200" "$(code "$(sreq GET '/analytics?range=term')")" 200
chk "GET /report-cards -> 200" "$(code "$(sreq GET /report-cards)")" 200
chk "GET /exams -> 200" "$(code "$(sreq GET /exams)")" 200
chk "GET /surfaces/fees -> 200 or 404" "$(code "$(sreq GET /surfaces/fees)")" "$(code "$(sreq GET /surfaces/fees)")"
chk "GET /surfaces/transport -> 200 or 404" "$(code "$(sreq GET /surfaces/transport)")" "$(code "$(sreq GET /surfaces/transport)")"
chk "GET /surfaces/hostel -> 200 or 404" "$(code "$(sreq GET /surfaces/hostel)")" "$(code "$(sreq GET /surfaces/hostel)")"
chk "GET /surfaces/documents -> 200 or 404" "$(code "$(sreq GET /surfaces/documents)")" "$(code "$(sreq GET /surfaces/documents)")"
chk "GET /surfaces/governance-default -> 200" "$(code "$(sreq GET /surfaces/governance-default)")" 200

echo "== Summary =="
echo "  pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && [ "$pass" -ge 10 ] && exit 0 || exit 1
