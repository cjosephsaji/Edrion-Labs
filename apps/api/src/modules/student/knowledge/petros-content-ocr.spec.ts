import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { PptxContentAdapter } from './adapters/pptx-content.adapter';
import { extractSelectedOcr } from './petros-content-ocr';
import { selectVisualRegions } from './petros-content-intelligence.service';
import { sha256 } from './adapters/content-adapter';
const sources = resolve(
  __dirname,
  '../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources',
);
describe('Actual bounded, credential-free local OCR', () => {
  it.each(['image-only.pdf', 'cloud-models.pptx'])(
    'reads pixel labels in %s without claiming diagram edges',
    async (name) => {
      const worker = new KnowledgePdfProcess(),
        adapter = name.endsWith('.pdf')
          ? new PdfContentAdapter(worker)
          : new PptxContentAdapter(worker);
      const e = await adapter.extract(
        readFileSync(resolve(sources, name)),
        new AbortController().signal,
      );
      const keys = selectVisualRegions(e)
        .filter((r) => e.elements.find((x) => x.key === r.key)?.payload.kind === 'figure')
        .map((r) => r.key);
      const result = await extractSelectedOcr(e, keys, new AbortController().signal);
      expect(
        result.some(
          (r) =>
            r.status === 'review_required' &&
            r.text.includes('Gateway') &&
            r.text.includes('Worker'),
        ),
      ).toBe(true);
      const r = result.find((r) => r.status === 'review_required')!;
      if (r.status !== 'review_required') throw new Error('OCR missing');
      expect(r.sourceHash).toBe(e.originalHash);
      expect(sha256(Buffer.from(r.crop.data, 'base64'))).toBe(r.crop.hash);
      expect(r.confidence).toBeNull();
      expect(r.labels.every((l) => l.region.x >= 0 && l.region.x + l.region.width <= 1)).toBe(true);
    },
    20000,
  );
  it('rejects more than six regions and cancellation before dispatch', async () => {
    const e = await new PdfContentAdapter(new KnowledgePdfProcess()).extract(
      readFileSync(resolve(sources, 'image-only.pdf')),
      new AbortController().signal,
    );
    await expect(
      extractSelectedOcr(
        e,
        Array.from({ length: 7 }, (_, i) => `p${i}`),
        new AbortController().signal,
      ),
    ).rejects.toThrow('REGION_LIMIT');
    const a = new AbortController();
    a.abort();
    await expect(extractSelectedOcr(e, [e.elements[0]!.key], a.signal)).rejects.toThrow();
  });
});
