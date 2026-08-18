#!/usr/bin/env bash
# Phase 12 (Institution Portal — hardening & ship-readiness) live smoke.
#
# Proves, against the running API + seeded portal users + the local DB, that the Phase 12
# hardening is real end-to-end:
#   1. real cookie auth — POST /portal/auth/login mints an HTTP-only portal session cookie; the
#      cookie alone (NO dev header) authenticates /portal/me + /portal/auth/session.
#   2. real Supabase-token path — a verified aal1 access token logs a non-MFA user in (the
#      production path, not just dev-login).
#   3. MFA enforcement — an MFA-enrolled user presenting an aal1 token -> 401 MFA_REQUIRED.
#   4. account lockout — repeated MFA-failed logins lock the account; even a valid aal2 token then
#      -> 401 ACCOUNT_LOCKED until the lockout window passes.
#   5. RLS GUC binding — /portal/auth/session reports tenantBound:true, i.e. app.institution_id is
#      set inside the request transaction so the zzz_rls.sql tenant policies bind on the portal path.
#   6. recent-auth gate — a sensitive action (institution_settings.manage) succeeds right after
#      login, is refused 403 RECENT_AUTH_REQUIRED once the session's last_auth_at is stale, and
#      succeeds again after POST /portal/auth/reauth. A non-sensitive read stays allowed while stale.
#   7. logout — POST /portal/auth/logout revokes the session; the same cookie then -> 401 SESSION_REVOKED.
#   8. per-principal rate limit — a burst beyond RATE_LIMIT_MAX for one principal -> 429 RATE_LIMITED
#      with a Retry-After header (portal controllers are @SkipRateLimit()'d for the platform limiter).
#   9. real invitation email — users.invite persists a portal_invitations row + a signed accept link
#      and dispatches via the EmailService seam (audited invitationEmailSent).
#  10. real dashboard counts — the institution dashboard returns real, numeric module counts
#      (students/staff/fees/...), no longer pending placeholders.
#  11. no-auth — no cookie + no dev header -> 401 UNAUTHENTICATED.
#  12. audit — portal-auth login/reauth/logout audit rows + MFA/lockout security events are written.
#
# Self-cleaning + idempotent: seeded users + invitations + probe settings are removed at the end.
#
# Prereqs: API on :3007; DB seeded + migration 0022 applied; in .env PORTAL_AUTH_DEV_HEADER=true,
# PORTAL_AUTH_DEV_LOGIN=true, and SUPABASE_JWT_SECRET set (used to mint test access tokens).
set -u
set +B
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API:-http://localhost:3007/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
PA="$API/portal/auth"
OWNER='owner@greenwood.edu'
TOKENUSER='p12.token@greenwood.edu'    # non-MFA, has authUserId -> proves the real Supabase-token path
MFAUSER='p12.mfa@greenwood.edu'        # MFA-enrolled -> proves MFA enforcement + lockout
RLUSER='p12.rl@greenwood.edu'          # dedicated principal for the rate-limit burst
INVITEE='p12.invitee@greenwood.edu'    # created via the invite path
AUTH1='11111111-1111-1111-1111-111111111111'   # token user's Supabase sub
AUTH2='22222222-2222-2222-2222-222222222222'   # mfa user's Supabase sub
RUN="p12-$(date +%s)"
INST='institution'

if [ -z "${SUPABASE_JWT_SECRET:-}" ]; then
  SUPABASE_JWT_SECRET="$(grep -E '^SUPABASE_JWT_SECRET=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2-)"
fi
export SUPABASE_JWT_SECRET

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
chkne(){ if [ "$2" != "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected!=$3 got=$2"; fail=$((fail+1)); fi; }
chkge(){ if [ "$2" -ge "$3" ] 2>/dev/null; then echo "  PASS  $1 ($2>=$3)"; pass=$((pass+1)); else echo "  FAIL  $1 expected>=$3 got=$2"; fail=$((fail+1)); fi; }
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
mint(){ # mint a Supabase HS256 access token: mint <sub> <aal>
  node -e '
    const c=require("crypto"); const sec=process.env.SUPABASE_JWT_SECRET;
    const sub=process.argv[1], aal=process.argv[2];
    const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const now=Math.floor(Date.now()/1000);
    const h=b({alg:"HS256",typ:"JWT"});
    const p=b({sub,aal,exp:now+3600,iat:now,session_id:"smoke-"+sub});
    const sig=c.createHmac("sha256",sec).update(h+"."+p).digest("base64url");
    process.stdout.write(h+"."+p+"."+sig);
  ' "$1" "$2"; }

INST_ID="$(psql "$DBURL" -tA -c "select institution_id from institution_users where email='$OWNER' limit 1" 2>/dev/null)"

echo "== 0. Seed test users =="
psql "$DBURL" -v ON_ERROR_STOP=1 -q <<SQL 2>/dev/null
delete from institution_users where email in ('$TOKENUSER','$MFAUSER','$RLUSER','$INVITEE');
insert into institution_users (institution_id, email, full_name, status, auth_user_id, mfa_enrolled, direct_grants)
values ('$INST_ID','$TOKENUSER','Toby Token','active','$AUTH1', false, '["portal.dashboard.view"]'::jsonb);
insert into institution_users (institution_id, email, full_name, status, auth_user_id, mfa_enrolled)
values ('$INST_ID','$MFAUSER','Mia MFA','active','$AUTH2', true);
insert into institution_users (institution_id, email, full_name, status, direct_grants)
values ('$INST_ID','$RLUSER','Ray Limit','active','["portal.dashboard.view"]'::jsonb);
SQL
echo "  seeded under institution $INST_ID"

echo "== 1. No auth (no cookie, no dev header) -> 401 =="
R="$(curl -s -w '\n%{http_code}' "$API/portal/me")"
chk "GET /portal/me unauthenticated" "$(code "$R")" "401"
chk "  code=UNAUTHENTICATED" "$(body "$R" | field code)" "UNAUTHENTICATED"

echo "== 2. Cookie login (dev-login) + session introspection =="
JAR="$(mktemp)"
R="$(curl -s -c "$JAR" -w '\n%{http_code}' -X POST "$PA/login" -H 'content-type: application/json' -d "{\"email\":\"$OWNER\"}")"
chk "POST /portal/auth/login (owner)" "$(code "$R")" "200"
chk "  authenticated=true" "$(body "$R" | field authenticated)" "true"
chk "  portal cookie set" "$(grep -c edrion_portal_session "$JAR")" "1"
R="$(curl -s -b "$JAR" -w '\n%{http_code}' "$API/portal/me")"
chk "GET /portal/me via cookie (no dev header)" "$(code "$R")" "200"
S="$(curl -s -b "$JAR" "$PA/session")"
chk "session hasServerSession=true" "$(printf '%s' "$S" | field hasServerSession)" "true"
chk "session recentAuth=true (fresh)" "$(printf '%s' "$S" | field recentAuth)" "true"
chk "session tenantBound=true (RLS GUC bound on portal path)" "$(printf '%s' "$S" | field tenantBound)" "true"

echo "== 3. Real Supabase-token path (non-MFA, aal1) =="
TOK1="$(mint "$AUTH1" aal1)"
JAR2="$(mktemp)"
R="$(curl -s -c "$JAR2" -w '\n%{http_code}' -X POST "$PA/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$TOK1\"}")"
chk "POST /portal/auth/login (verified aal1 token)" "$(code "$R")" "200"
chk "  token-path cookie set" "$(grep -c edrion_portal_session "$JAR2")" "1"
chk "  session via token cookie hasServerSession" "$(curl -s -b "$JAR2" "$PA/session" | field hasServerSession)" "true"
rm -f "$JAR2"

echo "== 4. MFA enforcement + account lockout (aal1 token for an MFA user) =="
TOKMFA1="$(mint "$AUTH2" aal1)"
R="$(curl -s -w '\n%{http_code}' -X POST "$PA/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$TOKMFA1\"}")"
chk "MFA user + aal1 token -> 401" "$(code "$R")" "401"
chk "  code=MFA_REQUIRED" "$(body "$R" | field code)" "MFA_REQUIRED"
# Drive failed attempts to the lockout threshold (AUTH_MAX_FAILED_LOGINS default 5; first try above = 1).
for n in 2 3 4 5 6; do
  LR="$(curl -s -w '\n%{http_code}' -X POST "$PA/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$TOKMFA1\"}")"
  LC="$(body "$LR" | field code)"
done
chk "MFA user now locked (last attempt code)" "$LC" "ACCOUNT_LOCKED"
TOKMFA2="$(mint "$AUTH2" aal2)"
R="$(curl -s -w '\n%{http_code}' -X POST "$PA/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$TOKMFA2\"}")"
chk "even a valid aal2 token -> 401 while locked" "$(code "$R")" "401"
chk "  code=ACCOUNT_LOCKED" "$(body "$R" | field code)" "ACCOUNT_LOCKED"

echo "== 5. Recent-auth gate on a sensitive action =="
SET="$API/portal/settings"
SBODY="{\"category\":\"general\",\"key\":\"${RUN}_k\",\"label\":\"P12\",\"value\":\"x\",\"valueType\":\"string\"}"
R="$(curl -s -b "$JAR" -w '\n%{http_code}' -X POST "$SET" -H 'content-type: application/json' -d "$SBODY")"
chk "sensitive create right after login -> 201" "$(code "$R")" "201"
SID="$(body "$R" | field id)"
# Age the session so recent-auth lapses.
psql "$DBURL" -q -c "update portal_sessions set last_auth_at = now() - interval '2 hours' where institution_user_id=(select id from institution_users where email='$OWNER') and revoked_at is null;" >/dev/null 2>&1
R="$(curl -s -b "$JAR" -w '\n%{http_code}' -X POST "$SET" -H 'content-type: application/json' -d "{\"category\":\"general\",\"key\":\"${RUN}_k2\",\"label\":\"P12\",\"value\":\"y\",\"valueType\":\"string\"}")"
chk "sensitive create while stale -> 403" "$(code "$R")" "403"
chk "  code=RECENT_AUTH_REQUIRED" "$(body "$R" | field code)" "RECENT_AUTH_REQUIRED"
chk "non-sensitive read while stale still allowed" "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$API/portal/me")" "200"
R="$(curl -s -b "$JAR" -w '\n%{http_code}' -X POST "$PA/reauth" -H 'content-type: application/json' -d '{"confirm":true}')"
chk "POST /portal/auth/reauth (confirm) -> 200" "$(code "$R")" "200"
R="$(curl -s -b "$JAR" -w '\n%{http_code}' -X POST "$SET" -H 'content-type: application/json' -d "{\"category\":\"general\",\"key\":\"${RUN}_k3\",\"label\":\"P12\",\"value\":\"z\",\"valueType\":\"string\"}")"
chk "sensitive create after reauth -> 201" "$(code "$R")" "201"

echo "== 6. Logout revokes the session =="
chk "POST /portal/auth/logout -> 200" "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$PA/logout")" "200"
R="$(curl -s -b "$JAR" -w '\n%{http_code}' "$API/portal/me")"
chk "revoked cookie -> 401" "$(code "$R")" "401"
chk "  code=SESSION_REVOKED" "$(body "$R" | field code)" "SESSION_REVOKED"
rm -f "$JAR"

echo "== 7. Per-principal rate limit (burst beyond RATE_LIMIT_MAX) =="
MAX="$(grep -E '^RATE_LIMIT_MAX=' "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2)"; MAX="${MAX:-300}"
N=$((MAX + 25))
echo "  firing $N requests for one principal ($RLUSER) ..."
seq 1 "$N" | xargs -P 24 -I {} curl -s -o /dev/null -w '%{http_code}\n' "$API/portal/me" \
  -H "x-institution-user-email: $RLUSER" > /tmp/p12_rl.$$ 2>/dev/null
N429="$(grep -c '^429' /tmp/p12_rl.$$ 2>/dev/null || echo 0)"
chkge "at least one request -> 429 RATE_LIMITED" "$N429" "1"
RA="$(curl -s -D - -o /dev/null "$API/portal/me" -H "x-institution-user-email: $RLUSER" | tr -d '\r' | grep -i '^retry-after:' | wc -l | tr -d ' ')"
chkge "429 carried a Retry-After header" "$RA" "1"
rm -f /tmp/p12_rl.$$

echo "== 8. Real invitation email (users.invite) =="
JAR3="$(mktemp)"
curl -s -c "$JAR3" -o /dev/null -X POST "$PA/login" -H 'content-type: application/json' -d "{\"email\":\"$OWNER\"}"
R="$(curl -s -b "$JAR3" -w '\n%{http_code}' -X POST "$API/portal/users" -H 'content-type: application/json' \
   -d "{\"email\":\"$INVITEE\",\"fullName\":\"Ivy Invitee\",\"roleKeys\":[\"teacher\"],\"campusIds\":[],\"requireMfa\":false}")"
chk "POST /portal/users invite -> 201" "$(code "$R")" "201"
chk "  invitationSent=true" "$(body "$R" | field invitationSent)" "true"
INVCOUNT="$(psql "$DBURL" -tA -c "select count(*) from portal_invitations pi join institution_users u on u.id=pi.institution_user_id where u.email='$INVITEE' and pi.accepted_at is null and pi.expires_at > now();" 2>/dev/null | tr -d ' ')"
chk "portal_invitations row persisted (unaccepted, unexpired)" "$INVCOUNT" "1"
INVAUDIT="$(psql "$DBURL" -tA -c "select count(*) from audit_events where module='portal-users' and action='user.invite' and (new_state->>'invitationEmailSent')='true';" 2>/dev/null | tr -d ' ')"
chkge "invite audited with invitationEmailSent" "$INVAUDIT" "1"
rm -f "$JAR3"

echo "== 9. Real dashboard module counts (no longer pending) =="
D="$(curl -s "$API/portal/dashboard" -H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST")"
STUD_PENDING="$(printf '%s' "$D" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const x=(o.stats||[]).find(t=>t.key==="students");console.log(x?String(!!x.pending):"missing")})')"
STUD_NUM="$(printf '%s' "$D" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const x=(o.stats||[]).find(t=>t.key==="students");console.log(x&&typeof x.value==="number"?"num":"no")})')"
FEES_NUM="$(printf '%s' "$D" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const x=(o.stats||[]).find(t=>t.key==="fees");console.log(x&&typeof x.value==="number"?"num":"no")})')"
chk "dashboard students stat NOT pending" "$STUD_PENDING" "false"
chk "dashboard students value is numeric" "$STUD_NUM" "num"
chk "dashboard fees value is numeric" "$FEES_NUM" "num"

echo "== 10. Audit + security events written =="
LOGIN_AUDIT="$(psql "$DBURL" -tA -c "select count(*) from audit_events where module='portal-auth' and action='user.login';" 2>/dev/null | tr -d ' ')"
chkge "portal-auth login audit rows" "$LOGIN_AUDIT" "1"
REAUTH_AUDIT="$(psql "$DBURL" -tA -c "select count(*) from audit_events where module='portal-auth' and action='user.reauth';" 2>/dev/null | tr -d ' ')"
chkge "portal-auth reauth audit rows" "$REAUTH_AUDIT" "1"
LOGOUT_AUDIT="$(psql "$DBURL" -tA -c "select count(*) from audit_events where module='portal-auth' and action='user.logout';" 2>/dev/null | tr -d ' ')"
chkge "portal-auth logout audit rows" "$LOGOUT_AUDIT" "1"
SEC="$(psql "$DBURL" -tA -c "select count(*) from security_events where event_type in ('portal_login_mfa_required','portal_account_locked');" 2>/dev/null | tr -d ' ')"
chkge "MFA/lockout security events" "$SEC" "1"

echo "== 11. Cleanup =="
curl -s "$API/portal/settings?category=general" -H "x-institution-user-email: $OWNER" >/dev/null 2>&1 || true
psql "$DBURL" -q <<SQL 2>/dev/null
delete from institution_settings where key like '${RUN}_%';
delete from institution_users where email in ('$TOKENUSER','$MFAUSER','$RLUSER','$INVITEE');
SQL
echo "  removed seeded users + probe settings"

echo ""
echo "==================================================="
echo "  Phase 12 smoke: PASS=$pass  FAIL=$fail"
echo "==================================================="
[ "$fail" -eq 0 ]
