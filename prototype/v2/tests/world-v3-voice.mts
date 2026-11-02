import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
// Local OS speech fixture only. No provider request and no shipped voice asset.
const exec = promisify(execFile),
  browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
const results: any[] = [];
await mkdir('/tmp/petros-world-speech', { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 900 : 844 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    let exactText = '';
    await page.route('**/prototype/api/speech', async (route) => {
      exactText = route.request().postDataJSON().text;
      const id = createHash('sha256')
          .update(exactText)
          .digest('hex')
          .slice(0, 12),
        base = '/tmp/petros-world-speech/' + id;
      try {
        await readFile(base + '.wav');
      } catch {
        await exec('/usr/bin/say', [
          '-r',
          '150',
          '-o',
          base + '.aiff',
          exactText,
        ]);
        await exec('/usr/bin/afconvert', [
          '-f',
          'WAVE',
          '-d',
          'LEI16',
          base + '.aiff',
          base + '.wav',
        ]);
      }
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: await readFile(base + '.wav'),
      });
    });
    await page.goto('http://127.0.0.1:3022/prototype');
    await page
      .getByRole('button', { name: 'Explore the islands', exact: true })
      .click();
    for (const [i, label] of [
      'Neural learning',
      'Rocket landing',
      'Attention',
      'Traffic waves',
      'Time dilation',
    ].entries()) {
      const id = ['neural', 'rocket', 'attention', 'traffic', 'relativity'][i];
      await page
        .locator('nav[aria-label="Interactive topics"]')
        .getByRole('button', { name: new RegExp(label) })
        .click();
      await page.waitForFunction((id) => {
        const c = document.querySelector('canvas');
        return (
          c?.dataset.destination === id && c.dataset.travelling === 'false'
        );
      }, id);
      await page
        .getByRole('button', { name: 'Start with voice →', exact: true })
        .click();
      await page.waitForFunction(
        () =>
          Number(document.querySelector('canvas')?.dataset.mouthAmplitude) >
          0.05,
      );
      const data = await page
        .locator('canvas')
        .evaluate((c) => ({ ...c.dataset }));
      assert.equal(data.petrosState, 'Speak');
      assert.ok(exactText.length > 20);
      const caption = await page.locator('[data-phase]').textContent();
      assert.ok(caption?.includes(exactText));
      await page.screenshot({
        path: fileURLToPath(
          new URL(
            `../evidence/world-rebuild/after/speaking-${id}-${width}-dpr2.png`,
            import.meta.url,
          ),
        ),
        fullPage: true,
      });
      if (width === 1440 && i === 0) {
        await page
          .getByRole('button', { name: 'Mute world sound', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.querySelector('canvas')?.dataset.petrosState !== 'Speak' &&
            Number(document.querySelector('canvas')?.dataset.mouthAmplitude) <
              0.01,
        );
      }
      await page
        .getByRole('button', { name: 'Pause Petros', exact: true })
        .click();
      await page.waitForTimeout(350);
      assert.ok(
        Number(
          await page.locator('canvas').getAttribute('data-mouth-amplitude'),
        ) < 0.01,
      );
      results.push({
        width,
        topic: id,
        source: 'Local macOS speech fixture, exact caption; provider disabled',
        mouthAmplitude: Number(data.mouthAmplitude),
        interruption: true,
      });
      console.log('SPEAKING', width, id);
    }
    await context.close();
  }
  await writeFile(
    new URL('../evidence/world-rebuild/voice-results.json', import.meta.url),
    JSON.stringify({ results, providerVerified: false }, null, 2),
  );
} catch (e) {
  await writeFile(
    new URL('../evidence/world-rebuild/voice-failure.json', import.meta.url),
    JSON.stringify({ error: String(e), results }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
