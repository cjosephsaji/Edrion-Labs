#!/usr/bin/env bash
# Phase 13 (Institution Portal — 7 functional staff roles) live smoke.
#
# Proves, against the running API + seeded Phase-13 portal users, that:
#   1. per-role permission gating — each staff role can reach ONLY its own module endpoints; the
#      classic finance/payroll/gradebook/medical keys it must NOT have all -> 403.
#   2. each new module's create writes an audit_events row (module = portal-<area>).
#   3. counseling read-access auditing — a single-note GET writes a counseling.note.view audit row.
#   4. campus-admin assignable-role governance — a Campus Admin may assign a functional staff role
#      but NOT finance_manager (403 ROLE_NOT_ASSIGNABLE) and may NOT set direct overrides
#      (403 OVERRIDES_NOT_PERMITTED). Institution Owner assigns anything.
#   5. IT security actions — reset-security / revoke-sessions succeed for IT Staff.
#
# Self-cleaning: created rows + the campus-admin-invited target are removed at the end. The seeded
# functional demo users (nurse@/counselor@/…) are left in place.
#
# Prereqs: API on :3001, DB seeded (pnpm db:seed && seed:portal) + migration 0023 applied, and in
# .env PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3001/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
P="$API/portal"
US="$P/users"
AU="$P/audit"
INST='institution'
FAKE='00000000-0000-0000-0000-000000000000'

OWNER='owner@greenwood.edu'
CADMIN='campus.north@greenwood.edu'      # campus_admin, confined to ONE campus (seeded)
NURSE='nurse@greenwood.edu'
COUNSELOR='counselor@greenwood.edu'
LAB='lab@greenwood.edu'
RECEPTION='reception@greenwood.edu'
IT='it@greenwood.edu'
MAINT='maintenance@greenwood.edu'
SECURITY='security@greenwood.edu'
TARGET="p13.target.$(date +%s)@greenwood.edu"
RUN="p13-$(date +%s)"

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
req(){ local m="$1" p="$2" e="$3" sc="$4" b="${5:-}"
  if [ -n "$b" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc" -H 'content-type: application/json' -d "$b"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$p" -H "x-institution-user-email: $e" -H "x-institution-scope: $sc"
  fi
}
code(){ printf '%s' "$1" | tail -1; }
body(){ printf '%s' "$1" | sed '$d'; }
gc(){ code "$(req GET "$1" "$2" "$INST")"; }            # GET code
uver(){ req GET "$US?pageSize=200" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const em=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.email===em);console.log(r?r.version:"")}catch{console.log("")}})' "$1"; }

INST_ID="$(psql "$DBURL" -tA -c "select institution_id from institution_users where email='$OWNER' limit 1" 2>/dev/null)"
CAMPUS_ID="$(psql "$DBURL" -tA -c "select id from campuses where institution_id='$INST_ID' order by code limit 1" 2>/dev/null)"

echo "== 1. Per-role gating: each role reaches its module, NOT others =="
chk "nurse health/records -> 200"      "$(gc "$P/health/records" "$NURSE")" 200
chk "nurse fees/structures -> 403"     "$(gc "$P/fees/structures" "$NURSE")" 403
chk "nurse labs/assets -> 403"         "$(gc "$P/labs/assets" "$NURSE")" 403
chk "nurse it/devices -> 403"          "$(gc "$P/it/devices" "$NURSE")" 403
chk "nurse security/gate-passes -> 403" "$(gc "$P/security/gate-passes" "$NURSE")" 403
chk "counselor counseling/records -> 200" "$(gc "$P/counseling/records" "$COUNSELOR")" 200
chk "counselor health/records -> 403"  "$(gc "$P/health/records" "$COUNSELOR")" 403
chk "lab labs/assets -> 200"           "$(gc "$P/labs/assets" "$LAB")" 200
chk "lab counseling/records -> 403"    "$(gc "$P/counseling/records" "$LAB")" 403
chk "reception front-desk/visitors -> 200" "$(gc "$P/front-desk/visitors" "$RECEPTION")" 200
chk "reception health/records -> 403"  "$(gc "$P/health/records" "$RECEPTION")" 403
chk "it it/devices -> 200"             "$(gc "$P/it/devices" "$IT")" 200
chk "it fees/structures -> 403"        "$(gc "$P/fees/structures" "$IT")" 403
chk "maintenance facilities -> 200"    "$(gc "$P/facilities" "$MAINT")" 200
chk "maintenance health/records -> 403" "$(gc "$P/health/records" "$MAINT")" 403
chk "security gate-passes -> 200"      "$(gc "$P/security/gate-passes" "$SECURITY")" 200
chk "security visitors (view) -> 200"  "$(gc "$P/front-desk/visitors" "$SECURITY")" 200
chk "security create visitor -> 403"   "$(code "$(req POST "$P/front-desk/visitors" "$SECURITY" "$INST" "{\"fullName\":\"X $RUN\"}")")" 403

echo "== 2. Each module create -> 200 + audit row =="
HR="$(req POST "$P/health/records" "$NURSE" "$INST" "{\"title\":\"HR $RUN\",\"recordType\":\"note\"}")"
chk "nurse create health record -> id" "$([ -n "$(body "$HR" | field id)" ] && echo ok)" ok
LA="$(req POST "$P/labs/assets" "$LAB" "$INST" "{\"name\":\"Asset $RUN\",\"kind\":\"equipment\"}")"
chk "lab create asset -> id" "$([ -n "$(body "$LA" | field id)" ] && echo ok)" ok
VS="$(req POST "$P/front-desk/visitors" "$RECEPTION" "$INST" "{\"fullName\":\"Vis $RUN\"}")"
chk "reception create visitor -> id" "$([ -n "$(body "$VS" | field id)" ] && echo ok)" ok
WO="$(req POST "$P/facilities/work-orders" "$MAINT" "$INST" "{\"title\":\"WO $RUN\"}")"
chk "maintenance create work order -> id" "$([ -n "$(body "$WO" | field id)" ] && echo ok)" ok
SI="$(req POST "$P/security/incidents" "$SECURITY" "$INST" "{\"title\":\"SI $RUN\"}")"
chk "security create incident -> id" "$([ -n "$(body "$SI" | field id)" ] && echo ok)" ok
DV="$(req POST "$P/it/devices" "$IT" "$INST" "{\"name\":\"Dev $RUN\"}")"
chk "it create device -> id" "$([ -n "$(body "$DV" | field id)" ] && echo ok)" ok

echo "== 3. Counseling read-access auditing =="
CN="$(req POST "$P/counseling/records" "$COUNSELOR" "$INST" "{\"title\":\"Note $RUN\",\"notes\":\"secret\"}")"
CN_ID="$(body "$CN" | field id)"
chk "counselor create note -> id" "$([ -n "$CN_ID" ] && echo ok)" ok
chk "counselor GET note -> 200" "$(code "$(req GET "$P/counseling/records/$CN_ID" "$COUNSELOR" "$INST")")" 200

echo "== 4. Campus-admin assignable-role governance =="
chk "cadmin invite target (school_nurse) -> 200" "$(code "$(req POST "$US" "$CADMIN" "$INST" "{\"email\":\"$TARGET\",\"fullName\":\"P13 Target\",\"roleKeys\":[\"school_nurse\"],\"campusIds\":[\"$CAMPUS_ID\"]}")")" 200
TARGET_ID="$(req GET "$US?pageSize=200" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const em=process.argv[1];const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.email===em);console.log(r?r.id:"")})' "$TARGET")"
TV="$(uver "$TARGET")"
chk "cadmin assign counselor -> 200" "$(code "$(req PUT "$US/$TARGET_ID/access" "$CADMIN" "$INST" "{\"roleKeys\":[\"counselor\"],\"campusIds\":[\"$CAMPUS_ID\"],\"version\":$TV}")")" 200
TV="$(uver "$TARGET")"
chk "cadmin assign finance_manager -> 403 (ROLE_NOT_ASSIGNABLE)" "$(body "$(req PUT "$US/$TARGET_ID/access" "$CADMIN" "$INST" "{\"roleKeys\":[\"finance_manager\"],\"version\":$TV}")" | field code)" ROLE_NOT_ASSIGNABLE
chk "cadmin set direct override -> 403 (OVERRIDES_NOT_PERMITTED)" "$(body "$(req PUT "$US/$TARGET_ID/access" "$CADMIN" "$INST" "{\"roleKeys\":[\"counselor\"],\"directGrants\":[\"fees.view\"],\"campusIds\":[\"$CAMPUS_ID\"],\"version\":$TV}")" | field code)" OVERRIDES_NOT_PERMITTED
chk "cadmin invite finance_manager -> 403 (ROLE_NOT_ASSIGNABLE)" "$(body "$(req POST "$US" "$CADMIN" "$INST" "{\"email\":\"nope.$RUN@greenwood.edu\",\"fullName\":\"Nope\",\"roleKeys\":[\"finance_manager\"]}")" | field code)" ROLE_NOT_ASSIGNABLE
TV="$(uver "$TARGET")"
chk "owner assign finance_manager -> 200 (institution-wide unaffected)" "$(code "$(req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"finance_manager\"],\"version\":$TV}")")" 200

echo "== 5. IT security actions =="
chk "it reset-security (target) -> 200" "$(code "$(req POST "$US/$TARGET_ID/reset-security" "$IT" "$INST")")" 200
chk "it revoke-sessions (target) -> 200" "$(code "$(req POST "$US/$TARGET_ID/revoke-sessions" "$IT" "$INST")")" 200
chk "nurse reset-security -> 403 (lacks key)" "$(code "$(req POST "$US/$TARGET_ID/reset-security" "$NURSE" "$INST")")" 403

echo "== 6. Audit rows written per module (needs DATABASE_URL/local DB) =="
acount(){ psql "$DBURL" -tA -c "select case when count(*)>0 then 'ok' else 'no' end from audit_events where module='$1' and institution_id='$INST_ID'" 2>/dev/null; }
amatch(){ psql "$DBURL" -tA -c "select case when count(*)>0 then 'ok' else 'no' end from audit_events where module='$1' and action='$2' and institution_id='$INST_ID'" 2>/dev/null; }
chk "portal-health audit rows"        "$(acount portal-health)" ok
chk "portal-counseling audit rows"    "$(acount portal-counseling)" ok
chk "portal-counseling note.view row" "$(amatch portal-counseling counseling.note.view)" ok
chk "portal-labs audit rows"          "$(acount portal-labs)" ok
chk "portal-front-desk audit rows"    "$(acount portal-front-desk)" ok
chk "portal-facilities audit rows"    "$(acount portal-facilities)" ok
chk "portal-security audit rows"      "$(acount portal-security)" ok
chk "portal-it audit rows"            "$(acount portal-it)" ok
chk "user.security.reset audit row"   "$(amatch portal-users user.security.reset)" ok
chk "user.sessions.revoke audit row"  "$(amatch portal-users user.sessions.revoke)" ok

echo "== 7. Cleanup =="
dv(){ # current version of a row by id in a resource list
  req GET "$1?pageSize=200" "$2" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:0)})' "$3"; }
delrow(){ local base="$1" e="$2" id="$3"; [ -n "$id" ] && req DELETE "$base/$id" "$e" "$INST" "{\"version\":$(dv "$base" "$e" "$id")}" >/dev/null; }
delrow "$P/health/records" "$NURSE" "$(body "$HR" | field id)"
delrow "$P/labs/assets" "$LAB" "$(body "$LA" | field id)"
delrow "$P/front-desk/visitors" "$RECEPTION" "$(body "$VS" | field id)"
delrow "$P/facilities/work-orders" "$MAINT" "$(body "$WO" | field id)"
delrow "$P/security/incidents" "$SECURITY" "$(body "$SI" | field id)"
delrow "$P/it/devices" "$IT" "$(body "$DV" | field id)"
delrow "$P/counseling/records" "$COUNSELOR" "$CN_ID"
psql "$DBURL" -q -c "delete from institution_users where email='$TARGET';" 2>/dev/null
echo "  cleaned created rows + target user"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
