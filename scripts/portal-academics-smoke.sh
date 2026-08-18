#!/usr/bin/env bash
# Phase 2 (Institution Portal — Academics core) live smoke.
#
# Proves, against the running API + seeded portal users, that the academic-structure verticals are
# real and the portal's guarantees hold for them:
#   1. permission gating  — academics.view to read, academics.manage to mutate (teacher vs parent).
#   2. full CRUD          — academic years, departments, grades, subjects, classes + class↔subject.
#   3. scope isolation    — confined campus-admin can work in its campus; a foreign campus -> 403.
#   4. tenancy/refs       — unknown foreign keys -> 400 (not a 500), validation -> 400.
#   5. optimistic concurrency — a stale version on update -> 409.
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end
# (versions are re-read from the API before deleting, so it survives version drift).
#
# Prereqs: API on :3007, DB seeded + `pnpm --filter @edrion/database seed:portal`, and in .env
#   PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B  # disable brace expansion so JSON bodies like {"a":1,"b":2} aren't split on commas
API="${API:-http://localhost:3007/v1}"
AC="$API/portal/academics"
OWNER='owner@greenwood.edu'      # institution_owner (wildcard)
TEACHER='teacher@greenwood.edu'  # academics.view, NOT academics.manage
PARENT='parent@greenwood.edu'    # neither
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, academics.manage
RUN="smoke-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
# field <jsonpath> reads stdin JSON and prints a dotted path (e.g. "items.0.id").
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
# req METHOD PATH EMAIL SCOPE [BODY] -> prints "<body>\n<code>"
req(){ local m="$1" p="$2" e="$3" sc="$4" b="${5:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc"
  fi
}
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }
INST='institution'

echo "== 1. Permission gating =="
chk "owner GET years -> 200"   "$(code "$(req GET "$AC/academic-years" "$OWNER" "$INST")")" 200
chk "teacher GET years -> 200" "$(code "$(req GET "$AC/academic-years" "$TEACHER" "$INST")")" 200
chk "parent GET years -> 403"  "$(code "$(req GET "$AC/academic-years" "$PARENT" "$INST")")" 403
chk "teacher POST year -> 403" "$(code "$(req POST "$AC/academic-years" "$TEACHER" "$INST" "{\"name\":\"x\",\"startDate\":\"2030-01-01\",\"endDate\":\"2030-12-31\"}")")" 403

echo "== 2. CRUD happy path (owner, institution scope) =="
R="$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\",\"status\":\"active\"}")"
chk "create academic year -> 200/201" "$([ "$(code "$R")" = 200 ] || [ "$(code "$R")" = 201 ] && echo ok)" ok
YEAR_ID="$(body "$R" | field id)"
chk "  returns an id" "$([ -n "$YEAR_ID" ] && echo ok)" ok

R="$(req POST "$AC/departments" "$OWNER" "$INST" "{\"name\":\"Science $RUN\",\"code\":\"SCI-$RUN\"}")"
DEPT_ID="$(body "$R" | field id)"
chk "create department" "$([ -n "$DEPT_ID" ] && echo ok)" ok

R="$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade 1 $RUN\",\"level\":1,\"departmentId\":\"$DEPT_ID\"}")"
GRADE_ID="$(body "$R" | field id)"
chk "create grade level" "$([ -n "$GRADE_ID" ] && echo ok)" ok

R="$(req POST "$AC/subjects" "$OWNER" "$INST" "{\"name\":\"Algebra $RUN\",\"code\":\"ALG-$RUN\",\"kind\":\"core\",\"departmentId\":\"$DEPT_ID\"}")"
SUBJ_ID="$(body "$R" | field id)"
chk "create subject" "$([ -n "$SUBJ_ID" ] && echo ok)" ok

R="$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Grade 1 A $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GRADE_ID\",\"section\":\"A\",\"capacity\":30}")"
CLASS_ID="$(body "$R" | field id)"
chk "create class" "$([ -n "$CLASS_ID" ] && echo ok)" ok

R="$(req POST "$AC/classes/$CLASS_ID/subjects" "$OWNER" "$INST" "{\"subjectId\":\"$SUBJ_ID\"}")"
ASSIGN_ID="$(body "$R" | field id)"
chk "assign subject to class" "$([ -n "$ASSIGN_ID" ] && echo ok)" ok
LEN="$(req GET "$AC/classes/$CLASS_ID/subjects" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(-1)}})')"
chk "class subjects length == 1" "$LEN" 1

echo "== 3. Validation + tenancy guards =="
chk "year endDate<startDate -> 400" "$(code "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"bad\",\"startDate\":\"2031-12-31\",\"endDate\":\"2031-01-01\"}")")" 400
chk "class unknown gradeLevel -> 400" "$(code "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"bad\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400

echo "== 4. Optimistic concurrency =="
chk "update with current version -> 200" "$(code "$(req PATCH "$AC/academic-years/$YEAR_ID" "$OWNER" "$INST" "{\"name\":\"Year $RUN v2\",\"version\":0}")")" 200
chk "update with stale version -> 409"   "$(code "$(req PATCH "$AC/academic-years/$YEAR_ID" "$OWNER" "$INST" "{\"name\":\"Year $RUN v3\",\"version\":0}")")" 409

echo "== 5. Scope isolation (confined campus admin) =="
chk "campus-admin GET years -> 200" "$(code "$(req GET "$AC/academic-years" "$CAMPUS" "$INST")")" 200
R="$(req POST "$AC/departments" "$CAMPUS" "$INST" "{\"name\":\"Campus Dept $RUN\",\"code\":\"CD-$RUN\"}")"
CDEPT_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CDEPT_ID" ] && echo ok)" ok
CDEPT_CAMPUS="$(body "$R" | field campusId)"
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$CDEPT_CAMPUS" ] && echo ok)" ok
R="$(req GET "$AC/academic-years" "$CAMPUS" "campus:00000000-0000-0000-0000-000000000000")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 6. Cleanup (re-read versions, delete) =="
delv(){ # delv <listPath> <id> <email> ; finds the row's version then deletes it
  local lp="$1" id="$2" e="$3"
  local v; v="$(req GET "$AC/$lp?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  $lp/$id (not found)"; return; }
  chk "delete $lp/${id:0:8} -> 200" "$(code "$(req DELETE "$AC/$lp/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$ASSIGN_ID" ] && chk "remove class subject -> 200" "$(code "$(req DELETE "$AC/classes/$CLASS_ID/subjects/$ASSIGN_ID" "$OWNER" "$INST")")" 200
[ -n "$CLASS_ID" ] && delv "classes" "$CLASS_ID" "$OWNER"
[ -n "$SUBJ_ID" ] && delv "subjects" "$SUBJ_ID" "$OWNER"
[ -n "$GRADE_ID" ] && delv "grade-levels" "$GRADE_ID" "$OWNER"
[ -n "$DEPT_ID" ] && delv "departments" "$DEPT_ID" "$OWNER"
[ -n "$CDEPT_ID" ] && delv "departments" "$CDEPT_ID" "$CAMPUS"
[ -n "$YEAR_ID" ] && delv "academic-years" "$YEAR_ID" "$OWNER"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
