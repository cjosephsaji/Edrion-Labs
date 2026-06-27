import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq, schema, type Database } from '@edrion/database';
import type { PlatformRole } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

export interface RoleWithMeta extends PlatformRole {
  permissionKeys: string[];
  memberCount: number;
}

/** Read-only typed SQL for the platform role catalogue. */
@Injectable()
export class PlatformRolesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<RoleWithMeta[]> {
    const roles = await this.db.select().from(schema.platformRoles).orderBy(asc(schema.platformRoles.name));
    const perms = await this.db
      .select({ roleId: schema.platformRolePermissions.roleId, key: schema.platformRolePermissions.permissionKey })
      .from(schema.platformRolePermissions);
    const members = await this.db
      .select({ roleId: schema.employeeRoleAssignments.roleId, value: count() })
      .from(schema.employeeRoleAssignments)
      .groupBy(schema.employeeRoleAssignments.roleId);

    const keysByRole = new Map<string, string[]>();
    for (const p of perms) {
      const arr = keysByRole.get(p.roleId) ?? [];
      arr.push(p.key);
      keysByRole.set(p.roleId, arr);
    }
    const countByRole = new Map(members.map((m) => [m.roleId, Number(m.value)]));

    return roles.map((r) => ({
      ...r,
      permissionKeys: (keysByRole.get(r.id) ?? []).sort(),
      memberCount: countByRole.get(r.id) ?? 0,
    }));
  }

  async findById(id: string): Promise<RoleWithMeta | undefined> {
    const [role] = await this.db
      .select()
      .from(schema.platformRoles)
      .where(eq(schema.platformRoles.id, id))
      .limit(1);
    if (!role) return undefined;
    const perms = await this.db
      .select({ key: schema.platformRolePermissions.permissionKey })
      .from(schema.platformRolePermissions)
      .where(eq(schema.platformRolePermissions.roleId, id));
    const [memberRow] = await this.db
      .select({ value: count() })
      .from(schema.employeeRoleAssignments)
      .where(eq(schema.employeeRoleAssignments.roleId, id));
    return {
      ...role,
      permissionKeys: perms.map((p) => p.key).sort(),
      memberCount: Number(memberRow?.value ?? 0),
    };
  }
}
