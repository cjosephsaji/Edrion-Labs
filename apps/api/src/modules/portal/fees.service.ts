import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateFeeInvoiceInput,
  CreateFeeStructureInput,
  FeeInvoicesListQuery,
  FeeStructuresListQuery,
  RecordFeePaymentInput,
  UpdateFeeInvoiceInput,
  UpdateFeeStructureInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { FeesRepository, type FeeRefTable } from './fees.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-fees';

/**
 * Institution-portal Fees service (Phase 7). Owns the same tenant invariants as the other portal
 * services: every read/write is confined to the principal's institution + the request's campus scope;
 * new rows are stamped with the active campus; updates/deletes are version-guarded; FKs are pre-checked
 * for friendly 400s; duplicate invoice numbers are a friendly 409; and every mutation is audited.
 *
 * Recording a payment is the fees bridge (like admissions→enrol): a payment line is inserted, then the
 * invoice's amount_paid is re-summed and its status recomputed (pending → partial → paid).
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly repo: FeesRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === fee structures ========================================================

  async listStructures(ctx: PortalActionContext, q: FeeStructuresListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listStructures(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createStructure(ctx: PortalActionContext, input: CreateFeeStructureInput) {
    await this.assertOptional(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'academicYears', input.academicYearId, 'academic year');
    await this.assertOptional(ctx, 'academicTerms', input.termId, 'term');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertStructure({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      feeType: input.feeType,
      gradeLevelId: input.gradeLevelId ?? null,
      classId: input.classId ?? null,
      academicYearId: input.academicYearId ?? null,
      termId: input.termId ?? null,
      amount: input.amount,
      frequency: input.frequency,
      description: input.description ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'fee.structure.create', 'fee_structure', row.id, campusId, {
      newState: { name: row.name, feeType: row.feeType, amount: row.amount },
    });
    return row;
  }

  async updateStructure(ctx: PortalActionContext, id: string, input: UpdateFeeStructureInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findStructure(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'academicYears', input.academicYearId, 'academic year');
    await this.assertOptional(ctx, 'academicTerms', input.termId, 'term');
    const updated = await this.repo.updateStructure(id, input.version, {
      name: input.name ?? existing!.name,
      feeType: input.feeType ?? existing!.feeType,
      gradeLevelId: input.gradeLevelId === undefined ? existing!.gradeLevelId : input.gradeLevelId,
      classId: input.classId === undefined ? existing!.classId : input.classId,
      academicYearId: input.academicYearId === undefined ? existing!.academicYearId : input.academicYearId,
      termId: input.termId === undefined ? existing!.termId : input.termId,
      amount: input.amount ?? existing!.amount,
      frequency: input.frequency ?? existing!.frequency,
      description: input.description === undefined ? existing!.description : input.description,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'fee.structure.update', 'fee_structure', id, updated.campusId, {
      newState: { name: updated.name, amount: updated.amount, status: updated.status },
    });
    return updated;
  }

  async deleteStructure(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findStructure(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteStructure(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'fee.structure.delete', 'fee_structure', id, existing!.campusId, {
      previousState: { name: existing!.name, feeType: existing!.feeType },
    });
    return { deleted: true };
  }

  // === fee invoices ==========================================================

  async listInvoices(ctx: PortalActionContext, q: FeeInvoicesListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listInvoices(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createInvoice(ctx: PortalActionContext, input: CreateFeeInvoiceInput) {
    await this.assertRef(ctx, 'students', input.studentId, 'student');
    await this.assertOptional(ctx, 'feeStructures', input.feeStructureId, 'fee structure');
    const invoiceNo = input.invoiceNo.trim();
    if (await this.repo.findInvoiceByNo(ctx.principal.institutionId, invoiceNo)) {
      throw new ConflictException({
        code: 'INVOICE_EXISTS',
        message: `Invoice number "${invoiceNo}" is already in use.`,
      });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertInvoice({
      institutionId: ctx.principal.institutionId,
      campusId,
      invoiceNo,
      studentId: input.studentId,
      feeStructureId: input.feeStructureId ?? null,
      amount: input.amount,
      amountPaid: 0,
      status: input.status,
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'fee.invoice.create', 'fee_invoice', row.id, campusId, {
      newState: { invoiceNo: row.invoiceNo, studentId: row.studentId, amount: row.amount },
    });
    return this.withBalance(row);
  }

  async updateInvoice(ctx: PortalActionContext, id: string, input: UpdateFeeInvoiceInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findInvoice(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'students', input.studentId, 'student');
    await this.assertOptional(ctx, 'feeStructures', input.feeStructureId, 'fee structure');
    const nextNo = (input.invoiceNo ?? existing!.invoiceNo).trim();
    if (nextNo !== existing!.invoiceNo) {
      const dupe = await this.repo.findInvoiceByNo(ctx.principal.institutionId, nextNo);
      if (dupe && dupe.id !== id) {
        throw new ConflictException({
          code: 'INVOICE_EXISTS',
          message: `Invoice number "${nextNo}" is already in use.`,
        });
      }
    }
    const nextAmount = input.amount ?? existing!.amount;
    const updated = await this.repo.updateInvoice(id, input.version, {
      invoiceNo: nextNo,
      studentId: input.studentId ?? existing!.studentId,
      feeStructureId: input.feeStructureId === undefined ? existing!.feeStructureId : input.feeStructureId,
      amount: nextAmount,
      status: input.status ?? this.computeStatus(nextAmount, existing!.amountPaid, existing!.status),
      issueDate: input.issueDate === undefined ? existing!.issueDate : input.issueDate,
      dueDate: input.dueDate === undefined ? existing!.dueDate : input.dueDate,
      notes: input.notes === undefined ? existing!.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'fee.invoice.update', 'fee_invoice', id, updated.campusId, {
      newState: { invoiceNo: updated.invoiceNo, amount: updated.amount, status: updated.status },
    });
    return this.withBalance(updated);
  }

  async deleteInvoice(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findInvoice(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteInvoice(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'fee.invoice.delete', 'fee_invoice', id, existing!.campusId, {
      previousState: { invoiceNo: existing!.invoiceNo, amount: existing!.amount },
    });
    return { deleted: true };
  }

  // === payments (the bridge) =================================================

  async listPayments(ctx: PortalActionContext, invoiceId: string) {
    await this.requireInvoiceInScope(ctx, invoiceId);
    return this.repo.listPayments(invoiceId);
  }

  /** Record a payment, then re-sum + update the invoice's amount_paid + status. */
  async recordPayment(ctx: PortalActionContext, invoiceId: string, input: RecordFeePaymentInput) {
    const invoice = await this.requireInvoiceInScope(ctx, invoiceId);
    const balance = invoice.amount - invoice.amountPaid;
    if (input.amount > balance) {
      throw new BadRequestException({
        code: 'PAYMENT_EXCEEDS_BALANCE',
        message: `Payment (${input.amount}) exceeds the outstanding balance (${balance}).`,
      });
    }
    const payment = await this.repo.insertPayment({
      institutionId: ctx.principal.institutionId,
      invoiceId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      paidDate: input.paidDate ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    const updatedInvoice = await this.reconcile(ctx, invoice.id);
    await this.write(ctx, 'fee.payment.record', 'fee_payment', payment.id, invoice.campusId, {
      newState: {
        invoiceId,
        amount: payment.amount,
        method: payment.method,
        invoiceStatus: updatedInvoice?.status,
      },
    });
    return { payment, invoice: updatedInvoice ? this.withBalance(updatedInvoice) : undefined };
  }

  async removePayment(ctx: PortalActionContext, invoiceId: string, paymentId: string) {
    const invoice = await this.requireInvoiceInScope(ctx, invoiceId);
    const payment = await this.repo.findPayment(paymentId, invoiceId);
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found' });
    await this.repo.deletePayment(paymentId);
    const updatedInvoice = await this.reconcile(ctx, invoice.id);
    await this.write(ctx, 'fee.payment.remove', 'fee_payment', paymentId, invoice.campusId, {
      previousState: { invoiceId, amount: payment.amount, method: payment.method },
    });
    return { deleted: true, invoice: updatedInvoice ? this.withBalance(updatedInvoice) : undefined };
  }

  /** Re-sum the invoice's payments and update amount_paid + status (uses the current version). */
  private async reconcile(ctx: PortalActionContext, invoiceId: string) {
    const invoice = await this.repo.findInvoice(invoiceId, ctx.principal.institutionId);
    if (!invoice) return undefined;
    const paid = await this.repo.sumPayments(invoiceId);
    const status = this.computeStatus(invoice.amount, paid, invoice.status);
    return this.repo.updateInvoice(invoiceId, invoice.version, {
      amountPaid: paid,
      status,
      updatedBy: ctx.principal.institutionUserId,
    });
  }

  // === helpers ===============================================================

  private computeStatus(amount: number, paid: number, current: string): string {
    if (current === 'cancelled') return 'cancelled';
    if (amount > 0 && paid >= amount) return 'paid';
    if (paid > 0) return 'partial';
    return current === 'overdue' ? 'overdue' : 'pending';
  }

  private withBalance<T extends { amount: number; amountPaid: number }>(row: T): T & { balance: number } {
    return { ...row, balance: row.amount - row.amountPaid };
  }

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

  private async requireInvoiceInScope(ctx: PortalActionContext, invoiceId: string) {
    const f = this.filter(ctx);
    const invoice = await this.repo.findInvoice(invoiceId, ctx.principal.institutionId);
    this.assertInScope(invoice?.campusId ?? null, invoice, f);
    return invoice;
  }

  private async assertRef(ctx: PortalActionContext, table: FeeRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: FeeRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
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
