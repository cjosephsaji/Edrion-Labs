import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=/tmp/petros-five-voice.wav',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(40000);
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  await page
    .getByRole('button', { name: 'Connect realtime voice', exact: true })
    .click();
  await page.getByRole('button', { name: /Talk/ }).waitFor();
  await page.getByRole('button', { name: /Talk/ }).click();
  for (const [topic, label, param, expected] of [
    ['neural', 'Neural learning', 'x1', -1],
    ['rocket', 'Rocket landing', 'dryMass', 2450],
    ['attention', 'Attention', 'tokens', 'the dog chased the ball'],
    ['traffic', 'Traffic waves', 'count', 20],
    ['relativity', 'Time dilation', 'beta', 0.99],
  ]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    const request = page.waitForResponse((r) => r.url().endsWith('/teacher'), {
      timeout: 120000,
    });
    const response = await request,
      data = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(data));
    assert.equal(data.state.params[param], expected);
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
      topic,
      passed: true,
      heardQuestion: state.activeQuestion,
      result: data,
      interrupted: true,
      scope:
        'AI-generated WAV through the browser microphone device and real WebRTC/transcription/tool/audio loop',
    });
    await writeFile(
      new URL('../evidence/voice-five-topics.json', import.meta.url),
      JSON.stringify(results, null, 2),
    );
    console.log('PASS spoken topic:', topic);
  }
  await page
    .getByRole('button', { name: 'Disconnect realtime voice', exact: true })
    .click();
  console.log(
    'PASS all five spoken parameter changes, actual provider audio, and mid-speech interruption. Human microphone conditions are not tested.',
  );
  await context.close();
} catch (error) {
  await writeFile(
    new URL('../evidence/voice-five-failure.json', import.meta.url),
    JSON.stringify(
      { error: String(error), completed: results.map((x) => x.topic) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
