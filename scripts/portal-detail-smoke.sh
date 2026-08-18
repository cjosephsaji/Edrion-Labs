#!/usr/bin/env bash
# Phase 1 (Admin-panel redesign — Foundation) live smoke.
#
# Proves the engine-level FK→name enrichment that backs the new read-only detail panels:
#   1. health/records list — each row carries a resolved `student` {id,label,sub,meta} alongside the
#      raw `studentId`, and student.id === studentId (the resolver matched the right row).
#   2. counseling/records list — same enrichment via the shared PortalEntityResolver (a second module,
#      proving it's generic, not health-specific).
#   3. raw ids are preserved (the web still edits/deletes by id; it only *renders* the name).
#   4. permission gating unchanged — a role without health_records.view gets 403.
#
# Read-only: creates nothing, deletes nothing. Needs seeded students + a few health/counseling rows.
#
# Prereqs: API on :3007 started with PORTAL_AUTH_DEV_HEADER=true; DB seeded (seed-portal).
set -u
API="${API:-http://localhost:3007/v1}"
OWNER="${OWNER:-owner@uis.edu.in}"         # institution_owner (wildcard perms)
TEACHER="${TEACHER:-teacher@uis.edu.in}"   # no health_records.view
INST='institution'

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
nonempty(){ if [ -n "$2" ] && [ "$2" != "undefined" ] && [ "$2" != "null" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 got empty/'$2'"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
get(){ curl -s "$API/$1" -H "x-institution-user-email: $2" -H "x-institution-scope: $INST"; }
gcode(){ curl -s -o /dev/null -w '%{http_code}' "$API/$1" -H "x-institution-user-email: $2" -H "x-institution-scope: $INST"; }

echo "== 1. health/records — enriched student =="
HR="$(get 'portal/health/records?pageSize=5' "$OWNER")"
nonempty "health list has a student label" "$(printf '%s' "$HR" | field 'items.0.student.label')"
SID="$(printf '%s' "$HR" | field 'items.0.studentId')"
SREFID="$(printf '%s' "$HR" | field 'items.0.student.id')"
chk   "student.id === studentId (right row resolved)" "$SREFID" "$SID"
nonempty "raw studentId preserved" "$SID"
nonempty "student.sub (admission no) present" "$(printf '%s' "$HR" | field 'items.0.student.sub')"

echo "== 2. counseling/records — same resolver, different module =="
CR="$(get 'portal/counseling/records?pageSize=5' "$OWNER")"
nonempty "counseling list has a student label" "$(printf '%s' "$CR" | field 'items.0.student.label')"

echo "== 3. permission gating unchanged =="
chk "teacher (no health_records.view) -> 403" "$(gcode 'portal/health/records' "$TEACHER")" "403"

echo
echo "detail smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
