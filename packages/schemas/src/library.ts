import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';

/**
 * Institution-Portal LIBRARY (Phase 8) request/response contracts: the book catalogue + the per-student
 * loans recorded against a book. Tenancy (institution_id) + the active campus scope (campus_id) are
 * NEVER taken from the body — the API derives them from the authenticated principal + scope header.
 * Money (fines) is a whole-number integer in MINOR units (the codebase has no decimals anywhere).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
/** Money, minor units (whole number). */
const money = z.coerce.number().int().min(0).max(1_000_000_000);
/** A non-negative whole count. */
const count = z.coerce.number().int().min(0).max(1_000_000);

export const LIBRARY_BOOK_STATUSES = ['available', 'archived'] as const;
export const libraryBookStatusSchema = z.enum(LIBRARY_BOOK_STATUSES);
export type LibraryBookStatus = (typeof LIBRARY_BOOK_STATUSES)[number];

export const LIBRARY_LOAN_STATUSES = ['issued', 'returned', 'lost'] as const;
export const libraryLoanStatusSchema = z.enum(LIBRARY_LOAN_STATUSES);
export type LibraryLoanStatus = (typeof LIBRARY_LOAN_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- books (catalogue) -------------------------------------------------------

export const libraryBooksListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  status: libraryBookStatusSchema.optional(),
});
export type LibraryBooksListQuery = z.infer<typeof libraryBooksListQuerySchema>;

export const createLibraryBookSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  author: shortText(160),
  isbn: shortText(40),
  category: shortText(80),
  publisher: shortText(160),
  totalCopies: count.default(1),
  /** Optional — defaults to totalCopies when omitted. */
  availableCopies: count.optional(),
  status: libraryBookStatusSchema.default('available'),
  description: shortText(500),
});
export type CreateLibraryBookInput = z.infer<typeof createLibraryBookSchema>;

export const updateLibraryBookSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  author: shortText(160),
  isbn: shortText(40),
  category: shortText(80),
  publisher: shortText(160),
  totalCopies: count.optional(),
  availableCopies: count.optional(),
  status: libraryBookStatusSchema.optional(),
  description: shortText(500),
  ...withVersion,
});
export type UpdateLibraryBookInput = z.infer<typeof updateLibraryBookSchema>;

// --- loans (against a book) --------------------------------------------------

/** Issue a copy of a book to a student. The service decrements available_copies. */
export const issueLibraryLoanSchema = z.object({
  studentId: z.string().uuid(),
  issueDate: isoDate,
  dueDate: isoDate,
  notes: shortText(500),
});
export type IssueLibraryLoanInput = z.infer<typeof issueLibraryLoanSchema>;

/** Return an issued loan. The service marks it returned + increments available_copies. */
export const returnLibraryLoanSchema = z.object({
  returnDate: isoDate,
  fineAmount: money.default(0),
  notes: shortText(500),
});
export type ReturnLibraryLoanInput = z.infer<typeof returnLibraryLoanSchema>;
