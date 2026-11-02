import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const cases = [
  ['neural', 'Neural learning', 'x1', -1],
  ['rocket', 'Rocket landing', 'dryMass', 2450],
  ['attention', 'Attention', 'tokens', 'the dog chased the ball'],
  ['traffic', 'Traffic waves', 'count', 20],
  ['relativity', 'Time dilation', 'beta', 0.99],
];
const clips = Object.fromEntries(
  await Promise.all(
    cases.map(async ([id]) => [
      id,
      (await readFile(`/tmp/petros-v2-voice-fixtures/${id}.wav`)).toString(
        'base64',
      ),
    ]),
  ),
);
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const results: any[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  // A controllable synthetic microphone is test equipment, not a mocked provider or transcript.
  await context.addInitScript(() => {
    let ctx: AudioContext, dest: MediaStreamAudioDestinationNode;
    navigator.mediaDevices.getUserMedia = async () => {
      ctx = new AudioContext({ sampleRate: 24000 });
      dest = ctx.createMediaStreamDestination();
      await ctx.resume();
      return dest.stream;
    };
    (window as any).__speakTestWav = async (encoded: string) => {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(bytes.buffer),
        source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(dest);
      source.start();
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(40000);
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  await page
    .getByRole('button', { name: 'Connect realtime voice', exact: true })
    .click();
  await page.getByRole('button', { name: /Talk/ }).waitFor();
  for (const [id, label, param, expected] of cases) {
    await page.getByRole('button', { name: new RegExp(String(label)) }).click();
    await page
      .getByRole('button', {
        name: 'Start learning with captions',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Explore freely', exact: true })
      .click();
    await page.getByRole('button', { name: /Talk/ }).click();
    const pending = page.waitForResponse((r) => r.url().endsWith('/teacher'), {
      timeout: 120000,
    });
    await page.evaluate(
      (encoded) => (window as any).__speakTestWav(encoded),
      clips[String(id)],
    );
    const response = await pending,
      body = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(body));
    assert.equal(body.state.params[String(param)], expected);
    await page.getByRole('button', { name: /Mute mic/ }).click();
    await page.waitForFunction(
      () => document.body.textContent?.includes('speaking'),
      undefined,
      { timeout: 45000 },
    );
    await page
      .getByRole('button', { name: 'Interrupt Petros', exact: true })
      .click();
    const state = JSON.parse(
      (await page.locator('#petros-observations').textContent())!,
    );
    results.push({
      topic: id,
      heardQuestion: state.activeQuestion,
      result: body,
      interrupted: true,
      scope:
        'Generated WAV → synthetic browser microphone track → genuine WebRTC/STT → teacher tools → actual simulation → provider speech. No hardware/human speech claim.',
    });
    await writeFile(
      new URL('../evidence/corrective/voice-microphone.json', import.meta.url),
      JSON.stringify(results, null, 2),
    );
    console.log('PASS spoken topic', id);
  }
  await page
    .getByRole('button', { name: 'Disconnect realtime voice', exact: true })
    .click();
  await context.close();
} catch (e) {
  await writeFile(
    new URL(
      '../evidence/corrective/voice-microphone-failure.json',
      import.meta.url,
    ),
    JSON.stringify(
      { error: String(e), completed: results.map((x) => x.topic) },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
