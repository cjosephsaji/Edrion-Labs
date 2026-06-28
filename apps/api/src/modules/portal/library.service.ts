import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateLibraryBookInput,
  IssueLibraryLoanInput,
  LibraryBooksListQuery,
  ReturnLibraryLoanInput,
  UpdateLibraryBookInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { LibraryRepository, type LibraryRefTable } from './library.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-library';

/**
 * Institution-portal Library service (Phase 8). A book is campus-scoped and version-guarded like every
 * other portal resource; the per-student loans inherit the book's campus and are only reachable through
 * a book the caller can see (requireBookInScope). Issuing a loan checks a copy is available (friendly
 * 400) and rejects a second active loan to the same student (friendly 409); returning marks the loan
 * returned. After every loan change the book's available_copies is re-derived from the active loan
 * count (the bridge, like fees re-summing payments). All mutations are audited.
 */
@Injectable()
export class LibraryService {
  constructor(
    private readonly repo: LibraryRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === books =================================================================

  async listBooks(ctx: PortalActionContext, q: LibraryBooksListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listBooks(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createBook(ctx: PortalActionContext, input: CreateLibraryBookInput) {
    const total = input.totalCopies;
    const available = Math.min(input.availableCopies ?? total, total);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertBook({
      institutionId: ctx.principal.institutionId,
      campusId,
      title: input.title,
      author: input.author ?? null,
      isbn: input.isbn ?? null,
      category: input.category ?? null,
      publisher: input.publisher ?? null,
      totalCopies: total,
      availableCopies: available,
      status: input.status,
      description: input.description ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'library.book.create', 'library_book', row.id, campusId, {
      newState: { title: row.title, totalCopies: row.totalCopies },
    });
    return row;
  }

  async updateBook(ctx: PortalActionContext, id: string, input: UpdateLibraryBookInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findBook(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const active = await this.repo.countActiveLoans(id);
    const total = input.totalCopies ?? existing!.totalCopies;
    // Keep available in step with total and never below what's currently on loan.
    const available =
      input.availableCopies !== undefined
        ? Math.min(input.availableCopies, total)
        : Math.max(0, total - active);
    const updated = await this.repo.updateBook(id, input.version, {
      title: input.title ?? existing!.title,
      author: input.author === undefined ? existing!.author : input.author,
      isbn: input.isbn === undefined ? existing!.isbn : input.isbn,
      category: input.category === undefined ? existing!.category : input.category,
      publisher: input.publisher === undefined ? existing!.publisher : input.publisher,
      totalCopies: total,
      availableCopies: available,
      status: input.status ?? existing!.status,
      description: input.description === undefined ? existing!.description : input.description,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'library.book.update', 'library_book', id, updated.campusId, {
      newState: { title: updated.title, totalCopies: updated.totalCopies, status: updated.status },
    });
    return updated;
  }

  async deleteBook(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findBook(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteBook(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'library.book.delete', 'library_book', id, existing!.campusId, {
      previousState: { title: existing!.title },
    });
    return { deleted: true };
  }

  // === loans (the issue→return bridge) =======================================

  async listLoans(ctx: PortalActionContext, bookId: string) {
    await this.requireBookInScope(ctx, bookId);
    return this.repo.listLoans(bookId);
  }

  /** Issue a copy to a student. Checks availability + no existing active loan, then re-derives copies. */
  async issueLoan(ctx: PortalActionContext, bookId: string, input: IssueLibraryLoanInput) {
    const book = await this.requireBookInScope(ctx, bookId);
    await this.assertRef(ctx, 'students', input.studentId, 'student');
    if (book.availableCopies <= 0) {
      throw new BadRequestException({ code: 'NO_COPIES_AVAILABLE', message: 'No copies of this book are available to issue.' });
    }
    if (await this.repo.findActiveLoan(bookId, input.studentId)) {
      throw new ConflictException({ code: 'LOAN_EXISTS', message: 'This student already has this book on loan.' });
    }
    const loan = await this.repo.insertLoan({
      institutionId: ctx.principal.institutionId,
      bookId,
      studentId: input.studentId,
      status: 'issued',
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    const updatedBook = await this.reconcile(ctx, bookId);
    await this.write(ctx, 'library.loan.issue', 'library_loan', loan.id, book.campusId, {
      newState: { bookId, studentId: loan.studentId, availableCopies: updatedBook?.availableCopies },
    });
    return { loan, book: updatedBook };
  }

  /** Return an issued loan, then re-derive the book's available copies. */
  async returnLoan(ctx: PortalActionContext, bookId: string, loanId: string, input: ReturnLibraryLoanInput) {
    const book = await this.requireBookInScope(ctx, bookId);
    const loan = await this.repo.findLoan(loanId, bookId);
    if (!loan) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Loan not found' });
    if (loan.status === 'returned') {
      throw new ConflictException({ code: 'ALREADY_RETURNED', message: 'This loan has already been returned.' });
    }
    const updated = await this.repo.updateLoan(loanId, loan.version, {
      status: 'returned',
      returnDate: input.returnDate ?? new Date().toISOString().slice(0, 10),
      fineAmount: input.fineAmount,
      notes: input.notes === undefined ? loan.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    const updatedBook = await this.reconcile(ctx, bookId);
    await this.write(ctx, 'library.loan.return', 'library_loan', loanId, book.campusId, {
      newState: { bookId, status: updated.status, availableCopies: updatedBook?.availableCopies },
    });
    return { loan: updated, book: updatedBook };
  }

  async removeLoan(ctx: PortalActionContext, bookId: string, loanId: string) {
    const book = await this.requireBookInScope(ctx, bookId);
    const loan = await this.repo.findLoan(loanId, bookId);
    if (!loan) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Loan not found' });
    await this.repo.deleteLoan(loanId);
    const updatedBook = await this.reconcile(ctx, bookId);
    await this.write(ctx, 'library.loan.remove', 'library_loan', loanId, book.campusId, {
      previousState: { bookId, studentId: loan.studentId, status: loan.status },
    });
    return { deleted: true, book: updatedBook };
  }

  /** Re-derive a book's available copies from the active loan count (uses the book's current version). */
  private async reconcile(ctx: PortalActionContext, bookId: string) {
    const book = await this.repo.findBook(bookId, ctx.principal.institutionId);
    if (!book) return undefined;
    const active = await this.repo.countActiveLoans(bookId);
    const available = Math.max(0, book.totalCopies - active);
    if (available === book.availableCopies) return book;
    return this.repo.updateBook(bookId, book.version, { availableCopies: available, updatedBy: ctx.principal.institutionUserId });
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async requireBookInScope(ctx: PortalActionContext, bookId: string) {
    const f = this.filter(ctx);
    const book = await this.repo.findBook(bookId, ctx.principal.institutionId);
    this.assertInScope(book?.campusId ?? null, book, f);
    return book;
  }

  private async assertRef(ctx: PortalActionContext, table: LibraryRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
