#!/usr/bin/env bash
# Phase 8 (Institution Portal — Library, Transport, Inventory, Hostel) live smoke.
#
# Proves, against the running API + seeded portal users, that the four P8 verticals are real and the
# portal's guarantees hold:
#   1. permission gating  — library/transport/inventory/hostel .{view,manage}; a view-only role (seeded
#      via direct_grants) gets 200 on read but 403 on a manage mutation; an unrelated role gets 403.
#   2. library   — book catalogue CRUD + the issue→return loan bridge (available copies re-derived).
#   3. transport — routes + vehicles CRUD + per-student route assignments.
#   4. inventory — items CRUD + stock-movement bridge (in adds / out subtracts / adjust sets quantity).
#   5. hostel    — blocks + rooms CRUD + the allocate→vacate bridge (room occupancy re-derived).
#   6. tenancy/refs — unknown foreign keys -> 400 (not 500); duplicates -> 409; bridge limits -> 400.
#   7. optimistic concurrency — a stale version on update -> 409.
#   8. scope isolation — a confined campus-admin creates campus-stamped rows; a foreign campus -> 403.
#   9. audit — every mutation writes an audit_events row (checked via count, needs DATABASE_URL).
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end; the
# view-only test user is (re)seeded at the start and removed at the end.
#
# Prereqs: API on :3001, DB seeded + migration 0018 applied, and in .env PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3001/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
LIB="$API/portal/library"
TR="$API/portal/transport"
INV="$API/portal/inventory"
HOS="$API/portal/hostel"
AC="$API/portal/academics"
PP="$API/portal/people"
OWNER='owner@greenwood.edu'          # institution_owner (wildcard)
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, all four .manage
TEACHER='teacher@greenwood.edu'      # no library/transport/inventory/hostel keys at all
VIEWER='viewer.p8@greenwood.edu'     # seeded below: the four *.view keys ONLY (no *.manage)
RUN="smoke-$(date +%s)"
TODAY="$(date +%F)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
len(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(-1)}})'; }
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
FAKE='00000000-0000-0000-0000-000000000000'

echo "== 0. Seed a view-only user (direct_grants: the four *.view keys, no *.manage) =="
psql "$DBURL" -v ON_ERROR_STOP=1 -q <<SQL 2>/dev/null
delete from institution_users where email = '$VIEWER';
insert into institution_users (institution_id, email, full_name, status, direct_grants)
select institution_id, '$VIEWER', 'Vic Viewer', 'active',
  '["library.view","transport.view","inventory.view","hostel.view","students.view"]'::jsonb
from institution_users where email = '$OWNER' limit 1;
SQL
chk "view-only user seeded" "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email='$VIEWER'" 2>/dev/null)" 1

echo "== 1. Permission gating =="
chk "owner GET library/books -> 200"     "$(code "$(req GET "$LIB/books" "$OWNER" "$INST")")" 200
chk "viewer GET library/books -> 200"    "$(code "$(req GET "$LIB/books" "$VIEWER" "$INST")")" 200
chk "viewer POST library/book -> 403"    "$(code "$(req POST "$LIB/books" "$VIEWER" "$INST" "{\"title\":\"x\"}")")" 403
chk "viewer GET transport/routes -> 200" "$(code "$(req GET "$TR/routes" "$VIEWER" "$INST")")" 200
chk "viewer POST transport/route -> 403" "$(code "$(req POST "$TR/routes" "$VIEWER" "$INST" "{\"name\":\"x\"}")")" 403
chk "viewer GET inventory/items -> 200"  "$(code "$(req GET "$INV/items" "$VIEWER" "$INST")")" 200
chk "viewer POST inventory/item -> 403"  "$(code "$(req POST "$INV/items" "$VIEWER" "$INST" "{\"name\":\"x\",\"sku\":\"y\"}")")" 403
chk "viewer GET hostel/rooms -> 200"     "$(code "$(req GET "$HOS/rooms" "$VIEWER" "$INST")")" 200
chk "viewer POST hostel/block -> 403"    "$(code "$(req POST "$HOS/blocks" "$VIEWER" "$INST" "{\"name\":\"x\"}")")" 403
chk "teacher GET library/books -> 403"   "$(code "$(req GET "$LIB/books" "$TEACHER" "$INST")")" 403
chk "teacher GET hostel/rooms -> 403"    "$(code "$(req GET "$HOS/rooms" "$TEACHER" "$INST")")" 403

echo "== 2. Academic + people scaffolding (owner, institution scope) =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GLVL_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
CLASS_ID="$(body "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GLVL_ID\"}")" | field id)"
STU_ID="$(body "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"classId\":\"$CLASS_ID\"}")" | field id)"
STU2_ID="$(body "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM2-$RUN\",\"firstName\":\"Sue $RUN\",\"lastName\":\"Dent\",\"classId\":\"$CLASS_ID\"}")" | field id)"
chk "scaffolding created (year/grade/class/2 students)" \
  "$([ -n "$YEAR_ID$GLVL_ID$CLASS_ID$STU_ID" ] && [ -n "$STU2_ID" ] && echo ok)" ok

echo "== 3. Library — books CRUD + issue->return bridge =="
R="$(req POST "$LIB/books" "$OWNER" "$INST" "{\"title\":\"Book $RUN\",\"author\":\"A. Writer\",\"totalCopies\":1}")"
BOOK_ID="$(body "$R" | field id)"
chk "create book -> id" "$([ -n "$BOOK_ID" ] && echo ok)" ok
chk "  default status available" "$(body "$R" | field status)" available
chk "  availableCopies defaults to totalCopies (1)" "$(body "$R" | field availableCopies)" 1
chk "book stale version update -> 409" "$(code "$(req PATCH "$LIB/books/$BOOK_ID" "$OWNER" "$INST" "{\"totalCopies\":2,\"version\":99}")")" 409
R="$(req POST "$LIB/books/$BOOK_ID/loans" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\",\"dueDate\":\"$TODAY\"}")"
LOAN_ID="$(body "$R" | field loan.id)"
chk "issue loan -> id" "$([ -n "$LOAN_ID" ] && echo ok)" ok
chk "  available copies decremented -> 0" "$(body "$R" | field book.availableCopies)" 0
chk "loan unknown student -> 400 (INVALID_REFERENCE)" "$(body "$(req POST "$LIB/books/$BOOK_ID/loans" "$OWNER" "$INST" "{\"studentId\":\"$FAKE\"}")" | field code)" INVALID_REFERENCE
chk "no copies left -> 400 (NO_COPIES_AVAILABLE)" "$(body "$(req POST "$LIB/books/$BOOK_ID/loans" "$OWNER" "$INST" "{\"studentId\":\"$STU2_ID\"}")" | field code)" NO_COPIES_AVAILABLE
R="$(req POST "$LIB/books/$BOOK_ID/loans/$LOAN_ID/return" "$OWNER" "$INST" "{\"fineAmount\":0}")"
chk "return loan -> status returned" "$(body "$R" | field loan.status)" returned
chk "  available copies restored -> 1" "$(body "$R" | field book.availableCopies)" 1
chk "return again -> 409 (ALREADY_RETURNED)" "$(body "$(req POST "$LIB/books/$BOOK_ID/loans/$LOAN_ID/return" "$OWNER" "$INST" "{}")" | field code)" ALREADY_RETURNED
chk "loans list (book 1) length == 1" "$(req GET "$LIB/books/$BOOK_ID/loans" "$OWNER" "$INST" | sed '$d' | len)" 1
# a 2-copy book proves a duplicate active loan is rejected while a copy is still available
R="$(req POST "$LIB/books" "$OWNER" "$INST" "{\"title\":\"Book2 $RUN\",\"totalCopies\":2}")"
BOOK2_ID="$(body "$R" | field id)"
req POST "$LIB/books/$BOOK2_ID/loans" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\"}" >/dev/null
chk "duplicate active loan (same student) -> 409 (LOAN_EXISTS)" "$(body "$(req POST "$LIB/books/$BOOK2_ID/loans" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\"}")" | field code)" LOAN_EXISTS

echo "== 4. Transport — routes + vehicles + assignments =="
R="$(req POST "$TR/routes" "$OWNER" "$INST" "{\"name\":\"Route $RUN\",\"code\":\"R-$RUN\",\"fare\":1500}")"
ROUTE_ID="$(body "$R" | field id)"
chk "create route -> id" "$([ -n "$ROUTE_ID" ] && echo ok)" ok
chk "  default status active" "$(body "$R" | field status)" active
chk "route stale version update -> 409" "$(code "$(req PATCH "$TR/routes/$ROUTE_ID" "$OWNER" "$INST" "{\"status\":\"inactive\",\"version\":99}")")" 409
R="$(req POST "$TR/vehicles" "$OWNER" "$INST" "{\"registrationNo\":\"KAA $RUN\",\"capacity\":40,\"routeId\":\"$ROUTE_ID\"}")"
VEH_ID="$(body "$R" | field id)"
chk "create vehicle (on route) -> id" "$([ -n "$VEH_ID" ] && echo ok)" ok
chk "  route name resolves" "$(req GET "$TR/vehicles?routeId=$ROUTE_ID" "$OWNER" "$INST" | sed '$d' | field items.0.routeName)" "Route $RUN"
chk "vehicle unknown route -> 400 (INVALID_REFERENCE)" "$(body "$(req POST "$TR/vehicles" "$OWNER" "$INST" "{\"registrationNo\":\"X $RUN\",\"routeId\":\"$FAKE\"}")" | field code)" INVALID_REFERENCE
R="$(req POST "$TR/routes/$ROUTE_ID/assignments" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\",\"stopName\":\"Main Gate\"}")"
ASN_ID="$(body "$R" | field id)"
chk "create assignment -> id" "$([ -n "$ASN_ID" ] && echo ok)" ok
chk "  student name resolves" "$(req GET "$TR/routes/$ROUTE_ID/assignments" "$OWNER" "$INST" | sed '$d' | field 0.studentName)" "Stu $RUN Dent"
chk "duplicate (route,student) -> 409 (ASSIGNMENT_EXISTS)" "$(body "$(req POST "$TR/routes/$ROUTE_ID/assignments" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\"}")" | field code)" ASSIGNMENT_EXISTS
chk "assignment unknown student -> 400 (INVALID_REFERENCE)" "$(body "$(req POST "$TR/routes/$ROUTE_ID/assignments" "$OWNER" "$INST" "{\"studentId\":\"$FAKE\"}")" | field code)" INVALID_REFERENCE
chk "assignments list length == 1" "$(req GET "$TR/routes/$ROUTE_ID/assignments" "$OWNER" "$INST" | sed '$d' | len)" 1

echo "== 5. Inventory — items CRUD + stock-movement bridge =="
R="$(req POST "$INV/items" "$OWNER" "$INST" "{\"name\":\"Item $RUN\",\"sku\":\"SKU-$RUN\",\"quantity\":10,\"reorderLevel\":5}")"
ITEM_ID="$(body "$R" | field id)"
chk "create item -> id" "$([ -n "$ITEM_ID" ] && echo ok)" ok
chk "  opening quantity 10" "$(body "$R" | field quantity)" 10
chk "duplicate SKU -> 409 (ITEM_EXISTS)" "$(body "$(req POST "$INV/items" "$OWNER" "$INST" "{\"name\":\"y\",\"sku\":\"SKU-$RUN\"}")" | field code)" ITEM_EXISTS
chk "item stale version update -> 409" "$(code "$(req PATCH "$INV/items/$ITEM_ID" "$OWNER" "$INST" "{\"reorderLevel\":1,\"version\":99}")")" 409
R="$(req POST "$INV/items/$ITEM_ID/movements" "$OWNER" "$INST" "{\"movementType\":\"in\",\"quantity\":5}")"
MOV_ID="$(body "$R" | field movement.id)"
chk "stock IN 5 -> quantity 15" "$(body "$R" | field item.quantity)" 15
chk "stock OUT 3 -> quantity 12" "$(body "$(req POST "$INV/items/$ITEM_ID/movements" "$OWNER" "$INST" "{\"movementType\":\"out\",\"quantity\":3}")" | field item.quantity)" 12
chk "stock ADJUST to 7 -> quantity 7" "$(body "$(req POST "$INV/items/$ITEM_ID/movements" "$OWNER" "$INST" "{\"movementType\":\"adjust\",\"quantity\":7}")" | field item.quantity)" 7
chk "OUT beyond stock -> 400 (INSUFFICIENT_STOCK)" "$(body "$(req POST "$INV/items/$ITEM_ID/movements" "$OWNER" "$INST" "{\"movementType\":\"out\",\"quantity\":999}")" | field code)" INSUFFICIENT_STOCK
chk "movements list length == 3" "$(req GET "$INV/items/$ITEM_ID/movements" "$OWNER" "$INST" | sed '$d' | len)" 3

echo "== 6. Hostel — blocks + rooms + allocate->vacate bridge =="
R="$(req POST "$HOS/blocks" "$OWNER" "$INST" "{\"name\":\"Block $RUN\",\"blockType\":\"mixed\"}")"
BLOCK_ID="$(body "$R" | field id)"
chk "create block -> id" "$([ -n "$BLOCK_ID" ] && echo ok)" ok
R="$(req POST "$HOS/rooms" "$OWNER" "$INST" "{\"roomNo\":\"R-$RUN\",\"blockId\":\"$BLOCK_ID\",\"capacity\":1}")"
ROOM_ID="$(body "$R" | field id)"
chk "create room (capacity 1) -> id" "$([ -n "$ROOM_ID" ] && echo ok)" ok
chk "  block name resolves" "$(req GET "$HOS/rooms?blockId=$BLOCK_ID" "$OWNER" "$INST" | sed '$d' | field items.0.blockName)" "Block $RUN"
chk "room unknown block -> 400 (INVALID_REFERENCE)" "$(body "$(req POST "$HOS/rooms" "$OWNER" "$INST" "{\"roomNo\":\"z\",\"blockId\":\"$FAKE\"}")" | field code)" INVALID_REFERENCE
chk "room stale version update -> 409" "$(code "$(req PATCH "$HOS/rooms/$ROOM_ID" "$OWNER" "$INST" "{\"capacity\":2,\"version\":99}")")" 409
R="$(req POST "$HOS/rooms/$ROOM_ID/allocations" "$OWNER" "$INST" "{\"studentId\":\"$STU_ID\",\"bedNo\":\"1\"}")"
ALLOC_ID="$(body "$R" | field allocation.id)"
chk "allocate bed -> id" "$([ -n "$ALLOC_ID" ] && echo ok)" ok
chk "  room occupancy -> 1" "$(body "$R" | field room.occupied)" 1
chk "  room status -> full (capacity 1)" "$(body "$R" | field room.status)" full
chk "room full -> 400 (ROOM_FULL)" "$(body "$(req POST "$HOS/rooms/$ROOM_ID/allocations" "$OWNER" "$INST" "{\"studentId\":\"$STU2_ID\"}")" | field code)" ROOM_FULL
chk "allocation unknown student -> 400 (INVALID_REFERENCE)" "$(body "$(req POST "$HOS/rooms/$ROOM_ID/allocations" "$OWNER" "$INST" "{\"studentId\":\"$FAKE\"}")" | field code)" INVALID_REFERENCE
R="$(req POST "$HOS/rooms/$ROOM_ID/allocations/$ALLOC_ID/vacate" "$OWNER" "$INST" "{}")"
chk "vacate -> status vacated" "$(body "$R" | field allocation.status)" vacated
chk "  room occupancy back to 0" "$(body "$R" | field room.occupied)" 0
chk "  room status -> available" "$(body "$R" | field room.status)" available
chk "vacate again -> 409 (ALREADY_VACATED)" "$(body "$(req POST "$HOS/rooms/$ROOM_ID/allocations/$ALLOC_ID/vacate" "$OWNER" "$INST" "{}")" | field code)" ALREADY_VACATED

echo "== 7. Scope isolation (confined campus admin) =="
chk "campus-admin GET library/books -> 200" "$(code "$(req GET "$LIB/books" "$CAMPUS" "$INST")")" 200
R="$(req POST "$LIB/books" "$CAMPUS" "$INST" "{\"title\":\"CBook $RUN\",\"totalCopies\":2}")"
CBOOK_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CBOOK_ID" ] && echo ok)" ok
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$(body "$R" | field campusId)" ] && echo ok)" ok
R="$(req GET "$LIB/books" "$CAMPUS" "campus:$FAKE")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 8. Audit rows written (needs DATABASE_URL/local DB) =="
acount(){ psql "$DBURL" -tA -c "select case when count(*)>0 then 'ok' else 'no' end from audit_events where module = '$1'" 2>/dev/null; }
chk "portal-library audit rows exist"   "$(acount portal-library)" ok
chk "portal-transport audit rows exist" "$(acount portal-transport)" ok
chk "portal-inventory audit rows exist" "$(acount portal-inventory)" ok
chk "portal-hostel audit rows exist"    "$(acount portal-hostel)" ok

echo "== 9. Cleanup (re-read versions, delete) =="
delv(){ # delv <listUrl> <delBase> <id> <email>
  local listUrl="$1" delBase="$2" id="$3" e="$4"
  local v; v="$(req GET "$listUrl?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  ${id:0:8} (not found)"; return; }
  chk "delete ${id:0:8} -> 200" "$(code "$(req DELETE "$delBase/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$BOOK_ID" ]  && delv "$LIB/books" "$LIB/books" "$BOOK_ID" "$OWNER"        # loans cascade
[ -n "$BOOK2_ID" ] && delv "$LIB/books" "$LIB/books" "$BOOK2_ID" "$OWNER"
[ -n "$CBOOK_ID" ] && delv "$LIB/books" "$LIB/books" "$CBOOK_ID" "$OWNER"
[ -n "$VEH_ID" ]   && delv "$TR/vehicles" "$TR/vehicles" "$VEH_ID" "$OWNER"
[ -n "$ROUTE_ID" ] && delv "$TR/routes" "$TR/routes" "$ROUTE_ID" "$OWNER"       # assignments cascade
[ -n "$ITEM_ID" ]  && delv "$INV/items" "$INV/items" "$ITEM_ID" "$OWNER"        # movements cascade
[ -n "$ROOM_ID" ]  && delv "$HOS/rooms" "$HOS/rooms" "$ROOM_ID" "$OWNER"        # allocations cascade
[ -n "$BLOCK_ID" ] && delv "$HOS/blocks" "$HOS/blocks" "$BLOCK_ID" "$OWNER"
[ -n "$STU_ID" ]   && delv "$PP/students" "$PP/students" "$STU_ID" "$OWNER"
[ -n "$STU2_ID" ]  && delv "$PP/students" "$PP/students" "$STU2_ID" "$OWNER"
[ -n "$CLASS_ID" ] && delv "$AC/classes" "$AC/classes" "$CLASS_ID" "$OWNER"
[ -n "$GLVL_ID" ]  && delv "$AC/grade-levels" "$AC/grade-levels" "$GLVL_ID" "$OWNER"
[ -n "$YEAR_ID" ]  && delv "$AC/academic-years" "$AC/academic-years" "$YEAR_ID" "$OWNER"
psql "$DBURL" -q -c "delete from institution_users where email = '$VIEWER';" 2>/dev/null
echo "  cleaned up view-only user"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
