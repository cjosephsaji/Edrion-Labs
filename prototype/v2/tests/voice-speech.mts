import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Generated test speech travels through the real microphone/WebRTC/transcription/tool path.
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=/tmp/petros-voice-padded.wav',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: /Time dilation/ }).click();
  await page
    .getByRole('button', { name: 'Connect realtime voice', exact: true })
    .click();
  await page.getByRole('button', { name: /Talk/ }).waitFor({ timeout: 45000 });
  const request = page.waitForResponse((r) => r.url().endsWith('/teacher'), {
    timeout: 90000,
  });
  await page.getByRole('button', { name: /Talk/ }).click();
  const response = await request;
  const result = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(result));
  assert.equal(result.state.params.beta, 0.99);
  await page.getByRole('button', { name: /Mute mic/ }).click();
  await page.waitForFunction(
    () => document.body.textContent?.includes('speaking'),
    {},
    { timeout: 45000 },
  );
  await page
    .getByRole('button', { name: 'Interrupt Petros', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Disconnect realtime voice', exact: true })
    .click();
  await writeFile(
    new URL('../evidence/voice-speech-results.json', import.meta.url),
    JSON.stringify(
      {
        input: 'AI_GENERATED_TEST_SPEECH',
        path: 'WAV → browser microphone → real WebRTC → provider transcription → teach tool → numerical model → real provider audio',
        passed: true,
        result,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: spoken .99c question → genuine speech transcription → backend teaching → changed model → audio response.',
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      const state = await page
        .locator('#petros-observations')
        .textContent()
        .catch(() => null);
      await writeFile(
        new URL('../evidence/voice-speech-failure.json', import.meta.url),
        JSON.stringify(
          {
            error: String(error),
            state: state ? JSON.parse(state) : null,
            body: await page.locator('body').innerText(),
          },
          null,
          2,
        ),
      );
    }
  throw error;
} finally {
  await browser.close();
}
