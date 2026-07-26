import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { ListEmployeesQuery } from '@edrion/schemas';
import type {
  EmployeePermissionOverride,
  NewPlatformEmployee,
  PlatformEmployee,
  PlatformRole,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  fullName: schema.platformEmployees.fullName,
  email: schema.platformEmployees.email,
  status: schema.platformEmployees.status,
  title: schema.platformEmployees.title,
  createdAt: schema.platformEmployees.createdAt,
};

export interface EmployeeListRow extends PlatformEmployee {
  roleCount: number;
  overrideCount: number;
}

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class EmployeesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private where(q: ListEmployeesQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(
        ilike(schema.platformEmployees.fullName, `%${q.search}%`),
        ilike(schema.platformEmployees.email, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.status) clauses.push(eq(schema.platformEmployees.status, q.status));
    if (q.roleId) {
      clauses.push(
        sql`exists (select 1 from ${schema.employeeRoleAssignments} era where era.employee_id = ${schema.platformEmployees.id} and era.role_id = ${q.roleId})`,
      );
    }
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListEmployeesQuery): Promise<{ items: EmployeeListRow[]; total: number }> {
    const where = this.where(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.platformEmployees.createdAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select({
        employee: schema.platformEmployees,
        roleCount: sql<number>`(select count(*)::int from ${schema.employeeRoleAssignments} era where era.employee_id = ${schema.platformEmployees.id})`,
        overrideCount: sql<number>`(select count(*)::int from ${schema.employeePermissionOverrides} epo where epo.employee_id = ${schema.platformEmployees.id})`,
      })
      .from(schema.platformEmployees)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.platformEmployees)
      .where(where);

    return {
      items: items.map((r) => ({
        ...r.employee,
        roleCount: Number(r.roleCount ?? 0),
        overrideCount: Number(r.overrideCount ?? 0),
      })),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.platformEmployees.status, value: count() })
      .from(schema.platformEmployees)
      .groupBy(schema.platformEmployees.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  async findById(id: string): Promise<PlatformEmployee | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.platformEmployees)
      .where(eq(schema.platformEmployees.id, id))
      .limit(1);
    return row;
  }

  async findByEmail(email: string): Promise<PlatformEmployee | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.platformEmployees)
      .where(eq(schema.platformEmployees.email, email))
      .limit(1);
    return row;
  }

  /** Roles assigned to an employee (joined to the role row). */
  async rolesForEmployee(employeeId: string): Promise<PlatformRole[]> {
    const rows = await this.db
      .select({ role: schema.platformRoles })
      .from(schema.employeeRoleAssignments)
      .innerJoin(schema.platformRoles, eq(schema.platformRoles.id, schema.employeeRoleAssignments.roleId))
      .where(eq(schema.employeeRoleAssignments.employeeId, employeeId))
      .orderBy(asc(schema.platformRoles.name));
    return rows.map((r) => r.role);
  }

  async overridesForEmployee(employeeId: string): Promise<EmployeePermissionOverride[]> {
    return this.db
      .select()
      .from(schema.employeePermissionOverrides)
      .where(eq(schema.employeePermissionOverrides.employeeId, employeeId))
      .orderBy(asc(schema.employeePermissionOverrides.permissionKey));
  }

  async insert(values: NewPlatformEmployee): Promise<PlatformEmployee> {
    const [row] = await this.db.insert(schema.platformEmployees).values(values).returning();
    return row!;
  }

  /** Optimistic update: only writes when the stored version matches. Returns the new row or null. */
  async updateWithVersion(
    id: string,
    version: number,
    patch: Partial<PlatformEmployee>,
    actorId: string,
  ): Promise<PlatformEmployee | null> {
    const [row] = await this.db
      .update(schema.platformEmployees)
      .set({ ...patch, version: version + 1, updatedBy: actorId, updatedAt: new Date() })
      .where(and(eq(schema.platformEmployees.id, id), eq(schema.platformEmployees.version, version)))
      .returning();
    return row ?? null;
  }

  /** Replace an employee's role set in one transaction. Returns the new role ids. */
  async replaceRoleAssignments(employeeId: string, roleIds: string[], actorId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.employeeRoleAssignments)
        .where(eq(schema.employeeRoleAssignments.employeeId, employeeId));
      if (roleIds.length) {
        await tx
          .insert(schema.employeeRoleAssignments)
          .values(roleIds.map((roleId) => ({ employeeId, roleId, assignedBy: actorId })));
      }
    });
  }
}
