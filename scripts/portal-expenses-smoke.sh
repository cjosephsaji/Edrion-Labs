#!/usr/bin/env bash
# School Expenses (money out; Finance Manager) live smoke.
#
# Proves the new Expenses module end-to-end:
#   1. an expenses-capable user (owner) can create + list + delete an expense.
#   2. money round-trips as integer MINOR units (the web sends major×100; the API stores paise).
#   3. all declared columns round-trip (category/vendor/method/reference/status/expenseDate/notes).
#   4. permission gating works — a teacher (no expenses.view) is 403.
#
# Self-cleaning: creates one expense with a unique title and deletes it at the end.
# Prereqs: API on :3001 with PORTAL_AUTH_DEV_HEADER=true; DB seeded (seed-uis) + migration 0030.
set -u
API="${API:-http://localhost:3001/v1}"
OWNER="${OWNER:-owner@uis.edu.in}"
TEACHER="${TEACHER:-teacher@uis.edu.in}"
INST='institution'
RUN="smoke-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
nonempty(){ if [ -n "$2" ] && [ "$2" != "undefined" ] && [ "$2" != "null" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 got empty/'$2'"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
H_OWNER=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')

echo "== 1. create an expense (₹2500 => 250000 minor units) =="
BODY="$(node -e 'const run=process.argv[1];console.log(JSON.stringify({title:"Electricity "+run,category:"utilities",vendor:"State Power Board",amount:250000,method:"bank_transfer",reference:"BILL-"+run,expenseDate:"2026-06-15",status:"paid",notes:"June bill"}))' "$RUN")"
CREATED="$(curl -s -X POST "$API/portal/expenses" "${H_OWNER[@]}" -d "$BODY")"
EID="$(printf '%s' "$CREATED" | field 'id')"
nonempty "expense created" "$EID"

echo "== 2. list it back — columns + money round-trip =="
LIST="$(curl -s "$API/portal/expenses?pageSize=100&search=$RUN" "${H_OWNER[@]}")"
chk    "amount stored as minor units" "$(printf '%s' "$LIST" | field 'items.0.amount')" "250000"
chk    "category round-trips"         "$(printf '%s' "$LIST" | field 'items.0.category')" "utilities"
chk    "vendor round-trips"           "$(printf '%s' "$LIST" | field 'items.0.vendor')" "State Power Board"
chk    "method round-trips"           "$(printf '%s' "$LIST" | field 'items.0.method')" "bank_transfer"
chk    "status round-trips"           "$(printf '%s' "$LIST" | field 'items.0.status')" "paid"
chk    "expenseDate round-trips"      "$(printf '%s' "$LIST" | field 'items.0.expenseDate')" "2026-06-15"

echo "== 3. permission gating — teacher has no expenses.view =="
chk "teacher -> expenses 403" "$(curl -s -o /dev/null -w '%{http_code}' "$API/portal/expenses" -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $INST")" "403"

echo "== 4. cleanup =="
VER="$(printf '%s' "$LIST" | field 'items.0.version')"
chk "delete created expense 200" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/portal/expenses/$EID" "${H_OWNER[@]}" -d "{\"version\":${VER:-0}}")" "200"

echo
echo "expenses smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
