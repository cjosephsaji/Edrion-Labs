/** Read-only subsystem timing on an actual loopback public snapshot. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildCompanionCue } from '../src/modules/student/petros-v2/petros-companion-cues';
import { CompanionController } from '../../student-web/src/features/petros-v2/companion/companion-controller';
async function main() {
  const response = await fetch('http://127.0.0.1:4983/demo/reading-preview', {
    redirect: 'manual',
  });
  const cookie = response.headers
    .getSetCookie()
    .map((s) => s.split(';')[0])
    .join('; ');
  const location = response.headers.get('location');
  if (!location) throw Error('Isolated demo unavailable');
  const id = new URL(location).searchParams.get('session');
  const s = await fetch(`http://127.0.0.1:4983/v1/student/petros/v2/sessions/${id}`, {
    headers: { cookie },
  }).then((r) => r.json());
  if (s.engine !== 'v2' || !s.companion) throw Error('Public M6 snapshot required');
  const build: number[] = [],
    resolve: number[] = [];
  const before = process.memoryUsage().heapUsed;
  const owner = new CompanionController();
  for (let i = 0; i < 2000; i++) {
    const start = performance.now();
    const cue = buildCompanionCue(s);
    build.push(performance.now() - start);
    const ref = s.teaching?.reference ?? s.lesson?.references[0];
    const a = {
      acceptedCue: cue,
      sessionId: s.id,
      revision: s.revision,
      epoch: s.epoch,
      activityRevision: s.canvas?.revision ?? 0,
      sourceRevisionId: ref?.sourceRevisionId ?? null,
      sourceHash: ref?.sourceHash ?? null,
      assessment: !!s.task && !s.submission,
      committed: !!s.submission,
    };
    const t = performance.now();
    owner.resolve(
      cue,
      a,
      {
        interaction: 'idle',
        visibility: 'visible',
        paused: false,
        revoked: false,
        reducedMotion: false,
      },
      Date.now(),
      null,
    );
    resolve.push(performance.now() - t);
  }
  const stats = (values: number[]) => {
    values.sort((a, b) => a - b);
    return {
      n: values.length,
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      max: values.at(-1),
    };
  };
  const result = {
    publicSessionId: s.id,
    buildMs: stats(build),
    resolveMs: stats(resolve),
    heapDeltaBytes: process.memoryUsage().heapUsed - before,
    note: 'Loaded local machine, subsystem microbenchmark; not hardware or production qualification. No academic mutation or model call.',
  };
  writeFileSync(process.env.PETROS_M6_PERF_OUTPUT!, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result) + '\n');
}
void main();
