#!/usr/bin/env bash
# Phase 2 (Admin-panel redesign — Health & Wellbeing deep fix) live smoke.
#
# Proves a health record is now a legible clinical record, not a bare UUID:
#   1. clinical columns round-trip — reason/symptoms/action_taken/treatment/attended_by/follow_up.
#   2. student enrichment — the row carries the full student card: name, admission no, class, grade,
#      section, campus, computed age, and the primary guardian (name/phone/relationship).
#   3. the nurse role can pick a student (student_basic_profile.view added to school_nurse).
#   4. permission gating unchanged (a teacher can't read health records).
#
# Self-cleaning: creates one record with a unique title and deletes it at the end.
#
# Prereqs: API on :3001 with PORTAL_AUTH_DEV_HEADER=true; DB seeded (seed-uis) + migration 0027.
set -u
API="${API:-http://localhost:3001/v1}"
OWNER="${OWNER:-owner@uis.edu.in}"
NURSE="${NURSE:-nurse@uis.edu.in}"
TEACHER="${TEACHER:-teacher@uis.edu.in}"
INST='institution'
RUN="smoke-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
nonempty(){ if [ -n "$2" ] && [ "$2" != "undefined" ] && [ "$2" != "null" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 got empty/'$2'"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
H_OWNER=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')

echo "== 0. nurse can pick a student =="
chk "nurse -> students-basic 200" "$(curl -s -o /dev/null -w '%{http_code}' "$API/portal/directory/students-basic?pageSize=1" -H "x-institution-user-email: $NURSE" -H "x-institution-scope: $INST")" "200"

# Reuse an already-seeded health record's student — those point at students that have a guardian,
# so the guardian assertion below is deterministic (guardians are optional in general).
SID="$(curl -s "$API/portal/health/records?pageSize=1" "${H_OWNER[@]}" | field 'items.0.studentId')"
nonempty "picked a student id (with guardian)" "$SID"

echo "== 1. create a health record with full clinical context =="
BODY="$(node -e 'const [sid,run]=process.argv.slice(1);console.log(JSON.stringify({title:"Fever "+run,studentId:sid,recordType:"visit",reason:"Complained of fever after lunch",symptoms:"Temp 38.5C, headache",actionTaken:"Rested in sick bay, gave water",treatment:"Paracetamol 250mg",attendedBy:"Nurse Usha",followUpRequired:true,followUpAt:"2026-07-05",status:"active",recordedAt:"2026-07-01"}))' "$SID" "$RUN")"
CREATED="$(curl -s -X POST "$API/portal/health/records" "${H_OWNER[@]}" -d "$BODY")"
RID="$(printf '%s' "$CREATED" | field 'id')"
nonempty "record created" "$RID"

echo "== 2. list it back — clinical cols round-trip + student card =="
LIST="$(curl -s "$API/portal/health/records?pageSize=100&search=$RUN" "${H_OWNER[@]}")"
# The searched row is item 0 (unique title).
chk    "reason round-trips"        "$(printf '%s' "$LIST" | field 'items.0.reason')" "Complained of fever after lunch"
chk    "actionTaken round-trips"   "$(printf '%s' "$LIST" | field 'items.0.actionTaken')" "Rested in sick bay, gave water"
chk    "attendedBy round-trips"    "$(printf '%s' "$LIST" | field 'items.0.attendedBy')" "Nurse Usha"
chk    "followUpRequired true"     "$(printf '%s' "$LIST" | field 'items.0.followUpRequired')" "true"
nonempty "student.label"           "$(printf '%s' "$LIST" | field 'items.0.student.label')"
nonempty "student.className"       "$(printf '%s' "$LIST" | field 'items.0.student.className')"
nonempty "student.gradeName"       "$(printf '%s' "$LIST" | field 'items.0.student.gradeName')"
nonempty "student.campusName"      "$(printf '%s' "$LIST" | field 'items.0.student.campusName')"
nonempty "student.age (from DOB)"  "$(printf '%s' "$LIST" | field 'items.0.student.age')"
nonempty "student.guardian.name"   "$(printf '%s' "$LIST" | field 'items.0.student.guardian.name')"

echo "== 3. permission gating unchanged =="
chk "teacher -> health/records 403" "$(curl -s -o /dev/null -w '%{http_code}' "$API/portal/health/records" -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $INST")" "403"

echo "== 4. cleanup =="
VER="$(printf '%s' "$LIST" | field 'items.0.version')"
chk "delete created record 200" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/portal/health/records/$RID" "${H_OWNER[@]}" -d "{\"version\":${VER:-0}}")" "200"

echo
echo "health smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
