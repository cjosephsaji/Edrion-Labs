/* Actual, uninterrupted browser output. Only UI actions change lesson state.
 * Performance/geometry observers are read-only; no routes, grades or cues are mocked. */
/* global window, document, performance, requestAnimationFrame, MutationObserver, setTimeout */
import process from 'node:process';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.env.PETROS_M6_BROWSER_DIR ?? '');
const api = process.env.PETROS_M6_BROWSER_API ?? 'http://127.0.0.1:4993';
const web = process.env.PETROS_M6_BROWSER_WEB ?? 'http://127.0.0.1:4994';
const samplerWeb = process.env.PETROS_M6_SAMPLER_WEB ?? web;
if (
  !process.env.PETROS_M6_BROWSER_DIR ||
  existsSync(out) ||
  ![api, web, samplerWeb].every((url) => /^http:\/\/127\.0\.0\.1:\d+$/.test(url))
)
  throw Error('NEW_DIRECTORY_AND_LOOPBACK_REQUIRED');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
const checks = [],
  errors = [],
  requests = [],
  timings = [],
  observations = [],
  videos = [];
const check = (value, label) => {
  checks.push({ passed: !!value, label });
  if (!value) throw Error(label);
};
const button = (p, name) => p.getByRole('button', { name, exact: true });
const quiet = (p, ms = 600) => p.waitForTimeout(ms);
async function wait(p, predicate) {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (predicate(p._snapshot)) return;
    await quiet(p, 100);
  }
  throw Error('Authoritative public snapshot timed out');
}
async function command(p, name) {
  const revision = p._snapshot.revision;
  await button(p, name).click();
  await wait(p, (s) => s?.revision > revision);
  await p.waitForFunction(
    () =>
      !document.querySelector('[data-studio] button[disabled]')?.textContent?.includes('Saving'),
  );
  await quiet(p);
}
async function shot(p, name) {
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
async function run(name, width, flow, extra = {}) {
  if (
    process.env.PETROS_M6_BROWSER_FLOW &&
    !process.env.PETROS_M6_BROWSER_FLOW.split(',').some((prefix) => name.startsWith(prefix))
  )
    return;
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    ...(width === 360 ? { isMobile: true, hasTouch: true } : {}),
    ...extra,
    recordVideo: { dir: `${out}/raw`, size: { width, height: 1000 } },
  });
  await context.addInitScript(() => {
    window.__petrosTrace = { frames: [], cues: [], inputs: [] };
    document.addEventListener(
      'input',
      () => {
        const start = performance.now();
        requestAnimationFrame(() => window.__petrosTrace.inputs.push(performance.now() - start));
      },
      true,
    );
    document.addEventListener(
      'DOMContentLoaded',
      () =>
        new MutationObserver(() => {
          const el = document.querySelector('[data-cue-id]');
          if (!el) return;
          const next = {
            eventId: el.getAttribute('data-cue-id'),
            phase: el.getAttribute('data-attention-phase'),
            gesture: el.getAttribute('data-gesture'),
            anchor: el.getAttribute('data-anchor'),
            at: performance.timeOrigin + performance.now(),
          };
          const old = window.__petrosTrace.cues.at(-1);
          if (
            next.eventId &&
            (!old ||
              ['eventId', 'phase', 'gesture', 'anchor'].some((key) => old[key] !== next[key]))
          )
            window.__petrosTrace.cues.push(next);
        }).observe(document.body, {
          subtree: true,
          attributes: true,
          childList: true,
          attributeFilter: ['data-cue-id', 'data-attention-phase', 'data-gesture', 'data-anchor'],
        }),
      { once: true },
    );
  });
  const p = await context.newPage();
  p.setDefaultTimeout(90000);
  p.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()));
  p.on('pageerror', (e) => errors.push({ name, error: e.message }));
  p.on('request', (r) => requests.push({ name, method: r.method(), url: r.url() }));
  p.on('response', async (r) => {
    if (!r.url().includes('/v1/student/petros/v2/sessions/')) return;
    const timing = r.request().timing();
    const headers = await r.allHeaders();
    const item = {
      name,
      method: r.request().method(),
      status: r.status(),
      ms: timing.responseStart - timing.requestStart,
      networkAt: timing.startTime + timing.responseStart,
      serverTiming: headers['server-timing'] ?? null,
    };
    timings.push(item);
    if (r.request().method() === 'GET' && r.status() === 200) {
      const s = await r.json().catch(() => null);
      if (s?.engine === 'v2') {
        p._snapshot = s;
        item.cueId = s.companion?.eventId;
        check(
          !JSON.stringify(s).includes('M4_PRIVATE_SENTINEL'),
          `${name}: no private sentinel in the public snapshot`,
        );
      }
    }
  });
  try {
    await flow(p);
    check(
      await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${name}: no horizontal overflow`,
    );
    await shot(p, name);
    observations.push({
      name,
      userTiming: await p.evaluate(() =>
        performance
          .getEntriesByType('measure')
          .filter((e) => e.name.startsWith('petros:'))
          .map((e) => ({ name: e.name, ms: e.duration })),
      ),
      trace: await p.evaluate(() => window.__petrosTrace),
    });
  } catch (e) {
    errors.push({ name, error: String(e) });
    const dock = await p
      .locator('[aria-label="Petros companion"]')
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          Object.fromEntries(
            [...node.attributes]
              .filter((a) => a.name.startsWith('data-'))
              .map((a) => [a.name, a.value]),
          ),
        ),
      )
      .catch(() => []);
    writeFileSync(
      `${out}/${name}-diagnostic.json`,
      JSON.stringify({ error: String(e), dock }, null, 2),
    );
    writeFileSync(
      `${out}/results.json`,
      JSON.stringify({ checks, errors, requests, timings, observations, videos }, null, 2),
    );
    await shot(p, `${name}-failure`).catch(() => {});
  } finally {
    const video = p.video();
    await context.close();
    copyFileSync(await video.path(), `${out}/${name}.webm`);
    videos.push(name);
    writeFileSync(
      `${out}/results.json`,
      JSON.stringify({ checks, errors, requests, timings, observations, videos }, null, 2),
    );
    process.stdout.write(`Recorded ${name}\n`);
  }
}
await run('A-original-reference-and-active-sampler', 1440, async (p) => {
  await p.goto(`${samplerWeb}/verification/petros-v2/companion`, {
    waitUntil: 'networkidle',
    timeout: 180000,
  });
  await p.getByRole('heading', { name: 'The familiar Petros.' }).waitFor();
  const images = p.getByRole('region', { name: 'Original versus active artwork' });
  check(
    (await images.locator('img[data-active="true"]').getAttribute('src')) ===
      '/petros/states/petros-idle.png',
    'The active renderer uses the same original reference asset',
  );
  for (const pose of [
    'neutral',
    'listening',
    'thinking',
    'point-left',
    'point-right',
    'point-up',
    'point-down',
    'neutral',
  ]) {
    await p.getByLabel('Pose', { exact: true }).selectOption(pose);
    await quiet(p, 900);
  }
  for (const size of [96, 160, 256, 512]) {
    await p.getByLabel('Size', { exact: true }).selectOption(String(size));
    await quiet(p, 650);
    await shot(p, `original-size-${size}`);
  }
  check(
    (await p.locator('[data-layered-character]').count()) === 0,
    'Rejected candidate and independent facial overlays are inactive',
  );
  await p.goto(`file://${resolve(out, '../original-reference.html')}`, { waitUntil: 'load' });
  check(
    (await p.locator('img').count()) === 32,
    'All eight original poses are shown at all four requested sizes',
  );
  await shot(p, 'original-reference-sheet');
  await quiet(p, 1200);
});
await run('E-F-safe-dock-and-interruption', 1440, async (p) => {
  await p.goto(`${api}/demo/companion?fresh=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await wait(p, (s) => !!s?.task);
  await p.getByRole('radio', { name: 'Consumer', exact: true }).check();
  await p.getByRole('spinbutton', { name: 'Available memory (GB)', exact: true }).fill('48');
  await p.getByRole('spinbutton', { name: 'Whole-VM capacity (VM)', exact: true }).fill('7');
  await command(p, 'Submit answer');
  await wait(p, (s) => s?.submission?.status === 'complete');
  await command(p, 'Work on this with Petros');
  const dock = p.locator('[aria-label="Petros companion"]');
  for (let i = 0; i < 4 && !p._snapshot.companion.targetId; i++)
    await command(p, 'Show next teaching step');
  const targetId = p._snapshot.companion.targetId;
  check(!!targetId, 'EXPLAIN is requested only after a real teaching target exists');
  await p.locator(`[data-canvas-element="${targetId}"]`).first().scrollIntoViewIfNeeded();
  await quiet(p, 500);
  check(
    (await dock.getAttribute('data-anchor')) === 'HOME',
    'Original artwork remains at HOME when EXPLAIN has no approved travel clip',
  );
  check(
    (await dock.getAttribute('data-travel')) === 'artwork-unavailable',
    'Unsupported travel is disclosed in the spatial result',
  );
  await shot(p, 'home-explain-fallback');
  const cloud = await p.locator('[data-cloud]').boundingBox();
  check(!!cloud && cloud.width <= 321, 'Desktop caption stays inside its measured 320px maximum');
  const activity = p.locator('[data-canvas-element]').first();
  const beforeDismiss = await activity.boundingBox();
  await button(p, 'Dismiss caption').click();
  await quiet(p, 150);
  const afterDismiss = await activity.boundingBox();
  check(
    Math.abs(beforeDismiss.y - afterDismiss.y) < 1,
    'Caption dismissal preserves activity geometry',
  );
  await button(p, 'Show caption').click();
  const prefix = p._snapshot.teaching.nextBeat;
  await command(p, 'Pause lesson');
  check(
    (await dock.getAttribute('data-gesture')) === 'settled',
    'Real pause stops the target gesture',
  );
  await command(p, 'Continue learning');
  check(
    p._snapshot.teaching.nextBeat === prefix,
    'Resume preserves the exact accepted teaching prefix',
  );
  check(
    (await dock.getAttribute('data-gesture')) === 'settled',
    'Resume does not replay the previous teaching gesture',
  );
  await button(p, 'Ask Petros').click();
  const dialog = p.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByRole('textbox').fill('What does reserved memory mean here?');
  await quiet(p);
  check(
    (await dock.getAttribute('data-gesture')) === 'settled',
    'A student question interrupts unrelated gestures',
  );
  await p.keyboard.press('Escape');
  await p.reload();
  await dock.waitFor();
  check(
    (await dock.getAttribute('data-gesture')) === 'settled',
    'Reload does not replay a displayed cue',
  );
  await p.waitForLoadState('networkidle');
  const idleRequests = requests.filter((r) =>
    r.url.includes('/v1/student/petros/v2/sessions/'),
  ).length;
  await Promise.race([
    p.evaluate(async () => {
      let previous = performance.now();
      for (let i = 0; i < 120; i++)
        await new Promise((resolve) =>
          requestAnimationFrame((now) => {
            window.__petrosTrace.frames.push(now - previous);
            previous = now;
            resolve();
          }),
        );
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('Idle frame observation exceeded 10 seconds')), 10000),
    ),
  ]);
  check(
    requests.filter((r) => r.url.includes('/v1/student/petros/v2/sessions/')).length ===
      idleRequests,
    '120 idle browser frames send zero session requests',
  );
  await shot(p, 'interrupted-and-restored');
});
await run(
  'G-mobile-english-and-responsiveness',
  360,
  async (p) => {
    await p.goto(`${api}/demo/argument-preview?fresh=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    });
    await wait(p, (s) => !!s?.teaching);
    const dock = p.locator('[aria-label="Petros companion"]');
    await dock.waitFor();
    check(
      (await dock.getAttribute('data-anchor')) === 'DOCKED_MOBILE',
      '360px uses the fixed compact mobile dock',
    );
    await p.getByLabel('From', { exact: true }).selectOption('evidence');
    await p.getByLabel('To', { exact: true }).selectOption('claim');
    await p.getByLabel('Relationship', { exact: true }).selectOption('supports');
    await command(p, 'Save relationship');
    await button(p, 'Evidence · survey passage').click();
    const field = p.getByRole('textbox', { name: /Explain or annotate/ });
    const before = requests.filter((r) => r.method === 'POST').length;
    await field.fill(
      'The sampled learners support considering later access, while feasibility and other residents need review.',
    );
    await quiet(p, 300);
    check(
      (await dock.getAttribute('data-gesture')) === 'settled',
      'Mobile English editing stays quiet and never judges the draft',
    );
    check(
      (await dock.getAttribute('data-anchor')) === 'DOCKED_MOBILE',
      'Typing does not make Petros roam on mobile',
    );
    check(
      requests.filter((r) => r.method === 'POST').length === before,
      'Typing and companion frames send zero mutation requests',
    );
    const geometry = await field.boundingBox(),
      cloud = await p.locator('[data-cloud]').boundingBox();
    check(
      !cloud ||
        !geometry ||
        cloud.y + cloud.height <= geometry.y ||
        geometry.y + geometry.height <= cloud.y,
      'The mobile caption does not cover the active answer field',
    );
    await shot(p, 'mobile-english-edit-focus');
    await command(p, 'Save annotation');
    await command(p, 'Review your correction');
    await p
      .getByRole('textbox', { name: 'Your answer', exact: true })
      .fill(
        'The surveyed learners prefer later access. This supports considering a change with sampling uncertainty and feasibility still requiring review.',
      );
    await command(p, 'Submit answer');
    await wait(p, (s) => s?.submission?.status === 'complete');
    check(
      p._snapshot.evaluation.status === 'review_required' &&
        p._snapshot.companion.result === 'review',
      'Actual mobile English evaluation remains review-required',
    );
    check(
      (await p.locator('[data-rig]').getAttribute('data-pose')) === 'neutral',
      'Review-required feedback uses the original neutral pose',
    );
    await button(p, 'Learning preferences').click();
    await p.getByRole('checkbox', { name: 'Hide character', exact: true }).check();
    await p.keyboard.press('Escape');
    check((await dock.count()) === 0, 'Minimized Petros leaves a usable text caption');
    await button(p, 'Learning preferences').click();
    await p.getByRole('checkbox', { name: 'Hide character', exact: true }).uncheck();
    await p.getByRole('checkbox', { name: 'Text-only presentation', exact: true }).check();
    await p.keyboard.press('Escape');
    check(
      (await p.locator('[data-text-only="true"]').count()) > 0,
      'Text-only remains usable on mobile',
    );
  },
  { reducedMotion: 'reduce' },
);
check(
  !requests.some((r) =>
    /\/petros\/v2\/rig\/(?:layers|neutral|attentive|thoughtful|pleased|uncertain|three-quarter)/.test(
      r.url,
    ),
  ),
  'No rejected artwork asset is requested in any recording',
);
await browser.close();
writeFileSync(
  `${out}/results.json`,
  JSON.stringify({ checks, errors, requests, timings, observations, videos }, null, 2),
);
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
