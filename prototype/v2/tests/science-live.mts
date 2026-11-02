import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const p = new URL('../evidence/browser-ai-results.json', import.meta.url),
  results = JSON.parse(await readFile(p, 'utf8')),
  rocket = results.find((x) => x.topic === 'rocket'),
  prior = rocket.followup;
const r = await fetch('http://127.0.0.1:3022/prototype/api/teacher', {
  method: 'POST',
  headers: {
    Origin: 'http://127.0.0.1:3022',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question:
      'Was this rocket ever rising? Explain why it crashed using the recorded velocity history.',
    sim: prior.state,
    scene: prior.scene,
    evidence: [],
    history: [],
    activeQuestion: '',
  }),
});
const data = await r.json();
assert.equal(r.status, 200, JSON.stringify(data));
assert.ok(Math.max(...data.state.history.map((p) => p.b)) < 0);
await writeFile(
  new URL('../evidence/scientific-review-regression.json', import.meta.url),
  JSON.stringify(
    {
      passed: true,
      maximumRecordedVelocity: Math.max(...data.state.history.map((p) => p.b)),
      result: data,
    },
    null,
    2,
  ),
);
rocket.followup = data;
await writeFile(p, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    {
      trajectoryMax: Math.max(...data.state.history.map((p) => p.b)),
      explanation: data.beats.map((b) => b.say),
      question: data.followup,
    },
    null,
    2,
  ),
);
