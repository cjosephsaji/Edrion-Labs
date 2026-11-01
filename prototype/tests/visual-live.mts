/** Public-topic integration check; never prints credentials or uploads private sources. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateTopic } from '../teaching/topic-provider';
import { validTopicLesson } from '../teaching/topic-content';
if (process.env.PETROS_LIVE_TOPIC_TEST !== '1')
  throw Error('Set PETROS_LIVE_TOPIC_TEST=1 to permit one live generation request.');
const require = createRequire(new URL('../../apps/student-web/package.json', import.meta.url));
require('@next/env').loadEnvConfig(
  fileURLToPath(new URL('../../apps/student-web', import.meta.url)),
);
const dir = 'evidence/visual-learning';
await mkdir(dir, { recursive: true });
const started = Date.now();
try {
  const lesson = await generateTopic(
    'Tectonic plates: lithosphere layers, slow plate movement, all three boundary types and a geological investigation. Use four concepts.',
  );
  if (!validTopicLesson(lesson))
    throw Error('Generated lesson failed the client validation boundary.');
  await writeFile(`${dir}/live-generated-tectonics.json`, JSON.stringify(lesson, null, 2));
  const result = {
    liveProviderCall: true,
    status: 'passed',
    elapsedMs: Date.now() - started,
    concepts: lesson.questions.length,
    visuals: lesson.questions.map((q) => ({
      type: q.teaching!.diagram.visual!.type,
      view: 'view' in q.teaching!.diagram.visual! ? (q.teaching!.diagram.visual as any).view : null,
    })),
  };
  await writeFile(`${dir}/live-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  const result = {
    liveProviderCall: true,
    status: 'failed',
    elapsedMs: Date.now() - started,
    code: (e as any).code,
    error: (e as Error).message,
  };
  await writeFile(`${dir}/live-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}
