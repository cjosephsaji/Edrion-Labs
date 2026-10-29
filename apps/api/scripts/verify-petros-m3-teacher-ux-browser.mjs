import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..'),
  out = resolve(
    root,
    'docs/verification/petros-v2/m3-teacher-ux-evidence/browser',
    new Date().toISOString().replaceAll(':', '-'),
  );
mkdirSync(out, { recursive: true });
const info = JSON.parse(
  readFileSync(
    resolve(
      root,
      'docs/verification/petros-v2/m3-teacher-ux-evidence/demo-info.json',
    ),
    'utf8',
  ),
);
const browser = await chromium.launch({
  executablePath:
    '/Users/macbook/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const checks = [],
  errors = [],
  requests = [],
  deniedExternal = [],
  screenshots = [];
context.on('page', (page) =>
  page.on('pageerror', (e) => errors.push(e.message)),
);
context.on('request', (r) =>
  requests.push({ url: r.url(), method: r.method() }),
);
await context.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (['localhost', '127.0.0.1'].includes(u.hostname)) await route.continue();
  else {
    deniedExternal.push(u.origin);
    await route.abort();
  }
});
const page = await context.newPage();
function record(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(name);
}
async function top(p = page) {
  await p.evaluate(() => {
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollTop) e.scrollTop = 0;
    });
  });
}
async function shot(name, p = page) {
  await top(p);
  await p.screenshot({ path: resolve(out, name + '.png'), fullPage: true });
  screenshots.push(name + '.png');
}
async function go(url, p = page) {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p
    .getByRole('heading', { name: 'Petros Learn', exact: true })
    .waitFor({ timeout: 120000 });
}
async function idle(p = page) {
  await p.locator('section[aria-label="Petros learning proposals"]').waitFor();
  await p.waitForFunction(
    () =>
      document
        .querySelector('section[aria-label="Petros learning proposals"]')
        ?.getAttribute('aria-busy') === 'false',
  );
}
async function openCloud() {
  await go(info.cloud + '#petros-lessons-material');
  await page
    .getByLabel('Teaching material')
    .selectOption({ label: 'cloud-models.pptx' });
  await page.getByRole('button', { name: 'Continue editing lesson' }).click();
  await page
    .getByRole('heading', { name: "Here's what your students will learn" })
    .waitFor();
  await idle();
}
async function post(path, body, ctx = context) {
  const r = await ctx.request.post('http://127.0.0.1:4903/v1' + path, {
    data: body,
    headers: { 'x-institution-scope': 'institution' },
  });
  return { status: r.status(), body: await r.json() };
}
try {
  await go(info.cloud + '#petros-lessons-material');
  await page.getByLabel('Teaching material').waitFor({ timeout: 120000 });
  record(
    'first visit offers Lessons, Learning goals and Student progress',
    (await page
      .getByRole('navigation', { name: 'Petros Learn areas' })
      .getByRole('button')
      .count()) >= 3,
  );
  record(
    'ordinary teacher sees no qualified reviewer workspace',
    (await page
      .getByRole('button', { name: 'Lesson reviews', exact: true })
      .count()) === 0,
  );
  await shot('landing-desktop');
  await page
    .getByLabel('Teaching material')
    .selectOption({ label: 'cloud-models.pptx' });
  await shot('choose-material-desktop');
  await page.getByRole('button', { name: 'Continue editing lesson' }).click();
  await idle();
  record(
    'actual controlled sample labelled',
    await page.getByText('Sample lesson — prepared from test data').isVisible(),
  );
  await shot('objectives-desktop');
  await page.getByRole('button', { name: 'Edit objective 1' }).click();
  const wording = page.getByLabel('Objective wording');
  record(
    'inline editor receives focus',
    await wording.evaluate((e) => e === document.activeElement),
  );
  const corrected =
    'Classify the stated responsibility boundaries and justify the distinction using the cited source.';
  await wording.fill(corrected);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await idle();
  record(
    'source-validated edit saved with renewed review requirement',
    (await page
      .getByRole('heading', { name: corrected, exact: true })
      .isVisible()) &&
      (await page
        .getByText('Changed · review needed again', { exact: true })
        .isVisible()),
  );
  await page.getByLabel('More actions for objective 1').click();
  await page
    .getByRole('button', { name: 'Inspect source', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Supporting source material' })
    .getByRole('table')
    .waitFor();
  record(
    'source drawer renders actual cloud table and native slide reference',
    (await page.getByText(/Slide 3/).isVisible()) &&
      (await page.getByRole('cell', { name: 'IaaS', exact: true }).isVisible()),
  );
  record(
    'source dialog receives focus',
    await page
      .getByRole('dialog')
      .evaluate((e) => e.contains(document.activeElement)),
  );
  await page.keyboard.press('Tab');
  record(
    'keyboard reaches source reference disclosure',
    await page.evaluate(
      () => document.activeElement?.textContent === 'Exact source reference',
    ),
  );
  await page.keyboard.press('Tab');
  record(
    'source drawer traps keyboard focus',
    await page
      .getByRole('dialog')
      .evaluate((e) => e.contains(document.activeElement)),
  );
  await shot('source-desktop');
  await page.keyboard.press('Escape');
  record(
    'source drawer restores focus',
    await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY'),
  );
  await page
    .getByRole('button', { name: 'Preview lesson', exact: true })
    .click();
  await page.getByLabel('Read-only activity preview').waitFor();
  await page
    .getByLabel('Read-only activity preview')
    .getByRole('table')
    .waitFor();
  record(
    'prominent actual activity is read only with no answer submission',
    (await page.getByText('Read only', { exact: true }).isVisible()) &&
      (await page.getByRole('button', { name: /Submit answer/ }).count()) === 0,
  );
  await shot('activity-desktop');
  await page
    .getByRole('button', { name: 'Change activity', exact: true })
    .click();
  const choice = page.getByLabel('Lesson activity'),
    oldChoice = await choice.inputValue();
  const options = await choice
    .locator('option')
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.value)
        .map((n) => ({ value: n.value, label: n.textContent })),
    );
  const alternative = options.find((o) => o.value !== oldChoice);
  await choice.selectOption(alternative.value);
  await idle();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  record(
    'supported activity alternative persists',
    await page
      .getByLabel('Read-only activity preview')
      .getByRole('heading', {
        name: alternative.label.split(' · ')[0],
        exact: true,
      })
      .isVisible(),
  );
  await page
    .getByRole('button', { name: 'Next activity', exact: true })
    .click();
  record(
    'next objective preview available',
    await page.getByText('Objective 2 of 2', { exact: true }).isVisible(),
  );
  await page
    .getByRole('button', { name: 'Previous activity', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue to approval', exact: true })
    .click();
  await shot('save-submit-desktop');
  await page
    .getByRole('button', { name: 'See what’s needed', exact: true })
    .click();
  record(
    'review details preserve separate authority dimensions',
    (await page.getByText('Teaching material', { exact: true }).isVisible()) &&
      (await page
        .getByText('Assessment verification', { exact: true })
        .isVisible()) &&
      (await page
        .getByText('Student availability', { exact: true })
        .isVisible()),
  );
  await shot('review-details-desktop');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await idle();
  await page
    .getByRole('button', { name: 'Submit for review', exact: true })
    .click();
  await idle();
  record(
    'real review submission shows waiting status',
    await page
      .getByRole('heading', { name: 'Waiting for review', exact: true })
      .isVisible(),
  );
  await shot('waiting-review-desktop');
  // An actual second server revision creates the stale save; no mocked API response.
  await page
    .getByRole('button', { name: 'Review lesson', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Edit objective 1', exact: true })
    .click();
  const local =
    'Classify the consumer and provider responsibilities using the cited source boundary.';
  await page.getByLabel('Objective wording').fill(local);
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.getByRole('tab', { name: 'Notes', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  record(
    'keyboard tab navigation opens Files',
    await page
      .getByRole('heading', { name: 'Share a file', exact: true })
      .isVisible(),
  );
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  record(
    'unsaved objective survives institution tab navigation',
    (await page.getByLabel('Objective wording').inputValue()) === local,
  );
  await page
    .getByRole('button', { name: 'Learning goals', exact: true })
    .click();
  await page.getByRole('button', { name: 'Lessons', exact: true }).click();
  record(
    'unsaved objective survives task navigation',
    (await page.getByLabel('Objective wording').inputValue()) === local,
  );
  const ids = new URL(info.cloud).pathname.split('/').filter(Boolean),
    base = `/portal/teaching/${ids[1]}/${ids[2]}/proposals`;
  const sources = await (
    await context.request.get('http://127.0.0.1:4903/v1' + base + '/sources')
  ).json();
  const source = sources.items.find((s) => s.title === 'cloud-models.pptx');
  let serverView = await (
    await context.request.get(
      'http://127.0.0.1:4903/v1' + base + '/' + source.proposalId,
    )
  ).json();
  const concurrent = await post(base + '/' + source.proposalId + '/edits', {
    commandId: crypto.randomUUID(),
    expectedVersion: serverView.proposal.version,
    change: {
      kind: 'objective',
      objectiveId: serverView.proposal.objectives[0].id,
      wording:
        'Explain the consumer and provider responsibilities using the cited service-model boundary.',
    },
  });
  record('second actual editor revision saved', concurrent.status === 200);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await idle();
  record(
    'stale save preserves unsaved teacher wording',
    (await page
      .getByText('This lesson was updated', { exact: true })
      .isVisible()) &&
      (await page.getByLabel('Objective wording').inputValue()) === local,
  );
  await shot('conflict-preserved');
  await page
    .getByRole('button', { name: 'Review latest changes', exact: true })
    .click();
  await idle();
  record(
    'comparison shows latest and local wording',
    (await page
      .getByRole('dialog')
      .getByText(local, { exact: true })
      .isVisible()) &&
      (await page
        .getByRole('dialog')
        .getByText(
          'Explain the consumer and provider responsibilities using the cited service-model boundary.',
          { exact: true },
        )
        .isVisible()),
  );
  await shot('conflict-comparison');
  await page
    .getByRole('button', { name: 'Continue with my wording', exact: true })
    .click();
  record(
    'comparison choice does not silently save',
    (await page.getByLabel('Objective wording').inputValue()) === local,
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await idle();
  serverView = await (
    await context.request.get(
      'http://127.0.0.1:4903/v1' + base + '/' + source.proposalId,
    )
  ).json();
  record(
    'explicit retry uses latest version and saves local wording',
    serverView.proposal.objectives[0].wording === local &&
      serverView.proposal.version === concurrent.body.proposal.version + 1,
  );
  await page
    .getByRole('button', { name: 'Save & submit', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Submit for review', exact: true })
    .click();
  await idle();
  await page
    .getByRole('button', { name: 'Review lesson', exact: true })
    .click();
  serverView = await (
    await context.request.get(
      'http://127.0.0.1:4903/v1' + base + '/' + source.proposalId,
    )
  ).json();
  const deniedReview = await post(base + '/' + source.proposalId + '/reviews', {
    commandId: crypto.randomUUID(),
    expectedVersion: serverView.proposal.version,
    qualificationId: crypto.randomUUID(),
    qualificationVersion: 1,
    dimension: 'teaching_scope',
    decision: 'approved',
    reason: 'Unauthorized synthetic authority attempt.',
    taskFamilyId: null,
    taskFamilyVersion: null,
    nonEquivalenceDecision: null,
  });
  record(
    'unqualified backend review remains denied',
    [403, 404, 422].includes(deniedReview.status),
    { status: deniedReview.status },
  );
  const deniedRelease = await post(
    base + '/' + source.proposalId + '/release',
    {
      commandId: crypto.randomUUID(),
      expectedVersion: serverView.proposal.version,
    },
  );
  record(
    'actual release remains blocked',
    [403, 409, 422].includes(deniedRelease.status),
    { status: deniedRelease.status },
  );
  const task = serverView.proposal.taskCandidates.find(
    (t) => t.kind !== 'formative_practice',
  );
  const privateGet = await context.request.get(
    'http://127.0.0.1:4903/v1' +
      base +
      '/' +
      source.proposalId +
      '/verification/' +
      task.id,
  );
  record(
    'ordinary private-content endpoint remains denied',
    [403, 404].includes(privateGet.status()),
  );
  await page
    .getByRole('button', { name: 'Concepts & connections', exact: true })
    .click();
  record(
    'public concepts and relationships remain available in focused panel',
    await page
      .getByRole('dialog')
      .getByText('Connections', { exact: true })
      .isVisible(),
  );
  await shot('concepts-desktop');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Check lesson claims', exact: true })
    .click();
  record(
    'claim review preserved',
    (await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Edit claim' })
      .count()) > 0,
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Version history', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect previous revision', exact: true })
    .click();
  await idle();
  record(
    'previous revision remains read only without replacing current lesson',
    await page
      .getByRole('dialog')
      .getByText(/read only/)
      .isVisible(),
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Learning goals', exact: true })
    .click();
  await page
    .getByText('No students are available in this demo.', { exact: true })
    .waitFor();
  record(
    'no fake assignment action when no recipients are available',
    (await page
      .getByRole('button', { name: 'Assign learning goal', exact: true })
      .count()) === 0,
  );
  await shot('learning-goals-desktop');
  await page
    .getByRole('button', { name: 'Student progress', exact: true })
    .click();
  record(
    'progress has a truthful empty state',
    await page
      .getByRole('heading', { name: 'No student progress available yet' })
      .isVisible(),
  );
  await shot('progress-desktop');
  for (const [name, heading] of [
    ['Notes', 'Write a note'],
    ['Files', 'Share a file'],
    ['Class updates', 'Post an update'],
  ]) {
    await page.getByRole('tab', { name, exact: true }).click();
    record(
      name + ' institutional screen still opens',
      await page
        .getByRole('heading', { name: heading, exact: true })
        .isVisible(),
    );
  }
  // English controlled fixture: actual argument material, no cloud strings in lesson region.
  await go(info.english + '#petros-lessons-review');
  await page
    .getByRole('heading', { name: "Here's what your students will learn" })
    .waitFor();
  await idle();
  record(
    'English objective addresses claim and evidence',
    await page
      .getByRole('heading', {
        name: 'Identify the author’s claim and distinguish it from the evidence offered for it.',
        exact: true,
      })
      .isVisible(),
  );
  await shot('english-objectives-desktop');
  await page
    .getByRole('button', { name: 'Preview lesson', exact: true })
    .click();
  await shot('english-activity-desktop');
  record(
    'English preview contains argument evidence without cloud assumptions',
    (
      await page
        .locator('section[aria-label="Petros learning proposals"]')
        .innerText()
    ).includes('claim') &&
      !(
        await page
          .locator('section[aria-label="Petros learning proposals"]')
          .innerText()
      ).includes('IaaS'),
  );
  // Desktop/tablet/mobile: all four steps plus actual source drawer at every width.
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    for (const [stepName, suffix] of [
      ['Choose material', 'material'],
      ['Review lesson', 'objectives'],
      ['Preview activities', 'preview'],
      ['Save & submit', 'submit'],
    ]) {
      await page.getByRole('button', { name: stepName, exact: true }).click();
      await top();
      const sizes = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        width: innerWidth,
        proposal: document.querySelector(
          'section[aria-label="Petros learning proposals"]',
        )?.scrollWidth,
        proposalWidth: document.querySelector(
          'section[aria-label="Petros learning proposals"]',
        )?.clientWidth,
      }));
      record(
        `${width}px ${suffix} contains all content`,
        sizes.document <= sizes.width && sizes.proposal <= sizes.proposalWidth,
        sizes,
      );
      const offscreen = await page
        .locator(
          'section[aria-label="Petros learning proposals"] button:visible',
        )
        .evaluateAll((buttons) =>
          buttons
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.left < -1 || r.right > innerWidth + 1;
            })
            .map((b) => b.textContent),
        );
      record(
        `${width}px ${suffix} actions fit`,
        offscreen.length === 0,
        offscreen,
      );
      if (width !== 1440 || suffix === 'preview')
        await shot(`english-${suffix}-${width}px`);
    }
    await page
      .getByRole('button', { name: 'Preview activities', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'View source material', exact: true })
      .click();
    await idle();
    record(
      `${width}px source drawer fits`,
      await page
        .getByRole('dialog')
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    );
    await shot(`source-${width}px`);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Learning goals', exact: true })
    .click();
  await shot('learning-goals-390px');
  await page
    .getByRole('button', { name: 'Student progress', exact: true })
    .click();
  await shot('progress-390px');
  record(
    'no private content in ordinary teacher DOM',
    !(await page.content()).includes('PRIVATE_M3_SENTINEL'),
  );
  // Separate cookie and disposable institution for an independently qualified reviewer.
  const reviewerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await reviewerContext.route('**/*', async (route) =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  const reviewer = await reviewerContext.newPage();
  reviewer.on('pageerror', (e) => errors.push(e.message));
  await reviewer.goto(info.reviewer, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await reviewer
    .getByRole('heading', { name: 'Lesson reviews', exact: true })
    .waitFor({ timeout: 120000 });
  await idle(reviewer);
  record(
    'separate qualified reviewer sees academic workspace',
    await reviewer.getByLabel('Current reviewer qualification').isVisible(),
  );
  await shot('reviewer-desktop', reviewer);
  await reviewer
    .getByRole('button', { name: 'Inspect private review draft', exact: true })
    .click();
  await idle(reviewer);
  record(
    'qualified private preview uses actual service endpoint',
    await reviewer.getByLabel('Qualified private review').isVisible(),
  );
  record(
    'instrument approval requires reason and explicit independence acknowledgement',
    await reviewer
      .getByRole('button', { name: 'Approve this instrument', exact: true })
      .isDisabled(),
  );
  await reviewer
    .getByLabel('Review reason')
    .fill('Isolated synthetic independent teaching material review.');
  await reviewer
    .getByRole('button', { name: 'Approve teaching material', exact: true })
    .click();
  await idle(reviewer);
  record(
    'qualified teaching decision recorded separately',
    await reviewer
      .getByText('Approved for this revision', { exact: true })
      .isVisible(),
  );
  await shot('reviewer-decision-desktop', reviewer);
  await reviewer.setViewportSize({ width: 360, height: 844 });
  await shot('reviewer-360px', reviewer);
  record(
    'reviewer mobile contains controls',
    await reviewer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await reviewerContext.close();
  record('zero browser runtime errors', errors.length === 0, errors);
  record(
    'no external browser calls',
    deniedExternal.length === 0,
    deniedExternal,
  );
} catch (e) {
  errors.push(e.message);
  await shot('diagnostic');
  writeFileSync(
    resolve(out, 'diagnostic.txt'),
    await page.locator('body').innerText(),
  );
  process.exitCode = 1;
}
writeFileSync(
  resolve(out, 'results.json'),
  JSON.stringify(
    {
      checks,
      errors,
      deniedExternal,
      screenshots,
      requests,
      fixtureLabel:
        'Actual institution portal with real M3 service calls and disposable App-role PostgreSQL; no live AI, student publication or learning evidence',
    },
    null,
    2,
  ),
);
await browser.close();
console.log(
  JSON.stringify({
    output: out,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    errors,
  }),
);
