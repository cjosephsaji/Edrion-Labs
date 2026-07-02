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
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { AdmissionApplication, NewAdmissionApplication } from '@edrion/database';
import type { AdmissionsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

export interface AdmissionRow extends AdmissionApplication {
  gradeLevelName: string | null;
  academicYearName: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type AdmissionRefTable = 'gradeLevels' | 'classes' | 'academicYears';

/**
 * Typed SQL for the institution-portal admissions table. Same contract as the other portal repos:
 * every query is confined to one institution; campus-scoped reads also include institution-owned
 * (campus_id IS NULL) rows. No business rules here — the service owns scope/version/FK/audit.
 */
@Injectable()
export class AdmissionsRepository {
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

  /** Confirm a referenced row exists in the institution (FK pre-check for friendly errors). */
  async existsInInstitution(table: AdmissionRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  async list(institutionId: string, campusIds: CampusFilter, q: AdmissionsListQuery): Promise<Page<AdmissionRow>> {
    const t = schema.admissionApplications;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.submittedVia) conds.push(eq(t.submittedVia, q.submittedVia));
    if (q.search) {
      const s = or(
        ilike(t.firstName, `%${q.search}%`),
        ilike(t.lastName, `%${q.search}%`),
        ilike(t.applicationNo, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      applicationNo: t.applicationNo,
      firstName: t.firstName,
      lastName: t.lastName,
      status: t.status,
      appliedDate: t.appliedDate,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const rows = await this.db
      .select({ app: t, gradeLevelName: schema.gradeLevels.name, academicYearName: schema.academicYears.name })
      .from(t)
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.app, gradeLevelName: r.gradeLevelName, academicYearName: r.academicYearName })),
      total: Number(tot?.value ?? 0),
    };
  }

  async find(id: string, institutionId: string): Promise<AdmissionApplication | undefined> {
    const t = schema.admissionApplications;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insert(values: NewAdmissionApplication): Promise<AdmissionApplication> {
    const [row] = await this.db.insert(schema.admissionApplications).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewAdmissionApplication>): Promise<AdmissionApplication | undefined> {
    const t = schema.admissionApplications;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.admissionApplications;
    const rows = await this.db
      .delete(t)
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /** Insert the student created when an applicant is enrolled. */
  async insertStudent(values: typeof schema.students.$inferInsert) {
    const [row] = await this.db.insert(schema.students).values(values).returning();
    return row!;
  }

  /** Is an admission number already taken in the institution? (friendly 400 on enrol). */
  async admissionNoExists(institutionId: string, admissionNo: string): Promise<boolean> {
    const t = schema.students;
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.admissionNo, admissionNo)))
      .limit(1);
    return !!row;
  }
}
