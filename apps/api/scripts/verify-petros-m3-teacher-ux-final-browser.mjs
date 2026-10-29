import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..'),
  out = resolve(
    root,
    'docs/verification/petros-v2/m3-teacher-ux-final-evidence/browser',
    new Date().toISOString().replaceAll(':', '-'),
  );
mkdirSync(out, { recursive: true });
const info = JSON.parse(
  readFileSync(
    resolve(
      root,
      'docs/verification/petros-v2/m3-teacher-ux-final-evidence/demo-info.json',
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
async function activityShot(name) {
  await page.getByLabel('Read-only activity preview').evaluate(el=>{
    const main=el.closest('main');
    if(main) {const nav=document.querySelector('[aria-label="Lesson preparation steps"]');const offset=60+(nav?.getBoundingClientRect().height??90)+12;main.scrollTop+=el.getBoundingClientRect().top-main.getBoundingClientRect().top-offset;}
  });
  await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});
  screenshots.push(name+'.png');
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
  const r = await ctx.request.post('http://127.0.0.1:4913/v1' + path, {
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
  record('ordinary class heading hides UUID subject codes',await page.getByRole('heading',{level:1}).allTextContents().then(texts=>texts.every(t=>t==='Cloud Computing')));
  record('one primary lesson status hides revision numbers',(await page.getByLabel('Lesson status').count())===1 && !(await page.getByLabel('Lesson status').innerText()).includes('revision'));
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
        .getByText('Objective wording changed', { exact: true })
        .isVisible()),
  );
  await page.getByRole('button',{name:'Edit objective 1',exact:true}).click();
  await page.getByLabel('Objective wording').fill('Unsaved wording to cancel');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  record('cancel editing preserves saved objective',await page.getByRole('heading',{name:corrected,exact:true}).isVisible());
  await page.getByLabel('More actions for objective 1').click();
  await page.getByRole('button',{name:'Keep this objective',exact:true}).click();
  await idle();
  record('keep objective is a draft choice with no academic approval',await page.getByText('Kept in draft · academic review still required',{exact:true}).isVisible() && !(await page.getByLabel('Lesson status').innerText()).includes('Teaching approved'));
  await page.getByLabel('More actions for objective 1').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Move down',exact:true}).focus();
  await page.keyboard.press('Enter');
  await idle();
  record('reorder changes displayed objective order',await page.getByRole('article',{name:'Objective 2',exact:true}).getByRole('heading',{name:corrected,exact:true}).isVisible());
  await page.getByLabel('More actions for objective 2').click();
  await page.getByRole('button',{name:'Move up',exact:true}).click();
  await idle();
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
    (await page.getByRole('dialog').locator('p').filter({hasText:/Slide 3/}).isVisible()) &&
      (await page.getByRole('cell', { name: 'IaaS', exact: true }).isVisible()),
  );
  record(
    'source dialog receives focus',
    await page
      .getByRole('dialog')
      .evaluate((e) => e.contains(document.activeElement)),
  );
  for(let i=0;i<3;i++) await page.keyboard.press('Tab');
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
    .getByLabel('Source cards to classify').waitFor();
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
  await page.getByRole('button',{name:'Change activity',exact:true}).click();
  await page.getByLabel('Lesson activity').selectOption(oldChoice);
  await idle();
  await page.keyboard.press('Escape');
  await page.getByLabel('Source cards to classify').waitFor();
  record('classification board uses actual source cells', await page.getByLabel('Source cards to classify').innerText().then(t=>t.includes('Operating system')&&t.includes('Physical hardware')));
  for(const [model,values] of [['PaaS',['Application code','Runtime']],['SaaS',['Access policy','Application platform']],['IaaS',['Operating system','Physical hardware']]]) {
    await page.getByRole('button',{name:model,exact:true}).click();
    const text=await page.getByLabel('Source cards to classify').innerText();
    record(model+' cards are the exact table cells',values.every(v=>text.includes(v)));
  }
  await activityShot('cloud-objective-1-preview');
  await page
    .getByRole('button', { name: 'Next activity', exact: true })
    .click();
  record(
    'next objective preview available',
    await page.getByText('Objective 2 of 2', { exact: true }).isVisible(),
  );
  const secondPreview=page.getByLabel('Read-only activity preview');
  record('second cloud task compares only virtualization concepts', (await secondPreview.innerText()).includes('allocated CPU and memory budget') && !(await secondPreview.innerText()).includes('IaaS') && (await secondPreview.getByRole('heading',{name:'Logical resources',exact:true}).count())===1 && (await secondPreview.getByRole('heading',{name:'Physical hardware',exact:true}).count())===1);
  record('comparison creates no directional conceptual proposal', await secondPreview.getByText('Unreviewed connection proposals',{exact:true}).count()===0);
  await activityShot('cloud-objective-2-preview');
  await page.getByRole('button',{name:'View source material',exact:true}).scrollIntoViewIfNeeded();
  const beforeSourceScroll=await page.locator('main').evaluate(e=>e.scrollTop);

  await page.getByRole('button',{name:'View source material',exact:true}).click();
  await page.getByRole('dialog').getByText(/Virtualization separates logical/).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='View source material');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  record('source drawer restores its trigger and scroll',await page.getByRole('button',{name:'View source material',exact:true}).evaluate(e=>e===document.activeElement) && Math.abs(await page.locator('main').evaluate(e=>e.scrollTop)-beforeSourceScroll)<2,{before:beforeSourceScroll,after:await page.locator('main').evaluate(e=>e.scrollTop)});
  record('source drawer returns to the same activity',await page.getByText('Objective 2 of 2',{exact:true}).isVisible());
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Preview lesson',exact:true}).click();
  record('Back Next retains selected objective',await page.getByText('Objective 2 of 2',{exact:true}).isVisible());
  for(const width of [1440,1280,768,390,360]) {
    await page.setViewportSize({width,height:width<700?844:1000});
    await activityShot(`cloud-comparison-${width}px`);
    record(`${width}px cloud comparison does not overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Previous activity',exact:true}).click();
    await page.getByLabel('Source cards to classify').waitFor();
    await activityShot(`cloud-classification-${width}px`);
    record(`${width}px classification categories fit`,await page.getByLabel('Classification categories').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await page.getByRole('button',{name:'Next activity',exact:true}).click();
  }
  await page.setViewportSize({width:1440,height:1000});
  await page
    .getByRole('button', { name: 'Previous activity', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue to submission', exact: true })
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
      .getByLabel('Lesson status').filter({hasText:'Submitted for review'})
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
    await context.request.get('http://127.0.0.1:4913/v1' + base + '/sources')
  ).json();
  const source = sources.items.find((s) => s.title === 'cloud-models.pptx');
  let serverView = await (
    await context.request.get(
      'http://127.0.0.1:4913/v1' + base + '/' + source.proposalId,
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
      'http://127.0.0.1:4913/v1' + base + '/' + source.proposalId,
    )
  ).json();
  record(
    'explicit retry uses latest version and saves local wording',
    serverView.proposal.objectives[0].wording === local &&
      serverView.proposal.version === concurrent.body.proposal.version + 1,
  );
  record('editing a submitted lesson clears submitted state and approval',serverView.proposal.state==='needs_source_review' && !Object.values(serverView.review).some(r=>r.status==='approved') && (await page.getByLabel('Lesson status').innerText()).includes('Needs your attention'));
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
      'http://127.0.0.1:4913/v1' + base + '/' + source.proposalId,
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
  writeFileSync(resolve(out,'cloud-current-view.json'),JSON.stringify(serverView,null,2));
  const sourceEvidence=[];
  for(const ref of serverView.proposal.source.references) {
    const result=await context.request.get('http://127.0.0.1:4913/v1'+base+'/'+source.proposalId+'/evidence/'+ref.unitId);
    const evidence=await result.json();
    record('Cloud evidence resolves actual eligible unit '+ref.unitId,result.status()===200 && evidence.id===ref.unitId);
    sourceEvidence.push(evidence);
  }
  writeFileSync(resolve(out,'cloud-source-evidence.json'),JSON.stringify(sourceEvidence,null,2));
  const task = serverView.proposal.taskCandidates.find(
    (t) => t.kind !== 'formative_practice',
  );
  const privateGet = await context.request.get(
    'http://127.0.0.1:4913/v1' +
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
    .getByText('Student assignment unavailable', { exact: true })
    .waitFor();
  record(
    'no fake assignment action when no recipients are available',
    (await page
      .getByRole('button', { name: 'Assign learning goal', exact: true })
      .count()) === 0,
  );
  record('learning goals show both enrolled permitted fixture recipients',await page.getByText('2 students on the class list · 2 permitted recipients for learning goals',{exact:true}).isVisible());
  const recipientResponse=await context.request.get('http://127.0.0.1:4913/v1'+base.replace('/proposals','/guidance'));
  const recipientData=await recipientResponse.json();
  record('recipient service returns two actual authorized students',recipientData.students.length===2 && recipientData.assignmentAvailability.available===false);
  const assignmentDenied=await post(base.replace('/proposals','/guidance'),{});
  record('demo refuses assignment instead of fabricating a receipt',assignmentDenied.status===403);
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
  record('English objective addresses claim and evidence',await page.getByRole('article',{name:'Objective 1',exact:true}).getByRole('heading').innerText().then(t=>t.includes('claim')&&t.includes('evidence')));
  await page.getByRole('button',{name:'Edit objective 1',exact:true}).click();
  const originalEnglish=await page.getByLabel('Objective wording').inputValue();
  await page.getByLabel('Objective wording').fill('Identify the author’s claim and cite the evidence offered for it.');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await idle();
  record('English edit is source validated and saved',await page.getByRole('heading',{name:'Identify the author’s claim and cite the evidence offered for it.',exact:true}).isVisible());
  await shot('english-objectives-desktop');
  await page
    .getByRole('button', { name: 'Preview lesson', exact: true })
    .click();
  await activityShot('english-activity-preview');
  record('English asks for a claim evidence and explanation',await page.getByLabel('Read-only activity preview').innerText().then(t=>t.includes('author’s claim')&&t.includes('evidence')&&t.includes('120 learners')));
  await page.getByRole('button',{name:'Next activity',exact:true}).click();
  record('English survey activity asks about support and assumptions',await page.getByLabel('Read-only activity preview').innerText().then(t=>t.includes('survey') && t.includes('assumption') && !t.includes('IaaS')));
  await activityShot('english-survey-preview');
  await page.getByRole('button',{name:'Previous activity',exact:true}).click();

  await page.getByRole('button',{name:'View source material',exact:true}).click();
  await page.getByRole('dialog').getByText(/council should extend/).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:/Source section 2/}).click();
  await page.getByRole('dialog').getByText(/survey of 120 learners/).waitFor();
  record('English survey evidence is directly inspectable',true);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Continue to submission',exact:true}).click();
  await page.getByRole('button',{name:'Submit for review',exact:true}).click();
  await idle();
  record('English current revision submitted',await page.getByLabel('Lesson status').innerText().then(t=>t.includes('Submitted for review')));
  const englishIds=new URL(info.english).pathname.split('/').filter(Boolean);
  const englishBase=`/portal/teaching/${englishIds[1]}/${englishIds[2]}/proposals`;
  const englishSources=await (await context.request.get('http://127.0.0.1:4913/v1'+englishBase+'/sources')).json();
  const englishId=englishSources.items.find(s=>s.title==='argument.pdf').proposalId;
  const englishView=await (await context.request.get('http://127.0.0.1:4913/v1'+englishBase+'/'+englishId)).json();
  writeFileSync(resolve(out,'english-current-view.json'),JSON.stringify(englishView,null,2));
  const englishRelease=await post(englishBase+'/'+englishId+'/release',{commandId:crypto.randomUUID(),expectedVersion:englishView.proposal.version});
  record('English unauthorized release denied',[403,409,422].includes(englishRelease.status),{status:englishRelease.status});
  await shot('english-submitted-status');

  await page.getByRole('button',{name:'Preview activities',exact:true}).click();
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
      if(suffix==='preview') await activityShot(`english-activity-${width}px`);
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
  await page.setViewportSize({width:1440,height:1000});
  await go(info.cloud+'#petros-lessons-material');
  await page.getByLabel('Teaching material').selectOption({label:'m2fa/cloud-notes.docx'});
  await page.getByRole('button',{name:'Prepare document outline',exact:true}).click();
  await idle();
  const beforeRemove=await page.getByRole('article',{name:/^Objective \d+$/}).count();
  record('permitted Word source retains outline preparation',beforeRemove>1);
  await page.getByLabel('More actions for objective 2').click();
  await page.getByRole('button',{name:'Remove from lesson',exact:true}).click();
  await idle();
  record('objective removal saves an immutable smaller draft',await page.getByRole('article',{name:/^Objective \d+$/}).count()===beforeRemove-1);
  await page.getByRole('button',{name:'Version history',exact:true}).click();
  await page.getByRole('button',{name:'Inspect previous revision',exact:true}).click();
  await idle();
  record('removed objective remains inspectable in prior revision',await page.getByRole('dialog').getByText(/read only/).isVisible());
  await page.keyboard.press('Escape');
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
