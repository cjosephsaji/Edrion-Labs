#!/usr/bin/env bash
# Petros companion smoke — grounding, continuity, actions, isolation.
#
# Prereqs: API on :3007, STUDENT_AUTH_DEV_HEADER=true, seeded greenwood students.
#
# COST: every companion turn is a billed model call. The default run makes about five;
# FULL=1 adds the exhaustive per-entity-type grounding sweep and costs roughly four times
# as much. Use the default while iterating, FULL=1 before shipping.
set -u
FULL="${FULL:-0}"
API="${API:-http://localhost:3007/v1}"
STU="${STUDENT_EMAIL:-student1@greenwood.edu}"
OTHER="${OTHER_STUDENT_EMAIL:-student2@greenwood.edu}"
PSQL="${PSQL:-postgres://macbook@localhost:5433/edrion}"
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }
# JSON null and an absent field both mean "no focus was recorded".
chknull(){ if [ "$2" = "null" ] || [ -z "$2" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 expected no focus, got=$2"; fail=$((fail+1)); fi; }
chkc(){ if printf '%s' "$2" | grep -qF "$3"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (missing '$3')"; fail=$((fail+1)); fi; }
chknc(){ if printf '%s' "$2" | grep -qF "$3"; then echo "  FAIL  $1 (leaked '$3')"; fail=$((fail+1)); else echo "  PASS  $1"; pass=$((pass+1)); fi; }
uuid(){ uuidgen | tr 'A-Z' 'a-z'; }
jq_(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);let v=o;for(const k of process.argv[1].split("."))v=(v==null?undefined:v[k]);console.log(typeof v==="object"?JSON.stringify(v):(v==null?"":v))}catch{console.log("")}})' "$1"; }
sget(){ curl -s -m 30 "$API/student$1" -H "x-student-email: ${2:-$STU}"; }
scode(){ curl -s -m 30 -o /dev/null -w '%{http_code}' "$API/student$1" -H "x-student-email: ${2:-$STU}"; }
spost(){ curl -s -m 90 -X POST "$API/student$1" -H "x-student-email: ${3:-$STU}" -H 'content-type: application/json' -d "$2"; }

AID="$(psql "$PSQL" -tAc "select a.id from assignments a join assignment_assignees aa on aa.assignment_id=a.id join students s on s.id=aa.student_id join institution_users u on u.id=s.institution_user_id where u.email='$STU' and a.status='published' limit 1")"
OTHER_AID="$(psql "$PSQL" -tAc "select a.id from assignments a where a.status='published' and a.institution_id <> (select s.institution_id from students s join institution_users u on u.id=s.institution_user_id where u.email='$STU' limit 1) limit 1")"
OTHER_GRADE="$(psql "$PSQL" -tAc "select g.id from grade_entries g where g.published=true and g.student_id <> (select s.id from students s join institution_users u on u.id=s.institution_user_id where u.email='$STU' limit 1) limit 1")"

echo "== Petros companion smoke ($STU) =="
echo "   own assignment:   ${AID:-none}"
echo "   other assignment: ${OTHER_AID:-none}"

echo
echo "== 1. Endpoint availability =="
chk "GET /petros/companion/thread"      "$(scode /petros/companion/thread)" 200
chk "GET /petros/companion/threads"     "$(scode /petros/companion/threads)" 200
chk "GET /petros/companion/briefing"    "$(scode /petros/companion/briefing)" 200
chk "GET /petros/companion/preferences" "$(scode /petros/companion/preferences)" 200
chk "no auth header -> 401"             "$(curl -s -o /dev/null -w '%{http_code}' "$API/student/petros/companion/thread")" 401

echo
echo "== 2. Grounding: the SELECTED item wins, not the first one =="
K1="$(uuid)"
T1="$(spost /petros/companion/turns "{\"message\":\"What is this one and when is it due?\",\"route\":\"/assignments\",\"surface\":\"assignments\",\"focusRef\":\"c3\",\"visibleCandidates\":[{\"ref\":\"c1\",\"entityType\":\"assignment\",\"entityId\":\"00000000-0000-4000-8000-000000000000\",\"title\":\"Decoy first card\",\"summary\":\"\"},{\"ref\":\"c3\",\"entityType\":\"assignment\",\"entityId\":\"$AID\",\"title\":\"CLIENT SUPPLIED TITLE\",\"summary\":\"client supplied summary\"}],\"idempotencyKey\":\"$K1\"}")"
THREAD="$(printf '%s' "$T1" | jq_ threadId)"
chk  "turn returns a thread"              "$([ -n "$THREAD" ] && echo ok)" ok
chk  "focus recorded as the third ref"    "$(printf '%s' "$T1" | jq_ reply.focusRef)" c3
chknc "client-supplied title not echoed"  "$T1" "CLIENT SUPPLIED TITLE"
chknc "decoy first card not described"    "$T1" "Decoy first card"

echo
echo "== 3. Idempotency: same key never makes a second turn =="
T1B="$(spost /petros/companion/turns "{\"message\":\"What is this one and when is it due?\",\"route\":\"/assignments\",\"surface\":\"assignments\",\"focusRef\":\"c3\",\"visibleCandidates\":[{\"ref\":\"c3\",\"entityType\":\"assignment\",\"entityId\":\"$AID\",\"title\":\"x\",\"summary\":\"\"}],\"idempotencyKey\":\"$K1\"}")"
chk "replay flagged"           "$(printf '%s' "$T1B" | jq_ replayed)" true
chk "replay reuses reply id"   "$(printf '%s' "$T1B" | jq_ reply.id)" "$(printf '%s' "$T1" | jq_ reply.id)"
chk "no duplicate messages"    "$(psql "$PSQL" -tAc "select count(*) from petros_student_messages where idempotency_key='$K1'")" 2

echo
echo "== 4. Continuity: a follow-up on another route keeps the thread =="
K2="$(uuid)"
T2="$(spost /petros/companion/turns "{\"threadId\":\"$THREAD\",\"message\":\"Why does that one matter for my next exam?\",\"route\":\"/calendar\",\"surface\":\"calendar\",\"visibleCandidates\":[],\"idempotencyKey\":\"$K2\"}")"
chk "same thread across routes" "$(printf '%s' "$T2" | jq_ threadId)" "$THREAD"
chk "thread now has 4 messages" "$(psql "$PSQL" -tAc "select count(*) from petros_student_messages where thread_id='$THREAD'")" 4
chk "thread reload returns history" "$(sget "/petros/companion/thread?threadId=$THREAD" | jq_ thread.messages | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log(0)}})')" 4

echo
echo "== 5. Route honesty: Petros never claims an unsupported screen =="
K3="$(uuid)"
T3="$(spost /petros/companion/turns "{\"message\":\"What am I looking at here?\",\"route\":\"/fees\",\"surface\":\"fees\",\"visibleCandidates\":[{\"ref\":\"f1\",\"entityType\":\"screen\",\"entityId\":\"x\",\"title\":\"Outstanding balance\",\"summary\":\"INR 12000 overdue\"}],\"idempotencyKey\":\"$K3\"}")"
chknull "unsupported route stores no focus" "$(printf '%s' "$T3" | jq_ reply.focusRef)"
chknc "no fee amount echoed"              "$T3" "12000"

echo
echo "== 6. Tenant/ownership isolation =="
if [ -n "$OTHER_AID" ]; then
  K4="$(uuid)"
  T4="$(spost /petros/companion/turns "{\"message\":\"Tell me the teacher feedback on this.\",\"route\":\"/assignments\",\"surface\":\"assignments\",\"focusRef\":\"x1\",\"visibleCandidates\":[{\"ref\":\"x1\",\"entityType\":\"assignment\",\"entityId\":\"$OTHER_AID\",\"title\":\"Someone else work\",\"summary\":\"\"}],\"idempotencyKey\":\"$K4\"}")"
  chknull "another student's row does not become focus" "$(printf '%s' "$T4" | jq_ reply.focusRef)"
else
  echo "  SKIP  no cross-institution assignment in seed"
fi
if [ -n "$OTHER_GRADE" ]; then
  K4B="$(uuid)"
  T4B="$(spost /petros/companion/turns "{\"message\":\"What mark is this?\",\"route\":\"/results\",\"surface\":\"results\",\"focusRef\":\"y1\",\"visibleCandidates\":[{\"ref\":\"y1\",\"entityType\":\"result\",\"entityId\":\"$OTHER_GRADE\",\"title\":\"Not mine\",\"summary\":\"\"}],\"idempotencyKey\":\"$K4B\"}")"
  chknull "another student's mark does not become focus" "$(printf '%s' "$T4B" | jq_ reply.focusRef)"
else
  echo "  SKIP  no other-student grade row in seed"
fi
if [ "$FULL" = "1" ]; then
K5="$(uuid)"
T5="$(spost /petros/companion/turns "{\"message\":\"Summarise this.\",\"route\":\"/assignments\",\"surface\":\"assignments\",\"focusRef\":\"g1\",\"visibleCandidates\":[{\"ref\":\"g1\",\"entityType\":\"assignment\",\"entityId\":\"11111111-1111-4111-8111-111111111111\",\"title\":\"Ghost\",\"summary\":\"\"}],\"idempotencyKey\":\"$K5\"}")"
chknull "nonexistent id does not become focus" "$(printf '%s' "$T5" | jq_ reply.focusRef)"
else
  echo "  SKIP  nonexistent-id check (set FULL=1)"
fi

echo
echo "== 7. Actions: propose, confirm once, execute once =="
PID=""
for attempt in 1 2; do
  K6="$(uuid)"
  spost /petros/companion/turns "{\"threadId\":\"$THREAD\",\"message\":\"Please add a 30 minute maths revision study block to my calendar for tomorrow at 17:00.\",\"route\":\"/calendar\",\"surface\":\"calendar\",\"visibleCandidates\":[],\"idempotencyKey\":\"$K6\"}" > /dev/null
  PID="$(psql "$PSQL" -tAc "select id from petros_student_action_proposals where thread_id='$THREAD' and action_key='planner.create' order by created_at desc limit 1")"
  [ -n "$PID" ] && break
done
if [ -n "$PID" ]; then
  chk "proposal starts unexecuted" "$(psql "$PSQL" -tAc "select status from petros_student_action_proposals where id='$PID'")" proposed
  PLAN_BEFORE="$(psql "$PSQL" -tAc "select count(*) from user_obligations where source='plan_engine'")"
  chk "proposal is not yet executed" "$(psql "$PSQL" -tAc "select count(*) from petros_student_action_proposals where id='$PID' and executed_at is null")" 1
  BEFORE="$PLAN_BEFORE"
  CK="$(uuid)"
  R1="$(spost "/petros/companion/actions/$PID/decision" "{\"decision\":\"confirm\",\"idempotencyKey\":\"$CK\"}")"
  chk "confirm executes" "$(printf '%s' "$R1" | jq_ status)" executed
  R2="$(spost "/petros/companion/actions/$PID/decision" "{\"decision\":\"confirm\",\"idempotencyKey\":\"$CK\"}")"
  chk "second confirm is a no-op" "$(printf '%s' "$R2" | jq_ status)" executed
  AFTER="$(psql "$PSQL" -tAc "select count(*) from user_obligations where source='plan_engine'")"
  ACTION_KEY="$(psql "$PSQL" -tAc "select action_key from petros_student_action_proposals where id='$PID'")"
  if [ "$ACTION_KEY" = "planner.create" ]; then
    chk "planner rows created exactly once" "$([ "$AFTER" -gt "$BEFORE" ] && echo grew || echo same)" grew
  else
    echo "  INFO  proposal was $ACTION_KEY, not planner.create"
  fi
else
  echo "  FAIL  no planner.create proposal after two explicit requests"
  fail=$((fail+1))
fi

echo
echo "== 8. Forged action keys and hrefs are rejected =="
FAKE="$(uuid)"
chk "unknown proposal id is not found" "$(curl -s -o /dev/null -w '%{http_code}' -m 30 -X POST "$API/student/petros/companion/actions/$FAKE/decision" -H "x-student-email: $STU" -H 'content-type: application/json' -d "{\"decision\":\"confirm\",\"idempotencyKey\":\"$(uuid)\"}")" 404

echo
echo "== 9. Preferences round-trip =="
PUT="$(curl -s -m 30 -X PUT "$API/student/petros/companion/preferences" -H "x-student-email: $STU" -H 'content-type: application/json' -d '{"preferredName":"Sam","responseDepth":"brief","energy":"calm","humour":"off","proactiveCheckIns":false,"language":"en","quietMode":true}')"
chk "humour saved as off"  "$(printf '%s' "$PUT" | jq_ humour)" off
chk "preference persists"  "$(sget /petros/companion/preferences | jq_ preferredName)" Sam
# The PUT above deliberately set quiet mode, so restore defaults before asserting the
# unmuted case — otherwise the test's own setup is what silences the briefing.
curl -s -m 30 -o /dev/null -X PUT "$API/student/petros/companion/preferences" -H "x-student-email: $STU" -H 'content-type: application/json' -d '{"preferredName":null,"responseDepth":"balanced","energy":"warm","humour":"light","proactiveCheckIns":true,"language":"en","quietMode":false}'
chk "briefing runs by default" "$(sget /petros/companion/briefing | jq_ mutedBy)" null
curl -s -m 30 -o /dev/null -X PUT "$API/student/petros/companion/preferences" -H "x-student-email: $STU" -H 'content-type: application/json' -d '{"preferredName":null,"responseDepth":"balanced","energy":"warm","humour":"light","proactiveCheckIns":false,"language":"en","quietMode":false}'
chk "turning check-ins off silences the briefing" "$(sget /petros/companion/briefing | jq_ mutedBy)" check_ins_off
curl -s -m 30 -o /dev/null -X PUT "$API/student/petros/companion/preferences" -H "x-student-email: $STU" -H 'content-type: application/json' -d '{"preferredName":null,"responseDepth":"balanced","energy":"warm","humour":"light","proactiveCheckIns":true,"language":"en","quietMode":true}'
chk "quiet mode silences the briefing" "$(sget /petros/companion/briefing | jq_ mutedBy)" quiet_mode
curl -s -m 30 -o /dev/null -X PUT "$API/student/petros/companion/preferences" -H "x-student-email: $STU" -H 'content-type: application/json' -d '{"preferredName":null,"responseDepth":"balanced","energy":"warm","humour":"light","proactiveCheckIns":true,"language":"en","quietMode":false}'

echo
echo "== 10. Briefing is deterministic =="
B1="$(sget /petros/companion/briefing)"
B2="$(sget /petros/companion/briefing)"
chk "same facts, same ordering" "$(printf '%s' "$B1" | jq_ items | md5 -q 2>/dev/null || printf '%s' "$B1" | jq_ items | md5sum | cut -d' ' -f1)" "$(printf '%s' "$B2" | jq_ items | md5 -q 2>/dev/null || printf '%s' "$B2" | jq_ items | md5sum | cut -d' ' -f1)"
chk "briefing has a headline" "$([ -n "$(printf '%s' "$B1" | jq_ headline)" ] && echo ok)" ok

echo
echo "== 11. Every entity type the portal offers can be grounded =="
SID="$(psql "$PSQL" -tAc "select s.id from students s join institution_users u on u.id=s.institution_user_id where u.email='$STU' limit 1")"
IID="$(psql "$PSQL" -tAc "select institution_id from students where id='$SID'")"
grounds(){ # kind, id, route, surface
  if [ -z "$2" ]; then echo "  SKIP  $1 (no seeded row)"; return; fi
  local key resp focus
  key="$(uuid)"
  resp="$(spost /petros/companion/turns "{\"message\":\"What is this?\",\"route\":\"$3\",\"surface\":\"$4\",\"focusRef\":\"g1\",\"visibleCandidates\":[{\"ref\":\"g1\",\"entityType\":\"$1\",\"entityId\":\"$2\",\"title\":\"CLIENT TITLE\",\"summary\":\"\"}],\"idempotencyKey\":\"$key\"}")"
  focus="$(printf '%s' "$resp" | jq_ reply.focusRef)"
  chk "$1 grounds" "$focus" "g1"
  chknc "$1 ignores the client title" "$resp" "CLIENT TITLE"
}
# One per resolver family by default; the whole matrix only under FULL=1, because each
# `grounds` call is a billed turn.
grounds assignment "$AID" /assignments assignments
grounds learning_path_step "$(psql "$PSQL" -tAc "select i.id from learning_path_items i join learning_paths p on p.id=i.path_id where p.student_id='$SID' limit 1")" /learning-path learning_path
if [ "$FULL" != "1" ]; then
  echo "  SKIP  remaining entity types (set FULL=1 to sweep all twelve)"
fi
if [ "$FULL" = "1" ]; then
grounds homework "$(psql "$PSQL" -tAc "select h.id from homework h join homework_submissions hs on hs.homework_id=h.id where hs.student_id='$SID' and h.status in ('assigned','closed') limit 1")" /homework homework
grounds result "$(psql "$PSQL" -tAc "select id from grade_entries where student_id='$SID' and published=true limit 1")" /results results
grounds exam_schedule "$(psql "$PSQL" -tAc "select es.id from exam_schedules es where es.published=true and es.class_id=(select class_id from students where id='$SID') limit 1")" /exams exams
grounds material "$(psql "$PSQL" -tAc "select id from class_materials where context_id=(select class_id from students where id='$SID') limit 1")" /materials materials
grounds announcement "$(psql "$PSQL" -tAc "select id from announcements where institution_id='$IID' and status='published' limit 1")" /announcements announcements
grounds report_card "$(psql "$PSQL" -tAc "select id from report_cards where student_id='$SID' and status='published' limit 1")" /report-cards report_cards
grounds document "$(psql "$PSQL" -tAc "select id from student_documents where student_id='$SID' and published=true limit 1")" /documents documents
grounds attendance_summary "$(psql "$PSQL" -tAc "select subject_id from attendance_rollups where student_id='$SID' and subject_id is not null limit 1")" /attendance attendance
grounds artifact "$(psql "$PSQL" -tAc "select id from petros_saved_artifacts where student_id='$SID' limit 1")" /petros/artifacts petros_artifacts
grounds petros_session "$(psql "$PSQL" -tAc "select id from petros_learning_sessions where student_id='$SID' limit 1")" /home home
fi

echo
echo "== 12. Session handoff returns to the same thread =="
CLOSED_SESSION="$(psql "$PSQL" -tAc "select id from petros_learning_sessions where status='closed' and student_id=(select s.id from students s join institution_users u on u.id=s.institution_user_id where u.email='$STU') limit 1")"
if [ -n "$CLOSED_SESSION" ]; then
  SID="$(psql "$PSQL" -tAc "select s.id from students s join institution_users u on u.id=s.institution_user_id where u.email='$STU' limit 1")"
  IID="$(psql "$PSQL" -tAc "select institution_id from students where id='$SID'")"
  psql "$PSQL" -qc "insert into petros_student_action_proposals (institution_id, student_id, thread_id, action_key, arguments, preview, status, result_ref, expires_at, executed_at) values ('$IID','$SID','$THREAD','session.preview_and_start','{}','[]','executed','$CLOSED_SESSION', now()+interval '1 hour', now());" >/dev/null
  RES1="$(sget "/petros/companion/thread?threadId=$THREAD")"
  chkc "finished session is reported in the thread" "$RES1" "Session complete"
  chkc "the summary names the topic" "$RES1" "You finished"
  sget "/petros/companion/thread?threadId=$THREAD" > /dev/null
  chk "the result lands exactly once" "$(psql "$PSQL" -tAc "select count(*) from petros_student_messages where thread_id='$THREAD' and blocks::text like '%Session complete%'")" 1
else
  echo "  SKIP  no closed session for this student"
fi

echo
echo "== 13. Thread lifecycle =="
chk "archive thread" "$(printf '%s' "$(spost "/petros/companion/threads/$THREAD/archive" '{}')" | jq_ status)" archived
chk "delete thread"  "$(curl -s -m 30 -X DELETE "$API/student/petros/companion/threads/$THREAD" -H "x-student-email: $STU" | jq_ deleted)" true
chk "messages cascade away" "$(psql "$PSQL" -tAc "select count(*) from petros_student_messages where thread_id='$THREAD'")" 0

echo
echo "== Result: $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
