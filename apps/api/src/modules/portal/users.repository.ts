import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { InstitutionUser, NewInstitutionUser, Staff } from '@edrion/database';
import { WILDCARD_PERMISSION } from '@edrion/permissions';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';
import type { PortalUsersListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { Page } from './academics.repository';

const teachingRoleKeysFor = (permissionKey: string) =>
  INSTITUTION_DEFAULT_ROLES.filter(
    (r) => r.permissions.includes(permissionKey) || r.permissions.includes(WILDCARD_PERMISSION),
  ).map((r) => r.key);

/**
 * Typed SQL for the institution-portal user directory (Phase 11) over institution_users +
 * institution_user_roles + campus_user_access. User management is an institution-level function, so
 * the list is institution-wide (not campus-filtered); the service still runs under the portal scope
 * guard. Role/campus-access replacement runs in a transaction so a user is never left half-assigned.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async list(
    institutionId: string,
    roleKeyUserIds: string[] | null,
    permissionUserIds: string[] | null,
    provisionedUserIds: string[] | null,
    q: PortalUsersListQuery,
  ): Promise<Page<InstitutionUser>> {
    const t = schema.institutionUsers;
    const conds: SQL[] = [eq(t.institutionId, institutionId)];
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.mfa !== undefined) conds.push(eq(t.requireMfa, q.mfa));
    if (roleKeyUserIds) {
      if (roleKeyUserIds.length === 0) return { items: [], total: 0 };
      conds.push(inArray(t.id, roleKeyUserIds));
    }
    if (permissionUserIds) {
      if (permissionUserIds.length === 0) return { items: [], total: 0 };
      conds.push(inArray(t.id, permissionUserIds));
    }
    if (provisionedUserIds) {
      if (provisionedUserIds.length === 0) return { items: [], total: 0 };
      conds.push(inArray(t.id, provisionedUserIds));
    }
    if (q.campusId) {
      const campusUsers = await this.db
        .select({ userId: schema.campusUserAccess.institutionUserId })
        .from(schema.campusUserAccess)
        .where(eq(schema.campusUserAccess.campusId, q.campusId));
      const ids = campusUsers.map((r) => r.userId);
      if (ids.length === 0) return { items: [], total: 0 };
      conds.push(inArray(t.id, ids));
    }
    if (q.search) {
      const s = or(ilike(t.fullName, `%${q.search}%`), ilike(t.email, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      fullName: t.fullName,
      email: t.email,
      status: t.status,
      lastLoginAt: t.lastLoginAt,
      createdAt: t.createdAt,
    };
    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items, total: Number(tot?.value ?? 0) };
  }

  async find(id: string, institutionId: string): Promise<InstitutionUser | undefined> {
    const t = schema.institutionUsers;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async findStaffByInstitutionUserId(institutionUserId: string, institutionId: string): Promise<Staff | undefined> {
    const t = schema.staff;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionUserId, institutionUserId), eq(t.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async findByEmail(institutionId: string, email: string): Promise<InstitutionUser | undefined> {
    const t = schema.institutionUsers;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.email, email)))
      .limit(1);
    return row;
  }

  async insert(values: NewInstitutionUser): Promise<InstitutionUser> {
    const [row] = await this.db.insert(schema.institutionUsers).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewInstitutionUser>): Promise<InstitutionUser | undefined> {
    const t = schema.institutionUsers;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.institutionUsers;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- roles + campus access aggregation -------------------------------------

  async rolesForUsers(userIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (userIds.length === 0) return map;
    const rows = await this.db
      .select({ userId: schema.institutionUserRoles.institutionUserId, roleKey: schema.institutionUserRoles.roleKey })
      .from(schema.institutionUserRoles)
      .where(inArray(schema.institutionUserRoles.institutionUserId, userIds));
    for (const r of rows) {
      const list = map.get(r.userId) ?? [];
      list.push(r.roleKey);
      map.set(r.userId, list);
    }
    return map;
  }

  async campusIdsForUsers(userIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (userIds.length === 0) return map;
    const rows = await this.db
      .select({ userId: schema.campusUserAccess.institutionUserId, campusId: schema.campusUserAccess.campusId })
      .from(schema.campusUserAccess)
      .where(inArray(schema.campusUserAccess.institutionUserId, userIds));
    for (const r of rows) {
      const list = map.get(r.userId) ?? [];
      list.push(r.campusId);
      map.set(r.userId, list);
    }
    return map;
  }

  /** The user ids in this institution holding a given role key (drives the directory role filter). */
  async userIdsWithRole(institutionId: string, roleKey: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.institutionUserRoles.institutionUserId })
      .from(schema.institutionUserRoles)
      .innerJoin(schema.institutionUsers, eq(schema.institutionUserRoles.institutionUserId, schema.institutionUsers.id))
      .where(and(eq(schema.institutionUsers.institutionId, institutionId), eq(schema.institutionUserRoles.roleKey, roleKey)));
    return rows.map((r) => r.id);
  }

  /** Institution users whose effective permissions include the given catalogue key. */
  async userIdsWithPermission(institutionId: string, permissionKey: string): Promise<string[]> {
    const customRoleRows = await this.db
      .select({ key: schema.institutionRoles.key })
      .from(schema.institutionRoles)
      .where(
        and(
          eq(schema.institutionRoles.institutionId, institutionId),
          or(
            sql`${schema.institutionRoles.permissions} @> ${JSON.stringify([permissionKey])}::jsonb`,
            sql`${schema.institutionRoles.permissions} @> ${JSON.stringify([WILDCARD_PERMISSION])}::jsonb`,
          ),
        ),
      );
    const roleKeys = [...new Set([...teachingRoleKeysFor(permissionKey), ...customRoleRows.map((r) => r.key)])];

    const roleRows =
      roleKeys.length === 0
        ? []
        : await this.db
            .select({ id: schema.institutionUserRoles.institutionUserId })
            .from(schema.institutionUserRoles)
            .innerJoin(schema.institutionUsers, eq(schema.institutionUserRoles.institutionUserId, schema.institutionUsers.id))
            .where(and(eq(schema.institutionUsers.institutionId, institutionId), inArray(schema.institutionUserRoles.roleKey, roleKeys)));

    const grantRows = await this.db
      .select({ id: schema.institutionUsers.id })
      .from(schema.institutionUsers)
      .where(
        and(
          eq(schema.institutionUsers.institutionId, institutionId),
          or(
            sql`${schema.institutionUsers.directGrants} @> ${JSON.stringify([permissionKey])}::jsonb`,
            sql`${schema.institutionUsers.directGrants} @> ${JSON.stringify([WILDCARD_PERMISSION])}::jsonb`,
          ),
        ),
      );

    return [...new Set([...roleRows.map((r) => r.id), ...grantRows.map((r) => r.id)])];
  }

  /** Users linked from a staff directory row in this institution. */
  async userIdsProvisionedFromStaff(institutionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.staff.institutionUserId })
      .from(schema.staff)
      .where(and(eq(schema.staff.institutionId, institutionId), isNotNull(schema.staff.institutionUserId)));
    return rows.map((r) => r.id!).filter(Boolean);
  }

  /** Which of the given campus ids actually belong to this institution (FK pre-check). */
  async validCampusIds(institutionId: string, campusIds: string[]): Promise<Set<string>> {
    if (campusIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: schema.campuses.id })
      .from(schema.campuses)
      .where(and(eq(schema.campuses.institutionId, institutionId), inArray(schema.campuses.id, campusIds)));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Replace a user's role assignment, campus access and overrides + bump the version, all in one
   * transaction. Returns the updated user, or undefined on a version conflict.
   */
  async replaceAccess(
    id: string,
    version: number,
    args: { roleKeys: string[]; campusIds: string[]; directGrants: string[]; directDenies: string[]; actorId: string | null },
  ): Promise<InstitutionUser | undefined> {
    return this.db.transaction(async (tx) => {
      const t = schema.institutionUsers;
      const [user] = await tx
        .update(t)
        .set({
          directGrants: args.directGrants,
          directDenies: args.directDenies,
          version: version + 1,
          updatedBy: args.actorId,
          updatedAt: new Date(),
        })
        .where(and(eq(t.id, id), eq(t.version, version)))
        .returning();
      if (!user) return undefined;

      await tx.delete(schema.institutionUserRoles).where(eq(schema.institutionUserRoles.institutionUserId, id));
      if (args.roleKeys.length > 0) {
        await tx
          .insert(schema.institutionUserRoles)
          .values(args.roleKeys.map((roleKey) => ({ institutionUserId: id, roleKey })));
      }

      await tx.delete(schema.campusUserAccess).where(eq(schema.campusUserAccess.institutionUserId, id));
      if (args.campusIds.length > 0) {
        await tx
          .insert(schema.campusUserAccess)
          .values(args.campusIds.map((campusId) => ({ institutionUserId: id, campusId, createdBy: args.actorId })));
      }
      return user;
    });
  }

  async getRoleKeys(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ roleKey: schema.institutionUserRoles.roleKey })
      .from(schema.institutionUserRoles)
      .where(eq(schema.institutionUserRoles.institutionUserId, userId));
    return rows.map((r) => r.roleKey);
  }

  async getCampusIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ campusId: schema.campusUserAccess.campusId })
      .from(schema.campusUserAccess)
      .where(eq(schema.campusUserAccess.institutionUserId, userId));
    return rows.map((r) => r.campusId);
  }
}
