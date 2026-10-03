import { z } from 'zod';

export const PETROS_DOCUMENT_SOURCE_VERSION = 'petros.document-source.v1' as const;
export const PETROS_DOCUMENT_MAX_PAGES = 500;
export const PETROS_DOCUMENT_MAX_TEXT_CHARS = 2_000_000;
export const PETROS_DOCUMENT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);

/** Stored by the extractor in knowledgeItems.origin; never supplied by a learner/model. */
export const petrosDocumentExtractionSchema = z
  .object({
    schemaVersion: z.literal(PETROS_DOCUMENT_SOURCE_VERSION),
    fileSha256: hash,
    extractorVersion: z.string().min(1).max(100),
    representation: z.enum(['pdf_text', 'preview_text']),
    truncated: z.boolean(),
    readable: z.boolean(),
    indexing: z.literal('not_built'),
  })
  .strict();

/** Offsets address the exact persisted extracted text, not PDF geometry or printed folios. */
export const petrosDocumentLocatorSchema = z
  .object({
    schemaVersion: z.literal(PETROS_DOCUMENT_SOURCE_VERSION),
    kind: z.literal('pdf_page_text'),
    sourceVersion: hash,
    objectId: z.string().uuid(),
    unitId: z.string().uuid(),
    page: z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES),
    textSha256: hash,
    start: z.number().int().nonnegative(),
    end: z.number().int().positive().max(PETROS_DOCUMENT_MAX_TEXT_CHARS),
    offsetEncoding: z.literal('utf16'),
  })
  .strict()
  .refine((value) => value.end > value.start, 'Locator must contain text');

/** Text availability is distinct from indexing and from objective/teaching-pack readiness. */
export const petrosDocumentReadinessSchema = z
  .object({
    schemaVersion: z.literal(PETROS_DOCUMENT_SOURCE_VERSION),
    sourceVersion: hash,
    status: z.enum(['ready', 'partially_ready', 'needs_confirmation', 'failed']),
    extraction: z.enum(['digital_text', 'preview_only', 'legacy_unverified']),
    indexing: z.enum(['not_built', 'legacy_unknown']),
    selectedPages: z
      .array(z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES))
      .max(PETROS_DOCUMENT_MAX_PAGES),
    unavailablePages: z
      .array(z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES))
      .max(PETROS_DOCUMENT_MAX_PAGES),
    omittedPageCount: z.number().int().nonnegative(),
    scopeReady: z.boolean(),
    coverage: z.literal('extracted_text_only'),
    teaching: z.literal('not_assessed'),
    reasons: z
      .array(
        z.enum([
          'pending',
          'extraction_failed',
          'preview_only',
          'truncated',
          'missing_pages',
          'unreadable_text',
          'confirmation_required',
          'invalid_locator',
          'resource_limit',
          'invalid_metadata',
        ]),
      )
      .max(12),
  })
  .strict();

export type PetrosDocumentExtraction = z.infer<typeof petrosDocumentExtractionSchema>;
export type PetrosDocumentReadiness = z.infer<typeof petrosDocumentReadinessSchema>;

export type PetrosDocumentLocator = z.infer<typeof petrosDocumentLocatorSchema>;

/** Frozen knowledge-owner snapshot; mutable lifecycle fields live outside this content. */
export const petrosPdfExtractionSnapshotSchema = z
  .object({
    institutionId: z.string().uuid(),
    studentId: z.string().uuid(),
    id: z.string().uuid(),
    version: z.number().int().positive(),
    kind: z.literal('pdf'),
    title: z.string().min(1),
    objectIds: z.array(z.string().uuid()).length(1),
    origin: z.record(z.unknown()),
    pageCount: z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES),
    pagesDone: z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES),
    status: z.enum(['ready', 'needs_ocr_confirm']),
    extractedTextReady: z.boolean(),
    indexReady: z.literal(false),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const extraction = petrosDocumentExtractionSchema.safeParse(snapshot.origin.petrosExtraction);
    if (
      snapshot.pagesDone !== snapshot.pageCount ||
      !extraction.success ||
      extraction.data.representation !== 'pdf_text' ||
      extraction.data.truncated
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A complete PDF extraction and its metadata are required',
      });
    }
  });

export const petrosResolvedDocumentLocatorSchema = z
  .object({
    locator: petrosDocumentLocatorSchema,
    text: z.string().min(1).max(1200),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.text.length !== value.locator.end - value.locator.start)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Resolved text must exactly match the UTF-16 range',
      });
  });
