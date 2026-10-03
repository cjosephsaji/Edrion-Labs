import { describe, expect, it } from 'vitest';
import { PETROS_DOCUMENT_SOURCE_VERSION, petrosDocumentLocatorSchema } from '@edrion/schemas';
import {
  documentPageCitation,
  documentReadiness,
  documentSourceVersion,
  documentTextHash,
} from './petros-document-source';

// Synthetic regression data only; never seeded into the application.
const id = '11111111-1111-4111-8111-111111111111';
const page = {
  id,
  objectId: id,
  pageIndex: 0,
  text: '  Elasticity adjusts capacity automatically as demand changes.  ',
  needsConfirm: false,
  ocrConfidence: null,
  confirmedAt: null,
};
const item = {
  id,
  title: 'Synthetic cloud chapter',
  version: 1,
  kind: 'pdf',
  objectIds: [id],
  origin: {},
  pageCount: 1,
  pagesDone: 1,
  status: 'ready',
  extractedTextReady: true,
  indexReady: true,
};

describe('production document source admission', () => {
  it('separates legacy text availability from index and teaching readiness', () => {
    expect(documentReadiness(item, [page])).toMatchObject({
      scopeReady: true,
      indexing: 'legacy_unknown',
      extraction: 'legacy_unverified',
      coverage: 'extracted_text_only',
      teaching: 'not_assessed',
    });
  });

  it.each([
    ['blank', { text: '   ' }, 'unreadable_text'],
    [
      'placeholder',
      { text: 'No readable text was found in this file. Download it to see the original layout.' },
      'unreadable_text',
    ],
    ['sparse scan', { text: 'Page 1' }, 'unreadable_text'],
    ['OCR uncertainty', { needsConfirm: true }, 'confirmation_required'],
    ['unconfirmed OCR', { ocrConfidence: '0.900' }, 'confirmation_required'],
    ['wrong object', { objectId: '22222222-2222-4222-8222-222222222222' }, 'invalid_locator'],
  ])('rejects %s even with legacy ready flags', (_name, patch, reason) => {
    const result = documentReadiness(item, [{ ...page, ...patch }]);
    expect(result.scopeReady).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it('permits only the selected readable physical page beside unavailable content', () => {
    const source = { ...item, pageCount: 2, pagesDone: 2 };
    const pages = [
      page,
      { ...page, id: '22222222-2222-4222-8222-222222222222', pageIndex: 1, text: '' },
    ];
    expect(documentReadiness(source, pages).scopeReady).toBe(false);
    expect(documentReadiness(source, pages, 1)).toMatchObject({
      scopeReady: true,
      status: 'partially_ready',
      unavailablePages: [2],
      selectedPages: [1],
      omittedPageCount: 1,
    });
    expect(documentReadiness(source, pages, 2).scopeReady).toBe(false);
    expect(documentReadiness(source, pages, 3).reasons).toContain('invalid_locator');
  });

  it('rejects missing/duplicate pages, oversized sources and invalid metadata', () => {
    expect(documentReadiness({ ...item, pageCount: 2, pagesDone: 2 }, [page]).scopeReady).toBe(
      false,
    );
    expect(documentReadiness(item, [page, page]).scopeReady).toBe(false);
    expect(documentReadiness({ ...item, pageCount: 501 }, [page]).reasons).toContain(
      'resource_limit',
    );
    expect(
      documentReadiness({ ...item, origin: { petrosExtraction: {} } }, [page]).reasons,
    ).toContain('invalid_metadata');
  });

  it('rejects Office previews and known truncation instead of inventing original page locators', () => {
    expect(documentReadiness({ ...item, kind: 'document' }, [page]).reasons).toContain(
      'preview_only',
    );
    const origin = {
      petrosExtraction: {
        schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION,
        fileSha256: 'a'.repeat(64),
        extractorVersion: 'test',
        representation: 'pdf_text',
        truncated: true,
        readable: true,
        indexing: 'not_built',
      },
    };
    expect(documentReadiness({ ...item, origin }, [page]).reasons).toContain('truncated');
  });

  it('hashes text, file identity, positions and confirmation, irrespective of timestamps/length', () => {
    const original = documentSourceVersion(item, [page]);
    for (const patch of [
      { text: page.text.replace('automatically', 'conditionally') },
      { needsConfirm: true },
      { pageIndex: 1 },
      { objectId: '22222222-2222-4222-8222-222222222222' },
    ]) {
      expect(documentSourceVersion(item, [{ ...page, ...patch }])).not.toBe(original);
    }
    expect(documentSourceVersion({ ...item, version: 2 }, [page])).not.toBe(original);
  });

  it('round-trips an exact citation against its persisted text without merging pages', () => {
    const citation = documentPageCitation(
      item,
      page,
      documentSourceVersion(item, [page]),
      'Elasticity',
    );
    expect(citation.excerpt).toBe(page.text.slice(citation.locator.start, citation.locator.end));
    expect(citation.locator.textSha256).toBe(documentTextHash(page.text));
    expect(citation.version).toBe(citation.locator.sourceVersion);
    expect(
      petrosDocumentLocatorSchema.safeParse({ ...citation.locator, end: citation.locator.start })
        .success,
    ).toBe(false);
  });
});
