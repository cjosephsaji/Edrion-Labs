import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import {
  PETROS_DOCUMENT_MAX_PAGES,
  PETROS_DOCUMENT_MAX_TEXT_CHARS,
  PETROS_DOCUMENT_SOURCE_VERSION,
  petrosDocumentExtractionSchema,
  petrosDocumentLocatorSchema,
  petrosDocumentReadinessSchema,
  type PetrosDocumentReadiness,
} from '@edrion/schemas';

export type SourceItem = {
  extractionFingerprint?: string;
  id: string;
  version: number;
  kind: string;
  title: string;
  pageCount: number | null;
  pagesDone: number;
  status: string;
  extractedTextReady: boolean;
  indexReady: boolean;
  objectIds: string[];
  origin: Record<string, unknown>;
};
export type SourcePage = {
  id: string;
  pageIndex: number;
  objectId: string;
  text: string;
  needsConfirm: boolean;
  ocrConfidence: string | null;
  confirmedAt: Date | null;
};

export const documentTextHash = (value: string) => createHash('sha256').update(value).digest('hex');

// A sparse-text heuristic is an admission check, never an OCR confidence or teaching score.
export function hasUsableDocumentText(text: string) {
  return (
    (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 24 &&
    !text.includes('\uFFFD') &&
    !text.startsWith('No readable text was found in this file.')
  );
}

/** Canonical fingerprint for admission, outline cache and start revalidation. */
export function documentSourceVersion(item: SourceItem, pages: SourcePage[]) {
  if (item.extractionFingerprint) return item.extractionFingerprint;
  return documentTextHash(
    JSON.stringify({
      schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION,
      id: item.id,
      version: item.version,
      kind: item.kind,
      title: item.title,
      objectIds: item.objectIds,
      origin: item.origin,
      pageCount: item.pageCount,
      pagesDone: item.pagesDone,
      status: item.status,
      extractedTextReady: item.extractedTextReady,
      indexReady: item.indexReady,
      pages: [...pages]
        .sort((a, b) => a.pageIndex - b.pageIndex)
        .map((page) => ({
          id: page.id,
          objectId: page.objectId,
          pageIndex: page.pageIndex,
          textSha256: documentTextHash(page.text),
          needsConfirm: page.needsConfirm,
          ocrConfidence: page.ocrConfidence,
          confirmedAt: page.confirmedAt,
        })),
    }),
  );
}

export function documentReadiness(
  item: SourceItem,
  pages: SourcePage[],
  selectedPage?: number | number[],
): PetrosDocumentReadiness {
  const metadata = petrosDocumentExtractionSchema.safeParse(item.origin?.petrosExtraction);
  const reasons = new Set<PetrosDocumentReadiness['reasons'][number]>();
  const pageCount = item.pageCount ?? 0;
  const limited =
    pageCount > PETROS_DOCUMENT_MAX_PAGES ||
    pages.length > PETROS_DOCUMENT_MAX_PAGES ||
    pages.reduce((sum, page) => sum + page.text.length, 0) > PETROS_DOCUMENT_MAX_TEXT_CHARS;
  if (limited) reasons.add('resource_limit');
  const physicalPages = Array.from(
    { length: Math.min(Math.max(0, pageCount), PETROS_DOCUMENT_MAX_PAGES) },
    (_, index) => index + 1,
  );
  const selectedPages =
    selectedPage == null
      ? physicalPages
      : [...new Set(Array.isArray(selectedPage) ? selectedPage : [selectedPage])].sort(
          (a, b) => a - b,
        );
  if (selectedPages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount))
    reasons.add('invalid_locator');
  // Historical multi-file page sequences do not establish a physical page within each file.
  if (item.objectIds.length !== 1) reasons.add('invalid_locator');
  if (item.status === 'error') reasons.add('extraction_failed');
  else if (!['ready', 'needs_ocr_confirm'].includes(item.status)) reasons.add('pending');
  if (!item.extractedTextReady)
    reasons.add(item.status === 'needs_ocr_confirm' ? 'unreadable_text' : 'pending');
  if (item.origin?.petrosExtraction != null && !metadata.success) reasons.add('invalid_metadata');
  if (item.kind !== 'pdf' || (metadata.success && metadata.data.representation !== 'pdf_text'))
    reasons.add('preview_only');
  if (metadata.success && metadata.data.truncated) reasons.add('truncated');
  if (metadata.success && !metadata.data.readable) reasons.add('unreadable_text');

  const unavailablePages = physicalPages.filter((number) => {
    const matches = pages.filter((page) => page.pageIndex === number - 1);
    const page = matches[0];
    return (
      matches.length !== 1 ||
      !page ||
      !item.objectIds.includes(page.objectId) ||
      !hasUsableDocumentText(page.text) ||
      page.needsConfirm ||
      (page.ocrConfidence != null && page.confirmedAt == null)
    );
  });
  const selected = pages.filter((page) => selectedPages.includes(page.pageIndex + 1));
  if (!selected.length || selected.length !== selectedPages.length || pageCount === 0)
    reasons.add('missing_pages');
  if (
    selected.some((page) => page.needsConfirm || (page.ocrConfidence != null && !page.confirmedAt))
  )
    reasons.add('confirmation_required');
  if (selected.some((page) => !hasUsableDocumentText(page.text))) reasons.add('unreadable_text');
  if (selected.some((page) => !item.objectIds.includes(page.objectId)))
    reasons.add('invalid_locator');
  if (selectedPages.some((page) => unavailablePages.includes(page)) && reasons.size === 0)
    reasons.add('missing_pages');
  if (pages.some((page) => page.pageIndex < 0 || page.pageIndex >= pageCount))
    reasons.add('invalid_locator');
  if (selectedPage == null && (item.pagesDone !== pageCount || pages.length !== pageCount))
    reasons.add('missing_pages');
  const scopeReady = reasons.size === 0;
  return petrosDocumentReadinessSchema.parse({
    schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION,
    sourceVersion: documentSourceVersion(item, pages),
    status: scopeReady
      ? unavailablePages.length
        ? 'partially_ready'
        : 'ready'
      : reasons.has('extraction_failed')
        ? 'failed'
        : 'needs_confirmation',
    extraction: metadata.success
      ? metadata.data.representation === 'pdf_text'
        ? 'digital_text'
        : 'preview_only'
      : 'legacy_unverified',
    indexing: metadata.success ? metadata.data.indexing : 'legacy_unknown',
    selectedPages: selectedPages.filter((page) => page >= 1 && page <= PETROS_DOCUMENT_MAX_PAGES),
    unavailablePages,
    omittedPageCount: Math.max(0, pageCount - selectedPages.length),
    scopeReady,
    coverage: 'extracted_text_only',
    teaching: 'not_assessed',
    reasons: [...reasons],
  });
}

export function requireDocumentReady(readiness: PetrosDocumentReadiness) {
  if (readiness.scopeReady) return;
  throw new ConflictException({
    code: readiness.reasons.includes('pending')
      ? 'PETROS_DOCUMENT_EXTRACTION_PENDING'
      : 'PETROS_DOCUMENT_SOURCE_NOT_READY',
    message: readiness.reasons.includes('preview_only')
      ? 'This file has a readable preview, but reliable teaching locators are not available yet. Open the original or provide a readable PDF.'
      : 'The selected source text is incomplete or needs confirmation. Open the original, select a readable PDF page, or retry preparation after correcting the file.',
    meta: { readiness },
  });
}

export function documentPageCitation(
  item: SourceItem,
  page: SourcePage,
  sourceVersion: string,
  section: string,
) {
  const start = page.text.length - page.text.trimStart().length;
  const excerpt = page.text.slice(start, start + 1_200).trimEnd();
  const locator = petrosDocumentLocatorSchema.parse({
    schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION,
    kind: 'pdf_page_text',
    sourceVersion,
    objectId: page.objectId,
    unitId: page.id,
    page: page.pageIndex + 1,
    textSha256: documentTextHash(page.text),
    start,
    end: start + excerpt.length,
    offsetEncoding: 'utf16',
  });
  return {
    sourceType: 'document' as const,
    sourceId: item.id,
    version: sourceVersion,
    label: `${item.title.slice(0, 200)} (PDF p. ${locator.page})`,
    page: locator.page,
    section,
    excerpt,
    locator,
  };
}

export function documentScopeDisclosure(readiness: PetrosDocumentReadiness) {
  return `${readiness.omittedPageCount} pages are outside this selected text scope; ${readiness.unavailablePages.length} pages have unavailable or unconfirmed text.`;
}
