import { describe, expect, it } from 'vitest';
import {
  petrosDocumentExtractionSchema,
  petrosDocumentLocatorSchema,
  petrosResolvedDocumentLocatorSchema,
  petrosPdfExtractionSnapshotSchema,
} from './petros-document-source';
import { petrosSourceCitationSchema } from './petros-session-intent';

const locator = {
  schemaVersion: 'petros.document-source.v1',
  kind: 'pdf_page_text',
  sourceVersion: 'a'.repeat(64),
  objectId: '11111111-1111-4111-8111-111111111111',
  unitId: '22222222-2222-4222-8222-222222222222',
  page: 2,
  textSha256: 'b'.repeat(64),
  start: 10,
  end: 14,
  offsetEncoding: 'utf16',
};
const citation = {
  sourceType: 'document',
  sourceId: locator.objectId,
  version: locator.sourceVersion,
  label: 'PDF page 2',
  page: 2,
  section: null,
  excerpt: 'Text',
};

describe('document source wire compatibility', () => {
  it('retains legacy citations while validating exact new locators', () => {
    expect(petrosSourceCitationSchema.parse(citation)).toEqual(citation);
    expect(petrosSourceCitationSchema.parse({ ...citation, locator }).locator).toEqual(locator);
  });

  it('rejects mismatched pages, versions, excerpts and non-document locators', () => {
    for (const patch of [
      { page: 1 },
      { version: 'old' },
      { excerpt: 'different' },
      { sourceType: 'exam' },
    ]) {
      expect(petrosSourceCitationSchema.safeParse({ ...citation, locator, ...patch }).success).toBe(
        false,
      );
    }
  });

  it('bounds offsets and pages and never allows extractor metadata to claim an index', () => {
    expect(petrosDocumentLocatorSchema.safeParse({ ...locator, end: 10 }).success).toBe(false);
    expect(petrosDocumentLocatorSchema.safeParse({ ...locator, page: 501 }).success).toBe(false);
    const extraction = {
      schemaVersion: locator.schemaVersion,
      fileSha256: locator.sourceVersion,
      extractorVersion: 'test',
      representation: 'pdf_text',
      truncated: false,
      readable: true,
      indexing: 'not_built',
    };
    expect(petrosDocumentExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(
      petrosDocumentExtractionSchema.safeParse({ ...extraction, indexing: 'ready' }).success,
    ).toBe(false);
  });
});

describe('immutable PDF contracts', () => {
  it('validates exact UTF-16 slices including astral characters', () => {
    const text = 'A😀B';
    expect(
      petrosResolvedDocumentLocatorSchema.parse({ locator: { ...locator, start: 0, end: 4 }, text })
        .text,
    ).toBe(text);
    expect(
      petrosResolvedDocumentLocatorSchema.safeParse({
        locator: { ...locator, start: 0, end: 3 },
        text,
      }).success,
    ).toBe(false);
  });
  it('rejects incomplete and preview-only immutable PDF snapshots', () => {
    const snapshot = {
      institutionId: locator.objectId,
      studentId: locator.objectId,
      id: locator.objectId,
      version: 1,
      kind: 'pdf',
      title: 'Synthetic source',
      objectIds: [locator.objectId],
      origin: {
        petrosExtraction: {
          schemaVersion: locator.schemaVersion,
          fileSha256: locator.sourceVersion,
          extractorVersion: 'synthetic-v1',
          representation: 'pdf_text',
          truncated: false,
          readable: true,
          indexing: 'not_built',
        },
      },
      pageCount: 1,
      pagesDone: 1,
      status: 'ready',
      extractedTextReady: true,
      indexReady: false,
    };
    expect(petrosPdfExtractionSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(petrosPdfExtractionSnapshotSchema.safeParse({ ...snapshot, pagesDone: 0 }).success).toBe(
      false,
    );
    expect(
      petrosPdfExtractionSnapshotSchema.safeParse({
        ...snapshot,
        origin: {
          petrosExtraction: { ...snapshot.origin.petrosExtraction, representation: 'preview_text' },
        },
      }).success,
    ).toBe(false);
  });
});
