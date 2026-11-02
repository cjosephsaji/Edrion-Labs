import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const results: any[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).__audioSamples = [];
    (window as any).Audio = function (src?: string) {
      const audio = new NativeAudio(src);
      audio.addEventListener(
        'playing',
        () => {
          const ctx = new AudioContext(),
            source = ctx.createMediaElementSource(audio),
            analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          void ctx.resume();
          const timer = setInterval(() => {
            const a = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(a);
            const rms = Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
            (window as any).__audioSamples.push({
              rms,
              at: Date.now(),
              text: document.querySelector('[data-phase]')?.textContent,
            });
          }, 100);
          audio.addEventListener(
            'ended',
            () => {
              clearInterval(timer);
              void ctx.close();
            },
            { once: true },
          );
          audio.addEventListener(
            'emptied',
            () => {
              clearInterval(timer);
              void ctx.close();
            },
            { once: true },
          );
        },
        { once: true },
      );
      return audio;
    } as any;
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto('http://127.0.0.1:3022/prototype');
  await page.locator('#petros-observations').waitFor({ state: 'attached' });
  for (const [i, label] of [
    'Neural learning',
    'Rocket landing',
    'Attention',
    'Traffic waves',
    'Time dilation',
  ].entries()) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    const before = await page.evaluate(
      () => (window as any).__audioSamples.length,
    );
    const speech = page.waitForResponse((r) => r.url().endsWith('/speech'));
    await page
      .getByRole('button', { name: 'Start with voice →', exact: true })
      .click();
    assert.equal((await speech).status(), 200);
    await page.waitForFunction(
      (n) =>
        (window as any).__audioSamples.slice(n).some((s: any) => s.rms > 0.005),
      before,
    );
    const samples = await page.evaluate(
      (n) => (window as any).__audioSamples.slice(n),
      before,
    );
    await page
      .getByRole('button', { name: 'Pause Petros', exact: true })
      .click();
    const state = JSON.parse(
      (await page.locator('#petros-observations').textContent())!,
    );
    await page.waitForTimeout(500);
    assert.equal(
      JSON.parse((await page.locator('#petros-observations').textContent())!)
        .guide.phase,
      'ORIENT',
    );
    assert.equal(state.guide.phase, 'ORIENT');
    assert.ok(samples.some((x: any) => x.rms > 0.005));
    // An explicit new learner action replaces the interrupted opening. Both visuals and caption follow it.
    await page
      .getByRole('button', { name: 'Continue with Petros →', exact: true })
      .click();
    await page.waitForFunction(() =>
      document.body.textContent?.includes('speaking'),
    );
    await page
      .getByRole('button', { name: 'Pause Petros', exact: true })
      .click();
    await page.screenshot({
      path: fileURLToPath(
        new URL(`../evidence/corrective/voice-${i}.png`, import.meta.url),
      ),
      fullPage: true,
    });
    results.push({
      topic: label,
      providerSpeech: true,
      decodedAudibleSignal: true,
      peakRMS: Math.max(...samples.map((s: any) => s.rms)),
      caption: samples.find((s: any) => s.rms > 0.005)?.text,
      interrupted: true,
      noStaleAdvance: true,
    });
    console.log('PASS real audible narration', label);
  }
  await writeFile(
    new URL('../evidence/corrective/voice-output.json', import.meta.url),
    JSON.stringify(
      {
        results,
        scope:
          'Real provider MP3 decoded and played in the browser, measured through Web Audio. Hardware speakers and human microphone conditions require human acceptance.',
      },
      null,
      2,
    ),
  );
  await context.close();
} catch (e) {
  await writeFile(
    new URL('../evidence/corrective/voice-failure.json', import.meta.url),
    JSON.stringify({ error: String(e), results }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
