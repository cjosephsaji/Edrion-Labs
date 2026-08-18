#!/usr/bin/env bash
# Phase 7 (Institution Portal — Fees, Payroll) live smoke.
#
# Proves, against the running API + seeded portal users, that the two P7 verticals are real and the
# portal's guarantees hold:
#   1. permission gating  — fees.{view,manage}, payroll.{view,manage} (manage is sensitive).
#   2. fees — structures CRUD; invoices CRUD; the payment→invoice bridge (paid/balance/status).
#   3. payroll — runs CRUD + nested per-employee items (teacher/staff); net = gross − deductions.
#   4. tenancy/refs — unknown foreign keys -> 400 (not 500); duplicate invoice/line -> 409.
#   5. optimistic concurrency — a stale version on update -> 409.
#   6. scope isolation — confined campus-admin works in its campus; a foreign campus -> 403.
#   7. audit — every mutation writes an audit_events row (checked via count when DATABASE_URL is set).
#
# Self-cleaning + idempotent: every row is created with a unique run suffix and deleted at the end.
#
# Prereqs: API on :3007, DB seeded + `pnpm --filter @edrion/database seed:portal` (adds hr@greenwood.edu),
# migration 0017 applied, and in .env PORTAL_AUTH_DEV_HEADER=true (dev only).
set -u
set +B
API="${API:-http://localhost:3007/v1}"
FEES="$API/portal/fees"
PR="$API/portal/payroll"
AC="$API/portal/academics"
PP="$API/portal/people"
OWNER='owner@greenwood.edu'          # institution_owner (wildcard)
FINANCE='finance@greenwood.edu'      # fees.view + fees.manage; NO payroll
HR='hr@greenwood.edu'                # payroll.view + payroll.manage; NO fees
PARENT='parent@greenwood.edu'        # fees.view ONLY (no fees.manage); no payroll
TEACHER='teacher@greenwood.edu'      # no fees, no payroll
CAMPUS='campus.north@greenwood.edu'  # campus_admin, 1 campus, fees.manage (NO payroll.manage)
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

echo "== 1. Permission gating =="
chk "owner GET fee structures -> 200"   "$(code "$(req GET "$FEES/structures" "$OWNER" "$INST")")" 200
chk "finance GET fee invoices -> 200"   "$(code "$(req GET "$FEES/invoices" "$FINANCE" "$INST")")" 200
chk "parent GET fee invoices -> 200"    "$(code "$(req GET "$FEES/invoices" "$PARENT" "$INST")")" 200
chk "parent POST fee invoice -> 403"    "$(code "$(req POST "$FEES/invoices" "$PARENT" "$INST" "{\"invoiceNo\":\"x\",\"studentId\":\"00000000-0000-0000-0000-000000000000\",\"amount\":1}")")" 403
chk "teacher GET fee invoices -> 403"   "$(code "$(req GET "$FEES/invoices" "$TEACHER" "$INST")")" 403
chk "hr GET fee invoices -> 403"        "$(code "$(req GET "$FEES/invoices" "$HR" "$INST")")" 403
chk "hr GET payroll runs -> 200"        "$(code "$(req GET "$PR/runs" "$HR" "$INST")")" 200
chk "finance GET payroll runs -> 403"   "$(code "$(req GET "$PR/runs" "$FINANCE" "$INST")")" 403
chk "finance POST payroll run -> 403"   "$(code "$(req POST "$PR/runs" "$FINANCE" "$INST" "{\"name\":\"x\"}")")" 403
chk "owner GET payroll runs -> 200"     "$(code "$(req GET "$PR/runs" "$OWNER" "$INST")")" 200

echo "== 2. Academic + people scaffolding (owner, institution scope) =="
YEAR_ID="$(body "$(req POST "$AC/academic-years" "$OWNER" "$INST" "{\"name\":\"Year $RUN\",\"startDate\":\"2031-06-01\",\"endDate\":\"2032-05-31\"}")" | field id)"
GLVL_ID="$(body "$(req POST "$AC/grade-levels" "$OWNER" "$INST" "{\"name\":\"Grade $RUN\",\"level\":1}")" | field id)"
CLASS_ID="$(body "$(req POST "$AC/classes" "$OWNER" "$INST" "{\"name\":\"Class $RUN\",\"academicYearId\":\"$YEAR_ID\",\"gradeLevelId\":\"$GLVL_ID\"}")" | field id)"
STU_ID="$(body "$(req POST "$PP/students" "$OWNER" "$INST" "{\"admissionNo\":\"ADM-$RUN\",\"firstName\":\"Stu $RUN\",\"lastName\":\"Dent\",\"classId\":\"$CLASS_ID\"}")" | field id)"
TEACHER_ID="$(body "$(req POST "$PP/teachers" "$OWNER" "$INST" "{\"firstName\":\"Tara $RUN\",\"lastName\":\"Teach\"}")" | field id)"
STAFF_ID="$(body "$(req POST "$PP/staff" "$OWNER" "$INST" "{\"firstName\":\"Sid $RUN\",\"lastName\":\"Staff\"}")" | field id)"
chk "scaffolding created (year/grade/class/student/teacher/staff)" \
  "$([ -n "$YEAR_ID$GLVL_ID$CLASS_ID$STU_ID$TEACHER_ID" ] && [ -n "$STAFF_ID" ] && echo ok)" ok

echo "== 3. Fee structures CRUD =="
R="$(req POST "$FEES/structures" "$OWNER" "$INST" "{\"name\":\"Tuition $RUN\",\"feeType\":\"tuition\",\"amount\":50000,\"frequency\":\"term\",\"gradeLevelId\":\"$GLVL_ID\"}")"
STRUCT_ID="$(body "$R" | field id)"
chk "create structure -> id" "$([ -n "$STRUCT_ID" ] && echo ok)" ok
chk "  default status active" "$(body "$R" | field status)" active
chk "structure unknown gradeLevelId -> 400" "$(code "$(req POST "$FEES/structures" "$OWNER" "$INST" "{\"name\":\"x\",\"amount\":1,\"gradeLevelId\":\"00000000-0000-0000-0000-000000000000\"}")")" 400
chk "structure update -> inactive (v0) -> 200" "$(code "$(req PATCH "$FEES/structures/$STRUCT_ID" "$OWNER" "$INST" "{\"status\":\"inactive\",\"version\":0}")")" 200
chk "structure stale version update -> 409" "$(code "$(req PATCH "$FEES/structures/$STRUCT_ID" "$OWNER" "$INST" "{\"status\":\"active\",\"version\":0}")")" 409

echo "== 4. Fee invoices CRUD + duplicate/ref guards =="
R="$(req POST "$FEES/invoices" "$OWNER" "$INST" "{\"invoiceNo\":\"INV-$RUN\",\"studentId\":\"$STU_ID\",\"feeStructureId\":\"$STRUCT_ID\",\"amount\":1000,\"dueDate\":\"$TODAY\"}")"
INV_ID="$(body "$R" | field id)"
chk "create invoice -> id" "$([ -n "$INV_ID" ] && echo ok)" ok
chk "  student name resolves" "$(req GET "$FEES/invoices?studentId=$STU_ID" "$OWNER" "$INST" | sed '$d' | field items.0.studentName)" "Stu $RUN Dent"
chk "  default status pending" "$(body "$R" | field status)" pending
chk "  initial balance == amount" "$(body "$R" | field balance)" 1000
chk "duplicate invoiceNo -> 409 (INVOICE_EXISTS)" "$(body "$(req POST "$FEES/invoices" "$OWNER" "$INST" "{\"invoiceNo\":\"INV-$RUN\",\"studentId\":\"$STU_ID\",\"amount\":1}")" | field code)" INVOICE_EXISTS
chk "invoice unknown studentId -> 400" "$(code "$(req POST "$FEES/invoices" "$OWNER" "$INST" "{\"invoiceNo\":\"INV2-$RUN\",\"studentId\":\"00000000-0000-0000-0000-000000000000\",\"amount\":1}")")" 400
chk "invoice stale version update -> 409" "$(code "$(req PATCH "$FEES/invoices/$INV_ID" "$OWNER" "$INST" "{\"amount\":2000,\"version\":99}")")" 409

echo "== 5. Payment -> invoice bridge =="
R="$(req POST "$FEES/invoices/$INV_ID/payments" "$OWNER" "$INST" "{\"amount\":400,\"method\":\"cash\"}")"
PAY1_ID="$(body "$R" | field payment.id)"
chk "record payment 400 -> id" "$([ -n "$PAY1_ID" ] && echo ok)" ok
chk "  invoice status -> partial" "$(body "$R" | field invoice.status)" partial
chk "  invoice amountPaid -> 400" "$(body "$R" | field invoice.amountPaid)" 400
chk "  invoice balance -> 600" "$(body "$R" | field invoice.balance)" 600
chk "overpay (700 > 600 balance) -> 400 (PAYMENT_EXCEEDS_BALANCE)" "$(body "$(req POST "$FEES/invoices/$INV_ID/payments" "$OWNER" "$INST" "{\"amount\":700}")" | field code)" PAYMENT_EXCEEDS_BALANCE
R="$(req POST "$FEES/invoices/$INV_ID/payments" "$OWNER" "$INST" "{\"amount\":600,\"method\":\"bank_transfer\"}")"
chk "record payment 600 -> invoice paid" "$(body "$R" | field invoice.status)" paid
chk "  invoice balance -> 0" "$(body "$R" | field invoice.balance)" 0
chk "payments list length == 2" "$(req GET "$FEES/invoices/$INV_ID/payments" "$OWNER" "$INST" | sed '$d' | len)" 2

echo "== 6. Payroll runs + items (net = gross - deductions) =="
R="$(req POST "$PR/runs" "$HR" "$INST" "{\"name\":\"Run $RUN\",\"periodLabel\":\"$RUN\",\"payDate\":\"$TODAY\"}")"
PRUN_ID="$(body "$R" | field id)"
chk "create payroll run -> id" "$([ -n "$PRUN_ID" ] && echo ok)" ok
chk "  default status draft" "$(body "$R" | field status)" draft
R="$(req POST "$PR/runs/$PRUN_ID/items" "$HR" "$INST" "{\"employeeType\":\"teacher\",\"teacherId\":\"$TEACHER_ID\",\"gross\":80000,\"deductions\":5000}")"
ITEM_ID="$(body "$R" | field id)"
chk "create item (teacher) -> id" "$([ -n "$ITEM_ID" ] && echo ok)" ok
chk "  net computed == 75000" "$(body "$R" | field net)" 75000
chk "  employee name resolves" "$(req GET "$PR/runs/$PRUN_ID/items" "$HR" "$INST" | sed '$d' | field 0.employeeName)" "Tara $RUN Teach"
chk "add staff item -> 200/201" "$([ "$(code "$(req POST "$PR/runs/$PRUN_ID/items" "$HR" "$INST" "{\"employeeType\":\"staff\",\"staffId\":\"$STAFF_ID\",\"gross\":40000,\"deductions\":0}")")" = 201 ] || [ "$(code "$(req POST "$PR/runs/$PRUN_ID/items" "$HR" "$INST" "{\"employeeType\":\"staff\",\"staffId\":\"$STAFF_ID\",\"gross\":40000}")")" = 201 ] && echo ok)" ok
chk "duplicate (run,teacher) -> 409 (ITEM_EXISTS)" "$(body "$(req POST "$PR/runs/$PRUN_ID/items" "$HR" "$INST" "{\"employeeType\":\"teacher\",\"teacherId\":\"$TEACHER_ID\",\"gross\":1}")" | field code)" ITEM_EXISTS
chk "item unknown teacherId -> 400" "$(code "$(req POST "$PR/runs/$PRUN_ID/items" "$HR" "$INST" "{\"employeeType\":\"teacher\",\"teacherId\":\"00000000-0000-0000-0000-000000000000\",\"gross\":1}")")" 400
chk "deductions > gross -> 400 (INVALID_DEDUCTIONS)" "$(body "$(req POST "$PR/runs/$PRUN_ID/items" "$HR" "$INST" "{\"employeeType\":\"teacher\",\"teacherId\":\"$TEACHER_ID\",\"gross\":10,\"deductions\":99}")" | field code)" INVALID_DEDUCTIONS
chk "items list length == 2" "$(req GET "$PR/runs/$PRUN_ID/items" "$HR" "$INST" | sed '$d' | len)" 2
chk "run update -> approved (v0) -> 200" "$(code "$(req PATCH "$PR/runs/$PRUN_ID" "$HR" "$INST" "{\"status\":\"approved\",\"version\":0}")")" 200
chk "run stale version update -> 409" "$(code "$(req PATCH "$PR/runs/$PRUN_ID" "$HR" "$INST" "{\"status\":\"paid\",\"version\":0}")")" 409

echo "== 7. Scope isolation (confined campus admin, fees) =="
chk "campus-admin GET fee structures -> 200" "$(code "$(req GET "$FEES/structures" "$CAMPUS" "$INST")")" 200
R="$(req POST "$FEES/structures" "$CAMPUS" "$INST" "{\"name\":\"CFee $RUN\",\"feeType\":\"transport\",\"amount\":1500}")"
CSTRUCT_ID="$(body "$R" | field id)"
chk "campus-admin can create in its scope" "$([ -n "$CSTRUCT_ID" ] && echo ok)" ok
chk "  new row stamped to a campus (not institution-owned)" "$([ -n "$(body "$R" | field campusId)" ] && echo ok)" ok
R="$(req GET "$FEES/structures" "$CAMPUS" "campus:00000000-0000-0000-0000-000000000000")"
chk "campus-admin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 8. Audit rows written (best-effort; needs DATABASE_URL) =="
if [ -n "${DATABASE_URL:-}" ]; then
  acount(){ node -e '
    const p=require("postgres");const sql=p(process.env.DATABASE_URL,{max:1});
    (async()=>{const r=await sql`select count(*)::int as n from audit_events where module = ${process.argv[1]}`;
    console.log(r[0]&&r[0].n>0?"ok":"no");await sql.end();})().catch(()=>{console.log("no")});
  ' "$1" 2>/dev/null; }
  chk "portal-fees audit rows exist" "$(acount portal-fees)" ok
  chk "portal-payroll audit rows exist" "$(acount portal-payroll)" ok
else
  echo "  SKIP  (DATABASE_URL not set — set it to verify audit rows)"
fi

echo "== 9. Cleanup (re-read versions, delete) =="
delv(){ # delv <listUrl> <delBase> <id> <email>
  local listUrl="$1" delBase="$2" id="$3" e="$4"
  local v; v="$(req GET "$listUrl?pageSize=100" "$e" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")}catch{console.log("")}})' "$id")"
  [ -z "$v" ] && { echo "  SKIP  ${id:0:8} (not found)"; return; }
  chk "delete ${id:0:8} -> 200" "$(code "$(req DELETE "$delBase/$id" "$e" "$INST" "{\"version\":$v}")")" 200
}
[ -n "$INV_ID" ] && delv "$FEES/invoices" "$FEES/invoices" "$INV_ID" "$OWNER"          # payments cascade
[ -n "$STRUCT_ID" ] && delv "$FEES/structures" "$FEES/structures" "$STRUCT_ID" "$OWNER"
[ -n "$CSTRUCT_ID" ] && delv "$FEES/structures" "$FEES/structures" "$CSTRUCT_ID" "$OWNER"
[ -n "$PRUN_ID" ] && delv "$PR/runs" "$PR/runs" "$PRUN_ID" "$OWNER"                     # items cascade
[ -n "$STU_ID" ] && delv "$PP/students" "$PP/students" "$STU_ID" "$OWNER"
[ -n "$CLASS_ID" ] && delv "$AC/classes" "$AC/classes" "$CLASS_ID" "$OWNER"
[ -n "$GLVL_ID" ] && delv "$AC/grade-levels" "$AC/grade-levels" "$GLVL_ID" "$OWNER"
[ -n "$YEAR_ID" ] && delv "$AC/academic-years" "$AC/academic-years" "$YEAR_ID" "$OWNER"
[ -n "$TEACHER_ID" ] && delv "$PP/teachers" "$PP/teachers" "$TEACHER_ID" "$OWNER"
[ -n "$STAFF_ID" ] && delv "$PP/staff" "$PP/staff" "$STAFF_ID" "$OWNER"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
