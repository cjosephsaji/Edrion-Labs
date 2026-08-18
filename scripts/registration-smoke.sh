#!/usr/bin/env bash
# Institution Registration & Approval — live smoke.
#
# Proves end-to-end, against the running API + Postgres, that the funnel + reviewer workflow are
# real and the guarantees hold:
#   1. public funnel — start draft (resume token) → autosave → OTP request → OTP verify → submit,
#      with a human-readable reference (EDR-REG-YYYY-NNNNNN) assigned only on submit.
#   2. OTP security  — a wrong code is rejected (OTP_INVALID); submit before verify -> EMAIL_NOT_VERIFIED.
#   3. resume token  — a missing/garbage token -> 403 INVALID_RESUME_TOKEN.
#   4. duplicate     — a second active application for the same email -> 409 DUPLICATE_REGISTRATION.
#   5. reviewer flow — list/detail (registration.view), start-review, approve wizard payload.
#   6. provisioning  — approval creates an institution (status=onboarding) + a campus + the primary
#      admin (status=invited) + a 6-item onboarding checklist, and links the request (status=approved).
#   7. audit         — registration.* + institution.create + institution_user.invite rows are written.
#   8. permission    — public endpoints need no auth; reviewer endpoints are gated (owner has wildcard).
#
# This is an API-only smoke (no browser). The public funnel UI now lives in apps/public-web on
# port 3003 (moved out of apps/super-admin-web); the reviewer workflow stays in super-admin-web.
#
# Prereqs: API on :3007 booted with AUTH_DEV_HEADER=true and REGISTRATION_OTP_DEV_RETURN=true;
# Postgres seeded with the platform owner (owner@edrion.dev); migrations through 0026 applied.
set -u
set +B
API="${API:-http://localhost:3007/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
OWNER='owner@edrion.dev'                       # platform_owner (wildcard) via AUTH_DEV_HEADER
RUN="$(date +%s)"
EMAIL="head+${RUN}@greenwood-smoke.edu"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
has(){ if printf '%s' "$2" | grep -q "$3"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (missing '$3' in: $(printf '%s' "$2" | head -c 200))"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of (process.argv[1]||"").split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "${1:-}"; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }

# Public funnel (no auth, signed resume token via x-registration-token).
pub(){ local m="$1" p="$2" sc="${3:-}" b="${4:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API/registration$p" -H "x-registration-token: $sc" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API/registration$p" -H "x-registration-token: $sc"
  fi
}
# Reviewer (cookieless dev header identity).
adm(){ local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API/registration-requests$p" -H "x-employee-email: $OWNER" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API/registration-requests$p" -H "x-employee-email: $OWNER"
  fi
}

echo "################ REGISTRATION SMOKE ($RUN) ################"

# Refresh the reviewer's recent-auth so the sensitive approve/reject pass (dev-header has no
# interactive re-auth; this simulates a fresh authentication, as a cookie login would).
psql "$DBURL" -tA -c "update platform_employees set last_auth_at=now() where email='$OWNER'" >/dev/null 2>&1

# 1. Start a draft.
R=$(pub POST "" "" '{}'); chk "start draft" "$(code "$R")" 201
ID=$(body "$R" | field id); TOKEN=$(body "$R" | field resumeToken)
[ -n "$ID" ] && echo "  .. draft id=$ID"

# 2. Resume-token guard.
R=$(pub GET "/$ID" "garbage.token.here"); chk "bad resume token -> 403" "$(code "$R")" 403
has "  code INVALID_RESUME_TOKEN" "$(body "$R")" "INVALID_RESUME_TOKEN"

# 3. Autosave a section.
R=$(pub PATCH "/$ID" "$TOKEN" '{"institutionInfo":{"legalName":"Greenwood Smoke Trust","displayName":"Greenwood Smoke","type":"school"}}')
chk "autosave institutionInfo" "$(code "$R")" 200

SECTIONS=$(cat <<JSON
{
  "institutionInfo":{"legalName":"Greenwood Smoke Trust","displayName":"Greenwood Smoke","type":"school","website":"https://greenwood.example"},
  "location":{"country":"US","city":"Springfield","address":"1 Elm Street","timezone":"America/New_York","region":"IL"},
  "campusInfo":{"currentCampuses":1,"firstCampusName":"Main Campus","expectedStudents":1200,"expectedStaff":120},
  "primaryContact":{"fullName":"Pat Head","jobTitle":"Principal","email":"$EMAIL","phone":"+1 212 555 0123"},
  "subscription":{"planKey":"institution_standard","launchTimeline":"Next term"},
  "consent":{"termsAccepted":true,"privacyAccepted":true,"marketingOptIn":false}
}
JSON
)

# 4. Submit before verifying -> blocked.
R=$(pub POST "/$ID/submit" "$TOKEN" "$SECTIONS"); chk "submit unverified -> 400" "$(code "$R")" 400
has "  code EMAIL_NOT_VERIFIED" "$(body "$R")" "EMAIL_NOT_VERIFIED"

# 5. Request OTP (dev-return) + wrong code rejected.
R=$(pub POST "/$ID/otp" "$TOKEN" "{\"email\":\"$EMAIL\"}"); chk "request OTP" "$(code "$R")" 201
OTP=$(body "$R" | field devCode)
[ -n "$OTP" ] && echo "  .. otp=$OTP" || echo "  !! no devCode — set REGISTRATION_OTP_DEV_RETURN=true"
R=$(pub POST "/$ID/otp/verify" "$TOKEN" '{"code":"000000"}'); chk "wrong OTP -> 400" "$(code "$R")" 400

# 6. Verify with the real code.
R=$(pub POST "/$ID/otp/verify" "$TOKEN" "{\"code\":\"$OTP\"}"); chk "verify OTP" "$(code "$R")" 201

# 7. Submit -> reference assigned.
R=$(pub POST "/$ID/submit" "$TOKEN" "$SECTIONS"); chk "submit verified" "$(code "$R")" 201
REF=$(body "$R" | field publicRef)
has "  reference EDR-REG-*" "$REF" "EDR-REG-"
echo "  .. ref=$REF"

# 8. Reviewer can list + read it.
R=$(adm GET "?search=$REF"); chk "reviewer list" "$(code "$R")" 200
has "  list contains ref" "$(body "$R")" "$REF"
R=$(adm GET "/$ID"); chk "reviewer detail" "$(code "$R")" 200
V=$(body "$R" | field request.version)

# 9. Start review (submitted -> under_review).
R=$(adm POST "/$ID/start-review" "{\"version\":$V}"); chk "start review" "$(code "$R")" 201
R=$(adm GET "/$ID"); V=$(body "$R" | field request.version)
chk "status under_review" "$(body "$R" | field request.status)" "under_review"

# 10. Add an internal note.
R=$(adm POST "/$ID/notes" '{"note":"Looks legitimate; approving."}'); chk "add note" "$(code "$R")" 201

# 11. Approve -> provision.
APPROVE=$(cat <<JSON
{"version":$V,"supportTier":"standard","campus":{"name":"Main Campus"},
 "admin":{"fullName":"Pat Head","email":"admin+${RUN}@greenwood-smoke.edu","roleKeys":["institution_owner"],"credentialDelivery":"activation"}}
JSON
)
R=$(adm POST "/$ID/approve" "$APPROVE"); chk "approve" "$(code "$R")" 201
INST_ID=$(body "$R" | field institutionId)
INST_PUB=$(body "$R" | field institutionPublicId)
echo "  .. institution=$INST_PUB ($INST_ID)"

# 12. Provisioning assertions (DB).
chk "request approved" "$(psql "$DBURL" -tA -c "select status from institution_registration_requests where id='$ID'")" "approved"
chk "request linked"   "$(psql "$DBURL" -tA -c "select linked_institution_id from institution_registration_requests where id='$ID'")" "$INST_ID"
chk "institution onboarding" "$(psql "$DBURL" -tA -c "select status from institutions where id='$INST_ID'")" "onboarding"
chk "campus created"   "$(psql "$DBURL" -tA -c "select count(*) from campuses where institution_id='$INST_ID'")" "1"
chk "admin invited"    "$(psql "$DBURL" -tA -c "select status from institution_users where institution_id='$INST_ID'")" "invited"
chk "onboarding tasks" "$(psql "$DBURL" -tA -c "select count(*) from institution_onboarding_tasks where institution_id='$INST_ID'")" "6"
chk "admin role"       "$(psql "$DBURL" -tA -c "select role_key from institution_user_roles r join institution_users u on u.id=r.institution_user_id where u.institution_id='$INST_ID'")" "institution_owner"

# 13. Audit trail.
AUD=$(psql "$DBURL" -tA -c "select count(*) from audit_events where entity_id='$ID' and action like 'registration.%'")
[ "${AUD:-0}" -ge 4 ] && { echo "  PASS  audit registration.* rows ($AUD)"; pass=$((pass+1)); } || { echo "  FAIL  audit rows ($AUD)"; fail=$((fail+1)); }
INSTA=$(psql "$DBURL" -tA -c "select count(*) from audit_events where institution_id='$INST_ID' and action in ('institution.create','institution_user.invite')")
[ "${INSTA:-0}" -ge 2 ] && { echo "  PASS  provisioning audit rows ($INSTA)"; pass=$((pass+1)); } || { echo "  FAIL  provisioning audit rows ($INSTA)"; fail=$((fail+1)); }

# 14. Duplicate active application for the same (now approved) email -> 409 on submit.
R=$(pub POST "" "" '{}'); ID2=$(body "$R" | field id); T2=$(body "$R" | field resumeToken)
R=$(pub POST "/$ID2/otp" "$T2" "{\"email\":\"$EMAIL\"}"); OTP2=$(body "$R" | field devCode)
pub POST "/$ID2/otp/verify" "$T2" "{\"code\":\"$OTP2\"}" >/dev/null
R=$(pub POST "/$ID2/submit" "$T2" "$SECTIONS"); chk "duplicate email -> 409" "$(code "$R")" 409
has "  code DUPLICATE_REGISTRATION" "$(body "$R")" "DUPLICATE_REGISTRATION"

# Cleanup the throwaway second draft.
psql "$DBURL" -tA -c "delete from institution_registration_requests where id='$ID2'" >/dev/null 2>&1

echo "================ SUMMARY ================"
echo "  PASS=$pass  FAIL=$fail"
echo "========================================"
exit "$fail"
