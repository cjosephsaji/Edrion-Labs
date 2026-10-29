import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('..', '..', 'docs/verification/petros-v2/m2g-2026-10-13');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  await page.goto('http://127.0.0.1:4873');
  await page.waitForSelector('#units button');
  const evidence = await page.evaluate(async () => (await fetch('/runs.json')).json());
  if (
    evidence.providerCalls !== 0 ||
    evidence.semanticReview?.cases.length !== 38 ||
    evidence.qualityCategories.cloud.native.recovered !== 19
  )
    throw new Error('M2G_INSPECTOR_EVIDENCE_MISMATCH');
  await page.selectOption('#document', 'cloud-models.pptx');
  await page.selectOption('#surface', '5');
  await page
    .getByRole('button', { name: /^figure/ })
    .first()
    .click();
  await page.screenshot({ path: resolve(output, 'inspector-flattened.png'), fullPage: true });
  await page.selectOption('#document', 'argument.pdf');
  await page
    .getByRole('button', { name: /survey of 120/ })
    .first()
    .click();
  await page.screenshot({ path: resolve(output, 'inspector-english.png'), fullPage: true });
  await page.locator('#qualityCategories').evaluate((element) => {
    element.parentElement.open = true;
  });
  await page.locator('#providerExecution').evaluate((element) => {
    element.parentElement.open = true;
  });
  await page.screenshot({ path: resolve(output, 'inspector-quality.png'), fullPage: true });
  writeFileSync(
    resolve(output, 'browser-qa.json'),
    JSON.stringify(
      {
        url: 'http://127.0.0.1:4873',
        actualProviderCalls: 0,
        independentReviews: 0,
        sources: evidence.runs
          .filter((run) => ['cloud-models.pptx', 'argument.pdf'].includes(run.name))
          .map((run) => ({
            name: run.name,
            originalHash: run.originalHash,
            revisionId: run.revision.id,
          })),
        cases: [
          'Authentic flattened crop, OCR null confidence, no native relationship',
          'English exact survey source unit',
          'Separate native/OCR/vision and provider execution categories',
        ],
        screenshots: ['inspector-flattened.png', 'inspector-english.png', 'inspector-quality.png'],
        status: 'passed',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
