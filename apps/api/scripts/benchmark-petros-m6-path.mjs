/** Real authenticated HTTP critical path on an exclusively disposable demo.
 * This is a subsystem benchmark, not a browser or human demonstration. */
/* global fetch, URL, setTimeout */
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const base = process.env.PETROS_M6_BROWSER_API;
const output = process.env.PETROS_M6_PERF_OUTPUT;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || !output || existsSync(output))
  throw Error('NEW_OUTPUT_AND_DISPOSABLE_LOOPBACK_REQUIRED');
const boot = await fetch(`${base}/demo/cloud-a?fresh=1`, { redirect: 'manual' });
const cookie = boot.headers
  .getSetCookie()
  .map((v) => v.split(';')[0])
  .join('; ');
const location = boot.headers.get('location');
if (!location || boot.status !== 302) throw Error('DISPOSABLE_DEMO_REQUIRED');
const id = new URL(location).searchParams.get('session');
const records = [];
async function request(operation, suffix = '', body) {
  const start = performance.now();
  const response = await fetch(`${base}/v1/student/petros/v2/sessions/${id}${suffix}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie,
      ...(body ? { origin: 'http://127.0.0.1:4994', 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  const stages = Object.fromEntries(
    (response.headers.get('server-timing') ?? '')
      .split(',')
      .map((v) => v.trim().match(/^(\w+);dur=([\d.]+)$/))
      .filter(Boolean)
      .map((m) => [m[1], Number(m[2])]),
  );
  records.push({
    operation,
    method: body ? 'POST' : 'GET',
    status: response.status,
    totalMs: performance.now() - start,
    stages,
  });
  writeFileSync(
    output,
    JSON.stringify(
      {
        records,
        note: 'Actual HTTP and nested stage durations; nested spans must not be added. No response bodies or answer/rubric text are logged.',
      },
      null,
      2,
    ),
  );
  if (!response.ok) throw Error(`HTTP ${response.status} during ${operation}`);
  return value;
}
let state = await request('initial_snapshot');
for (let i = 0; i < 12; i++) state = await request('snapshot_read');
async function command(type, extra = {}) {
  await request(type, '/commands', {
    commandId: randomUUID(),
    expectedRevision: state.revision,
    epoch: state.epoch,
    type,
    ...extra,
  });
  state = await request('post_command_projection');
}
await request('submit', `/tasks/${state.task.taskId}/responses`, {
  commandId: randomUUID(),
  expectedRevision: state.revision,
  epoch: state.epoch,
  taskInstanceHash: state.task.instanceHash,
  canvasRevision: state.canvas?.revision ?? 0,
  response: {
    kind: 'structured',
    values: { responsibility: 'consumer', available: 48, capacity: 7 },
  },
});
for (let i = 0; i < 40; i++) {
  state = await request('evaluation_projection');
  if (state.submission?.status === 'complete') break;
  await new Promise((resolve) => setTimeout(resolve, 600));
}
if (state.submission?.status !== 'complete') throw Error('ACTUAL_EVALUATION_DID_NOT_COMPLETE');
await command('teach');
while (state.teaching?.status === 'presenting')
  await command('teaching_step', {
    actionId: state.teaching.actionId,
    nextBeat: state.teaching.nextBeat,
  });
for (let i = 0; i < 5; i++) {
  await command('pause');
  await command('resume');
}
process.stdout.write(JSON.stringify({ requests: records.length, output }) + '\n');
