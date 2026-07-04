import Handlebars from 'handlebars';
import type { HeaderConfig } from '@edrion/schemas';

/**
 * Handlebars → HTML → (Playwright) PDF. The Handlebars environment is restricted: default
 * HTML-escaping stays ON for every field value and only a small allowlisted helper set is
 * registered — templates are institution-editable content, never trusted code.
 */
const hb = Handlebars.create();
hb.registerHelper('upper', (v: unknown) => String(v ?? '').toUpperCase());
hb.registerHelper('lower', (v: unknown) => String(v ?? '').toLowerCase());
hb.registerHelper('date', (v: unknown) => {
  const d = v ? new Date(String(v)) : new Date();
  return Number.isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
});
hb.registerHelper('eq', (a: unknown, b: unknown) => a === b);
hb.registerHelper('inc', (v: unknown) => Number(v) + 1);

export interface RenderBranding {
  institutionName: string;
  logoUrl: string | null;
}

export function buildDocumentHtml(opts: {
  html: string;
  css: string;
  headerConfig: HeaderConfig;
  branding: RenderBranding;
  payload: Record<string, unknown>;
  title: string;
}): string {
  const template = hb.compile(opts.html, { strict: false, noEscape: false });
  const header = opts.headerConfig ?? {};
  const body = template({
    ...opts.payload,
    title: opts.title,
    institution: opts.branding,
    header,
    today: new Date().toISOString().slice(0, 10),
  });
  const logo =
    header.logoPosition !== 'none' && opts.branding.logoUrl
      ? `<img class="doc-logo pos-${header.logoPosition ?? 'left'}" src="${hb.escapeExpression(opts.branding.logoUrl)}" alt="" />`
      : '';
  const instName =
    header.showInstitutionName === false
      ? ''
      : `<div class="doc-inst-name">${hb.escapeExpression(opts.branding.institutionName)}</div>`;
  const subtitle = header.subtitle ? `<div class="doc-subtitle">${hb.escapeExpression(header.subtitle)}</div>` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; font-size: 12pt; line-height: 1.5; }
  .doc-header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
  .doc-header.center { flex-direction: column; text-align: center; }
  .doc-logo { height: 56px; }
  .doc-inst-name { font-size: 18pt; font-weight: bold; }
  .doc-subtitle { font-size: 10pt; color: #444; }
  .doc-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 12px 0; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #999; padding: 4px 8px; }
  ${opts.css}
</style></head>
<body>
  <div class="doc-header ${header.logoPosition === 'center' ? 'center' : ''}">${logo}<div>${instName}${subtitle}</div></div>
  <div class="doc-title">${hb.escapeExpression(opts.title)}</div>
  ${body}
</body></html>`;
}

/** Render HTML to a PDF buffer with the system Chrome via playwright-core. */
export async function renderPdf(html: string): Promise<Buffer> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
