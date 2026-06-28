import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { LibraryBook, LibraryLoan, NewLibraryBook, NewLibraryLoan } from '@edrion/database';
import type { LibraryBooksListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const studentDisplayName = sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.lastName})`;

export interface LibraryBookRow extends LibraryBook {
  activeLoans: number;
}
export interface LibraryLoanRow extends LibraryLoan {
  studentName: string | null;
  admissionNo: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type LibraryRefTable = 'students';

/**
 * Typed SQL for the institution-portal library tables (books + loans). Same contract as the other
 * portal repos: every query is confined to one institution; campus-scoped book reads also include
 * institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit and the
 * issue→return bridge that re-derives a book's available copies.
 */
@Injectable()
export class LibraryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(instCol: PgColumn, campusCol: PgColumn, institutionId: string, campusIds: CampusFilter): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: LibraryRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- books -----------------------------------------------------------------

  async listBooks(institutionId: string, campusIds: CampusFilter, q: LibraryBooksListQuery): Promise<Page<LibraryBookRow>> {
    const t = schema.libraryBooks;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.title, `%${q.search}%`), ilike(t.author, `%${q.search}%`), ilike(t.isbn, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      title: t.title,
      author: t.author,
      totalCopies: t.totalCopies,
      availableCopies: t.availableCopies,
      status: t.status,
      createdAt: t.createdAt,
    };
    const activeLoans = sql<number>`(select count(*) from ${schema.libraryLoans} ll where ll.book_id = ${t.id} and ll.status = 'issued')`;
    const rows = await this.db
      .select({ book: t, activeLoans })
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.title))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.book, activeLoans: Number(r.activeLoans ?? 0) })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findBook(id: string, institutionId: string): Promise<LibraryBook | undefined> {
    const t = schema.libraryBooks;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertBook(values: NewLibraryBook): Promise<LibraryBook> {
    const [row] = await this.db.insert(schema.libraryBooks).values(values).returning();
    return row!;
  }

  async updateBook(id: string, version: number, patch: Partial<NewLibraryBook>): Promise<LibraryBook | undefined> {
    const t = schema.libraryBooks;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteBook(id: string, version: number): Promise<boolean> {
    const t = schema.libraryBooks;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- loans (against a book) ------------------------------------------------

  async listLoans(bookId: string): Promise<LibraryLoanRow[]> {
    const t = schema.libraryLoans;
    const rows = await this.db
      .select({ loan: t, studentName: studentDisplayName, admissionNo: schema.students.admissionNo })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .where(eq(t.bookId, bookId))
      .orderBy(desc(t.createdAt));
    return rows.map((r) => ({ ...r.loan, studentName: r.studentName, admissionNo: r.admissionNo }));
  }

  async findLoan(id: string, bookId: string): Promise<LibraryLoan | undefined> {
    const t = schema.libraryLoans;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.bookId, bookId))).limit(1);
    return row;
  }

  /** An active (issued) loan already exists for this (book, student)? (friendly 409). */
  async findActiveLoan(bookId: string, studentId: string): Promise<LibraryLoan | undefined> {
    const t = schema.libraryLoans;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.bookId, bookId), eq(t.studentId, studentId), eq(t.status, 'issued')))
      .limit(1);
    return row;
  }

  async insertLoan(values: NewLibraryLoan): Promise<LibraryLoan> {
    const [row] = await this.db.insert(schema.libraryLoans).values(values).returning();
    return row!;
  }

  async updateLoan(id: string, version: number, patch: Partial<NewLibraryLoan>): Promise<LibraryLoan | undefined> {
    const t = schema.libraryLoans;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteLoan(id: string): Promise<boolean> {
    const t = schema.libraryLoans;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  /** Count active (issued) loans for a book — drives the available-copies bridge. */
  async countActiveLoans(bookId: string): Promise<number> {
    const t = schema.libraryLoans;
    const [row] = await this.db
      .select({ value: count() })
      .from(t)
      .where(and(eq(t.bookId, bookId), eq(t.status, 'issued')));
    return Number(row?.value ?? 0);
  }
}
