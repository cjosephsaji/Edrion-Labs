import { afterEach, describe, expect, it, vi } from 'vitest';
import { integrals } from '../lessons/integrals';
import { preparedTopic } from '../teaching/topic-catalog';
import {
  integralArea,
  makeTopicLesson,
  validOutline,
  validTopicLesson,
} from '../teaching/topic-content';
import {
  initialState,
  selectLesson,
  practice,
  interrupt,
  resume,
} from '../teaching/controller';
import {
  goToCheckpoint,
  teachAction,
  currentQuestion,
  continueCheckpoint,
} from '../teaching/checkpoint';
import { restoreSession, serializeSession } from '../teaching/persistence';
import { resolveLesson } from '../teaching/lesson-registry';
import { generateTopic, answerTopicQuestion } from '../teaching/topic-provider';
import { handleShowcase } from '../teaching/server';
import { topicOutlineFixture } from './fixtures/topic-outline';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const start = () =>
  goToCheckpoint(selectLesson(initialState, integrals, null), integrals, 0);
const request = (topic: unknown, origin = 'http://localhost:3022') =>
  new Request('http://localhost:3022/prototype/api/topic', {
    method: 'POST',
    headers: {
      host: 'localhost:3022',
      origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ topic }),
  });
function local() {
  vi.stubEnv('PETROS_SHOWCASE_ENABLED', '1');
  vi.stubEnv('PETROS_SHOWCASE_LOCAL_ONLY', '1');
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('OPENAI_API_KEY', '');
}
describe('complete topic learning workflow', () => {
  it('recognizes the requested integrals lesson without routing unrelated questions to it', () => {
    expect(preparedTopic(' How do integrals work? ')).toBe(integrals);
    expect(preparedTopic('integrals')).toBe(integrals);
    expect(preparedTopic('continuous integration')).toBeNull();
    expect(preparedTopic('How does photosynthesis work?')).toBeNull();
    expect(validTopicLesson(integrals)).toBe(true);
  });
  it('computes real left-endpoint sums that approach the exact integral', () => {
    expect(integralArea({ slope: 1, upper: 2, slices: 4 })).toEqual({
      exact: 2,
      left: 1.5,
    });
    expect(integralArea({ slope: 1, upper: 2, slices: 32 })).toEqual({
      exact: 2,
      left: 1.9375,
    });
    expect(integralArea({ slope: 3, upper: 4, slices: 32 })).toEqual({
      exact: 24,
      left: 23.25,
    });
  });
  it('reteaches a mistake, checks a different application, and requires explicit continuation', () => {
    let s = teachAction(
      teachAction(start(), integrals, 'demonstrate'),
      integrals,
      'check',
    );
    const id = s.questionId;
    expect(continueCheckpoint(s, integrals).questionId).toBe(id);
    s = practice(
      { ...s, studentResponse: integrals.questions[0]!.options[1]! },
      integrals.questions[0]!,
    );
    expect(s.teaching.status).toBe('RETEACHING');
    expect(s.questionId).toBe(id);
    expect(s.completion[id!]).toBeUndefined();
    s = teachAction(s, integrals, 'check');
    const fresh = currentQuestion(s, integrals);
    expect(fresh.task).not.toBe(integrals.questions[0]!.task);
    s = practice(
      { ...s, studentResponse: fresh.correct[0]! },
      integrals.questions[0]!,
    );
    expect(s.teaching.status).toBe('READY_TO_CONTINUE');
    expect(s.questionId).toBe(id);
    expect(s.observations[id!]!.responses.map((r) => r.validation)).toEqual([
      'incorrect',
      'correct',
    ]);
    expect(continueCheckpoint(s, integrals).questionId).toBe(
      integrals.questions[1]!.id,
    );
  });
  it('preserves the topic, diagram, draft and observations through help, mode change and refresh', () => {
    let s = { ...start(), studentResponse: 'draft', mode: 'world' as const };
    if (s.visualState.kind === 'topic')
      s = {
        ...s,
        visualState: {
          ...s.visualState,
          area: { slope: 2, upper: 3, slices: 16 },
        },
      };
    const paused = interrupt(s, '');
    expect(resume(paused).visualState).toEqual(s.visualState);
    const restored = restoreSession(serializeSession(paused));
    expect(restored?.topicLesson).toEqual(integrals);
    expect(resolveLesson(restored!)?.title).toBe(integrals.title);
    expect(restored?.studentResponse).toBe('draft');
    expect(resume(restored!).visualState).toEqual(s.visualState);
  });
  it('rejects broken plans, duplicate options and malformed recovered diagrams', () => {
    const bad = structuredClone(topicOutlineFixture);
    bad.steps[0]!.followup.task = bad.steps[0]!.check.task;
    expect(validOutline(bad)).toBe(false);
    const lesson = structuredClone(integrals);
    lesson.questions[0]!.options[1] = lesson.questions[0]!.options[0]!;
    expect(validTopicLesson(lesson)).toBe(false);
    expect(
      restoreSession(
        serializeSession({
          ...start(),
          visualState: {
            kind: 'topic',
            heading: 'invalid',
            labels: [],
            caption: 'invalid',
          },
        }),
      ),
    ).toBeNull();
  });
});
describe('topic provider and API boundary', () => {
  it('serves integrals locally with the real endpoint and no model call', async () => {
    local();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await handleShowcase(request('How do integrals work?'), [
      'topic',
    ]);
    expect(result.status).toBe(200);
    expect(validTopicLesson((await result.json()).lesson)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('leaves an unconfigured provider off and returns a visible actionable error', async () => {
    local();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await handleShowcase(
      request('How does photosynthesis work?'),
      ['topic'],
    );
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe('MODEL_NOT_CONFIGURED');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['', 'x', 'x'.repeat(241), 42])(
    'rejects invalid topic input before a provider call: %s',
    async (topic) => {
      local();
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect((await handleShowcase(request(topic), ['topic'])).status).toBe(
        400,
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('retains the feature and same-origin boundaries', async () => {
    local();
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '0');
    expect((await handleShowcase(request('integrals'), ['topic'])).status).toBe(
      404,
    );
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '1');
    expect(
      (
        await handleShowcase(
          request('integrals', 'https://elsewhere.example'),
          ['topic'],
        )
      ).status,
    ).toBe(403);
  });
  it('builds a complete lesson from a structured provider response without storing conversations', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://provider.example/v1');
    vi.stubEnv('PETROS_TOPIC_MODEL', 'gpt-5.4-mini');
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify(topicOutlineFixture),
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const lesson = await generateTopic('How does photosynthesis work?');
    expect(validTopicLesson(lesson)).toBe(true);
    expect(lesson.questions).toHaveLength(4);
    expect(lesson.origin).toBe('generated');
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.type).toBe('json_schema');
    const state = goToCheckpoint(
      selectLesson(initialState, lesson, null),
      lesson,
      0,
    );
    expect(state.inputOrigin).toBe('live_open_topic');
    expect(restoreSession(serializeSession(state))?.topicLesson).toEqual(
      lesson,
    );
  });
  it.each([
    { status: 'incomplete', output: [] },
    {
      status: 'completed',
      output: [{ content: [{ type: 'refusal', refusal: 'No' }] }],
    },
    { status: 'completed', output_text: '{"title":"not a lesson"}' },
  ])(
    'does not open an incomplete/refused/malformed lesson',
    async (payload) => {
      vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
      await expect(generateTopic('A new topic')).rejects.toThrow();
    },
  );
  it('sanitizes provider authentication failures', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('private provider diagnostic', { status: 401 }),
        ),
    );
    await expect(generateTopic('A new topic')).rejects.toMatchObject({
      code: 'MODEL_AUTH_FAILED',
      status: 503,
    });
  });
  it.each(['lesson', 'answer'])(
    'identifies a pasted key ID before an OpenAI %s request without exposing its value',
    async (kind) => {
      vi.stubEnv('OPENAI_API_KEY', 'key_metadata_test_identifier');
      vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1/');
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const result =
        kind === 'lesson'
          ? generateTopic('A new topic')
          : answerTopicQuestion({ question: 'Why?' });
      await expect(result).rejects.toMatchObject({
        code: 'MODEL_KEY_ID',
        status: 503,
        message: expect.stringContaining('not the secret API key'),
      });
      await expect(result).rejects.not.toThrow('key_metadata_test_identifier');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('keeps custom Responses-compatible provider credential formats supported', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'key_custom_provider_credential');
    vi.stubEnv('OPENAI_BASE_URL', 'https://provider.example/v1');
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status: 'completed',
        output_text: JSON.stringify(topicOutlineFixture),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(validTopicLesson(await generateTopic('A new topic'))).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('answers contextual questions through the isolated connector without returning progression commands', async () => {
    local();
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        status: 'completed',
        output_text: JSON.stringify({
          answer: 'A provider fixture explanation.',
          advance: true,
        }),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const lesson = makeTopicLesson(
      topicOutlineFixture,
      'generated',
      'topic-question-fixture',
    );
    const r = new Request('http://localhost:3022/prototype/api/ask', {
      method: 'POST',
      headers: {
        host: 'localhost:3022',
        origin: 'http://localhost:3022',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessonId: lesson.id,
        topicLesson: lesson,
        questionId: lesson.questions[0]!.id,
        questionText: 'Why does light matter?',
        visual: { kind: 'topic', ...lesson.questions[0]!.teaching!.diagram },
        teaching: { status: 'AWAITING_RESPONSE' },
        previousResponse: 'An earlier answer',
      }),
    });
    const response = await handleShowcase(r, ['ask']);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      answer: 'A provider fixture explanation.',
    });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.store).toBe(false);
    expect(body.text.format.name).toBe('petros_topic_answer');
    expect(JSON.parse(body.input).currentTask).toBe(lesson.questions[0]!.task);
  });
  it('keeps contextual live questions disabled with a blank key and rejects empty provider answers', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      answerTopicQuestion({ question: 'Why?' }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_CONFIGURED' });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-real-key');
    fetch.mockResolvedValue(
      Response.json({ status: 'completed', output_text: '{"answer":""}' }),
    );
    await expect(
      answerTopicQuestion({ question: 'Why?' }),
    ).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
  });
  it('offers an honestly labelled offline hint using the current integral parameters', async () => {
    local();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const r = new Request('http://localhost:3022/prototype/api/ask', {
      method: 'POST',
      headers: {
        host: 'localhost:3022',
        origin: 'http://localhost:3022',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lessonId: integrals.id,
        topicLesson: integrals,
        questionId: integrals.questions[0]!.id,
        questionText: 'Explain this model',
        visual: {
          kind: 'topic',
          ...integrals.questions[0]!.teaching!.diagram,
          area: { slope: 2, upper: 3, slices: 16 },
        },
      }),
    });
    const response = await handleShowcase(r, ['ask']);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.live).toBe(false);
    expect(data.label).toBe('Prepared mathematics explanation');
    expect(data.answer).toContain('8.4375');
    expect(data.answer).toContain('exact integral is 9');
    expect(fetch).not.toHaveBeenCalled();
  });
});
