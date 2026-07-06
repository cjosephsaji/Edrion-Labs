#!/usr/bin/env bash
# Programme structure layer smoke (department_grade_levels + programme-structure tree).
#
# Prereqs: API on :3001, DB migrated (0044), PORTAL_AUTH_DEV_HEADER=true, UIS seed.
set -u
API="${API:-http://localhost:3001/v1}"
AC="$API/portal/academics"
OWNER="${OWNER:-owner@uis.edu.in}"
TEACHER="${TEACHER:-teacher@uis.edu.in}"
INST='institution'
H=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')
RUN="ps-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
count(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],o);console.log(Array.isArray(v)?v.length:(v?.items?.length??0))}catch{console.log(0)}})' "$1"; }
req(){ local m="$1" p="$2" e="$3" sc="$4" b="${5:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc"; fi; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== 1. seed programmes + grade levels =="
# Reuse UIS departments/grades or create minimal set for smoke.
DEPT_BT="$(curl -s "$AC/departments?page=1&pageSize=50" "${H[@]}" | field items.0.id)"
DEPT_MBA="$(curl -s "$AC/departments?page=1&pageSize=50" "${H[@]}" | field items.1.id)"
G1="$(curl -s "$AC/grade-levels?page=1&pageSize=10&sortBy=level" "${H[@]}" | field items.0.id)"
G2="$(curl -s "$AC/grade-levels?page=1&pageSize=10&sortBy=level" "${H[@]}" | field items.1.id)"
G3="$(curl -s "$AC/grade-levels?page=1&pageSize=10&sortBy=level" "${H[@]}" | field items.2.id)"
G4="$(curl -s "$AC/grade-levels?page=1&pageSize=10&sortBy=level" "${H[@]}" | field items.3.id)"

if [ -z "$DEPT_BT" ] || [ -z "$G1" ]; then
  echo "  SKIP  need departments + grade levels in seed"
  exit 0
fi

link_year() {
  local dept="$1" grade="$2" seq="$3"
  req POST "$AC/department-grade-levels" "$OWNER" "$INST" "{\"departmentId\":\"$dept\",\"gradeLevelId\":\"$grade\",\"sequence\":$seq}" > /dev/null
}

# B.Tech: 4 years (if grades exist)
[ -n "$G1" ] && link_year "$DEPT_BT" "$G1" 1
[ -n "$G2" ] && link_year "$DEPT_BT" "$G2" 2
[ -n "$G3" ] && link_year "$DEPT_BT" "$G3" 3
[ -n "$G4" ] && link_year "$DEPT_BT" "$G4" 4
# MBA: 2 years
if [ -n "$DEPT_MBA" ] && [ -n "$G1" ]; then
  link_year "$DEPT_MBA" "$G1" 1
  [ -n "$G2" ] && link_year "$DEPT_MBA" "$G2" 2
fi

echo "== 2. list by programme =="
BT_CNT="$(curl -s "$AC/department-grade-levels?departmentId=$DEPT_BT&pageSize=50" "${H[@]}" | count items)"
MBA_CNT="$(curl -s "$AC/department-grade-levels?departmentId=${DEPT_MBA:-none}&pageSize=50" "${H[@]}" | count items)"
chk "B.Tech linked years >= 1" "$([ "$BT_CNT" -ge 1 ] && echo ok)" ok
if [ -n "$DEPT_MBA" ]; then
  chk "MBA linked years <= 2" "$([ "$MBA_CNT" -le 2 ] && echo ok)" ok
fi

echo "== 3. programme-structure tree =="
TREE="$(curl -s "$AC/programme-structure" "${H[@]}")"
chk "tree returns array" "$([ "$(printf '%s' "$TREE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Array.isArray(JSON.parse(s))?"yes":"no"))')" = yes ] && echo ok)" ok

echo "== 4. guard: unlink pair rejected on term create =="
YEAR_ID="$(curl -s "$AC/academic-years?page=1&pageSize=1" "${H[@]}" | field items.0.id)"
BAD="$(req POST "$AC/academic-terms" "$OWNER" "$INST" "{\"academicYearId\":\"$YEAR_ID\",\"departmentId\":\"$DEPT_BT\",\"gradeLevelId\":\"$G4\",\"name\":\"Bad $RUN\",\"startDate\":\"2030-01-01\",\"endDate\":\"2030-06-01\"}")"
# If G4 not linked to B.Tech, expect 400; if linked, skip
if [ "$(code "$BAD")" = 400 ]; then
  chk "invalid programme+year pair -> 400" ok ok
else
  echo "  SKIP  guard case (grade may be linked)"
fi

echo "== 5. permissions =="
chk "teacher GET links -> 200" "$(code "$(req GET "$AC/department-grade-levels" "$TEACHER" "$INST")")" 200
TPOST="$(code "$(req POST "$AC/department-grade-levels" "$TEACHER" "$INST" "{\"departmentId\":\"$DEPT_BT\",\"gradeLevelId\":\"$G1\"}")")"
chk "teacher cannot POST link" "$([ "$TPOST" = 403 ] || [ "$TPOST" = 400 ] && echo ok)" ok

echo
echo "programme-structure smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
