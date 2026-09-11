import type { PetrosDocumentSourceStructure } from '@edrion/schemas';

export const PETROS_DOCUMENT_PARSER_VERSION = 'structured-source-2026-09-08-r1';

export interface PositionedTextItem {
  str: string;
  transform?: ArrayLike<number>;
  width?: number;
  height?: number;
}

interface PdfPageInput {
  page: number;
  width: number | null;
  height: number | null;
  items: PositionedTextItem[];
}

function normalizedText(value: string) {
  return value.replaceAll(String.fromCharCode(0), '').replace(/\s+/g, ' ').trim();
}

function headingLevel(text: string, height: number, medianHeight: number): number | null {
  if (text.length > 180) return null;
  if (height >= medianHeight * 1.55) return 1;
  if (height >= medianHeight * 1.28) return 2;
  if (/^(?:chapter|unit|section)\s+\w+/i.test(text) || /^\d+(?:\.\d+){0,3}\s+\S/.test(text)) return 2;
  if (text.length <= 80 && text === text.toUpperCase() && /[A-Z]/.test(text)) return 3;
  return null;
}

function likelyEquation(text: string) {
  const operators = (text.match(/[=∫∑√±≤≥<>^]/g) ?? []).length;
  return operators >= 1 && /\d|[a-z]/i.test(text) && text.length <= 500;
}

/** Reconstruct lines and blocks from positioned PDF glyph runs without executing document content. */
export function buildPdfSourceStructure(
  checksum: string,
  inputPages: PdfPageInput[],
): PetrosDocumentSourceStructure {
  const warnings: string[] = [];
  const pages = inputPages.map((page) => {
    const usable = page.items
      .map((item, index) => ({
        index,
        text: normalizedText(item.str),
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0),
        width: Math.max(0, Number(item.width ?? 0)),
        height: Math.max(1, Number(item.height ?? Math.abs(Number(item.transform?.[3] ?? 10)))),
      }))
      .filter((item) => item.text);
    const heights = usable.map((item) => item.height).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] ?? 10;
    const lines: typeof usable[] = [];
    for (const item of usable.sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x)) {
      const line = lines.find((candidate) => Math.abs((candidate[0]?.y ?? item.y) - item.y) <= Math.max(2, medianHeight * 0.35));
      if (line) line.push(item);
      else lines.push([item]);
    }
    const orderedLines = lines
      .map((line) => line.sort((a, b) => a.x - b.x))
      .sort((a, b) => (b[0]?.y ?? 0) - (a[0]?.y ?? 0));
    const regions: PetrosDocumentSourceStructure['pages'][number]['regions'] = orderedLines.map((line, order) => {
      const text = line.map((item) => item.text).join(' ').replace(/\s+([,.;:)])/g, '$1');
      const topHeight = Math.max(...line.map((item) => item.height));
      const level = headingLevel(text, topHeight, medianHeight);
      const minX = Math.min(...line.map((item) => item.x));
      const minY = Math.min(...line.map((item) => item.y));
      const maxX = Math.max(...line.map((item) => item.x + item.width));
      const maxY = Math.max(...line.map((item) => item.y + item.height));
      return {
        id: `p${page.page}-r${order + 1}`,
        page: page.page,
        order,
        kind: level ? 'heading' as const : likelyEquation(text) ? 'equation' as const : 'paragraph' as const,
        text,
        ...(level ? { level } : {}),
        bbox: [minX, minY, maxX, maxY] as [number, number, number, number],
        confidence: 1,
      };
    });
    const pageWarnings: string[] = [];
    if (!regions.length) {
      pageWarnings.push('No digital text was extracted; OCR or visual inspection is required.');
      warnings.push(`Page ${page.page} has no extracted digital text.`);
      regions.push({
        id: `p${page.page}-unresolved`, page: page.page, order: 0, kind: 'unresolved', text: '',
        confidence: 0, warning: pageWarnings[0],
      });
    }
    return {
      page: page.page,
      width: page.width,
      height: page.height,
      regions,
      confidence: regions.some((region) => region.kind !== 'unresolved') ? 1 : 0,
      warnings: pageWarnings,
    };
  });
  return {
    parserVersion: PETROS_DOCUMENT_PARSER_VERSION,
    checksum,
    pages,
    warnings,
    extractionComplete: warnings.length === 0,
  };
}

export function pageTextFromStructure(structure: PetrosDocumentSourceStructure) {
  return structure.pages.map((page) => page.regions
    .filter((region) => region.kind !== 'unresolved')
    .map((region) => region.text)
    .filter(Boolean)
    .join('\n'));
}

export function buildSectionSourceStructure(
  checksum: string,
  sections: Array<{ title?: string | null; text?: string | null; rows?: string[][] | null }>,
): PetrosDocumentSourceStructure {
  const pages = sections.map((section, index) => {
    const regions: PetrosDocumentSourceStructure['pages'][number]['regions'] = [];
    if (normalizedText(section.title ?? '')) regions.push({ id: `s${index + 1}-heading`, page: index + 1, order: regions.length, kind: 'heading', text: normalizedText(section.title ?? ''), level: 2, confidence: 1 });
    if (normalizedText(section.text ?? '')) regions.push({ id: `s${index + 1}-text`, page: index + 1, order: regions.length, kind: 'paragraph', text: normalizedText(section.text ?? ''), confidence: 1 });
    if (section.rows?.length) regions.push({ id: `s${index + 1}-table`, page: index + 1, order: regions.length, kind: 'table', text: section.rows.map((row) => row.join(' | ')).join('\n'), confidence: 0.95 });
    if (!regions.length) regions.push({ id: `s${index + 1}-unresolved`, page: index + 1, order: 0, kind: 'unresolved', text: '', confidence: 0, warning: 'The section contains no extractable text.' });
    return { page: index + 1, width: null, height: null, regions, confidence: regions[0]?.kind === 'unresolved' ? 0 : 1, warnings: regions[0]?.kind === 'unresolved' ? ['The section contains no extractable text.'] : [] };
  });
  return { parserVersion: PETROS_DOCUMENT_PARSER_VERSION, checksum, pages, warnings: pages.flatMap((page) => page.warnings.map((warning) => `Section ${page.page}: ${warning}`)), extractionComplete: pages.every((page) => page.confidence > 0) };
}
