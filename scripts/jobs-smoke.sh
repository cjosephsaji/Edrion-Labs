#!/usr/bin/env bash
# Phase 10e proof: a tracked maintenance job runs, records a background_jobs row, and shows in
# System Health. Run from repo root with the API up (QUEUE_WORKERS_ENABLED=true).
set -u
API="${API:-http://localhost:3007/v1}"
H=(-H 'x-employee-email: owner@edrion.dev')
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; pass=$((pass+1)); else echo "  FAIL  $1 expected=$3 got=$2"; fail=$((fail+1)); fi; }

echo "== enqueue a tracked maintenance job =="
node scripts/enqueue-maintenance.mjs support-session.expiry >/dev/null
sleep 2

echo "== System Health surfaces the tracked run =="
OUT=$(curl -s "${H[@]}" "$API/system/health")
echo "$OUT" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const j=JSON.parse(s);
    const latest=(j.jobs&&j.jobs.latest)||[];
    const sweep=latest.find(x=>x.name==="support-session.expiry");
    const queueOk=Array.isArray(j.queues)&&j.queues.some(q=>q.name==="maintenance");
    console.log("SWEEP_STATUS="+(sweep?sweep.status:"missing"));
    console.log("REDIS="+(j.redis&&j.redis.status));
    console.log("QUEUE_PRESENT="+queueOk);
  });' > /tmp/_jobs_smoke.$$
. /tmp/_jobs_smoke.$$ 2>/dev/null || eval "$(cat /tmp/_jobs_smoke.$$)"; rm -f /tmp/_jobs_smoke.$$
chk "support-session.expiry tracked as succeeded" "${SWEEP_STATUS:-}" succeeded
chk "redis reported healthy" "${REDIS:-}" ok
chk "maintenance queue present in health" "${QUEUE_PRESENT:-}" true

echo; echo "RESULT: $pass passed, $fail failed"; exit $fail
