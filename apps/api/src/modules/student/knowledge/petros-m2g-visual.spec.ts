import { petrosVerificationOutput } from '../../integrations/petros-verification-output';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { PptxContentAdapter } from './adapters/pptx-content.adapter';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { extractSelectedOcr } from './petros-content-ocr';
import { sha256 } from './adapters/content-adapter';
import { fixtureRevision } from './petros-m2-test-helpers';
import { produceContentUnits } from './petros-content-intelligence.service';

const root = resolve(__dirname, '../../../../../..');
const original = readFileSync(
  resolve(root, 'packages/learn-evals/src/petros-v2/fixtures/sources/cloud-models.pptx'),
);
const output = resolve(petrosVerificationOutput('docs/verification/petros-v2/m2g-2026-10-13/visual/marker'),'..');
const variants = [
  { name: 'reverse-arrow', text: 'IMAGE ONLY: Gateway <- Worker <- Storage' },
  { name: 'remove-arrowhead', text: 'IMAGE ONLY: Gateway -- Worker -- Storage' },
  { name: 'change-label', text: 'IMAGE ONLY: Router -> Worker -> Storage' },
  {
    name: 'unrelated-arrow',
    text: 'IMAGE ONLY: Gateway -> Worker -> Storage',
    extra: 'Cache -> Client',
  },
  { name: 'move-crop', text: 'IMAGE ONLY: Gateway -> Worker -> Storage', move: true },
  { name: 'change-resolution', text: 'IMAGE ONLY: Gateway -> Worker -> Storage', scale: 2 },
  { name: 'held-out-image', text: 'IMAGE ONLY: Router <- Queue <- Disk' },
];

describe('M2-G altered authentic PPTX bytes and raster uncertainty', () => {
  it.each(variants)(
    'does not invent or reuse a flattened relationship: $name',
    async (variant) => {
      const zip = await JSZip.loadAsync(original);
      const scale = variant.scale ?? 1;
      const canvas = createCanvas(700 * scale, 220 * scale);
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.fillStyle = 'white';
      context.fillRect(0, 0, 700, 220);
      context.fillStyle = 'black';
      context.font = '27px Arial';
      context.fillText(variant.text, 35, 77);
      context.font = '23px Arial';
      context.fillText(variant.extra ?? 'Labels and arrows require visual review.', 35, 142);
      zip.file('ppt/media/image1.png', canvas.toBuffer('image/png'));
      if (variant.move) {
        const slide = await zip.file('ppt/slides/slide5.xml')!.async('string');
        zip.file(
          'ppt/slides/slide5.xml',
          slide.replace('x="640080" y="1828800"', 'x="1280160" y="914400"'),
        );
      }
      const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      expect(sha256(bytes)).not.toBe(sha256(original));
      const evidence = await new PptxContentAdapter(new KnowledgePdfProcess()).extract(
        bytes,
        new AbortController().signal,
      );
      const image = evidence.elements.find((element) => element.sourceImage)!;
      expect(image.sourceImage).toBeDefined();
      const revision = fixtureRevision(evidence),
        before = JSON.stringify(revision);
      const units = produceContentUnits(evidence, revision);
      const sourceUnit = units.find(
        (unit) =>
          unit.locator.kind === 'slide' &&
          unit.locator.slide === 5 &&
          unit.payload.kind === 'figure',
      )!;
      expect(sourceUnit.payload.kind).toBe('figure');
      if (sourceUnit.payload.kind !== 'figure') throw new Error('Missing raster figure');
      expect(sourceUnit.payload.relationships).toEqual([]);
      expect(sourceUnit.quality.uncertainties.length).toBeGreaterThan(0);
      const receipts = await extractSelectedOcr(
        evidence,
        [image.key],
        new AbortController().signal,
      );
      const receipt = receipts[0]!;
      expect(receipt.status).toBe('review_required');
      if (receipt.status !== 'review_required') throw new Error(JSON.stringify(receipt));
      expect(receipt.confidence).toBeNull();
      expect(receipt.sourceHash).toBe(sha256(bytes));
      expect(sha256(Buffer.from(receipt.crop.data, 'base64'))).toBe(receipt.crop.hash);
      if (variant.name === 'change-label' || variant.name === 'held-out-image') {
        expect(receipt.text).toContain('Router');
        expect(receipt.text).not.toContain('Gateway');
      }
      if (variant.move && image.locator.kind === 'slide')
        expect(image.locator.region?.y).toBeCloseTo(1 / 7.5);
      if (variant.scale) expect(receipt.crop.width).toBe(1280);
      expect(JSON.stringify(revision)).toBe(before);
      expect(sha256(original)).toBe(
        '5ce5e6b855309556f0990ece00a6d7a2ecf7f7cb9a35f1b0a50b255c061e2c3b',
      );
      mkdirSync(output, { recursive: true });
      writeFileSync(resolve(output, `${variant.name}.pptx`), bytes);
      writeFileSync(
        resolve(output, `${variant.name}.png`),
        Buffer.from(receipt.crop.data, 'base64'),
      );
      writeFileSync(
        resolve(output, `${variant.name}.json`),
        JSON.stringify(
          {
            originalHash: sha256(original),
            revisedHash: sha256(bytes),
            sourceImage: image.sourceImage,
            locator: image.locator,
            receipt,
            relationship: 'unresolved',
            semanticStatus: 'review_required',
            immutableRevisionUnchanged: JSON.stringify(revision) === before,
          },
          null,
          2,
        ),
      );
    },
    20000,
  );
});
