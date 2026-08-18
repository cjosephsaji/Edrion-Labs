#!/usr/bin/env bash
# Phase 5 (Admin-panel redesign — Institution Attention / Command Centre) live smoke.
#
# Proves the command centre aggregates REAL signals (never fake) + labels analytics as not-yet-ready:
#   1. structure — six categories are returned (fees, attendance, performance, learning, health, ops).
#   2. real signal — a seeded overdue invoice surfaces in Fees & Finance with the student's NAME
#      (resolved, not a UUID) and a non-zero count.
#   3. honest placeholders — Student Performance + Learning Progress report `not_yet_available`.
#   4. permission-scoped — a nurse (no fees.view) gets Fees as `no_access` but Health as `ok`.
#
# Self-cleaning: seeds one overdue invoice via psql and deletes it. Prereqs: API on :3007 with
# PORTAL_AUTH_DEV_HEADER=true; DB seeded (uis).
set -u
API="${API:-http://localhost:3007/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
OWNER="${OWNER:-owner@uis.edu.in}"
NURSE="${NURSE:-nurse@uis.edu.in}"
INST='institution'
RUN="att-$(date +%s)"
H=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST")

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
ok(){ if [ -n "$2" ] && [ "$2" != "undefined" ] && [ "$2" != "null" ] && [ "$2" != "Unknown student" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 got '$2'"; fail=$((fail+1)); fi; }
cat_field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const c=(o.categories||[]).find(x=>x.key===process.argv[1]);let v=c;for(const k of process.argv[2].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)})' "$1" "$2"; }

echo "== 0. seed an overdue invoice for a real student =="
SNAME="$(psql "$DBURL" -tAc "
with s as (select id, institution_id, campus_id, first_name||' '||last_name as name from students order by admission_no limit 1)
insert into fee_invoices (institution_id, campus_id, invoice_no, student_id, amount, amount_paid, status, due_date)
select institution_id, campus_id, 'INV-$RUN', id, 123400, 0, 'pending', '2020-01-01' from s
returning (select name from s);" 2>/dev/null | tr -d '[:space:]')"
ok "seeded invoice for student" "$SNAME"

echo "== 1. structure — six categories =="
ALL="$(curl -s "$API/portal/attention" "${H[@]}")"
chk "category count" "$(printf '%s' "$ALL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s).categories||[]).length))')" "6"

echo "== 2. real fees signal resolves a name =="
chk "fees status ok" "$(printf '%s' "$ALL" | cat_field fees status)" "ok"
FC="$(printf '%s' "$ALL" | cat_field fees count)"
if [ "${FC:-0}" -ge 1 ] 2>/dev/null; then echo "  PASS  fees count >= 1 ($FC)"; pass=$((pass+1)); else echo "  FAIL  fees count >=1 got '$FC'"; fail=$((fail+1)); fi
ok "fees item shows student name" "$(printf '%s' "$ALL" | cat_field fees items.0.title)"

echo "== 3. honest analytics placeholders =="
chk "performance not_yet_available" "$(printf '%s' "$ALL" | cat_field performance status)" "not_yet_available"
chk "learning not_yet_available" "$(printf '%s' "$ALL" | cat_field learning status)" "not_yet_available"

echo "== 4. permission-scoped per category (nurse) =="
NALL="$(curl -s "$API/portal/attention" -H "x-institution-user-email: $NURSE" -H "x-institution-scope: $INST")"
chk "nurse: fees no_access" "$(printf '%s' "$NALL" | cat_field fees status)" "no_access"
chk "nurse: health ok" "$(printf '%s' "$NALL" | cat_field health status)" "ok"

echo "== 5. cleanup =="
psql "$DBURL" -tAc "delete from fee_invoices where invoice_no = 'INV-$RUN';" >/dev/null 2>&1 && echo "  cleaned"

echo
echo "attention smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
