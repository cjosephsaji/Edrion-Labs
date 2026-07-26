#!/usr/bin/env bash
# Phase 11 (Institution Portal — Settings, User Management, Roles editor, Audit viewer) live smoke.
#
# Proves, against the running API + seeded portal users, that the four Administration verticals are
# real and the portal's guarantees hold:
#   1. permission gating  — institution_settings.{view,manage}, users.{view,invite,manage,manage_roles},
#      roles.{view,manage}, audit.{view,export}. A view-only admin (seeded via direct_grants: the four
#      *.view keys, NO manage/invite/export) reads 200 but every write/export -> 403; teacher -> 403.
#   2. settings — CRUD + the (institution,campus,category,key) uniqueness 409 + version 409.
#   3. roles    — list merges built-in (read-only) + custom; create/edit/delete custom; built-in key
#      and duplicate -> 409; an unknown permission -> 400; built-in edit/delete -> 400 ROLE_IS_SYSTEM.
#   4. users    — invite (USER_EXISTS 409), edit, set access (roles+campus+overrides), self-guards
#      (cannot disable / edit-own-roles / delete self), invalid role/campus -> 400.
#   5. roles editor is REAL — a custom role's permission bag actually changes a user's evaluated access
#      (assign a custom role granting audit.view -> the user's GET /portal/audit flips 403 -> 200).
#   6. audit    — read + module filter + CSV export (header row), export is itself audited; export
#      gated by audit.export.
#   7. scope isolation — a confined admin creates a campus-stamped setting; a foreign campus -> 403.
#   8. audit rows — every mutation writes an audit_events row (checked via count, needs DATABASE_URL).
#
# Self-cleaning + idempotent: created rows carry a unique run suffix and are deleted at the end; the
# seeded test users are removed at the end.
#
# Prereqs: API on :3001, DB seeded + migration 0021 applied, and in .env PORTAL_AUTH_DEV_HEADER=true.
set -u
set +B
API="${API:-http://localhost:3001/v1}"
DBURL="${DATABASE_URL:-postgres://macbook@localhost:5432/edrion}"
ST="$API/portal/settings"
RL="$API/portal/roles"
US="$API/portal/users"
AU="$API/portal/audit"
OWNER='owner@greenwood.edu'            # institution_owner (wildcard)
TEACHER='teacher@greenwood.edu'        # no Administration keys at all
VIEWER='viewer.p11@greenwood.edu'      # seeded: users/roles/institution_settings/audit .view (no manage/export)
CADMIN='cadmin.p11@greenwood.edu'      # seeded: institution_settings.view+manage, confined to ONE campus
TARGET='target.p11@greenwood.edu'      # created via the API invite path, then edited/assigned/deleted
RUN="smoke-$(date +%s)"
INST='institution'
FAKE='00000000-0000-0000-0000-000000000000'

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
uver(){ # current version of an institution user by email (via the directory)
  req GET "$US?pageSize=100" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const em=process.argv[1];try{const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.email===em);console.log(r?r.version:"")}catch{console.log("")}})' "$1"
}

INST_ID="$(psql "$DBURL" -tA -c "select institution_id from institution_users where email='$OWNER' limit 1" 2>/dev/null)"
OWNER_ID="$(psql "$DBURL" -tA -c "select id from institution_users where email='$OWNER' limit 1" 2>/dev/null)"
CAMPUS_ID="$(psql "$DBURL" -tA -c "select id from campuses where institution_id='$INST_ID' limit 1" 2>/dev/null)"

echo "== 0. Seed test users (direct_grants) =="
psql "$DBURL" -v ON_ERROR_STOP=1 -q <<SQL 2>/dev/null
delete from institution_users where email in ('$VIEWER','$CADMIN','$TARGET');
insert into institution_users (institution_id, email, full_name, status, direct_grants)
values ('$INST_ID', '$VIEWER', 'Val Viewer', 'active',
  '["users.view","roles.view","institution_settings.view","audit.view"]'::jsonb);
insert into institution_users (institution_id, email, full_name, status, direct_grants)
values ('$INST_ID', '$CADMIN', 'Cam Admin', 'active',
  '["institution_settings.view","institution_settings.manage"]'::jsonb);
insert into campus_user_access (institution_user_id, campus_id)
select id, '$CAMPUS_ID' from institution_users where email='$CADMIN';
SQL
chk "viewer seeded"  "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email='$VIEWER'" 2>/dev/null)" 1
chk "cadmin seeded"  "$(psql "$DBURL" -tA -c "select count(*) from institution_users where email='$CADMIN'" 2>/dev/null)" 1

echo "== 1. Permission gating =="
chk "owner GET settings -> 200"   "$(code "$(req GET "$ST" "$OWNER" "$INST")")" 200
chk "viewer GET settings -> 200"  "$(code "$(req GET "$ST" "$VIEWER" "$INST")")" 200
chk "viewer POST setting -> 403"  "$(code "$(req POST "$ST" "$VIEWER" "$INST" "{\"category\":\"general\",\"key\":\"x\",\"label\":\"x\"}")")" 403
chk "viewer GET roles -> 200"     "$(code "$(req GET "$RL" "$VIEWER" "$INST")")" 200
chk "viewer POST role -> 403"     "$(code "$(req POST "$RL" "$VIEWER" "$INST" "{\"key\":\"x_role\",\"name\":\"X\"}")")" 403
chk "viewer GET users -> 200"     "$(code "$(req GET "$US" "$VIEWER" "$INST")")" 200
chk "viewer POST user -> 403"     "$(code "$(req POST "$US" "$VIEWER" "$INST" "{\"email\":\"z@z.edu\",\"fullName\":\"Zee Zed\"}")")" 403
chk "viewer GET audit -> 200"     "$(code "$(req GET "$AU" "$VIEWER" "$INST")")" 200
chk "viewer GET audit export -> 403" "$(code "$(req GET "$AU/export" "$VIEWER" "$INST")")" 403
chk "teacher GET settings -> 403" "$(code "$(req GET "$ST" "$TEACHER" "$INST")")" 403
chk "teacher GET roles -> 403"    "$(code "$(req GET "$RL" "$TEACHER" "$INST")")" 403
chk "teacher GET users -> 403"    "$(code "$(req GET "$US" "$TEACHER" "$INST")")" 403
chk "teacher GET audit -> 403"    "$(code "$(req GET "$AU" "$TEACHER" "$INST")")" 403

echo "== 2. Settings — CRUD + uniqueness + version =="
R="$(req POST "$ST" "$OWNER" "$INST" "{\"category\":\"general\",\"key\":\"k-$RUN\",\"label\":\"Lbl $RUN\",\"valueType\":\"string\",\"value\":\"v1\"}")"
SET_ID="$(body "$R" | field id)"
chk "create setting -> id" "$([ -n "$SET_ID" ] && echo ok)" ok
chk "  default valueType string" "$(body "$R" | field valueType)" string
chk "duplicate (category,key) -> 409 (SETTING_EXISTS)" "$(body "$(req POST "$ST" "$OWNER" "$INST" "{\"category\":\"general\",\"key\":\"k-$RUN\",\"label\":\"y\"}")" | field code)" SETTING_EXISTS
chk "setting stale version -> 409" "$(code "$(req PATCH "$ST/$SET_ID" "$OWNER" "$INST" "{\"label\":\"z\",\"version\":99}")")" 409
chk "setting update v0 -> 200" "$(code "$(req PATCH "$ST/$SET_ID" "$OWNER" "$INST" "{\"value\":\"v2\",\"version\":0}")")" 200

echo "== 3. Roles — built-in + custom CRUD =="
chk "list has 12+ roles (built-in + custom)" "$([ "$(req GET "$RL?pageSize=100" "$OWNER" "$INST" | sed '$d' | field total)" -ge 12 ] && echo ok)" ok
RKEY="role_$(date +%s)"
R="$(req POST "$RL" "$OWNER" "$INST" "{\"key\":\"$RKEY\",\"name\":\"Smoke Role\",\"permissions\":[\"students.view\"]}")"
ROLE_ID="$(body "$R" | field id)"
chk "create custom role -> id" "$([ -n "$ROLE_ID" ] && echo ok)" ok
chk "  source custom" "$(body "$R" | field source)" custom
chk "duplicate key -> 409 (ROLE_EXISTS)" "$(body "$(req POST "$RL" "$OWNER" "$INST" "{\"key\":\"$RKEY\",\"name\":\"Dupe Role\"}")" | field code)" ROLE_EXISTS
chk "built-in key reserved -> 409 (ROLE_EXISTS)" "$(body "$(req POST "$RL" "$OWNER" "$INST" "{\"key\":\"teacher\",\"name\":\"Dupe Role\"}")" | field code)" ROLE_EXISTS
chk "unknown permission -> 400 (INVALID_PERMISSION)" "$(body "$(req POST "$RL" "$OWNER" "$INST" "{\"key\":\"bad_role_smoke\",\"name\":\"Bad Role\",\"permissions\":[\"not.a.key\"]}")" | field code)" INVALID_PERMISSION
R="$(req PUT "$RL/$ROLE_ID/permissions" "$OWNER" "$INST" "{\"permissions\":[\"students.view\",\"teachers.view\",\"audit.view\"],\"version\":0}")"
chk "set permissions -> count 3" "$(body "$R" | field permissionCount)" 3
chk "set permissions stale version -> 409" "$(code "$(req PUT "$RL/$ROLE_ID/permissions" "$OWNER" "$INST" "{\"permissions\":[],\"version\":0}")")" 409
chk "edit built-in -> 400 (ROLE_IS_SYSTEM)" "$(body "$(req PATCH "$RL/default:teacher" "$OWNER" "$INST" "{\"name\":\"Hax\",\"version\":0}")" | field code)" ROLE_IS_SYSTEM
chk "delete built-in -> 400 (ROLE_IS_SYSTEM)" "$(body "$(req DELETE "$RL/default:teacher" "$OWNER" "$INST" "{\"version\":0}")" | field code)" ROLE_IS_SYSTEM

echo "== 4. Users — invite + edit + access + self-guards =="
R="$(req POST "$US" "$OWNER" "$INST" "{\"email\":\"$TARGET\",\"fullName\":\"Tara Target\"}")"
TARGET_ID="$(body "$R" | field id)"
chk "invite target -> id" "$([ -n "$TARGET_ID" ] && echo ok)" ok
chk "  status invited" "$(body "$R" | field status)" invited
chk "duplicate email -> 409 (USER_EXISTS)" "$(body "$(req POST "$US" "$OWNER" "$INST" "{\"email\":\"$TARGET\",\"fullName\":\"Dup\"}")" | field code)" USER_EXISTS
TV="$(uver "$TARGET")"
chk "set access unknown role -> 400 (INVALID_ROLE)" "$(body "$(req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"nope_role\"],\"version\":$TV}")" | field code)" INVALID_ROLE
chk "set access unknown campus -> 400 (INVALID_REFERENCE)" "$(body "$(req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\"],\"campusIds\":[\"$FAKE\"],\"version\":$TV}")" | field code)" INVALID_REFERENCE
R="$(req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\"],\"campusIds\":[\"$CAMPUS_ID\"],\"version\":$TV}")"
chk "set access ok -> roleKeys has teacher" "$(body "$R" | field roleKeys.0)" teacher
chk "  campusCount 1" "$(body "$R" | field campusCount)" 1
TV="$(uver "$TARGET")"
chk "update target (fullName) -> 200" "$(code "$(req PATCH "$US/$TARGET_ID" "$OWNER" "$INST" "{\"fullName\":\"Tara T2\",\"version\":$TV}")")" 200
chk "update target stale version -> 409" "$(code "$(req PATCH "$US/$TARGET_ID" "$OWNER" "$INST" "{\"fullName\":\"Tara Stale\",\"version\":99}")")" 409
chk "owner disable self -> 403 (CANNOT_DISABLE_SELF)" "$(body "$(req PATCH "$US/$OWNER_ID" "$OWNER" "$INST" "{\"status\":\"disabled\",\"version\":0}")" | field code)" CANNOT_DISABLE_SELF
chk "owner edit own roles -> 403 (CANNOT_EDIT_OWN_ROLES)" "$(body "$(req PUT "$US/$OWNER_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\"],\"version\":0}")" | field code)" CANNOT_EDIT_OWN_ROLES
chk "owner delete self -> 403 (CANNOT_DELETE_SELF)" "$(body "$(req DELETE "$US/$OWNER_ID" "$OWNER" "$INST" "{\"version\":0}")" | field code)" CANNOT_DELETE_SELF

echo "== 5. Roles editor is REAL (custom role changes evaluated access) =="
# target currently has the built-in 'teacher' role (no audit.view) -> audit denied
chk "target GET audit (teacher only) -> 403" "$(code "$(req GET "$AU" "$TARGET" "$INST")")" 403
TV="$(uver "$TARGET")"
# assign the custom role (granting audit.view) on top
req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\",\"$RKEY\"],\"version\":$TV}" >/dev/null
chk "target GET audit (after custom role w/ audit.view) -> 200" "$(code "$(req GET "$AU" "$TARGET" "$INST")")" 200
TV="$(uver "$TARGET")"
# remove the custom role again -> access reverts
req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\"],\"version\":$TV}" >/dev/null
chk "target GET audit (role removed) -> 403" "$(code "$(req GET "$AU" "$TARGET" "$INST")")" 403

echo "== 6. Roles — delete guard (in use) + cleanup =="
# assign the role to target, try to delete -> 409 ROLE_IN_USE
TV="$(uver "$TARGET")"
req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\",\"$RKEY\"],\"version\":$TV}" >/dev/null
RV="$(req GET "$RL?pageSize=100" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const k=process.argv[1];const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.key===k);console.log(r?r.version:"")})' "$RKEY")"
chk "delete role in use -> 409 (ROLE_IN_USE)" "$(body "$(req DELETE "$RL/$ROLE_ID" "$OWNER" "$INST" "{\"version\":$RV}")" | field code)" ROLE_IN_USE
# unassign, then delete succeeds
TV="$(uver "$TARGET")"
req PUT "$US/$TARGET_ID/access" "$OWNER" "$INST" "{\"roleKeys\":[\"teacher\"],\"version\":$TV}" >/dev/null
chk "delete role (now free) -> 200" "$(code "$(req DELETE "$RL/$ROLE_ID" "$OWNER" "$INST" "{\"version\":$RV}")")" 200

echo "== 7. Audit — read + filter + export =="
chk "owner GET audit -> 200" "$(code "$(req GET "$AU" "$OWNER" "$INST")")" 200
chk "audit filter module=portal-settings has rows" "$([ "$(req GET "$AU?module=portal-settings&pageSize=1" "$OWNER" "$INST" | sed '$d' | field total)" -ge 1 ] && echo ok)" ok
CSV="$(curl -s "$AU/export?module=portal-roles" -H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST")"
chk "export CSV header row" "$(printf '%s' "$CSV" | head -1 | cut -d, -f1,2)" "occurred_at,module"

echo "== 8. Scope isolation (confined admin) =="
chk "cadmin GET settings -> 200" "$(code "$(req GET "$ST" "$CADMIN" "$INST")")" 200
R="$(req POST "$ST" "$CADMIN" "campus:$CAMPUS_ID" "{\"category\":\"general\",\"key\":\"ck-$RUN\",\"label\":\"Campus $RUN\"}")"
CSET_ID="$(body "$R" | field id)"
chk "cadmin creates in its campus scope" "$([ -n "$CSET_ID" ] && echo ok)" ok
chk "  new row stamped to a campus" "$([ -n "$(body "$R" | field campusId)" ] && echo ok)" ok
R="$(req GET "$ST" "$CADMIN" "campus:$FAKE")"
chk "cadmin -> foreign campus -> 403" "$(code "$R")" 403
chk "  body code == SCOPE_FORBIDDEN" "$(body "$R" | field code)" SCOPE_FORBIDDEN

echo "== 9. Audit rows written (needs DATABASE_URL/local DB) =="
acount(){ psql "$DBURL" -tA -c "select case when count(*)>0 then 'ok' else 'no' end from audit_events where module = '$1' and institution_id='$INST_ID'" 2>/dev/null; }
chk "portal-settings audit rows exist" "$(acount portal-settings)" ok
chk "portal-roles audit rows exist"    "$(acount portal-roles)" ok
chk "portal-users audit rows exist"    "$(acount portal-users)" ok
chk "portal-audit audit rows exist (export logged)" "$(acount portal-audit)" ok

echo "== 10. Cleanup =="
sv(){ req GET "$ST?pageSize=100" "$OWNER" "$INST" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:"")})' "$1"; }
[ -n "$SET_ID" ]  && chk "delete setting -> 200" "$(code "$(req DELETE "$ST/$SET_ID" "$OWNER" "$INST" "{\"version\":$(sv "$SET_ID")}")")" 200
[ -n "$CSET_ID" ] && req DELETE "$ST/$CSET_ID" "$CADMIN" "campus:$CAMPUS_ID" "{\"version\":$(req GET "$ST?pageSize=100" "$CADMIN" "campus:$CAMPUS_ID" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const id=process.argv[1];const o=JSON.parse(s);const r=(o.items||[]).find(x=>x.id===id);console.log(r?r.version:0)})' "$CSET_ID")}" >/dev/null && echo "  cleaned campus setting"
TV="$(uver "$TARGET")"; [ -n "$TARGET_ID" ] && chk "delete target user -> 200" "$(code "$(req DELETE "$US/$TARGET_ID" "$OWNER" "$INST" "{\"version\":$TV}")")" 200
psql "$DBURL" -q -c "delete from institution_users where email in ('$VIEWER','$CADMIN','$TARGET');" 2>/dev/null
echo "  cleaned up seeded users"

echo
echo "==================================="
echo "  PASS=$pass  FAIL=$fail"
echo "==================================="
[ "$fail" -eq 0 ]
