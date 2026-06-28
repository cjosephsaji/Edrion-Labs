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
import type { NewPayrollItem, NewPayrollRun, PayrollItem, PayrollRun } from '@edrion/database';
import type { PayrollRunsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const teacherName = sql<string>`concat_ws(' ', ${schema.teachers.firstName}, ${schema.teachers.lastName})`;
const staffName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;

export interface PayrollRunRow extends PayrollRun {
  itemCount: number;
  totalNet: number;
}
export interface PayrollItemRow extends PayrollItem {
  employeeName: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type PayrollRefTable = 'teachers' | 'staff';

/**
 * Typed SQL for the institution-portal payroll tables (runs + per-employee items). Same contract as
 * the other portal repos: every query is confined to one institution; campus-scoped run reads also
 * include institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit.
 */
@Injectable()
export class PayrollRepository {
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

  async existsInInstitution(table: PayrollRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- payroll runs ----------------------------------------------------------

  async listRuns(institutionId: string, campusIds: CampusFilter, q: PayrollRunsListQuery): Promise<Page<PayrollRunRow>> {
    const t = schema.payrollRuns;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.periodLabel, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      name: t.name,
      status: t.status,
      payDate: t.payDate,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;
    const itemCount = sql<number>`(select count(*) from ${schema.payrollItems} pi where pi.payroll_run_id = ${t.id})`;
    const totalNet = sql<number>`(select coalesce(sum(pi.net), 0) from ${schema.payrollItems} pi where pi.payroll_run_id = ${t.id})`;
    const rows = await this.db
      .select({ run: t, itemCount, totalNet })
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.run,
        itemCount: Number(r.itemCount ?? 0),
        totalNet: Number(r.totalNet ?? 0),
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findRun(id: string, institutionId: string): Promise<PayrollRun | undefined> {
    const t = schema.payrollRuns;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertRun(values: NewPayrollRun): Promise<PayrollRun> {
    const [row] = await this.db.insert(schema.payrollRuns).values(values).returning();
    return row!;
  }

  async updateRun(id: string, version: number, patch: Partial<NewPayrollRun>): Promise<PayrollRun | undefined> {
    const t = schema.payrollRuns;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteRun(id: string, version: number): Promise<boolean> {
    const t = schema.payrollRuns;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- payroll items (per employee) ------------------------------------------

  async listItems(runId: string): Promise<PayrollItemRow[]> {
    const t = schema.payrollItems;
    const rows = await this.db
      .select({
        item: t,
        teacherName,
        staffName,
      })
      .from(t)
      .leftJoin(schema.teachers, eq(schema.teachers.id, t.teacherId))
      .leftJoin(schema.staff, eq(schema.staff.id, t.staffId))
      .where(eq(t.payrollRunId, runId))
      .orderBy(desc(t.createdAt));
    return rows.map((r) => ({
      ...r.item,
      employeeName: r.item.employeeType === 'staff' ? r.staffName : r.teacherName,
    }));
  }

  /** An item already exists for this (run, employee)? (friendly 409 instead of a duplicate row). */
  async findItemByEmployee(
    runId: string,
    employeeType: string,
    employeeId: string,
  ): Promise<PayrollItem | undefined> {
    const t = schema.payrollItems;
    const col = employeeType === 'staff' ? t.staffId : t.teacherId;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.payrollRunId, runId), eq(t.employeeType, employeeType), eq(col, employeeId)))
      .limit(1);
    return row;
  }

  async findItem(id: string, runId: string): Promise<PayrollItem | undefined> {
    const t = schema.payrollItems;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.payrollRunId, runId))).limit(1);
    return row;
  }

  async insertItem(values: NewPayrollItem): Promise<PayrollItem> {
    const [row] = await this.db.insert(schema.payrollItems).values(values).returning();
    return row!;
  }

  async updateItem(id: string, version: number, patch: Partial<NewPayrollItem>): Promise<PayrollItem | undefined> {
    const t = schema.payrollItems;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteItem(id: string, version: number): Promise<boolean> {
    const t = schema.payrollItems;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
