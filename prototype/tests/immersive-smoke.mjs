import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const b = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
  args: ['--use-angle=metal'],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
try {
  await p.goto('http://127.0.0.1:3021/prototype');
  await p
    .getByRole('button', { name: 'Learn AI_Module_3.pdf', exact: true })
    .click();
  await p
    .getByRole('button', { name: 'Enter Petros World', exact: true })
    .click();
  await p.getByRole('dialog', { name: 'Entering Petros World' }).waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'evidence/redesign/portal.png' });
  await p
    .getByRole('dialog', { name: 'Entering Petros World' })
    .waitFor({ state: 'detached', timeout: 30000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: 'evidence/redesign/arrival.png' });
  await p.getByRole('button', { name: 'Find my module', exact: true }).click();
  await p
    .getByRole('button', { name: 'Retrieve this book', exact: false })
    .click();
  await p
    .getByRole('button', { name: 'Let me show you', exact: true })
    .waitFor();
  await p.screenshot({ path: 'evidence/redesign/book.png' });
  await p.getByRole('button', { name: 'Let me show you', exact: true }).click();
  await p.waitForTimeout(1100);
  await p.screenshot({ path: 'evidence/redesign/teaching.png' });
  for (const answer of [
    'Opponent responds strategically',
    'Root MAX + children MIN',
  ]) {
    await p
      .getByRole('button', { name: 'Try it yourself', exact: true })
      .click();
    await p
      .getByRole('group', { name: 'World practice choices' })
      .getByRole('button', { name: answer, exact: true })
      .click();
    await p
      .getByRole('button', { name: 'Check practice answer', exact: true })
      .click();
    await p
      .getByRole('button', { name: 'Continue lesson', exact: true })
      .click();
    await p.waitForTimeout(1050);
  }
  await p.getByRole('button', { name: 'Try it yourself', exact: true }).click();
  await p.waitForTimeout(1000);
  const point = await p.evaluate(
    () => window.__PETROS_WORLD_METRICS__.picks['leaf-0-0'],
  );
  const box = await p.locator('canvas').boundingBox();
  await p.mouse.click(box.x + point.x, box.y + point.y);
  await p
    .getByRole('button', { name: 'Check practice answer', exact: true })
    .click();
  await p.waitForTimeout(950);
  await p.screenshot({ path: 'evidence/redesign/practice.png' });
  await p
    .getByRole('button', { name: 'Ask Petros anything', exact: true })
    .click();
  await p
    .getByRole('textbox', { name: 'Ask Petros anything', exact: true })
    .fill('Why did MIN A choose 3 instead of 5?');
  await p.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await p
    .getByText('Prepared source-linked explanation', { exact: true })
    .waitFor();
  await p.screenshot({ path: 'evidence/redesign/contextual-answer.png' });
  await p
    .getByRole('button', {
      name: 'Continue lesson · same checkpoint',
      exact: true,
    })
    .click();
  await p
    .getByRole('heading', {
      name: 'At MIN A, choose between 3 and 5.',
      exact: true,
    })
    .waitFor();
  await p
    .getByRole('button', { name: 'Exit Petros World', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: 'Leaving Petros World' })
    .waitFor({ state: 'detached' });
  await p
    .getByRole('heading', {
      name: 'At MIN A, choose between 3 and 5.',
      exact: true,
    })
    .waitFor();
  await writeFile(
    'evidence/redesign/smoke.json',
    JSON.stringify(
      {
        errors,
        portal: true,
        book: true,
        spatialNodePick: true,
        contextualAnswer: true,
        exactResume: true,
        classicPreserved: true,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await b.close();
}
