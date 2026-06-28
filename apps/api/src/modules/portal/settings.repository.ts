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
import type { InstitutionSetting, NewInstitutionSetting } from '@edrion/database';
import type { PortalSettingsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

/**
 * Typed SQL for the institution-portal settings tree (Phase 11). Same contract as the other portal
 * repos: every query is confined to one institution; campus-scoped reads also include
 * institution-owned (campus_id IS NULL) rows. The service owns scope/version/audit + the
 * (institution, campus, category, key) uniqueness pre-check.
 */
@Injectable()
export class SettingsRepository {
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

  async list(institutionId: string, campusIds: CampusFilter, q: PortalSettingsListQuery): Promise<Page<InstitutionSetting>> {
    const t = schema.institutionSettings;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.category) conds.push(eq(t.category, q.category));
    if (q.search) {
      const s = or(ilike(t.key, `%${q.search}%`), ilike(t.label, `%${q.search}%`), ilike(t.value, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      category: t.category,
      key: t.key,
      label: t.label,
      valueType: t.valueType,
      createdAt: t.createdAt,
    };
    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(
        this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.category),
        asc(t.key),
      )
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items, total: Number(tot?.value ?? 0) };
  }

  async find(id: string, institutionId: string): Promise<InstitutionSetting | undefined> {
    const t = schema.institutionSettings;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  /** Logical-uniqueness lookup for (institution, campus, category, key) — campus NULL = institution-owned. */
  async findByKey(
    institutionId: string,
    campusId: string | null,
    category: string,
    key: string,
  ): Promise<InstitutionSetting | undefined> {
    const t = schema.institutionSettings;
    const campusCond = campusId === null ? isNull(t.campusId) : eq(t.campusId, campusId);
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), campusCond, eq(t.category, category), eq(t.key, key)))
      .limit(1);
    return row;
  }

  async insert(values: NewInstitutionSetting): Promise<InstitutionSetting> {
    const [row] = await this.db.insert(schema.institutionSettings).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewInstitutionSetting>): Promise<InstitutionSetting | undefined> {
    const t = schema.institutionSettings;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.institutionSettings;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
