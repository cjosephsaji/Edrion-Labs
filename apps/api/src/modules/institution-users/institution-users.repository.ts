import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  CampusUserAccess,
  Institution,
  InstitutionUser,
  NewCampusUserAccess,
  NewInstitutionUser,
} from '@edrion/database';
import type { CampusGrant, ListInstitutionUsersQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  fullName: schema.institutionUsers.fullName,
  email: schema.institutionUsers.email,
  status: schema.institutionUsers.status,
  lastLoginAt: schema.institutionUsers.lastLoginAt,
  invitedAt: schema.institutionUsers.invitedAt,
  createdAt: schema.institutionUsers.createdAt,
  updatedAt: schema.institutionUsers.updatedAt,
};

/** A campus access grant joined with the campus name, for detail rendering. */
export interface CampusAccessRow extends CampusUserAccess {
  campusName: string | null;
  campusInstitutionId: string;
}

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class InstitutionUsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private buildWhere(q: ListInstitutionUsersQuery): SQL | undefined {
    const u = schema.institutionUsers;
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(ilike(u.fullName, `%${q.search}%`), ilike(u.email, `%${q.search}%`));
      if (s) clauses.push(s);
    }
    if (q.institutionId) clauses.push(eq(u.institutionId, q.institutionId));
    if (q.status) clauses.push(eq(u.status, q.status));

    if (q.invitation === 'pending') clauses.push(eq(u.status, 'invited'));
    if (q.invitation === 'accepted') clauses.push(sql`${u.status} <> 'invited'`);

    if (q.lastActivity === 'never') clauses.push(sql`${u.lastLoginAt} is null`);
    if (q.lastActivity === 'active_7d') clauses.push(sql`${u.lastLoginAt} >= now() - interval '7 days'`);
    if (q.lastActivity === 'active_30d') clauses.push(sql`${u.lastLoginAt} >= now() - interval '30 days'`);
    if (q.lastActivity === 'inactive_30d') {
      clauses.push(sql`(${u.lastLoginAt} is null or ${u.lastLoginAt} < now() - interval '30 days')`);
    }

    if (q.security === 'mfa_missing') clauses.push(eq(u.mfaEnrolled, false));
    if (q.security === 'mfa_required') clauses.push(eq(u.requireMfa, true));
    if (q.security === 'locked') clauses.push(eq(u.status, 'locked'));
    if (q.security === 'disabled') clauses.push(eq(u.status, 'disabled'));
    if (q.security === 'password_reset') clauses.push(sql`${u.passwordResetRequiredAt} is not null`);

    // Membership filters via EXISTS so the row stays a single institution_users record.
    if (q.roleKey) {
      clauses.push(
        sql`exists (select 1 from ${schema.institutionUserRoles} r where r.institution_user_id = ${u.id} and r.role_key = ${q.roleKey})`,
      );
    }
    if (q.campusId) {
      clauses.push(
        sql`exists (select 1 from ${schema.campusUserAccess} ca where ca.institution_user_id = ${u.id} and ca.campus_id = ${q.campusId})`,
      );
    }
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(
    q: ListInstitutionUsersQuery,
  ): Promise<{ items: InstitutionUser[]; total: number; rolesByUser: Map<string, string[]>; campusCountByUser: Map<string, number> }> {
    const where = this.buildWhere(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.institutionUsers.createdAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db.select({ value: count() }).from(schema.institutionUsers).where(where);

    const ids = items.map((i) => i.id);
    const rolesByUser = await this.rolesForUsers(ids);
    const campusCountByUser = await this.campusCountsForUsers(ids);

    return { items, total: Number(totalRows[0]?.value ?? 0), rolesByUser, campusCountByUser };
  }

  /** Status counts for the directory summary cards (single grouped query). */
  async summaryByStatus(institutionId?: string): Promise<Record<string, number>> {
    const where = institutionId ? eq(schema.institutionUsers.institutionId, institutionId) : undefined;
    const rows = await this.db
      .select({ status: schema.institutionUsers.status, value: count() })
      .from(schema.institutionUsers)
      .where(where)
      .groupBy(schema.institutionUsers.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  async rolesForUsers(userIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (userIds.length === 0) return map;
    const rows = await this.db
      .select({ userId: schema.institutionUserRoles.institutionUserId, roleKey: schema.institutionUserRoles.roleKey })
      .from(schema.institutionUserRoles)
      .where(inArray(schema.institutionUserRoles.institutionUserId, userIds));
    for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.roleKey]);
    return map;
  }

  private async campusCountsForUsers(userIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (userIds.length === 0) return map;
    const rows = await this.db
      .select({ userId: schema.campusUserAccess.institutionUserId, value: count() })
      .from(schema.campusUserAccess)
      .where(inArray(schema.campusUserAccess.institutionUserId, userIds))
      .groupBy(schema.campusUserAccess.institutionUserId);
    for (const r of rows) map.set(r.userId, Number(r.value));
    return map;
  }

  async findById(id: string): Promise<InstitutionUser | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, id))
      .limit(1);
    return row;
  }

  async rolesForUser(id: string): Promise<string[]> {
    const rows = await this.db
      .select({ roleKey: schema.institutionUserRoles.roleKey })
      .from(schema.institutionUserRoles)
      .where(eq(schema.institutionUserRoles.institutionUserId, id));
    return rows.map((r) => r.roleKey);
  }

  async campusAccessForUser(id: string): Promise<CampusAccessRow[]> {
    const rows = await this.db
      .select({
        access: schema.campusUserAccess,
        campusName: schema.campuses.name,
        campusInstitutionId: schema.campuses.institutionId,
      })
      .from(schema.campusUserAccess)
      .leftJoin(schema.campuses, eq(schema.campuses.id, schema.campusUserAccess.campusId))
      .where(eq(schema.campusUserAccess.institutionUserId, id));
    return rows.map((r) => ({
      ...r.access,
      campusName: r.campusName,
      campusInstitutionId: r.campusInstitutionId ?? '',
    }));
  }

  async findInstitution(id: string): Promise<Institution | undefined> {
    const [row] = await this.db.select().from(schema.institutions).where(eq(schema.institutions.id, id)).limit(1);
    return row;
  }

  async findByEmail(institutionId: string, email: string): Promise<InstitutionUser | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(and(eq(schema.institutionUsers.institutionId, institutionId), eq(schema.institutionUsers.email, email)))
      .limit(1);
    return row;
  }

  /** Campus ids that belong to the institution — used to enforce the single-institution invariant. */
  async campusIdsForInstitution(institutionId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ id: schema.campuses.id })
      .from(schema.campuses)
      .where(eq(schema.campuses.institutionId, institutionId));
    return new Set(rows.map((r) => r.id));
  }

  async insert(values: NewInstitutionUser): Promise<InstitutionUser> {
    const [row] = await this.db.insert(schema.institutionUsers).values(values).returning();
    return row!;
  }

  /** Optimistic-concurrency update; returns undefined on a version mismatch (→ 409 in service). */
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewInstitutionUser>,
  ): Promise<InstitutionUser | undefined> {
    const [row] = await this.db
      .update(schema.institutionUsers)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.institutionUsers.id, id), eq(schema.institutionUsers.version, expectedVersion)))
      .returning();
    return row;
  }

  /** Version-less stamp (force-reset / revoke-sessions / resend-invite) — bumps version, no guard. */
  async stamp(id: string, patch: Partial<NewInstitutionUser>): Promise<InstitutionUser | undefined> {
    const [row] = await this.db
      .update(schema.institutionUsers)
      .set({ ...patch, version: sql`${schema.institutionUsers.version} + 1`, updatedAt: new Date() })
      .where(eq(schema.institutionUsers.id, id))
      .returning();
    return row;
  }

  /** Replace the user's role set atomically. */
  async replaceRoles(userId: string, roleKeys: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.institutionUserRoles).where(eq(schema.institutionUserRoles.institutionUserId, userId));
      if (roleKeys.length) {
        await tx
          .insert(schema.institutionUserRoles)
          .values(roleKeys.map((roleKey) => ({ institutionUserId: userId, roleKey })));
      }
    });
  }

  /** Replace the user's campus grants atomically. Caller has already validated the institution. */
  async replaceCampusAccess(
    userId: string,
    grants: CampusGrant[],
    actorId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.campusUserAccess).where(eq(schema.campusUserAccess.institutionUserId, userId));
      if (grants.length) {
        const values: NewCampusUserAccess[] = grants.map((g) => ({
          institutionUserId: userId,
          campusId: g.campusId,
          accessLevel: g.accessLevel,
          createdBy: actorId,
        }));
        await tx.insert(schema.campusUserAccess).values(values);
      }
    });
  }

  /** This institution's custom roles (institution_roles) — merged over the code defaults. */
  async customRolesForInstitution(
    institutionId: string,
  ): Promise<{ key: string; name: string; description: string | null; permissions: string[] }[]> {
    const rows = await this.db
      .select({
        key: schema.institutionRoles.key,
        name: schema.institutionRoles.name,
        description: schema.institutionRoles.description,
        permissions: schema.institutionRoles.permissions,
      })
      .from(schema.institutionRoles)
      .where(eq(schema.institutionRoles.institutionId, institutionId));
    return rows;
  }

  async insertRoles(userId: string, roleKeys: string[]): Promise<void> {
    if (!roleKeys.length) return;
    await this.db
      .insert(schema.institutionUserRoles)
      .values(roleKeys.map((roleKey) => ({ institutionUserId: userId, roleKey })));
  }
}
