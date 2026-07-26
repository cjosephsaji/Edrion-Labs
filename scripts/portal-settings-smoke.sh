#!/usr/bin/env bash
# Phase 6 (Admin-panel redesign — Global settings prune + wire) live smoke.
#
# Proves the canonical settings registry + effective endpoint work and take effect:
#   1. effective defaults — GET returns the registry defaults (currency USD, grading percentage, …).
#   2. save + merge — POST a couple of overrides; GET reflects them (currency INR, grading gpa4).
#   3. unknown keys ignored — a bogus key is not stored.
#   4. permission gating — a teacher (no institution_settings.view) gets 403.
#
# Restores currency to USD at the end. Prereqs: API on :3001 with PORTAL_AUTH_DEV_HEADER=true.
set -u
API="${API:-http://localhost:3001/v1}"
OWNER="${OWNER:-owner@uis.edu.in}"
TEACHER="${TEACHER:-teacher@uis.edu.in}"
INST='institution'
H=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
val(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);console.log(o.values?.[process.argv[1]]??"")}catch{console.log("")}})' "$1"; }
has(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(Object.prototype.hasOwnProperty.call(o.values||{},process.argv[1])?"yes":"no")})' "$1"; }

echo "== 1. effective returns registry keys (unset key = default) =="
DEF="$(curl -s "$API/portal/settings/effective" "${H[@]}")"
# mfaRequired is not seeded, so it must be the registry default (false) — proves the overlay path.
chk "unset mfaRequired = default false" "$(printf '%s' "$DEF" | val mfaRequired)" "false"
chk "unset dataRetentionDays = default 365" "$(printf '%s' "$DEF" | val dataRetentionDays)" "365"

echo "== 2. save + merge (set → get) =="
curl -s -X POST "$API/portal/settings/effective" "${H[@]}" -d '{"values":{"currency":"USD","gradingScale":"percentage"}}' > /dev/null
BASE="$(curl -s "$API/portal/settings/effective" "${H[@]}")"
chk "currency USD after set" "$(printf '%s' "$BASE" | val currency)" "USD"
SAVED="$(curl -s -X POST "$API/portal/settings/effective" "${H[@]}" -d '{"values":{"currency":"INR","gradingScale":"gpa4"}}')"
chk "save returns currency INR" "$(printf '%s' "$SAVED" | val currency)" "INR"
AFT="$(curl -s "$API/portal/settings/effective" "${H[@]}")"
chk "GET reflects currency INR" "$(printf '%s' "$AFT" | val currency)" "INR"
chk "GET reflects grading gpa4" "$(printf '%s' "$AFT" | val gradingScale)" "gpa4"

echo "== 3. unknown key ignored =="
curl -s -X POST "$API/portal/settings/effective" "${H[@]}" -d '{"values":{"totallyBogusKey":"x"}}' > /dev/null
chk "bogus key not stored" "$(curl -s "$API/portal/settings/effective" "${H[@]}" | has totallyBogusKey)" "no"

echo "== 4. permission gating =="
chk "teacher -> effective 403" "$(curl -s -o /dev/null -w '%{http_code}' "$API/portal/settings/effective" -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $INST")" "403"

echo "== 5. restore =="
curl -s -X POST "$API/portal/settings/effective" "${H[@]}" -d '{"values":{"currency":"USD","gradingScale":"percentage"}}' > /dev/null && echo "  restored"

echo
echo "settings smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
