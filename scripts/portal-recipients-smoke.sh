#!/usr/bin/env bash
# Phase 3 (Admin-panel redesign — Announcements/Notifications recipient targeting) live smoke.
#
# Proves rich recipient targeting end to end:
#   1. preview — a target list resolves to a real, de-duplicated recipient count + sample names +
#      a human summary, scoped to the institution.
#   2. structural == derived — a plain `class` target resolves the same students as `students_of_class`.
#   3. broadcast — `all_students` count equals the students directory total.
#   4. saved groups — create a group, list it (member labels resolved), reference it in a preview and
#      get the same count as the underlying target.
#   5. announcement targets — create an announcement with targets; the list returns them resolved to
#      labels; publishing fans out a notification stamped with recipient_count + target_summary.
#   6. permission gating — a teacher (no announcements.send) can't preview.
#
# Self-cleaning. Prereqs: API on :3007 with PORTAL_AUTH_DEV_HEADER=true; DB seeded + migration 0028.
set -u
API="${API:-http://localhost:3007/v1}"
OWNER="${OWNER:-owner@uis.edu.in}"
TEACHER="${TEACHER:-teacher@uis.edu.in}"
INST='institution'
RUN="smoke-$(date +%s)"
H=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
ok(){ if [ -n "$2" ] && [ "$2" != "undefined" ] && [ "$2" != "null" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 got '$2'"; fail=$((fail+1)); fi; }
gt0(){ if [ "${2:-0}" -gt 0 ] 2>/dev/null; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 not >0 got '$2'"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
preview(){ curl -s -X POST "$API/portal/recipients/preview" "${H[@]}" -d "$1" | field "$2"; }

CID="$(curl -s "$API/portal/academics/classes?pageSize=1" "${H[@]}" | field 'items.0.id')"
ok "picked a class" "$CID"
STUDENT_TOTAL="$(curl -s "$API/portal/people/students?pageSize=1" "${H[@]}" | field 'total')"

echo "== 1. preview resolves a real count =="
SOC="$(preview "{\"targets\":[{\"kind\":\"students_of_class\",\"refId\":\"$CID\"}]}" 'count')"
gt0 "students_of_class count > 0" "$SOC"
POC="$(preview "{\"targets\":[{\"kind\":\"parents_of_class\",\"refId\":\"$CID\"}]}" 'byKind.parents')"
gt0 "parents_of_class resolves parents" "$POC"

echo "== 2. structural class == derived students_of_class =="
CLS="$(preview "{\"targets\":[{\"kind\":\"class\",\"refId\":\"$CID\"}]}" 'count')"
chk "class == students_of_class" "$CLS" "$SOC"

echo "== 3. broadcast all_students == directory total =="
ALLS="$(preview '{"targets":[{"kind":"all_students"}]}' 'count')"
chk "all_students == student total" "$ALLS" "$STUDENT_TOTAL"

echo "== 4. saved group =="
GID="$(curl -s -X POST "$API/portal/recipient-groups" "${H[@]}" -d "{\"name\":\"Grp $RUN\",\"members\":[{\"kind\":\"students_of_class\",\"refId\":\"$CID\"}]}" | field 'id')"
ok "group created" "$GID"
ok "group member label resolved" "$(curl -s "$API/portal/recipient-groups?pageSize=100" "${H[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const g=(o.items||[]).find(x=>x.id===process.argv[1]);console.log(g&&g.members&&g.members[0]?g.members[0].label:"")})' "$GID")"
GRPCOUNT="$(preview "{\"targets\":[{\"kind\":\"group\",\"refId\":\"$GID\"}]}" 'count')"
chk "group preview == underlying count" "$GRPCOUNT" "$SOC"

echo "== 5. announcement targets + publish fan-out =="
AID="$(curl -s -X POST "$API/portal/announcements" "${H[@]}" -d "{\"title\":\"Ann $RUN\",\"referenceCode\":\"ANN-$RUN\",\"status\":\"draft\",\"targets\":[{\"kind\":\"students_of_class\",\"refId\":\"$CID\"}]}" | field 'id')"
ok "announcement created" "$AID"
ok "list returns resolved target label" "$(curl -s "$API/portal/announcements?pageSize=100&search=$RUN" "${H[@]}" | field 'items.0.targets.0.label')"
PUB="$(curl -s -X POST "$API/portal/announcements/$AID/publish" "${H[@]}" -d '{}')"
NCOUNT="$(printf '%s' "$PUB" | field 'notification.recipientCount')"
chk "notification.recipientCount == preview" "$NCOUNT" "$SOC"
ok "notification.targetSummary set" "$(printf '%s' "$PUB" | field 'notification.targetSummary')"

echo "== 6. permission gating =="
chk "teacher -> preview 403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/portal/recipients/preview" -H "x-institution-user-email: $TEACHER" -H "x-institution-scope: $INST" -H 'content-type: application/json' -d '{"targets":[{"kind":"all"}]}')" "403"

echo "== 7. cleanup =="
AVER="$(curl -s "$API/portal/announcements?pageSize=100&search=$RUN" "${H[@]}" | field 'items.0.version')"
chk "delete announcement" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/portal/announcements/$AID" "${H[@]}" -d "{\"version\":${AVER:-0}}")" "200"
chk "delete group" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/portal/recipient-groups/$GID" "${H[@]}" -d '{"version":0}')" "200"

echo
echo "recipients smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
