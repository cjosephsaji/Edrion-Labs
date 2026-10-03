import { z } from 'zod';
import {
  PETROS_DOCUMENT_MAX_PAGES,
  petrosResolvedDocumentLocatorSchema,
} from './petros-document-source';

export const PETROS_DOCUMENT_RETRIEVAL_VERSION = 'petros.pdf-lexical.v1' as const;
export const PETROS_RETRIEVAL_MAX_SPANS = 4;
export const PETROS_RETRIEVAL_MAX_TERMS = 64;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const pages = z
  .array(z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES))
  .max(PETROS_DOCUMENT_MAX_PAGES);
export const petrosDocumentSearchSchema = z
  .object({
    sourceVersion: hash,
    query: z.string().trim().min(2).max(2_000),
    purpose: z.enum(['source_lookup', 'lesson_question']),
    pages: pages
      .min(1)
      .refine((value) => new Set(value).size === value.length, 'Pages must be unique'),
    limit: z.number().int().min(1).max(PETROS_RETRIEVAL_MAX_SPANS).default(3),
  })
  .strict();
export type PetrosDocumentSearch = z.infer<typeof petrosDocumentSearchSchema>;

export const petrosDocumentRetrievalSchema = z
  .object({
    schemaVersion: z.literal(PETROS_DOCUMENT_RETRIEVAL_VERSION),
    sourceId: z.string().uuid(),
    sourceVersion: hash,
    hits: z
      .array(
        z
          .object({
            spanId: hash,
            source: petrosResolvedDocumentLocatorSchema,
            matchedTerms: z.array(z.string().min(1).max(80)).min(1).max(PETROS_RETRIEVAL_MAX_TERMS),
            boundaryClipped: z.boolean(),
          })
          .strict(),
      )
      .max(PETROS_RETRIEVAL_MAX_SPANS),
    trace: z
      .object({
        purpose: z.enum(['source_lookup', 'lesson_question']),
        querySha256: hash,
        index: z.literal('per_query_lexical'),
        unitization: z.literal('sentence_windows_with_overlap'),
        requestedPages: pages,
        searchedPages: pages,
        unavailablePages: pages,
        returnedPages: pages,
        totalPages: z.number().int().min(1).max(PETROS_DOCUMENT_MAX_PAGES),
        unsearchedPageCount: z.number().int().nonnegative(),
        unreturnedPageCount: z.number().int().nonnegative(),
        searchedTextChars: z.number().int().nonnegative().max(2_000_000),
        matchedSpanCount: z.number().int().nonnegative(),
        omittedMatchingSpanCount: z.number().int().nonnegative(),
        omittedQueryTermCount: z.number().int().nonnegative(),
        status: z.enum(['matches', 'no_match', 'no_searchable_text']),
        sufficiency: z.enum(['unverified', 'insufficient']),
        coverage: z.literal('extracted_text_only'),
        structure: z.literal('table_formula_figure_alignment_unverified'),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const trace = value.trace;
    const returned = [...new Set(value.hits.map((hit) => hit.source.locator.page))].sort(
      (a, b) => a - b,
    );
    const valid = (list: number[]) =>
      new Set(list).size === list.length && list.every((page) => page <= trace.totalPages);
    if (
      ![
        trace.requestedPages,
        trace.searchedPages,
        trace.unavailablePages,
        trace.returnedPages,
      ].every(valid) ||
      trace.searchedPages.some(
        (page) => !trace.requestedPages.includes(page) || trace.unavailablePages.includes(page),
      ) ||
      trace.unavailablePages.some((page) => !trace.requestedPages.includes(page)) ||
      trace.searchedPages.length + trace.unavailablePages.length !== trace.requestedPages.length ||
      JSON.stringify(returned) !== JSON.stringify(trace.returnedPages) ||
      trace.unsearchedPageCount !== trace.totalPages - trace.searchedPages.length ||
      trace.unreturnedPageCount !== trace.totalPages - returned.length ||
      trace.omittedMatchingSpanCount !== trace.matchedSpanCount - value.hits.length ||
      new Set(value.hits.map((hit) => hit.spanId)).size !== value.hits.length ||
      value.hits.some(
        (hit) =>
          hit.source.locator.sourceVersion !== value.sourceVersion ||
          !trace.searchedPages.includes(hit.source.locator.page),
      ) ||
      value.hits.length > 0 !== (trace.status === 'matches') ||
      (trace.status === 'no_searchable_text') !== (trace.searchedPages.length === 0) ||
      trace.sufficiency !== (value.hits.length ? 'unverified' : 'insufficient')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Retrieval coverage must describe the exact searched scope and returned locators',
      });
    }
  });
export type PetrosDocumentRetrieval = z.infer<typeof petrosDocumentRetrievalSchema>;
