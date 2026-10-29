import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const out = 'evidence/realism',
  base = 'http://127.0.0.1:3021';
await mkdir(out + '/recording', { recursive: true });
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal', '--window-size=1920,1161'],
});
const results = {
  checks: [],
  errors: [],
  assets: [],
  productionMutations: [],
  views: {},
};
const check = (condition, name) => {
  if (!condition) throw Error(name);
  results.checks.push(name);
  console.log(name);
};
const context = await browser.newContext({
  viewport: null,
  recordVideo: { dir: out + '/recording', size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
page.on('pageerror', (e) => results.errors.push(e.message));
page.on('request', (r) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) &&
    !r.url().includes('/prototype/api/')
  )
    results.productionMutations.push(r.url());
});
page.on('response', (r) => {
  if (r.url().includes('/api/asset/'))
    results.assets.push({
      file: new URL(r.url()).pathname.split('/').at(-1),
      status: r.status(),
      bytes: Number(r.headers()['content-length']),
    });
});
const main = page.getByRole('main', { name: 'Petros World immersive study' });
const phase = () => main.getAttribute('data-world-phase');
async function stable() {
  await page.waitForTimeout(1300);
}
async function pick(id) {
  const p = await page.evaluate(
      (id) => window.__PETROS_WORLD_METRICS__.picks[id],
      id,
    ),
    rect = await page.locator('[data-world-scene] canvas').boundingBox();
  await page.mouse.click(rect.x + p.x, rect.y + p.y);
}
async function snapshot(id, file) {
  await stable();
  await page.screenshot({ path: out + '/' + file });
  results.views[id] = await page.evaluate(() => ({
    metrics: window.__PETROS_WORLD_METRICS__,
    board: window.__PETROS_BOARD__,
    font: getComputedStyle(document.querySelector('[data-world-typeface]'))
      .fontFamily,
    heap: performance.memory
      ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
        }
      : null,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
}
try {
  results.viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
  }));
  check(
    results.viewport.width === 1920 && results.viewport.height === 1080,
    'Native recording viewport is 1920 × 1080',
  );
  await page.goto(base + '/prototype');
  await page
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  const start = Date.now();
  await page
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 90000 });
  results.entryWallMs = Date.now() - start;
  check((await phase()) === 'arrival', 'Loaded reference room enters arrival');
  await snapshot('arrival', '01-arrival.png');
  check(!results.views.arrival.overflow, '1080p arrival has no page overflow');
  await pick('bookshelf');
  await page
    .getByRole('region', { name: 'World library' })
    .waitFor({ timeout: 7000 });
  check(
    (await phase()) === 'library',
    'Actual imported bookshelf opens source selector',
  );
  await stable();
  for (const [id, title] of [
    ['ai4', 'How an AI Reasons with Knowledge'],
    ['ehs3', 'Find the Construction Hazards'],
    ['ehs5', 'Protecting Water Resources'],
    ['ai3', 'Minimax & Alpha–Beta Pruning'],
  ]) {
    await pick('book-' + id);
    await page
      .getByRole('region', { name: 'World library' })
      .getByRole('heading', { name: title, exact: true })
      .waitFor();
    check(true, 'Imported source-book mesh selects ' + id);
  }
  await snapshot('library', '02-library.png');
  await page.getByRole('button', { name: /Retrieve this book/ }).click();
  await page
    .getByRole('button', { name: /Let me show you|Continue this lesson/ })
    .click();
  await page
    .getByRole('heading', {
      name: 'Which first move should MAX choose?',
      exact: true,
    })
    .waitFor({ timeout: 60000 });
  await snapshot('teaching', '03-teaching.png');
  check(
    results.views.teaching.board.layout.errors.length === 0,
    'Whiteboard generated layout remains valid',
  );
  check(
    (await main.getAttribute('data-question-id')) === 'AI3-Q07',
    'Automatic minimax demonstration reaches first-move prediction',
  );
  await page
    .getByRole('group', { name: 'World practice choices' })
    .getByRole('button', { name: 'A', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue lesson', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Ask Petros anything', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
    .fill('Why does MIN choose the smaller value?');
  await page.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await page.getByText(/Prepared source-linked explanation/).waitFor();
  await page
    .getByRole('button', {
      name: 'Continue lesson · same checkpoint',
      exact: true,
    })
    .click();
  check(
    (await main.getAttribute('data-question-id')) === 'AI3-Q07',
    'Prepared interruption resumes the same completed checkpoint',
  );
  await page
    .getByRole('button', { name: 'Accessibility and preferences', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Graphics: detailed', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Graphics: lighter', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Close preferences', exact: true })
    .click();
  check(
    (await main.getAttribute('data-question-id')) === 'AI3-Q07',
    'Lighter graphics retains the lesson checkpoint',
  );
  await page
    .getByRole('button', { name: 'Exit Petros World', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .waitFor({ state: 'detached', timeout: 20000 });
  await page
    .getByRole('heading', {
      name: 'Which first move should MAX choose?',
      exact: true,
    })
    .waitFor();
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  check(true, 'Classic retains the answered World checkpoint');
  check(
    results.assets.length >= 10 &&
      results.assets.every((a) => a.status === 200),
    'All requested runtime assets return successful responses',
  );
  check(results.errors.length === 0, 'No browser JavaScript errors');
  check(
    results.productionMutations.length === 0,
    'No production mutation requests',
  );
  results.sceneAssetBytes = results.assets.reduce((s, a) => s + a.bytes, 0);
  const client = await context.newCDPSession(page);
  results.performance = await client.send('Performance.getMetrics');
  const bs = await browser.newBrowserCDPSession();
  const gpu = await bs.send('SystemInfo.getInfo');
  results.gpu = gpu.gpu.devices;
  results.passed = true;
} catch (e) {
  results.failure = String(e);
  await page.screenshot({ path: out + '/verification-failure.png' });
  throw e;
} finally {
  results.video = await page.video()?.path();
  await writeFile(out + '/verification.json', JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
}
