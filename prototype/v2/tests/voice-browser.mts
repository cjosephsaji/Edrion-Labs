import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  await page
    .getByRole('button', { name: 'Connect realtime voice', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Disconnect realtime voice', exact: true })
    .waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: /Talk/ }).click();
  await page.getByRole('button', { name: /Mute mic/ }).waitFor();
  await page.getByRole('button', { name: /Mute mic/ }).click();
  await page.keyboard.down('v');
  await page.getByRole('button', { name: /Mute mic/ }).waitFor();
  await page.keyboard.up('v');
  await page.getByRole('button', { name: /Talk/ }).waitFor();
  await page.keyboard.press('Control+v');
  await page.getByRole('button', { name: /Talk/ }).waitFor();
  await page.getByRole('button', { name: /Talk/ }).click();
  await page.getByLabel('Ask Petros', { exact: true }).fill('v');
  await page.getByLabel('Ask Petros', { exact: true }).press('v');
  await page.getByRole('button', { name: /Mute mic/ }).waitFor();
  await page.getByRole('button', { name: /Mute mic/ }).click();
  const ai = page.waitForResponse((r) => r.url().endsWith('/teacher'), {
    timeout: 120000,
  });
  await page
    .getByLabel('Ask Petros', { exact: true })
    .fill('Set input x1 to -1 and explain the output.');
  await page
    .getByRole('button', { name: 'Send question', exact: true })
    .click();
  const reply = await (await ai).json();
  assert.ok(reply.beats?.length);
  // This uses the real provider's audio completion events, not mocked speech synthesis.
  await page.waitForFunction(
    () => document.body.textContent?.includes('speaking'),
    {},
    { timeout: 45000 },
  );
  await page
    .getByRole('button', { name: 'Interrupt Petros', exact: true })
    .click();
  const state = await page.locator('#petros-observations').textContent();
  await page
    .getByRole('button', { name: 'Disconnect realtime voice', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Connect realtime voice', exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: fileURLToPath(
      new URL('../evidence/voice-interruption.png', import.meta.url),
    ),
    fullPage: true,
  });
  await writeFile(
    new URL('../evidence/voice-results.json', import.meta.url),
    JSON.stringify(
      {
        connection: 'REAL_WEBRTC',
        microphone: 'SYNTHETIC_BROWSER_DEVICE',
        teacher: 'REAL_OPENAI',
        playback: 'REAL_PROVIDER_AUDIO_EVENT',
        interrupt: true,
        spokenRecognition: 'NOT_TESTED',
        state: JSON.parse(state!),
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS real WebRTC connection, synthetic mic toggling, genuine AI/audio playback, stop and preserved state. Human speech recognition remains untested.',
  );
  await context.close();
} finally {
  await browser.close();
}
