import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { observe, trafficFront } from '../simulations/runtime';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
    executablePath: browserExecutable(),
    headless: true,
  }),
  results: any[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript('window.__name=f=>f');
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.goto('http://127.0.0.1:3022/prototype');
  await page
    .getByRole('button', { name: 'Explore the islands', exact: true })
    .click();
  const read = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!);
  const visit = async (id: string, label: string) => {
    await page
      .locator('nav[aria-label="Interactive topics"]')
      .getByRole('button', { name: new RegExp(label) })
      .click();
    await page.waitForFunction((id) => {
      const c = document.querySelector('canvas');
      return c?.dataset.destination === id && c.dataset.travelling === 'false';
    }, id);
    await page.getByLabel('Experiment controls', { exact: true }).click();
  };
  const slider = async (label: string, value: string) => {
    await page
      .getByRole('slider', { name: new RegExp(label) })
      .evaluate((el, value) => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.set!.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    await page.waitForTimeout(250);
  };
  const capture = async (name: string) => {
    await page.getByLabel('Experiment controls', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: fileURLToPath(
        new URL(`../evidence/world-rebuild/after/${name}.png`, import.meta.url),
      ),
      fullPage: true,
    });
  };
  await visit('neural', 'Neural learning');
  await page.getByText('Adjust the experiment', { exact: false }).click();
  await page.getByLabel('Model', { exact: true }).selectOption('network');
  await page.waitForTimeout(250);
  const initial = await read(),
    loss = Number(observe(initial.sim).loss);
  await page.getByRole('button', { name: 'Step +', exact: true }).click();
  const trained = await read();
  assert.equal(trained.params.model, 'network');
  assert.ok(Number(observe(trained.sim).loss) < loss);
  await capture('neural-lattice-1440-dpr2');
  results.push({
    topic: 'neural',
    fullNetwork: true,
    lossBefore: loss,
    lossAfter: observe(trained.sim).loss,
  });
  await visit('rocket', 'Rocket landing');
  await slider('Thrust', '0.8');
  const rocket = await read();
  await page.getByRole('button', { name: 'Step +', exact: true }).click();
  assert.notEqual(
    (await read()).sim.data.rocket.altitude,
    rocket.sim.data.rocket.altitude,
  );
  await capture('rocket-burn-1440-dpr2');
  results.push({ topic: 'rocket', actualBurn: true });
  await visit('attention', 'Attention');
  await slider('Query token', '2');
  const attention = await read();
  assert.equal(attention.params.query, 2);
  assert.ok(Math.abs(Number(observe(attention.sim).rowSum) - 1) < 1e-10);
  await capture('attention-query-1440-dpr2');
  results.push({ topic: 'attention', actualQueryWeights: true });
  await visit('traffic', 'Traffic waves');
  await slider('Cars on ring', '45');
  await page
    .getByRole('button', { name: '▷ Run experiment', exact: true })
    .click();
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: 'Brake a car', exact: true }).click();
  await page
    .getByRole('button', { name: '▷ Run experiment', exact: true })
    .click();
  const front = trafficFront((await read()).sim);
  await page.getByLabel('Experiment controls', { exact: true }).click();
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        let prior = performance.now(),
          start = prior;
        function tick(now: number) {
          samples.push(now - prior);
          prior = now;
          if (now - start > 4000) resolve(samples.slice(3));
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
  );
  const traffic = await read();
  assert.equal(traffic.sim.data.traffic.cars.length, 45);
  assert.ok(traffic.sim.time > 8);
  const counts = await page
    .locator('canvas')
    .evaluate((c) => ({ ...c.dataset }));
  assert.ok(Number(counts.triangles) < 1e6);
  assert.ok(Number(counts.drawCalls) < 200);
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        '../evidence/world-rebuild/after/traffic-wave-1440-dpr2.png',
        import.meta.url,
      ),
    ),
    fullPage: true,
  });
  const sorted = frames.slice().sort((a, b) => a - b);
  results.push({
    topic: 'traffic',
    cars: 45,
    brakePropagates: true,
    frontBefore: front.car.id,
    frontAfter: trafficFront(traffic.sim).car.id,
    scope:
      'Development build on this Mac; 1440×900 DPR2, Balanced, running 45-car model',
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
    canvas: counts,
  });
  await visit('relativity', 'Time dilation');
  await page
    .getByRole('button', { name: '▷ Run experiment', exact: true })
    .click();
  await page.waitForTimeout(2400);
  const clocks = await read(),
    o = observe(clocks.sim);
  assert.ok(Number(o.earthClock) > 2);
  assert.ok(
    Math.abs(Number(o.shipClock) - Number(o.earthClock) / Number(o.gamma)) <
      1e-8,
  );
  await capture('relativity-ticking-1440-dpr2');
  results.push({
    topic: 'relativity',
    earth: o.earthClock,
    ship: o.shipClock,
    gamma: o.gamma,
  });
  await writeFile(
    new URL('../evidence/world-rebuild/dynamic-results.json', import.meta.url),
    JSON.stringify({ results }, null, 2),
  );
  await context.close();
} catch (e) {
  await writeFile(
    new URL('../evidence/world-rebuild/dynamic-failure.json', import.meta.url),
    JSON.stringify({ error: String(e), results }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
}
