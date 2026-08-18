#!/usr/bin/env bash
# Nomenclature + academic_terms live smoke.
#
# Proves:
#   1. GET /portal/settings/effective returns resolved nomenclature for the tenant type.
#   2. POST /portal/settings/nomenclature stores overrides that win over the preset.
#   3. academic-terms CRUD is gated by academics.view / academics.manage.
#
# Prereqs: API on :3007, DB seeded, PORTAL_AUTH_DEV_HEADER=true.
set -u
API="${API:-http://localhost:3007/v1}"
AC="$API/portal/academics"
OWNER="${OWNER:-owner@uis.edu.in}"
TEACHER="${TEACHER:-teacher@uis.edu.in}"
INST='institution'
H=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')
RUN="nom-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
req(){ local m="$1" p="$2" e="$3" sc="$4" b="${5:-}"
  if [ -n "$b" ]; then curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc" -H 'content-type: application/json' -d "$b"
  else curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc"; fi; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

echo "== 1. effective nomenclature =="
EFF="$(curl -s "$API/portal/settings/effective" "${H[@]}")"
GRADE_LABEL="$(printf '%s' "$EFF" | field nomenclature.gradeLevel.singular)"
PROG_LABEL="$(printf '%s' "$EFF" | field nomenclature.programmeStructure.singular)"
chk "nomenclature.gradeLevel.singular present" "$([ -n "$GRADE_LABEL" ] && echo ok)" ok
chk "nomenclature.programmeStructure present" "$([ -n "$PROG_LABEL" ] && echo ok)" ok
echo "  gradeLevel label: $GRADE_LABEL"
echo "  programmeStructure label: $PROG_LABEL"

echo "== 2. nomenclature override =="
SAVED="$(curl -s -X POST "$API/portal/settings/nomenclature" "${H[@]}" -d '{"overrides":{"gradeLevel":{"singular":"Custom Year","plural":"Custom Years"}}}')"
chk "override singular" "$(printf '%s' "$SAVED" | field nomenclature.gradeLevel.singular)" "Custom Year"
curl -s -X POST "$API/portal/settings/nomenclature" "${H[@]}" -d '{"overrides":{}}' > /dev/null && echo "  restored overrides"

echo "== 3. academic-terms CRUD =="
chk "teacher GET terms -> 200" "$(code "$(req GET "$AC/academic-terms" "$TEACHER" "$INST")")" 200
chk "teacher POST term -> 403" "$(code "$(req POST "$AC/academic-terms" "$TEACHER" "$INST" '{"academicYearId":"00000000-0000-0000-0000-000000000001","name":"x","startDate":"2030-01-01","endDate":"2030-06-01"}')")" 403

YEAR_ID="$(curl -s "$AC/academic-years?page=1&pageSize=1" "${H[@]}" | field items.0.id)"
if [ -n "$YEAR_ID" ]; then
  R="$(req POST "$AC/academic-terms" "$OWNER" "$INST" "{\"academicYearId\":\"$YEAR_ID\",\"name\":\"Term $RUN\",\"kind\":\"term\",\"sequence\":9,\"startDate\":\"2030-01-01\",\"endDate\":\"2030-06-01\"}")"
  chk "owner create term" "$([ "$(code "$R")" = 200 ] || [ "$(code "$R")" = 201 ] && echo ok)" ok
  TERM_ID="$(body "$R" | field id)"
  VER="$(body "$R" | field version)"
  if [ -n "$TERM_ID" ]; then
    req DELETE "$AC/academic-terms/$TERM_ID" "$OWNER" "$INST" "{\"version\":$VER}" > /dev/null
    echo "  cleaned up term $TERM_ID"
  fi
else
  echo "  SKIP  no academic year to attach term"
fi

echo
echo "nomenclature smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
