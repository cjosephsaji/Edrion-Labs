#!/usr/bin/env bash
# Parent Portal — live end-to-end smoke against the running API (:3001) + Postgres.
#
# Proves the full guardian journey and its guarantees:
#   dashboard → results publish-gate → acknowledge notice → respond consent → book + cancel PTM
#   (capacity-safe) → submit absence note → staff acknowledges → update health profile (versioned)
#   → add pickup authorization (pending) → staff verifies (active) → request early leave → staff
#   approves → gate exit event → staff records a medical incident → immediate notification →
#   pay an invoice via the mock provider → signed webhook settles it (bad signature rejected) →
#   receipt appears → open a message thread → staff replies → notification → request a bonafide →
#   staff fulfils → document appears → trigger a preview digest → delivery recorded (rate-limited) →
#   emergency broadcast (append-only) → counseling never leaks → guardian cannot hit staff routes →
#   audit rows written for the mutations.
#
# Prereqs: API booted with PORTAL_AUTH_DEV_HEADER=true; DB seeded (`seed`, `seed:portal`,
# `seed:parent`). No browser — API only.
set -uo pipefail

API="${API:-http://localhost:3001/v1}"
DBURL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/edrion}"
WEBHOOK_SECRET="${PARENT_PAYMENT_WEBHOOK_SECRET:-dev-parent-webhook-secret}"
G='guardian.a@greenwood.edu'
CT='Content-Type: application/json'

# Staff owner (wildcard) — discovered from the DB so the script is seed-agnostic.
STAFF="$(psql "$DBURL" -tAc "select u.email from institution_users u join institution_user_roles r on r.institution_user_id=u.id where r.role_key='institution_owner' limit 1" 2>/dev/null | tr -d '[:space:]')"

green=$'\e[32m'; red=$'\e[31m'; dim=$'\e[2m'; rst=$'\e[0m'
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ${green}✓${rst} $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ${red}✗ $1${rst}  ${dim}(got: ${2:-})${rst}"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2 != $3"; fi; }
gte() { if [ "$2" -ge "$3" ] 2>/dev/null; then ok "$1"; else bad "$1" "$2 < $3"; fi; }

pget() { curl -s -H "x-institution-user-email: $G" "$API/parent$1"; }
ppost() { curl -s -X POST -H "x-institution-user-email: $G" -H "$CT" -d "${2:-}" "$API/parent$1"; }
scode() { curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-institution-user-email: $1" -H "$CT" -d "${3:-}" "$API/parent$2"; }
spost() { curl -s -X POST -H "x-institution-user-email: $STAFF" -H "$CT" -d "${2:-}" "$API/parent-staff$1"; }

echo "Parent Portal smoke → $API (staff: ${STAFF:-<none>})"
[ -z "$STAFF" ] && { echo "${red}No institution_owner found — run seeds first.${rst}"; exit 1; }

# Make the smoke repeatable: clear today's message threads (5/day cap) and reset the demo invoices to
# unpaid. Both tables are mutable (not append-only). Digest preview stays 1/hour (assertion tolerates it).
psql "$DBURL" -tAc "delete from parent_message_threads where opened_by_guardian_id in (select id from institution_users where email='$G') and created_at > now() - interval '1 day'" >/dev/null 2>&1
psql "$DBURL" -tAc "update fee_invoices set amount_paid=0, status='pending' where invoice_no in ('PP-TUITION-0001','PP-FINE-0001')" >/dev/null 2>&1

# ── Identity + dashboard ───────────────────────────────────────────────────────
ME="$(pget /me)"
W1="$(echo "$ME" | jq -r '.children[0].studentId')"
W2="$(echo "$ME" | jq -r '.children[1].studentId // .children[0].studentId')"
gte "me returns wards" "$(echo "$ME" | jq '.children | length')" 1
check "dashboard responds" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-institution-user-email: $G" "$API/parent/dashboard?studentId=$W1")" 200
check "results are publish-gated (no unpublished leak)" "$(pget /students/$W1/results | jq '.terms | length')" 0

# ── Notices + consents ─────────────────────────────────────────────────────────
NID="$(pget /notices | jq -r '.items[0].id')"
check "acknowledge notice" "$(scode "$G" "/notices/$NID/acknowledge")" 201
CID="$(pget /consents | jq -r '.items[0].id')"
check "respond to consent" "$(ppost "/consents/$CID/respond" "{\"studentId\":\"$W1\",\"response\":\"yes\"}" | jq -r '.response')" yes

# ── PTM (capacity-safe) ────────────────────────────────────────────────────────
EID="$(pget /ptm/events | jq -r '.items[0].id')"
SID="$(pget /ptm/events/$EID/slots | jq -r '.items[0].id')"
BID="$(ppost "/ptm/slots/$SID/book" "{\"studentId\":\"$W1\"}" | jq -r '.id')"
[ "$BID" != null ] && ok "book PTM slot" || bad "book PTM slot" "$BID"
check "second booking on a full slot → 409" "$(scode "$G" "/ptm/slots/$SID/book" "{\"studentId\":\"$W2\"}")" 409
check "cancel PTM booking" "$(ppost "/ptm/bookings/$BID/cancel" | jq -r '.ok')" true

# ── Absence note → staff review ────────────────────────────────────────────────
AID="$(ppost /absence-notes "{\"studentId\":\"$W1\",\"dateFrom\":\"2026-06-30\",\"dateTo\":\"2026-06-30\",\"reasonCategory\":\"illness\"}" | jq -r '.id')"
check "staff acknowledges absence note" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-institution-user-email: $STAFF" -H "$CT" -d '{"decision":"acknowledged"}' "$API/parent-staff/absence-notes/$AID/review")" 201

# ── Health profile versioning ──────────────────────────────────────────────────
R0="$(pget /students/$W1/health/profile | jq -r '.revision // 0')"
R1="$(ppost "/students/$W1/health/profile" '{"allergies":["Peanuts"],"chronicConditions":[],"currentMedications":[],"vaccinations":[],"emergencyContacts":[]}' | jq -r '.revision')"
gte "health profile creates a new revision" "$R1" "$((R0+1))"

# ── Pickup + gate + early leave ────────────────────────────────────────────────
PK="$(ppost "/students/$W1/pickup-authorizations" '{"personName":"Test Uncle","relationship":"relative"}' | jq -r '.id')"
check "staff verifies pickup" "$(pget /students/$W1/pickup-authorizations >/dev/null; curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-institution-user-email: $STAFF" "$API/parent-staff/pickup-authorizations/$PK/verify")" 201
G0="$(pget /students/$W1/gate-events | jq '.items | length')"
EL="$(ppost "/students/$W1/early-leave-requests" "{\"studentId\":\"$W1\",\"leaveDate\":\"2026-07-05\"}" | jq -r '.id')"
spost "/early-leave-requests/$EL/decide" '{"decision":"approve"}' >/dev/null
gte "approving early leave records a gate event" "$(pget /students/$W1/gate-events | jq '.items | length')" "$((G0+1))"

# ── Medical incident → immediate notification ──────────────────────────────────
MED="$(spost /medical-incidents "{\"studentId\":\"$W1\",\"title\":\"Playground fall\",\"severity\":\"low\",\"actionTaken\":\"First aid\"}")"
gte "staff medical incident notifies guardians" "$(echo "$MED" | jq -r '.notified // 0')" 1

# ── Payment: intent → signed webhook → receipt ─────────────────────────────────
INV="$(pget "/fees?studentId=$W1" | jq -r '[.invoices[]|select(.balanceMinor>0)][0].id')"
REF="$(ppost "/fees/invoices/$INV/payment-intents" '{"provider":"mock"}' | jq -r '.providerRef')"
BODY="$(python3 -c "import json,sys;print(json.dumps({'provider':'mock','providerRef':sys.argv[1],'event':'payment.succeeded','status':'succeeded'}))" "$REF")"
SIG="$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.*= //')"
check "bad webhook signature → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$CT" -H 'x-webhook-signature: deadbeef' -d "$BODY" "$API/parent/payments/webhook")" 403
check "signed webhook settles the invoice" "$(curl -s -X POST -H "$CT" -H "x-webhook-signature: $SIG" -d "$BODY" "$API/parent/payments/webhook" | jq -r '.invoiceStatus')" paid
gte "receipt recorded" "$(pget "/fees/receipts?studentId=$W1" | jq '.receipts | length')" 1

# ── Messaging → staff reply ────────────────────────────────────────────────────
TID="$(ppost /messages/threads "{\"studentId\":\"$W1\",\"category\":\"general\",\"subject\":\"Smoke\",\"body\":\"Hi\"}" | jq -r '.id')"
spost "/messages/threads/$TID/reply" '{"body":"Thanks"}' >/dev/null
check "staff reply lands in the thread" "$(pget /messages/threads/$TID | jq '.messages | length')" 2

# ── Document request → fulfil → appears ────────────────────────────────────────
DR="$(ppost /document-requests "{\"studentId\":\"$W1\",\"type\":\"bonafide\"}" | jq -r '.id')"
spost "/document-requests/$DR/fulfil" '{"title":"Bonafide Smoke","fileRef":"docs/smoke.pdf"}' >/dev/null
gte "fulfilled document appears in the vault" "$(pget /students/$W1/documents | jq '[.items[]|select(.title=="Bonafide Smoke")]|length')" 1

# ── Digest preview (rate-limited) ──────────────────────────────────────────────
# The preview is rate-limited to 1/hour, so on a re-run within the hour it returns 429 — both are fine.
DP="$(curl -s -w $'\n%{http_code}' -X POST -H "x-institution-user-email: $G" "$API/parent/digest/preview")"
DPSENT="$(echo "$DP" | sed '$d' | jq -r '.sent // empty' 2>/dev/null)"; DPCODE="$(echo "$DP" | tail -1)"
if [ "$DPSENT" = true ] || [ "$DPCODE" = 429 ]; then ok "digest preview sends (or already sent this hour)"; else bad "digest preview sends" "$DPCODE"; fi
check "preview within the hour is rate-limited → 429" "$(scode "$G" "/digest/preview")" 429

# ── Emergency broadcast (append-only) + confirmation ───────────────────────────
check "emergency without the phrase → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-institution-user-email: $STAFF" -H "$CT" -d '{"title":"x","body":"y","confirmPhrase":"no"}' "$API/parent-staff/emergency-broadcasts")" 400
gte "emergency broadcast reaches guardians" "$(spost /emergency-broadcasts '{"title":"Drill","body":"Test","severity":"urgent","confirmPhrase":"SEND EMERGENCY"}' | jq -r '.recipients')" 1
# NB: capture first — psql exits non-zero on the (expected) append-only error, which would poison the
# pipeline under `set -o pipefail` if we piped straight into grep.
AO_OUT="$(psql "$DBURL" -tAc "update parent_emergency_broadcasts set title='x' where id=(select id from parent_emergency_broadcasts order by created_at desc limit 1)" 2>&1)"
if echo "$AO_OUT" | grep -q 'append-only'; then ok "emergency broadcasts are append-only"; else bad "emergency broadcasts are append-only" "$AO_OUT"; fi

# ── Confidentiality + permission boundaries ────────────────────────────────────
check "counseling disclosure with none → 404 (never leaks)" "$(curl -s -o /dev/null -w '%{http_code}' -H "x-institution-user-email: $G" "$API/parent/students/$W1/counseling-disclosure")" 404
check "guardian cannot hit a staff route → 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "x-institution-user-email: $G" -H "$CT" -d '{"decision":"approve"}' "$API/parent-staff/absence-notes/$AID/review")" 403

# ── Audit ──────────────────────────────────────────────────────────────────────
gte "audit rows written for parent mutations" "$(psql "$DBURL" -tAc "select count(*) from audit_events where action like 'parent%'" | tr -d '[:space:]')" 5

echo
echo "───────────────────────────────"
echo "  ${green}$PASS passed${rst}, $([ "$FAIL" -gt 0 ] && echo "${red}$FAIL failed${rst}" || echo "0 failed")"
[ "$FAIL" -eq 0 ] || exit 1
