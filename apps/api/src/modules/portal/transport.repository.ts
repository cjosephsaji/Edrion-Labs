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
  personSqlName,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  NewTransportAssignment,
  NewTransportRoute,
  NewTransportVehicle,
  TransportAssignment,
  TransportRoute,
  TransportVehicle,
} from '@edrion/database';
import type { TransportRoutesListQuery, TransportVehiclesListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const studentDisplayName = personSqlName(schema.students.firstName, schema.students.middleName, schema.students.lastName);

export interface TransportRouteRow extends TransportRoute {
  assignmentCount: number;
}
export interface TransportVehicleRow extends TransportVehicle {
  routeName: string | null;
}
export interface TransportAssignmentRow extends TransportAssignment {
  studentName: string | null;
  admissionNo: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type TransportRefTable = 'transportRoutes' | 'students';

/**
 * Typed SQL for the institution-portal transport tables (routes + vehicles + assignments). Same
 * contract as the other portal repos: every query is confined to one institution; campus-scoped reads
 * also include institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit.
 */
@Injectable()
export class TransportRepository {
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

  async existsInInstitution(table: TransportRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- routes ----------------------------------------------------------------

  async listRoutes(institutionId: string, campusIds: CampusFilter, q: TransportRoutesListQuery): Promise<Page<TransportRouteRow>> {
    const t = schema.transportRoutes;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.code, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, fare: t.fare, status: t.status, createdAt: t.createdAt };
    const assignmentCount = sql<number>`(select count(*) from ${schema.transportAssignments} ta where ta.route_id = ${t.id})`;
    const rows = await this.db
      .select({ route: t, assignmentCount })
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.route, assignmentCount: Number(r.assignmentCount ?? 0) })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findRoute(id: string, institutionId: string): Promise<TransportRoute | undefined> {
    const t = schema.transportRoutes;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertRoute(values: NewTransportRoute): Promise<TransportRoute> {
    const [row] = await this.db.insert(schema.transportRoutes).values(values).returning();
    return row!;
  }

  async updateRoute(id: string, version: number, patch: Partial<NewTransportRoute>): Promise<TransportRoute | undefined> {
    const t = schema.transportRoutes;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteRoute(id: string, version: number): Promise<boolean> {
    const t = schema.transportRoutes;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- vehicles --------------------------------------------------------------

  async listVehicles(
    institutionId: string,
    campusIds: CampusFilter,
    q: TransportVehiclesListQuery,
  ): Promise<Page<TransportVehicleRow>> {
    const t = schema.transportVehicles;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.routeId) conds.push(eq(t.routeId, q.routeId));
    if (q.search) {
      const s = or(ilike(t.registrationNo, `%${q.search}%`), ilike(t.model, `%${q.search}%`), ilike(t.driverName, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      registrationNo: t.registrationNo,
      capacity: t.capacity,
      status: t.status,
      createdAt: t.createdAt,
    };
    const rows = await this.db
      .select({ vehicle: t, routeName: schema.transportRoutes.name })
      .from(t)
      .leftJoin(schema.transportRoutes, eq(schema.transportRoutes.id, t.routeId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.registrationNo))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.vehicle, routeName: r.routeName })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findVehicle(id: string, institutionId: string): Promise<TransportVehicle | undefined> {
    const t = schema.transportVehicles;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertVehicle(values: NewTransportVehicle): Promise<TransportVehicle> {
    const [row] = await this.db.insert(schema.transportVehicles).values(values).returning();
    return row!;
  }

  async updateVehicle(id: string, version: number, patch: Partial<NewTransportVehicle>): Promise<TransportVehicle | undefined> {
    const t = schema.transportVehicles;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteVehicle(id: string, version: number): Promise<boolean> {
    const t = schema.transportVehicles;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- assignments (against a route) -----------------------------------------

  async listAssignments(routeId: string): Promise<TransportAssignmentRow[]> {
    const t = schema.transportAssignments;
    const rows = await this.db
      .select({ assignment: t, studentName: studentDisplayName, admissionNo: schema.students.admissionNo })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .where(eq(t.routeId, routeId))
      .orderBy(desc(t.createdAt));
    return rows.map((r) => ({ ...r.assignment, studentName: r.studentName, admissionNo: r.admissionNo }));
  }

  async findAssignment(id: string, routeId: string): Promise<TransportAssignment | undefined> {
    const t = schema.transportAssignments;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.routeId, routeId))).limit(1);
    return row;
  }

  /** An assignment already exists for this (route, student)? (friendly 409). */
  async findAssignmentByStudent(routeId: string, studentId: string): Promise<TransportAssignment | undefined> {
    const t = schema.transportAssignments;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.routeId, routeId), eq(t.studentId, studentId)))
      .limit(1);
    return row;
  }

  async insertAssignment(values: NewTransportAssignment): Promise<TransportAssignment> {
    const [row] = await this.db.insert(schema.transportAssignments).values(values).returning();
    return row!;
  }

  async updateAssignment(
    id: string,
    version: number,
    patch: Partial<NewTransportAssignment>,
  ): Promise<TransportAssignment | undefined> {
    const t = schema.transportAssignments;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteAssignment(id: string, version: number): Promise<boolean> {
    const t = schema.transportAssignments;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
