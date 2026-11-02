import { readFile, writeFile, mkdir } from 'node:fs/promises';
const lines = await readFile(
  new URL('../../../.env', import.meta.url),
  'utf8',
).catch(() => '');
const key =
  process.env.OPENAI_API_KEY ??
  lines
    .split('\n')
    .find((s) => s.startsWith('OPENAI_API_KEY='))
    ?.slice('OPENAI_API_KEY='.length)
    .trim()
    .replace(/^['"]|['"]$/g, '');
if (!key)
  throw Error('Set server-side OPENAI_API_KEY to generate test speech.');
export const questions = {
  neural: 'Set the first input to negative one and explain what changed.',
  rocket: 'Double the rocket mass and show how the landing changes.',
  attention: 'Replace the noun cat with dog. What changed?',
  traffic: 'Brake one car and point to the jam front.',
  relativity:
    'Set the speed to zero point nine nine c. How do the two clocks compare?',
};
await mkdir('/tmp/petros-v2-voice-fixtures', { recursive: true });
for (const [topic, input] of Object.entries(questions)) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input,
      response_format: 'pcm',
    }),
  });
  if (!r.ok) throw Error('Test speech provider failed: ' + r.status);
  const pcm = Buffer.from(await r.arrayBuffer()),
    wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  await writeFile(`/tmp/petros-v2-voice-fixtures/${topic}.wav`, wav);
  console.log('Generated synthetic test input:', topic);
}
// One real browser microphone track permits all five topics within a single capped voice session.
const timeline = Buffer.alloc(215 * 24000 * 2);
let header: Buffer | undefined;
for (const [i, topic] of Object.keys(questions).entries()) {
  const wav = await readFile(`/tmp/petros-v2-voice-fixtures/${topic}.wav`);
  header ??= Buffer.from(wav.subarray(0, 44));
  wav.subarray(44).copy(timeline, (12 + i * 45) * 24000 * 2);
}
const combined = Buffer.concat([header!, timeline]);
combined.writeUInt32LE(36 + timeline.length, 4);
combined.writeUInt32LE(timeline.length, 40);
await writeFile('/tmp/petros-five-voice.wav', combined);
console.log(
  'Prepared timed five-topic microphone input (AI-generated test speech).',
);
