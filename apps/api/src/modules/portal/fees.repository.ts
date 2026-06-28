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
import type {
  FeeInvoice,
  FeePayment,
  FeeStructure,
  NewFeeInvoice,
  NewFeePayment,
  NewFeeStructure,
} from '@edrion/database';
import type { FeeInvoicesListQuery, FeeStructuresListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const studentDisplayName = sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.lastName})`;

export interface FeeStructureRow extends FeeStructure {
  gradeLevelName: string | null;
  className: string | null;
  academicYearName: string | null;
}
export interface FeeInvoiceRow extends FeeInvoice {
  balance: number;
  studentName: string | null;
  admissionNo: string | null;
  feeStructureName: string | null;
}
export interface FeePaymentRow extends FeePayment {}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type FeeRefTable = 'gradeLevels' | 'classes' | 'academicYears' | 'students' | 'feeStructures';

/**
 * Typed SQL for the institution-portal fees tables (structures + invoices + payments). Same contract
 * as the other portal repos: every query is confined to one institution; campus-scoped reads also
 * include institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit and the
 * payment→invoice bridge.
 */
@Injectable()
export class FeesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(
    instCol: PgColumn,
    campusCol: PgColumn,
    institutionId: string,
    campusIds: CampusFilter,
  ): SQL[] {
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

  async existsInInstitution(table: FeeRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- fee structures --------------------------------------------------------

  async listStructures(
    institutionId: string,
    campusIds: CampusFilter,
    q: FeeStructuresListQuery,
  ): Promise<Page<FeeStructureRow>> {
    const t = schema.feeStructures;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.feeType) conds.push(eq(t.feeType, q.feeType));
    if (q.search) {
      const s = ilike(t.name, `%${q.search}%`);
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      name: t.name,
      feeType: t.feeType,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;
    const rows = await this.db
      .select({
        structure: t,
        gradeLevelName: schema.gradeLevels.name,
        className: schema.classes.name,
        academicYearName: schema.academicYears.name,
      })
      .from(t)
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.structure,
        gradeLevelName: r.gradeLevelName,
        className: r.className,
        academicYearName: r.academicYearName,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findStructure(id: string, institutionId: string): Promise<FeeStructure | undefined> {
    const t = schema.feeStructures;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertStructure(values: NewFeeStructure): Promise<FeeStructure> {
    const [row] = await this.db.insert(schema.feeStructures).values(values).returning();
    return row!;
  }

  async updateStructure(id: string, version: number, patch: Partial<NewFeeStructure>): Promise<FeeStructure | undefined> {
    const t = schema.feeStructures;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteStructure(id: string, version: number): Promise<boolean> {
    const t = schema.feeStructures;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- fee invoices ----------------------------------------------------------

  async listInvoices(
    institutionId: string,
    campusIds: CampusFilter,
    q: FeeInvoicesListQuery,
  ): Promise<Page<FeeInvoiceRow>> {
    const t = schema.feeInvoices;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.studentId) conds.push(eq(t.studentId, q.studentId));
    if (q.search) {
      const s = or(ilike(t.invoiceNo, `%${q.search}%`), ilike(studentDisplayName, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      invoiceNo: t.invoiceNo,
      amount: t.amount,
      status: t.status,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;
    const rows = await this.db
      .select({
        invoice: t,
        studentName: studentDisplayName,
        admissionNo: schema.students.admissionNo,
        feeStructureName: schema.feeStructures.name,
      })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .leftJoin(schema.feeStructures, eq(schema.feeStructures.id, t.feeStructureId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.invoice,
        balance: r.invoice.amount - r.invoice.amountPaid,
        studentName: r.studentName,
        admissionNo: r.admissionNo,
        feeStructureName: r.feeStructureName,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findInvoice(id: string, institutionId: string): Promise<FeeInvoice | undefined> {
    const t = schema.feeInvoices;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  /** An invoice already exists with this number? (friendly 409 instead of a unique-index 500). */
  async findInvoiceByNo(institutionId: string, invoiceNo: string): Promise<FeeInvoice | undefined> {
    const t = schema.feeInvoices;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.invoiceNo, invoiceNo)))
      .limit(1);
    return row;
  }

  async insertInvoice(values: NewFeeInvoice): Promise<FeeInvoice> {
    const [row] = await this.db.insert(schema.feeInvoices).values(values).returning();
    return row!;
  }

  async updateInvoice(id: string, version: number, patch: Partial<NewFeeInvoice>): Promise<FeeInvoice | undefined> {
    const t = schema.feeInvoices;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteInvoice(id: string, version: number): Promise<boolean> {
    const t = schema.feeInvoices;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- payments (against an invoice) -----------------------------------------

  async listPayments(invoiceId: string): Promise<FeePaymentRow[]> {
    const t = schema.feePayments;
    return this.db.select().from(t).where(eq(t.invoiceId, invoiceId)).orderBy(desc(t.createdAt));
  }

  async findPayment(id: string, invoiceId: string): Promise<FeePayment | undefined> {
    const t = schema.feePayments;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.invoiceId, invoiceId))).limit(1);
    return row;
  }

  async insertPayment(values: NewFeePayment): Promise<FeePayment> {
    const [row] = await this.db.insert(schema.feePayments).values(values).returning();
    return row!;
  }

  async deletePayment(id: string): Promise<boolean> {
    const t = schema.feePayments;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  /** Sum of all payments recorded against an invoice (minor units). Drives the bridge. */
  async sumPayments(invoiceId: string): Promise<number> {
    const t = schema.feePayments;
    const [row] = await this.db
      .select({ total: sql<number>`coalesce(sum(${t.amount}), 0)` })
      .from(t)
      .where(eq(t.invoiceId, invoiceId));
    return Number(row?.total ?? 0);
  }
}
