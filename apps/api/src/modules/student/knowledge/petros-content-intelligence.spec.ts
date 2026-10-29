import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { PptxContentAdapter } from './adapters/pptx-content.adapter';
const path = resolve(
  __dirname,
  '../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources',
);
const read = (name: string) => readFileSync(resolve(path, name));
const pdf = new PdfContentAdapter(new KnowledgePdfProcess()),
  pptx = new PptxContentAdapter(new KnowledgePdfProcess());
describe('M2 actual document bytes in the existing OS sandbox', () => {
  it('extracts and renders actual PDF spans, tables, equations, code, columns and figures', async () => {
    const e = await pdf.extract(read('cloud-reference.pdf'), new AbortController().signal);
    expect(e.pageCount).toBe(2);
    expect(e.surfaces[0]!.preview?.fidelity).toBe('source_render');
    expect(e.elements.some((x) => x.payload.kind === 'table')).toBe(true);
    expect(e.elements.some((x) => x.payload.kind === 'equation')).toBe(true);
    expect(e.elements.some((x) => x.payload.kind === 'code')).toBe(true);
    expect(e.elements.some((x) => x.payload.kind === 'figure')).toBe(true);
    expect(e.surfaces[1]!.warnings.join(' ')).toContain('columns');
  }, 25000);
  it('extracts native PPTX tables, shapes, arrows, images and separates speaker notes', async () => {
    const e = await pptx.extract(read('cloud-models.pptx'), new AbortController().signal);
    expect(e.slideCount).toBe(7);
    expect(e.elements.some((x) => x.payload.kind === 'table')).toBe(true);
    expect(e.elements.some((x) => x.payload.kind === 'diagram')).toBe(true);
    expect(e.elements.some((x) => x.channel === 'notes')).toBe(true);
  }, 25000);
});

import { convertPresentationForM2 } from '../materials/presentation-converter';
it('renders approved real PPTX bytes with a credential-free, network-denied Office sandbox', async () => {
  const bytes = await convertPresentationForM2(
    read('cloud-models.pptx'),
    'pptx',
    new AbortController().signal,
    '/Users/macbook/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/MacOS/soffice',
  );
  expect(bytes.subarray(0, 16).toString()).toContain('%PDF-');
  const e = await pdf.extract(bytes, new AbortController().signal);
  expect(e.pageCount).toBe(7);
}, 30000);
