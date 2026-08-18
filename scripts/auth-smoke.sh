#!/usr/bin/env bash
# Phase 10a authentication smoke. Proves the production substrate AND the preserved guarantees:
#   1. unauthenticated request -> 401
#   2. MFA enforced (aal1 token for an enrolled employee -> MFA_REQUIRED)
#   3. a valid session resolves the SAME permission set as the dev-header path
#   4. a sensitive action still demands recent auth (and re-auth restores it)
#   5. session revocation on logout
#   6. account lockout after repeated failed MFA logins
#
# Non-destructive: sensitive calls use bad/empty bodies so the recent-auth gate is exercised
# without performing the real mutation; owner lockout is reset at the end.
#
# Prereqs: API running on :3007, DB seeded, and in .env:
#   SUPABASE_JWT_SECRET set, AUTH_DEV_HEADER=true, AUTH_DEV_LOGIN=true (dev only).
set -u
API="${API:-http://localhost:3007/v1}"
DB="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
SECRET="$(grep -E '^SUPABASE_JWT_SECRET=' .env | head -1 | cut -d= -f2-)"
OWNER_SUB='00000000-0000-0000-0000-000000000001'   # seeded owner.auth_user_id
PSQL=(psql "$DB" -t -A)
INST="$("${PSQL[@]}" -c "select id from institutions order by created_at limit 1")"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT

mint() { # <sub> <aal>
  node -e '
    const {createHmac}=require("crypto");
    const [sub,aal,secret]=process.argv.slice(1);
    const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const iat=Math.floor(Date.now()/1e3);
    const h=b({alg:"HS256",typ:"JWT"});
    const p=b({sub,email:"owner@edrion.dev",aal,session_id:"idp-"+iat,iat,exp:iat+3600});
    process.stdout.write(`${h}.${p}.`+createHmac("sha256",secret).update(`${h}.${p}`).digest("base64url"));
  ' "$1" "$2" "$SECRET"
}
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
jc(){ curl -s -w '\n%{http_code}' "$@"; }

echo "== 1. Unauthenticated =="
chk "GET /auth/me no creds -> 401"      "$(code "$API/auth/me")" 401
chk "GET /institutions no creds -> 401" "$(code "$API/institutions")" 401

echo "== 2. MFA enforcement =="
AAL1="$(mint "$OWNER_SUB" aal1)"
R="$(jc -X POST "$API/auth/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$AAL1\"}")"
chk "login aal1 -> 401" "$(echo "$R"|tail -1)" 401
chk "login aal1 -> MFA_REQUIRED" "$(echo "$R"|head -1|grep -o MFA_REQUIRED)" MFA_REQUIRED

echo "== 3. Valid aal2 login + identical permission set =="
AAL2="$(mint "$OWNER_SUB" aal2)"
chk "login aal2 -> 200" "$(code -c "$JAR" -X POST "$API/auth/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$AAL2\"}")" 200
P=$(curl -s -b "$JAR" "$API/auth/me" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).permissions.sort().join(",")))')
H=$(curl -s -H "x-employee-email: owner@edrion.dev" "$API/auth/me" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).permissions.sort().join(",")))')
chk "cookie perms == dev-header perms" "$([ "$P" = "$H" ] && echo same || echo diff)" same

echo "== 4. Recent-auth on a sensitive action =="
chk "suspend fresh+badbody -> 400 (recent-auth OK)" "$(code -b "$JAR" -X POST "$API/institutions/$INST/suspend" -H 'content-type: application/json' -d '{}')" 400
SID="$("${PSQL[@]}" -c "select id from auth_sessions where revoked_at is null order by created_at desc limit 1")"
"${PSQL[@]}" -c "update auth_sessions set last_auth_at=now()-interval '2 hours' where id='$SID'" >/dev/null
R="$(jc -b "$JAR" -X POST "$API/institutions/$INST/suspend" -H 'content-type: application/json' -d '{"reason":"smoke reason","version":0}')"
chk "suspend stale -> RECENT_AUTH_REQUIRED" "$(echo "$R"|head -1|grep -o RECENT_AUTH_REQUIRED)" RECENT_AUTH_REQUIRED
chk "reauth -> 200" "$(code -b "$JAR" -X POST "$API/auth/reauth" -H 'content-type: application/json' -d "{\"accessToken\":\"$AAL2\"}")" 200
chk "suspend after reauth -> 400 (recent-auth OK)" "$(code -b "$JAR" -X POST "$API/institutions/$INST/suspend" -H 'content-type: application/json' -d '{}')" 400

echo "== 5. Revocation =="
chk "logout -> 200" "$(code -b "$JAR" -X POST "$API/auth/logout")" 200
chk "revoked cookie -> SESSION_REVOKED" "$(jc -b "$JAR" "$API/auth/me"|head -1|grep -o SESSION_REVOKED)" SESSION_REVOKED

echo "== 6. Account lockout =="
for n in 1 2 3 4 5; do code -X POST "$API/auth/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$AAL1\"}" >/dev/null; done
chk "aal2 login after lockout -> ACCOUNT_LOCKED" "$(jc -X POST "$API/auth/login" -H 'content-type: application/json' -d "{\"accessToken\":\"$AAL2\"}"|head -1|grep -o ACCOUNT_LOCKED)" ACCOUNT_LOCKED
"${PSQL[@]}" -c "update platform_employees set failed_login_attempts=0, locked_until=null, last_auth_at=now() where email='owner@edrion.dev'" >/dev/null

echo; echo "RESULT: $pass passed, $fail failed"; exit $fail
