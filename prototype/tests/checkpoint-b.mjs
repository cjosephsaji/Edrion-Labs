import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const browser = await chromium.launch({
  executablePath:
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const home = async () => {
    await page
      .getByRole('button', { name: 'Petros Showcase', exact: true })
      .click();
  };
  const start = async (name) => {
    await page
      .getByRole('button', { name: `Learn ${name}`, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Start lesson', exact: true })
      .click();
  };
  await page.goto('http://127.0.0.1:3021/prototype');
  await start('AI_Module_4.pdf');
  await page
    .getByRole('button', { name: 'Apply rule · Tweety', exact: true })
    .click();
  await page.getByText('from Bird(Tweety) + rule', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'ASK CanFly(Tweety)?', exact: true })
    .click();
  await page
    .getByText('CanFly(Tweety): not entailed', { exact: true })
    .waitFor();
  await page.screenshot({
    path: 'evidence/checkpoint-b-knowledge.png',
    fullPage: true,
  });
  await home();
  await start('EHS_Module_3.pdf');
  for (const n of [1, 2, 5])
    await page
      .getByRole('button', { name: new RegExp('^Inspect hazard ' + n + ':') })
      .click();
  await page
    .getByRole('button', { name: 'Show safer setup', exact: true })
    .click();
  await page.getByRole('img', { name: /Safer illustration/ }).waitFor();
  await page.screenshot({
    path: 'evidence/checkpoint-b-hazards.png',
    fullPage: true,
  });
  await home();
  await start('EHS_Module_5.pdf');
  await page
    .getByRole('button', {
      name: '+ Treat wastewater before discharge',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: '+ Reduce agrochemical runoff', exact: true })
    .click();
  if (
    (await page
      .getByText('Source controlled in illustration', { exact: true })
      .count()) !== 2
  )
    throw Error('Expected two controls');
  await page.screenshot({
    path: 'evidence/checkpoint-b-river.png',
    fullPage: true,
  });
  await home();
  await page
    .getByRole('button', {
      name: 'How does artificial intelligence work?',
      exact: false,
    })
    .click();
  await page.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await page.getByRole('slider', { name: 'Connection weight' }).fill('1.5');
  await page.getByText('3.0', { exact: true }).first().waitFor();
  await page.screenshot({
    path: 'evidence/checkpoint-b-network.png',
    fullPage: true,
  });
  await home();
  await page
    .getByRole('button', { name: 'Is time travel possible?', exact: false })
    .click();
  await page.getByRole('button', { name: 'Start lesson', exact: true }).click();
  await page.getByRole('button', { name: 'Try 0.8c' }).click();
  await page.getByText('6.00 traveler years', { exact: true }).waitFor();
  await page.screenshot({
    path: 'evidence/checkpoint-b-clocks.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Ask Petros A question', exact: false })
    .click();
  await page
    .getByRole('textbox', { name: 'Ask Petros a question' })
    .fill('Why does this clock run differently?');
  await page.getByRole('button', { name: 'Ask Petros', exact: true }).click();
  await page.getByText('Model unavailable', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Resume explanation · same step' })
    .click();
  await home();
  await page
    .getByRole('textbox', { name: 'Explore any topic' })
    .fill('Why do stars form?');
  await page
    .getByRole('button', { name: 'Let’s explore', exact: false })
    .click();
  await page.getByText(/No qualified read-only model connector/).waitFor();
  await writeFile(
    'evidence/checkpoint-b-results.json',
    JSON.stringify(
      {
        errors,
        kb: true,
        hazards: true,
        river: true,
        network: true,
        clocks: true,
        interruption: true,
        arbitraryTopicFallback: true,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw Error(errors.join('\n'));
} finally {
  await browser.close();
}
