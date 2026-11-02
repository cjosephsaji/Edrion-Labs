import { it, expect } from 'vitest';
import { RealtimeVoice } from '../core/voice-provider';
it('unfinished speech is combined with its continuation after interruption', async () => {
  const received: string[] = [];
  let resolveFirst: (v: null) => void = () => {};
  const voice = new RealtimeVoice('/api', {
    status: () => {},
    transcript: () => {},
    interrupt: () => {},
    ready: () => {},
    error: () => {},
    question: async (q) => {
      received.push(q);
      if (received.length === 1)
        return new Promise<null>((r) => (resolveFirst = r));
      return { beats: [], observations: {} };
    },
  });
  const first = voice.event({
    type: 'response.function_call_arguments.done',
    name: 'teach',
    call_id: 'first',
    arguments: JSON.stringify({ question: 'Replace cat with dog.' }),
  });
  voice.interrupt();
  resolveFirst(null);
  await first;
  await voice.event({
    type: 'response.function_call_arguments.done',
    name: 'teach',
    call_id: 'second',
    arguments: JSON.stringify({ question: 'What changed?' }),
  });
  expect(received[1]).toBe('Replace cat with dog.\nWhat changed?');
  await voice.event({
    type: 'response.function_call_arguments.done',
    name: 'teach',
    call_id: 'third',
    arguments: JSON.stringify({ question: 'Now explain the mask.' }),
  });
  expect(received[2]).toBe('Now explain the mask.');
});
it('explicit topic navigation forgets an unfinished voice request', async () => {
  const received: string[] = [];
  const voice = new RealtimeVoice('/api', {
    status: () => {},
    transcript: () => {},
    interrupt: () => {},
    ready: () => {},
    error: () => {},
    question: async (q) => {
      received.push(q);
      return null;
    },
  });
  await voice.event({
    type: 'response.function_call_arguments.done',
    name: 'teach',
    call_id: 'one',
    arguments: JSON.stringify({ question: 'Change the rocket.' }),
  });
  voice.interrupt(true);
  await voice.event({
    type: 'response.function_call_arguments.done',
    name: 'teach',
    call_id: 'two',
    arguments: JSON.stringify({ question: 'Explain neural learning.' }),
  });
  expect(received[1]).toBe('Explain neural learning.');
});
it('late cancelled audio completion cannot release the next teaching beat', async () => {
  const sent: any[] = [];
  const voice = new RealtimeVoice('/api', {
    status: () => {},
    transcript: () => {},
    interrupt: () => {},
    ready: () => {},
    error: () => {},
    question: async () => null,
  });
  (voice as any).dc = {
    readyState: 'open',
    send: (s: string) => sent.push(JSON.parse(s)),
  };
  const firstAbort = new AbortController();
  const first = voice.speak('first', firstAbort.signal).catch(() => {});
  const one = sent.at(-1).response.metadata.petros_beat;
  await voice.event({
    type: 'response.created',
    response: { id: 'one', metadata: { petros_beat: one } },
  });
  firstAbort.abort();
  await first;
  let completed = false;
  const second = voice
    .speak('second', new AbortController().signal)
    .then(() => {
      completed = true;
    });
  const two = sent.at(-1).response.metadata.petros_beat;
  await voice.event({
    type: 'response.created',
    response: { id: 'two', metadata: { petros_beat: two } },
  });
  await voice.event({
    type: 'output_audio_buffer.stopped',
    response_id: 'one',
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  await voice.event({
    type: 'output_audio_buffer.stopped',
    response_id: 'two',
  });
  await second;
  expect(completed).toBe(true);
});
