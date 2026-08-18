#!/usr/bin/env bash
# Phase 4 (Admin-panel redesign — Messaging rebuild) live smoke.
#
# Proves messaging v2 behaves like a real chat, not admin threads:
#   1. create a conversation from a recipient target (a teacher) with an opening message; the creator
#      is auto-added as owner and the direct conversation is named from the other participant.
#   2. it appears in the conversation list with resolved participant names + last-message preview.
#   3. messages read back with resolved sender names; posting a reply grows the thread.
#   4. read cursor — after markRead the unread count is 0 for the reader.
#   5. participants — add a second person (becomes a group) then remove them.
#   6. lifecycle — archive hides from the default list; unarchive restores.
#   7. access gate — a portal user who is NOT a participant gets 404 (membership is the boundary).
#
# Self-cleaning-ish (conversations are left; they carry a unique marker). Prereqs: API on :3007 with
# PORTAL_AUTH_DEV_HEADER=true; DB seeded + migration 0029.
set -u
API="${API:-http://localhost:3007/v1}"
OWNER="${OWNER:-owner@uis.edu.in}"
OTHER="${OTHER:-admin@uis.edu.in}"   # a different portal user, NOT a participant
INST='institution'
RUN="msg-$(date +%s)"
H=(-H "x-institution-user-email: $OWNER" -H "x-institution-scope: $INST" -H 'content-type: application/json')

pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
ok(){ if [ -n "$2" ] && [ "$2" != "undefined" ] && [ "$2" != "null" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 got '$2'"; fail=$((fail+1)); fi; }
field(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(v==null?"":v)}catch{console.log("")}})' "$1"; }
len(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);console.log(Array.isArray(o)?o.length:(o.items?o.items.length:-1))}catch{console.log(-1)}})'; }

TID="$(curl -s "$API/portal/people/teachers?pageSize=1" "${H[@]}" | field 'items.0.id')"
STID="$(curl -s "$API/portal/people/staff?pageSize=1" "${H[@]}" | field 'items.0.id')"
ok "picked a teacher" "$TID"

echo "== 1. create conversation =="
CONV="$(curl -s -X POST "$API/portal/conversations" "${H[@]}" -d "{\"targets\":[{\"kind\":\"teacher\",\"refId\":\"$TID\"}],\"body\":\"Hello $RUN\"}")"
CID="$(printf '%s' "$CONV" | field 'id')"
ok "conversation created" "$CID"
chk "direct (2 participants)" "$(printf '%s' "$CONV" | field 'participantCount')" "2"
ok "named from other participant" "$(printf '%s' "$CONV" | field 'name')"

echo "== 2. appears in list with preview =="
chk "last message preview" "$(curl -s "$API/portal/conversations?filter=all&pageSize=100" "${H[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const c=(o.items||[]).find(x=>x.id===process.argv[1]);console.log(c&&c.lastMessage?c.lastMessage.body:"")})' "$CID")" "Hello $RUN"

echo "== 3. messages read back + post grows thread =="
ok "sender name resolved" "$(curl -s "$API/portal/conversations/$CID/messages" "${H[@]}" | field '0.senderName')"
curl -s -X POST "$API/portal/conversations/$CID/messages" "${H[@]}" -d '{"body":"second message"}' > /dev/null
chk "thread has 2 messages" "$(curl -s "$API/portal/conversations/$CID/messages" "${H[@]}" | len)" "2"

echo "== 4. read cursor =="
curl -s -X POST "$API/portal/conversations/$CID/read" "${H[@]}" -d '{}' > /dev/null
chk "unread == 0 after read" "$(curl -s "$API/portal/conversations/$CID" "${H[@]}" | field 'unreadCount')" "0"

echo "== 5. participants add/remove =="
ADDED="$(curl -s -X POST "$API/portal/conversations/$CID/participants" "${H[@]}" -d "{\"targets\":[{\"kind\":\"staff\",\"refId\":\"$STID\"}]}")"
chk "now a group of 3" "$(printf '%s' "$ADDED" | field 'participantCount')" "3"
chk "isGroup true" "$(printf '%s' "$ADDED" | field 'isGroup')" "true"
REMOVED="$(curl -s -X POST "$API/portal/conversations/$CID/participants/staff/$STID/remove" "${H[@]}")"
chk "back to 2 after remove" "$(printf '%s' "$REMOVED" | field 'participantCount')" "2"

echo "== 6. archive lifecycle =="
curl -s -X PATCH "$API/portal/conversations/$CID" "${H[@]}" -d '{"archived":true}' > /dev/null
chk "archived hidden from default list" "$(curl -s "$API/portal/conversations?filter=all&pageSize=100" "${H[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log((o.items||[]).some(x=>x.id===process.argv[1])?"yes":"no")})' "$CID")" "no"
chk "archived shows in archived filter" "$(curl -s "$API/portal/conversations?filter=archived&pageSize=100" "${H[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log((o.items||[]).some(x=>x.id===process.argv[1])?"yes":"no")})' "$CID")" "yes"
curl -s -X PATCH "$API/portal/conversations/$CID" "${H[@]}" -d '{"archived":false}' > /dev/null

echo "== 7. access gate =="
chk "non-participant -> 404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/portal/conversations/$CID" -H "x-institution-user-email: $OTHER" -H "x-institution-scope: $INST")" "404"

echo
echo "messaging smoke: $pass passed, $fail failed"
[ "$fail" = "0" ]
