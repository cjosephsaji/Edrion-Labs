import { afterEach, expect, it, vi } from 'vitest';
import {
  preparedAnswer,
  preparedQuestions,
  matchPreparedQuestion,
} from '../core/prepared-answers';
import { lessonModel } from '../core/teaching';
import { compile } from '../core/scene-compiler';
import { emptyScene } from '../core/scene-ir';
import {
  TOPICS,
  initial,
  invariants,
  namedAnchors,
  observe,
} from '../simulations/runtime';
import { handleV2 } from '../server/handler';
import { prototypeFeatures } from '../core/prototype-features';
import { Narrator } from '../core/narration';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(TOPICS)(
  '%s prepared questions preserve the source and commit valid live graphics',
  (topic) => {
    for (const q of preparedQuestions[topic]) {
      const source = lessonModel(topic),
        saved = structuredClone(source);
      const answer = preparedAnswer(q.question, source);
      expect(answer.questionId).toBe(q.id);
      expect(source).toEqual(saved);
      expect(invariants(answer.sim).ok).toBe(true);
      expect(
        compile(
          emptyScene(),
          answer.beat.visualCommands,
          namedAnchors(answer.sim),
        ).ok,
      ).toBe(true);
      expect(answer.beat.say).not.toMatch(/NaN|undefined/);
    }
  },
);
it('demonstrations use the real training, mass, mask and time calculations', () => {
  const train = preparedAnswer('Train one step', lessonModel('neural'));
  expect(observe(train.sim).loss).toBeCloseTo(1.62);
  const heavy = preparedAnswer('Double the mass', initial('rocket'));
  expect(observe(heavy.sim).mass).toBe(2900);
  expect(observe(heavy.sim).fuel).toBe(450);
  const masked = preparedAnswer(
    'What is a causal mask?',
    initial('attention', { causal: false }),
  );
  expect(masked.sim.params).toMatchObject({ query: 0, causal: true });
  expect(observe(masked.sim).primary).toBe(1);
  const clocks = preparedAnswer(
    'At 0.99c, how much time passes?',
    initial('relativity', { duration: 20 }),
  );
  expect(observe(clocks.sim).shipSeconds).toBeCloseTo(20 / 7.088812050083354);
  const braking = preparedAnswer('Brake one car', initial('traffic'));
  expect(braking.sim.time).toBeCloseTo(2);
});
it('handles the full network, missing words and mass limits without inventing changes', () => {
  const network = preparedAnswer('Make the input negative', initial('neural'));
  expect(network.beat.say).toContain('full tanh network');
  const source = initial('attention', { tokens: 'hello world' });
  const missing = preparedAnswer('Replace cat with dog', source);
  expect(missing.sim).toEqual(source);
  expect(missing.beat.say).toContain('left it unchanged');
  const heavy = initial('rocket', { dryMass: 10000 });
  expect(preparedAnswer('Double the mass', heavy).sim).toEqual(heavy);
});
it.each(TOPICS)(
  '%s unknown or negated requests offer the supported questions without changing the model',
  (topic) => {
    const source = lessonModel(topic);
    const unknown = preparedAnswer('Please explain quantum biology', source);
    expect(unknown.questionId).toBeNull();
    expect(unknown.sim).toEqual(source);
    expect(unknown.beat.say).toContain('Choose one of the prepared questions');
    expect(matchPreparedQuestion(topic, 'Do not double the mass')).toBeNull();
  },
);
it.each(['teacher', 'speech', 'voice'])(
  'paused %s endpoint cannot contact a provider even with a configured key',
  async (action) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-secret');
    expect(prototypeFeatures.liveAI).toBe(false);
    const response = await handleV2(
      new Request(`http://127.0.0.1:3022/prototype/api/${action}`, {
        method: 'POST',
        headers: { host: '127.0.0.1:3022', origin: 'http://127.0.0.1:3022' },
        body: '{}',
      }),
      [action],
      'test',
    );
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('AI_PAUSED');
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('read aloud goes straight to device narration while AI is paused', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  class Utterance {
    lang = '';
    rate = 1;
    onstart?: () => void;
    onend?: () => void;
    onerror?: () => void;
    constructor(public text: string) {}
  }
  const spoken: string[] = [],
    statuses: string[] = [];
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('speechSynthesis', {
    cancel() {},
    getVoices: () => [{}],
    speak(u: Utterance) {
      spoken.push(u.text);
      queueMicrotask(() => {
        u.onstart?.();
        u.onend?.();
      });
    },
  });
  await new Narrator().speak('/prototype/api', 'Prepared explanation.', (s) =>
    statuses.push(s),
  );
  expect(spoken).toEqual(['Prepared explanation.']);
  expect(statuses).toEqual(['loading', 'speaking', 'ready']);
  expect(fetch).not.toHaveBeenCalled();
});
