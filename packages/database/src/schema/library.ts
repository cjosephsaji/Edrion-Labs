import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL library (Phase 8). A two-level model with an issue→return bridge:
 *   - library_books: the catalogue — one title with a tracked copy count, campus-scoped +
 *     version-guarded. `total_copies` is the holding; `available_copies` is what may still be
 *     issued (maintained by the loan bridge).
 *   - library_loans: the per-student loans of a book. No campus column of its own — it inherits the
 *     book's campus and is only reachable through a book the caller can see (mirrors fee_payments /
 *     exam_schedules). Issuing a loan decrements available_copies; returning increments it again
 *     (a small bridge like fees payment→invoice). Students are the FK target.
 *
 * Same tenant convention as the rest of the portal. academics/people are referenced forward-only, so
 * plain `.references()` is safe (no Drizzle type cycle). Money (fines) is a whole-number integer in
 * MINOR units — the codebase has no decimals/numeric anywhere.
 */
export const libraryBooks = pgTable(
  'library_books',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    author: text('author'),
    isbn: text('isbn'),
    category: text('category'),
    publisher: text('publisher'),
    /** Total copies held. */
    totalCopies: integer('total_copies').notNull().default(1),
    /** Copies still available to issue (maintained by the loan bridge). */
    availableCopies: integer('available_copies').notNull().default(1),
    /** available | archived. */
    status: text('status').notNull().default('available'),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('library_books_institution_idx').on(t.institutionId),
    scopeIdx: index('library_books_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('library_books_status_idx').on(t.status),
  }),
);

/** A loan of a book to a student. Inherits the book's campus (no campus column of its own). */
export const libraryLoans = pgTable(
  'library_loans',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => libraryBooks.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** issued | returned | lost. */
    status: text('status').notNull().default('issued'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    returnDate: date('return_date'),
    /** Fine charged on return, minor units. */
    fineAmount: integer('fine_amount').notNull().default(0),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('library_loans_institution_idx').on(t.institutionId),
    bookIdx: index('library_loans_book_idx').on(t.bookId),
    studentIdx: index('library_loans_student_idx').on(t.studentId),
    statusIdx: index('library_loans_status_idx').on(t.status),
  }),
);

export type LibraryBook = typeof libraryBooks.$inferSelect;
export type NewLibraryBook = typeof libraryBooks.$inferInsert;
export type LibraryLoan = typeof libraryLoans.$inferSelect;
export type NewLibraryLoan = typeof libraryLoans.$inferInsert;
