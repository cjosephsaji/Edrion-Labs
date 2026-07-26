import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, schema, type Database } from '@edrion/database';
import type { InstitutionRole, NewInstitutionRole } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/**
 * Typed SQL for the institution-portal CUSTOM roles (Phase 11). Confined to one institution. The
 * code default roles are not stored here — the service merges them in for the list + the auth eval.
 */
@Injectable()
export class RolesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listCustom(institutionId: string): Promise<InstitutionRole[]> {
    const t = schema.institutionRoles;
    return this.db.select().from(t).where(eq(t.institutionId, institutionId)).orderBy(t.name);
  }

  async find(id: string, institutionId: string): Promise<InstitutionRole | undefined> {
    const t = schema.institutionRoles;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async findByKey(institutionId: string, key: string): Promise<InstitutionRole | undefined> {
    const t = schema.institutionRoles;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.key, key)))
      .limit(1);
    return row;
  }

  async insert(values: NewInstitutionRole): Promise<InstitutionRole> {
    const [row] = await this.db.insert(schema.institutionRoles).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewInstitutionRole>): Promise<InstitutionRole | undefined> {
    const t = schema.institutionRoles;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.institutionRoles;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Per-role-key assignment counts for an institution (drives the "in use" column + the delete
   * guard). institution_user_roles has no institution_id, so we join to institution_users.
   */
  async usageByKey(institutionId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ roleKey: schema.institutionUserRoles.roleKey, value: count() })
      .from(schema.institutionUserRoles)
      .innerJoin(
        schema.institutionUsers,
        eq(schema.institutionUserRoles.institutionUserId, schema.institutionUsers.id),
      )
      .where(eq(schema.institutionUsers.institutionId, institutionId))
      .groupBy(schema.institutionUserRoles.roleKey);
    return new Map(rows.map((r) => [r.roleKey, Number(r.value ?? 0)]));
  }
}
