import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, sql, type Database } from '@edrion/database';
import type { ProviderEntityKind, ProviderMappingInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class ProviderMappingsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async connection(institutionId: string, id: string) {
    const [row] = await this.db.select().from(schema.institutionIdentityProviders)
      .where(and(eq(schema.institutionIdentityProviders.id, id), eq(schema.institutionIdentityProviders.institutionId, institutionId)))
      .for('update'); // Serialize revisions and pin configuration until the enclosing transaction commits.
    return row;
  }

  latest(institutionId: string, connectionId: string, key: Pick<ProviderMappingInput, 'namespace' | 'entityKind' | 'externalId'>) {
    const t = schema.integrationProviderMappings;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.connectionId, connectionId),
      eq(t.namespace, key.namespace), eq(t.entityKind, key.entityKind), eq(t.externalId, key.externalId)))
      .orderBy(desc(t.version)).limit(1).then((rows) => rows[0]);
  }

  receipt(institutionId: string, connectionId: string, commandId: string) {
    const t = schema.integrationProviderMappings;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.connectionId, connectionId), eq(t.commandId, commandId)))
      .limit(1).then((rows) => rows[0]);
  }

  insert(values: typeof schema.integrationProviderMappings.$inferInsert) {
    return this.db.insert(schema.integrationProviderMappings).values(values).returning().then((rows) => rows[0]!);
  }

  /** Whitelisted canonical owners only. External strings never become SQL names or primary IDs. */
  async canonical(institutionId: string, kind: ProviderEntityKind, id: string) {
    const owners: Record<ProviderEntityKind, string> = {
      institution: 'institutions', campus: 'campuses', institution_user: 'institution_users',
      student: 'students', staff: 'staff', course: 'courses', class: 'classes', academic_term: 'academic_terms', assignment: 'assignments',
    };
    const table = sql.raw(owners[kind]);
    const campus = ['institution', 'campus', 'institution_user'].includes(kind) ? sql`NULL` : sql`campus_id`;
    const tenant = kind === 'institution' ? sql`id = ${institutionId}::uuid` : sql`institution_id = ${institutionId}::uuid`;
    // Classes have no lifecycle status in the canonical owner; existence/version is the available reference.
    const status = kind === 'campus' ? sql`CASE WHEN is_active THEN 'active' ELSE 'inactive' END`
      : kind === 'class' ? sql`'present'::text` : sql`status`;
    const rows = await this.db.execute<{ id: string; version: number; status: string; campusId: string | null }>(sql`
      SELECT id, version, ${status} AS status, ${campus} AS "campusId" FROM ${table}
      WHERE id = ${id}::uuid AND ${tenant} FOR SHARE
    `);
    const row = rows[0];
    if (!row) return null;
    if (kind === 'student' && row.status !== 'enrolled') return null;
    if ((kind === 'staff' || kind === 'institution_user') && row.status !== 'active') return null;
    if (['inactive', 'archived', 'deleted', 'suspended', 'closed'].includes(row.status)) return null;
    return row;
  }
}
