import { it, expect } from 'vitest';
import { compile, layoutScene, restoreScene } from '../core/scene-compiler';
import { emptyScene } from '../core/scene-ir';
import {
  freshSession,
  parseSession,
  hash,
  lesson,
} from '../core/session-store';
import { policy } from '../core/teacher-policy';
import { BeatScheduler } from '../core/beat-scheduler';
it('rejects unknown pointer IDs and dangling edges atomically', () => {
  const previous = emptyScene();
  for (const commands of [
    [{ op: 'focus_target', targetId: 'missing' }],
    [
      {
        op: 'add',
        sceneId: 'lesson',
        object: { id: 'a', kind: 'node', content: 'a' },
      },
      { op: 'connect', fromId: 'a', toId: 'missing', relation: 'causes' },
    ],
    [{ op: 'eval', code: 'process.exit()' }],
  ]) {
    const r = compile(previous, commands, []);
    expect(r.ok).toBe(false);
    expect(r.scene).toBe(previous);
  }
});
it('known IDs focus without model-supplied coordinates', () => {
  const r = compile(
    emptyScene(),
    [
      { op: 'focus_target', targetId: 'rocket' },
      { op: 'highlight', targetId: 'rocket', mode: 'circle' },
    ],
    ['rocket'],
  );
  expect(r.ok).toBe(true);
  expect(r.scene.focus).toBe('rocket');
});
it('semantic layout has bounded non-overlapping node boxes', () => {
  const r = compile(
    emptyScene(),
    Array.from({ length: 6 }, (_, i) => ({
      op: 'add',
      sceneId: 'lesson',
      object: { id: `n${i}`, kind: 'node', content: 'A meaningful label' },
    })),
    [],
  );
  expect(r.ok).toBe(true);
  const nodes = layoutScene(r.scene);
  for (const a of nodes) {
    expect(a.x + a.width).toBeLessThanOrEqual(720);
    for (const b of nodes)
      if (a !== b)
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true);
  }
});
it('validates restored scene', () => {
  expect(() =>
    restoreScene({ ...emptyScene(), focus: 'unknown' }, []),
  ).toThrow();
});
it('classic/world and topic memories survive restore', () => {
  const s = freshSession();
  s.mode = 'world';
  s.topics.rocket = lesson('rocket');
  s.topics.rocket.sim.params.dryMass = 2000;
  s.active = 'rocket';
  expect(parseSession(JSON.stringify(s))).toEqual(s);
  expect(hash(s)).toBe(hash(s));
});
it('wrong answers change policy and do not infer mastery', () => {
  const p = policy([
    {
      question: 'Q',
      answer: 'wrong',
      assessment: 'wrong',
      move: 'diagnose',
      assistance: 0,
      at: 0,
    },
  ]);
  expect(p.allowedMoves).toContain('change_representation');
  expect(p.requireFreshTransfer).toBe(true);
  expect(p.mastery).toBe('not_assessed');
});
it('cancellation prevents stale beats', async () => {
  const scheduler = new BeatScheduler(),
    committed: string[] = [];
  let finish: () => void = () => {};
  const run = scheduler.play(
    [
      { say: 'first', do: [] },
      { say: 'obsolete', do: [] },
    ],
    (b) => committed.push(b.say),
    () => new Promise<void>((r) => (finish = r)),
  );
  scheduler.cancel();
  finish();
  await run;
  expect(committed).toEqual(['first']);
});
it('mobile explanation layout stacks complete readable nodes without horizontal scrolling', () => {
  const r = compile(
    emptyScene(),
    Array.from({ length: 6 }, (_, i) => ({
      op: 'add',
      sceneId: 'lesson',
      object: {
        id: `node${i}`,
        kind: 'node',
        content:
          'A complete explanatory sentence that must stay inside the mobile diagram',
      },
    })),
    [],
  );
  const nodes = layoutScene(r.scene, 360, true);
  expect(nodes.every((n) => n.x + n.width <= 360 && n.width >= 290)).toBe(true);
  expect(new Set(nodes.map((n) => n.y)).size).toBe(6);
});
