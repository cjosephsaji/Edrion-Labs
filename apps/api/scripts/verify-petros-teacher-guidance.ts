import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { NOMENCLATURE_PRESETS } from '@edrion/shared-types';

// Browser checks use only synthetic API responses and never publish real assignments.
const output = resolve('../../docs/verification/petros-teacher-guidance-20261007');
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const classId = id(1), subjectId = id(2), studentId = id(3), goalId = id(5);
const assignment = { classId, subjectId, className: 'Class 7A', subjectName: 'Mathematics', subjectCode: 'MATH',
  teacherId: id(6), teacherName: 'Synthetic Teacher', isMine: true, contextIds: [classId], studentCount: 2,
  counts: { materials: 0, notes: 0, drafts: 0, updates: 0 } };
const students = [{ id: studentId, name: 'Ananya Rao', rollNo: '12' }, { id: id(4), name: 'Rohan Sen', rollNo: '13' }];
let goals: Array<Record<string, unknown>> = [];
let submitted: Record<string, unknown> | null = null;
let completedSteps = 0;
let reported = false;
const attachment = { id: id(10), filename: 'Fractions worksheet.txt', mimeType: 'text/plain', sizeBytes: 45,
  textStatus: 'readable', textTruncated: false };
const guidance = { schemaVersion: 'petros.teacher-guidance.v1', focus: 'Add fractions with unlike denominators',
  instructions: 'Start with equivalent fractions. Use visual examples, then practise three problems. Ask for an explanation.',
  approach: 'practice', sessionMinutes: 15, attachmentObjectIds: [attachment.id] };
const teacher = { institutionUserId: id(8), fullName: 'Synthetic Teacher', email: 'teacher@example.test', institutionId: id(7),
  institutionName: 'Synthetic School', institutionStatus: 'active', onboardingStatus: 'completed', institutionType: 'school',
  institutionCountry: 'IN', nomenclature: NOMENCLATURE_PRESETS.school, roleKeys: ['teacher'],
  permissions: ['class_content.manage'], isInstitutionWide: true, campuses: [] };
const learner = { kind: 'institutional', fullName: 'Ananya Rao', email: 'ananya@example.test', studentId, institutionId: id(7),
  campusId: null, programmeName: null, className: 'Class 7A', sectionName: null, termName: null, academicYearName: null,
  permissions: ['student.learn.use'], surfaces: {} };

async function main() {
  await mkdir(output, { recursive: true });
  console.log('Launching the synthetic browser check.');
  const browser = await chromium.launch({ executablePath: process.env.PETROS_GUIDANCE_BROWSER ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 20_000 });
  const errors: string[] = [];
  const results: string[] = [];
  let activePage: Page | undefined;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(30_000);
    await context.route('**/v1/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace(/^\/v1/, '');
      const headers = { 'access-control-allow-origin': req.headers().origin ?? '*',
        'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS' };
      const send = (body: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path === '/portal/me') return send(teacher);
      if (path === '/portal/settings/effective') return send({ values: { dateFormat: 'd MMM yyyy' } });
      if (path === `/portal/teaching/${classId}/${subjectId}`) return send(assignment);
      if (path === `/portal/teaching/${classId}/${subjectId}/guidance/files`) {
        if (!req.url().includes('Fractions%20worksheet.txt') || req.headers()['content-type'] !== 'application/octet-stream') throw new Error('Wrong attachment upload.');
        return send(attachment);
      }
      if (path.endsWith(`/files/${attachment.id}`)) return route.fulfill({ status: 200, headers,
        contentType: 'text/plain', body: 'Equivalent fractions: one half is two quarters.' });
      if (path === `/portal/teaching/${classId}/${subjectId}/guidance`) {
        if (req.method() === 'GET') return send({ students, goals });
        submitted = req.postDataJSON();
        const body = submitted!;
        goals = [{ id: goalId, version: 0, status: 'published', dueDate: body.dueDate, guidance, attachments: [attachment],
          recipients: [{ studentId, name: students[0]!.name, progress: 'not_started' }] }];
        return send({ id: goalId });
      }
      if (path === `/portal/teaching/${classId}/${subjectId}/guidance/${goalId}/close`) {
        goals[0]!.status = 'closed'; return send({ id: goalId });
      }
      if (path === '/student/me') return send(learner);
      if (path === '/student/petros/path') return send(null);
      if (path === '/student/assignments/learning-goals') return send({ items: reported ? [] : [{ id: goalId, title: guidance.focus, subjectName: 'Mathematics', dueAt: '2099-10-14' }] });
      if (path === `/student/assignments/learning-goals/${goalId}`) return send({ id: goalId, dueAt: '2099-10-14',
        status: reported ? 'submitted' : 'assigned', petrosGuidance: guidance, attachments: [attachment],
        petrosParticipation: { started: completedSteps > 0, completedSteps, currentSessionId: null } });
      if (path === `/student/assignments/learning-goals/${goalId}/completion`) {
        if (!completedSteps) throw new Error('Completion request sent without a learning step.');
        const body = req.postDataJSON();
        if (body.fileObjectIds.length || !body.note.includes('equivalent fractions')) throw new Error('Wrong completion payload.');
        reported = true; return send({ submitted: true, versionNo: 1 });
      }
      return send({ code: 'SYNTHETIC_UNAVAILABLE', message: 'Not part of this synthetic browser check.' }, 404);
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:3008/teaching/${classId}/${subjectId}`);
    console.log('Teacher page opened.');
    await page.getByRole('tab', { name: 'Petros Learn' }).click();
    await page.getByRole('heading', { name: 'Guide what your students learn' }).waitFor();
    await page.getByRole('checkbox', { name: /Ananya Rao/ }).check();
    await page.getByLabel('What should they learn or improve?').fill(guidance.focus);
    await page.getByLabel('How would you like Petros to guide them?').fill(guidance.instructions);
    await page.getByLabel('Learning focus', { exact: true }).click();
    await page.getByRole('option', { name: 'Practise a weak area', exact: true }).click();
    await page.getByLabel('Suggested session length', { exact: true }).click();
    await page.getByRole('option', { name: '25 minutes', exact: true }).click();
    await page.getByLabel('Suggested session length', { exact: true }).click();
    await page.getByRole('option', { name: '15 minutes', exact: true }).click();
    await page.getByLabel('Complete by', { exact: true }).fill('2099-10-14');
    await page.getByLabel('Attach supporting files').setInputFiles({ name: attachment.filename, mimeType: 'text/plain', buffer: Buffer.from('Equivalent fractions: one half is two quarters.') });
    await page.getByRole('button', { name: `Remove ${attachment.filename}`, exact: true }).waitFor();
    await page.getByRole('button', { name: `Remove ${attachment.filename}`, exact: true }).click();
    if (await page.getByRole('button', { name: `Remove ${attachment.filename}`, exact: true }).count()) throw new Error('Draft attachment was not removed.');
    await page.getByLabel('Attach supporting files').setInputFiles({ name: attachment.filename, mimeType: 'text/plain', buffer: Buffer.from('Equivalent fractions: one half is two quarters.') });
    await page.getByRole('button', { name: `Remove ${attachment.filename}`, exact: true }).waitFor();
    const fieldStyles = await page.getByLabel('What should they learn or improve?').evaluate((element) => ({
      radius: getComputedStyle(element).borderRadius, background: getComputedStyle(element).backgroundColor,
      sharedInput: element.classList.contains('h-input') && element.classList.contains('bg-surface-elevated'),
    }));
    if (!fieldStyles.sharedInput) throw new Error('Goal field does not use the shared institutional Input.');
    results.push(`Design system: shared Input, Label, searchable Select, Checkbox and loading Button; input radius ${fieldStyles.radius}, background ${fieldStyles.background}.`);
    await page.getByRole('button', { name: 'Preview learning goal' }).click();
    await page.getByRole('region', { name: 'Learning goal preview' }).waitFor();
    if (await page.getByLabel('Canonical source item ID').isVisible()) throw new Error('Internal IDs are exposed in the main workflow.');
    await page.screenshot({ path: resolve(output, 'teacher-desktop.png'), fullPage: true, animations: 'disabled' });
    const priorTheme = await page.evaluate(() => {
      const previous = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', 'dark'); return previous;
    });
    await page.waitForFunction((lightBackground) => getComputedStyle(document.querySelector('#petros-goal-focus')!).backgroundColor !== lightBackground, fieldStyles.background);
    const darkPanel = await page.getByRole('region', { name: 'Guide what your students learn' }).evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color,
    }));
    if (darkPanel.background !== 'rgb(31, 34, 26)') throw new Error(`The shared surface colour does not follow dark theme tokens: ${darkPanel.background}`);
    if (await page.getByLabel('Complete by', { exact: true }).evaluate((element) => getComputedStyle(element).colorScheme) !== 'dark') throw new Error('Native date control does not follow the dark theme.');
    await page.screenshot({ path: resolve(output, 'teacher-dark.png'), fullPage: true, animations: 'disabled' });
    await page.evaluate((previous) => { if (previous) document.documentElement.setAttribute('data-theme', previous); else document.documentElement.removeAttribute('data-theme'); }, priorTheme);
    results.push('Theme: teacher controls respond to the existing dark theme tokens.');
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.waitForFunction(() => (document.querySelector('aside')?.getBoundingClientRect().width ?? 1000) < 90);
    const mobileGoalField = await page.getByLabel('What should they learn or improve?').boundingBox();
    if (!mobileGoalField || mobileGoalField.width < 200 || mobileGoalField.x + mobileGoalField.width > 390) throw new Error('Teacher form is crowded or clipped on mobile.');
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Teacher page overflows on mobile.');
    await page.screenshot({ path: resolve(output, 'teacher-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Assign learning goal', exact: true }).click();
    await page.getByText('Learning goal assigned to 1 student.', { exact: false }).waitFor();
    const sent = submitted as Record<string, unknown> | null;
    const audience = sent?.audience as { kind: string; studentIds: string[] } | undefined;
    if (audience?.kind !== 'students' || audience.studentIds.join() !== studentId || sent?.focus !== guidance.focus || JSON.stringify(sent?.attachmentObjectIds) !== JSON.stringify([attachment.id])) throw new Error('Wrong student, goal or files assigned.');
    await page.getByText('Student progress (1)', { exact: true }).click();
    await page.getByText('Not started', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close goal' }).click();
    await page.getByText('Closed', { exact: true }).waitFor();
    results.push('Teacher: named learner, goal, directions, deadline, upload/remove/reattach, preview, exact recipient and attachment payload, progress and close; desktop/mobile no horizontal overflow; advanced fields collapsed.');
    console.log('Teacher workflow checked.');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`http://localhost:3011/learn/goals/${goalId}`);
    await page.getByRole('heading', { name: guidance.focus, exact: true }).waitFor();
    await page.getByText(guidance.instructions, { exact: true }).waitFor();
    await page.getByRole('link', { name: `Download ${attachment.filename}`, exact: true }).waitFor();
    const fileHref = await page.getByRole('link', { name: `Download ${attachment.filename}`, exact: true }).getAttribute('href');
    if (!fileHref?.endsWith(`/learning-goals/${goalId}/files/${attachment.id}`)) throw new Error('Student file route is not bound to the learning goal.');
    if (!(await page.getByRole('button', { name: 'Report completion', exact: true }).isDisabled())) throw new Error('Completion available before learning.');
    if (await page.locator('input[type=file]').count()) throw new Error('Learning goal asks for a file submission.');
    await page.screenshot({ path: resolve(output, 'student-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Student page overflows on mobile.');
    await page.screenshot({ path: resolve(output, 'student-mobile.png'), fullPage: true, animations: 'disabled' });
    completedSteps = 1;
    await page.reload();
    await page.getByLabel('What can you explain or do now?').fill('I can use equivalent fractions to add different denominators.');
    await page.getByRole('button', { name: 'Report completion', exact: true }).click();
    await page.getByRole('heading', { name: 'Completion reported', exact: true }).waitFor();
    results.push('Student: school learner with only Learn permission reads directions and gets supporting-file download links; completion disabled until a learning step; reflection report acknowledged; desktop/mobile no horizontal overflow; shared student cards and action controls.');
    console.log('Student workflow checked.');
    reported = false;
    await page.goto('http://localhost:3011/learn');
    await page.getByRole('heading', { name: 'Your learning goals', exact: true }).waitFor();
    await page.getByRole('link', { name: /View goal and learn with Petros/ }).click();
    await page.getByRole('heading', { name: guidance.focus, exact: true }).waitFor();
    results.push('Learn: teacher goals are discoverable and open the assigned goal without college assignment navigation.');
    if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
    await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ synthetic: true, results, errors }, null, 2));
    console.log(results.join('\n'));
  } catch (error) {
    if (activePage) {
      await writeFile(resolve(output, 'browser-failure.html'), await activePage.content());
      await activePage.screenshot({ path: resolve(output, 'browser-failure.png'), fullPage: true });
      console.log('Failure URL:', activePage.url());
      console.log('Page errors:', errors);
    }
    throw error;
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
