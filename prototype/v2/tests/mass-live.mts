import { initial } from '../simulations/runtime';
import { emptyScene } from '../core/scene-ir';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const r = await fetch('http://127.0.0.1:3022/prototype/api/teacher', {
  method: 'POST',
  headers: {
    Origin: 'http://127.0.0.1:3022',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question:
      'Double the rocket total mass and compare the landing against the original mass by running both for six seconds.',
    sim: initial('rocket'),
    scene: emptyScene(),
    evidence: [],
    history: [],
    activeQuestion: '',
  }),
});
const data = await r.json();
assert.equal(r.status, 200, JSON.stringify(data));
assert.equal(data.state.params.dryMass, 2450);
const experiment = data.events.find((e) => e.tool === 'sim_experiment');
assert.ok(experiment?.baseline);
assert.ok(experiment.baseline.mass < experiment.after.mass);
assert.ok(
  Math.abs(experiment.baseline.velocity) < Math.abs(experiment.after.velocity),
);
await writeFile(
  new URL('../evidence/mass-comparison-regression.json', import.meta.url),
  JSON.stringify({ passed: true, result: data }, null, 2),
);
console.log(
  JSON.stringify(
    {
      beforeQuestionBaseline: experiment.baseline,
      heavy: experiment.after,
      explanation: data.beats.map((b) => b.say),
    },
    null,
    2,
  ),
);
