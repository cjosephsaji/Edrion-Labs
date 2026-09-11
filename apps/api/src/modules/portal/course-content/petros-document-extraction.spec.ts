import { describe, expect, it } from 'vitest';
import { buildPdfSourceStructure, pageTextFromStructure } from './petros-document-extraction';

const checksum = 'a'.repeat(64);

describe('Petros structured document extraction', () => {
  it('preserves line order, heading boundaries, equations and source geometry', () => {
    const structure = buildPdfSourceStructure(checksum, [{
      page: 1, width: 600, height: 800,
      items: [
        { str: 'INTEGRATION AS ACCUMULATION', transform: [1, 0, 0, 22, 50, 740], width: 330, height: 22 },
        { str: 'The area grows as x moves right.', transform: [1, 0, 0, 11, 50, 700], width: 220, height: 11 },
        { str: 'A = ∫ f(x) dx', transform: [1, 0, 0, 12, 50, 660], width: 110, height: 12 },
      ],
    }]);
    expect(structure.pages[0]?.regions.map((region) => region.kind)).toEqual(['heading', 'paragraph', 'equation']);
    expect(structure.pages[0]?.regions[0]?.bbox).toEqual([50, 740, 380, 762]);
    expect(pageTextFromStructure(structure)[0]).toContain('INTEGRATION AS ACCUMULATION\nThe area grows');
  });

  it('does not claim an image-only page was understood', () => {
    const structure = buildPdfSourceStructure(checksum, [{ page: 1, width: 600, height: 800, items: [] }]);
    expect(structure.extractionComplete).toBe(false);
    expect(structure.pages[0]?.regions[0]).toMatchObject({ kind: 'unresolved', confidence: 0 });
    expect(structure.warnings[0]).toContain('no extracted digital text');
  });
});

