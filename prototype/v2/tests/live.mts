import { initial, topicInfo, TOPICS, observe } from '../simulations/runtime';
import { emptyScene } from '../core/scene-ir';
import { writeFile, mkdir } from 'node:fs/promises';
const base = process.env.PETROS_V2_URL ?? 'http://127.0.0.1:3022';
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
const results = [];
for (const id of TOPICS) {
  const started = Date.now(),
    sim = initial(id),
    question = topicInfo[id].prompt;
  const response = await fetch(base + '/prototype/api/teacher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({
      question,
      sim,
      scene: emptyScene(),
      evidence: [],
      history: [],
      activeQuestion: '',
    }),
  });
  const data = await response.json();
  results.push({
    topic: id,
    status: response.status,
    elapsedMs: Date.now() - started,
    before: observe(sim),
    ...data,
  });
  console.log(
    id,
    response.status,
    Date.now() - started,
    JSON.stringify(
      response.ok
        ? {
            params: data.state.params,
            tools: data.events,
            beats: data.beats,
            followup: data.followup,
          }
        : data,
    ),
  );
  await writeFile(
    new URL('../evidence/live-ai.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
  if (!response.ok) break;
}
