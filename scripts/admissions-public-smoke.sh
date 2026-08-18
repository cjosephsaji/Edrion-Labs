#!/usr/bin/env bash
# Public parent admission-apply funnel — live smoke.
#
# Proves end-to-end, against the running API + Postgres, that the PUBLIC funnel is real and its
# guarantees hold:
#   1. discovery  — list live institutions (minimal public fields) + per-institution options
#      (campuses / academic years / grade levels), for that institution only.
#   2. funnel     — start draft (resume token returned ONCE) → autosave section → OTP request →
#      OTP verify → submit, with an ADM-XXXXXXXX reference assigned only on submit.
#   3. resume     — a missing/garbage token -> 403 INVALID_RESUME_TOKEN.
#   4. OTP guard  — a wrong code is rejected; submit before verify -> 400 EMAIL_NOT_VERIFIED.
#   5. persistence— submit creates a tenant admission_applications row (submitted_via='portal').
#   6. idempotent — re-submitting the same draft returns the same application_no.
#   7. audit      — admission.* rows are written for the draft.
#   8. permission — every endpoint is @Public (no auth header needed).
#   9. cross-device resume — POST /resume + /resume/verify rotates the resume token.
#  10. geo           — GET /geo returns a JSON object (may be empty on localhost).
#
# Prereqs: API on :3007 booted with REGISTRATION_OTP_DEV_RETURN=true; Postgres with at least one
# institution in an applicable status (active/trial) that has campuses/years/grades; migrations
# through 0032 applied. API-only smoke (no browser); the funnel UI lives in apps/public-web.
set -u
set +B
API="${API:-http://localhost:3007/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
REDIS="${REDIS_URL:-redis://localhost:6379}"
RUN="$(date +%s)"
EMAIL="parent+${RUN}@applicant-smoke.test"

# The API rate-limiter shares ONE per-IP counter across handlers while each handler caps it at its
# own max (start=10, otp=5, submit=5). Running the whole funnel from one IP inside a single 60s
# window therefore trips the low submit/otp caps. Reset just the rate-limit keys between phases so
# this stays a deterministic FUNNEL proof (not a throttle test) — like starting a fresh window.
reset_throttle(){ redis-cli -u "$REDIS" --scan --pattern 'rl:*' 2>/dev/null | xargs -r redis-cli -u "$REDIS" del >/dev/null 2>&1; }

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
has(){ if printf '%s' "$2" | grep -q "$3"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (missing '$3' in: $(printf '%s' "$2" | head -c 200))"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of (process.argv[1]||"").split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "${1:-}"; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

# Public funnel (no auth, signed resume token via x-admission-token).
pub(){ local m="$1" p="$2" sc="${3:-}" b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API/admissions/apply$p" -H "x-admission-token: $sc" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API/admissions/apply$p" -H "x-admission-token: $sc"
  fi
}
pub_noauth(){ local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API/admissions/apply$p" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API/admissions/apply$p"
  fi
}

echo "################ ADMISSIONS PUBLIC SMOKE ($RUN) ################"

# 1. Discover a live institution.
R=$(pub GET "/institutions"); chk "list institutions" "$(code "$R")" 200
INST=$(body "$R" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);console.log(a[0]?a[0].id:"")})')
has "  institution has publicId" "$(body "$R")" '"publicId"'
[ -n "$INST" ] && echo "  .. institution id=$INST" || { echo "  !! no applicable institution — seed one (status active/trial)"; echo "  PASS=$pass FAIL=$((fail+1))"; exit 1; }

# 2. Per-institution options (campuses / years / grades), that institution only.
R=$(pub GET "/institutions/$INST/options"); chk "institution options" "$(code "$R")" 200
OPT=$(body "$R")
CAMPUS=$(printf '%s' "$OPT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(o.campuses&&o.campuses[0]?o.campuses[0].id:"")})')
YEAR=$(printf '%s' "$OPT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(o.academicYears&&o.academicYears[0]?o.academicYears[0].id:"")})')
GRADE=$(printf '%s' "$OPT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(o.gradeLevels&&o.gradeLevels[0]?o.gradeLevels[0].id:"")})')
has "  options has campuses" "$OPT" '"campuses"'
has "  options has gradeLevels" "$OPT" '"gradeLevels"'
echo "  .. campus=$CAMPUS year=$YEAR grade=$GRADE"

# 3. Options for a non-existent institution -> 404.
R=$(pub GET "/institutions/00000000-0000-0000-0000-000000000000/options"); chk "options unknown inst -> 404" "$(code "$R")" 404

# 4. Start a draft.
R=$(pub POST "" "" "{\"institutionId\":\"$INST\",\"contactEmail\":\"$EMAIL\"}"); chk "start draft" "$(code "$R")" 201
ID=$(body "$R" | field id); TOKEN=$(body "$R" | field token)
[ -n "$ID" ] && echo "  .. draft id=$ID"
has "  token returned once" "$(body "$R")" '"token"'

# 5. Resume-token guard.
R=$(pub GET "/$ID" "garbage-token"); chk "bad resume token -> 403" "$(code "$R")" 403
has "  code INVALID_RESUME_TOKEN" "$(body "$R")" "INVALID_RESUME_TOKEN"

# 6. Resume with the real token.
R=$(pub GET "/$ID" "$TOKEN"); chk "resume draft" "$(code "$R")" 200
has "  status draft" "$(body "$R")" '"status":"draft"'

# 7. Autosave a section.
R=$(pub PATCH "/$ID" "$TOKEN" '{"student":{"firstName":"Ava","lastName":"Applicant","gender":"female","dateOfBirth":"2015-04-01"},"guardian":{"name":"Riya Applicant","phone":"+919876543210","relationship":"mother"}}')
chk "autosave sections" "$(code "$R")" 200
has "  payload persisted" "$(body "$R")" '"firstName":"Ava"'

# 7b. Geo endpoint (best-effort; localhost may return {}).
R=$(pub_noauth GET "/geo"); chk "geo endpoint" "$(code "$R")" 200

# 7c. Cross-device resume rotates the resume token.
OLD_TOKEN="$TOKEN"
reset_throttle
R=$(pub_noauth POST "/resume" "{\"email\":\"$EMAIL\"}"); chk "resume request" "$(code "$R")" 201
RESUME_OTP=$(body "$R" | field devCode)
[ -n "$RESUME_OTP" ] && echo "  .. resume otp=$RESUME_OTP" || echo "  !! no devCode — set REGISTRATION_OTP_DEV_RETURN=true"
R=$(pub_noauth POST "/resume/verify" "{\"email\":\"$EMAIL\",\"code\":\"$RESUME_OTP\"}"); chk "resume verify" "$(code "$R")" 201
NEW_TOKEN=$(body "$R" | field token)
has "  resume returns draft" "$(body "$R")" '"draft"'
[ "$NEW_TOKEN" != "$OLD_TOKEN" ] && { echo "  PASS  resume token rotated"; pass=$((pass+1)); } || { echo "  FAIL  resume token not rotated"; fail=$((fail+1)); }
R=$(pub GET "/$ID" "$NEW_TOKEN"); chk "resume with new token" "$(code "$R")" 200
R=$(pub GET "/$ID" "$OLD_TOKEN"); chk "old token invalidated -> 403" "$(code "$R")" 403
TOKEN="$NEW_TOKEN"

SUBMIT=$(cat <<JSON
{
  "target":{"campusId":"$CAMPUS","academicYearId":"$YEAR","gradeLevelId":"$GRADE"},
  "student":{"firstName":"Ava","lastName":"Applicant","gender":"female","dateOfBirth":"2015-04-01","previousSchool":"Sunrise Pre"},
  "guardian":{"name":"Riya Applicant","email":"riya+${RUN}@applicant-smoke.test","phone":"+919876543210","relationship":"mother"},
  "contact":{"email":"$EMAIL","phone":"+919812345678"},
  "address":{"line1":"12 Rose Ln","city":"Mumbai","country":"IN"}
}
JSON
)

# 8. Submit before verifying -> blocked.
reset_throttle
R=$(pub POST "/$ID/submit" "$TOKEN" "$SUBMIT"); chk "submit unverified -> 400" "$(code "$R")" 400
has "  code EMAIL_NOT_VERIFIED" "$(body "$R")" "EMAIL_NOT_VERIFIED"

# 9. Request OTP (dev-return) + wrong code rejected.
R=$(pub POST "/$ID/otp" "$TOKEN" "{\"email\":\"$EMAIL\"}"); chk "request OTP" "$(code "$R")" 201
OTP=$(body "$R" | field devCode)
[ -n "$OTP" ] && echo "  .. otp=$OTP" || echo "  !! no devCode — set REGISTRATION_OTP_DEV_RETURN=true"
R=$(pub POST "/$ID/otp/verify" "$TOKEN" '{"code":"000000"}'); chk "wrong OTP -> 400" "$(code "$R")" 400

# 10. Verify with the real code.
R=$(pub POST "/$ID/otp/verify" "$TOKEN" "{\"code\":\"$OTP\"}"); chk "verify OTP" "$(code "$R")" 201

# 11. Submit -> reference assigned.
R=$(pub POST "/$ID/submit" "$TOKEN" "$SUBMIT"); chk "submit verified" "$(code "$R")" 201
APPNO=$(body "$R" | field applicationNo)
has "  reference ADM-*" "$APPNO" "ADM-"
chk "status submitted" "$(body "$R" | field status)" "submitted"
echo "  .. application_no=$APPNO"

# 12. Persistence assertions (DB).
chk "app row submitted_via" "$(psql "$DBURL" -tA -c "select submitted_via from admission_applications where application_no='$APPNO' and institution_id='$INST'")" "portal"
chk "app row status"        "$(psql "$DBURL" -tA -c "select status from admission_applications where application_no='$APPNO' and institution_id='$INST'")" "submitted"
chk "app row campus linked" "$(psql "$DBURL" -tA -c "select campus_id from admission_applications where application_no='$APPNO'")" "$CAMPUS"
chk "app row grade linked"  "$(psql "$DBURL" -tA -c "select grade_level_id from admission_applications where application_no='$APPNO'")" "$GRADE"
chk "draft marked submitted" "$(psql "$DBURL" -tA -c "select status from admission_application_drafts where id='$ID'")" "submitted"

# 13. Idempotent re-submit -> same reference.
reset_throttle
R=$(pub POST "/$ID/submit" "$TOKEN" "$SUBMIT"); chk "re-submit idempotent" "$(code "$R")" 201
chk "re-submit same ref" "$(body "$R" | field applicationNo)" "$APPNO"

# 14. Audit trail.
AUD=$(psql "$DBURL" -tA -c "select count(*) from audit_events where entity_id='$ID' and action like 'admission.%'")
[ "${AUD:-0}" -ge 3 ] && { echo "  PASS  audit admission.* rows ($AUD)"; pass=$((pass+1)); } || { echo "  FAIL  audit admission.* rows ($AUD)"; fail=$((fail+1)); }

echo "================ SUMMARY ================"
echo "  PASS=$pass  FAIL=$fail"
echo "========================================"
exit "$fail"
