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
import type { Institution, InstitutionSetting, NewInstitution, NewInstitutionSetting } from '@edrion/database';
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

  // --- effective settings (Phase 6) ------------------------------------------

  /** All settings rows in scope (institution-owned + campus), for overlaying on the registry defaults. */
  async getAll(institutionId: string, campusIds: CampusFilter): Promise<InstitutionSetting[]> {
    const t = schema.institutionSettings;
    return this.db.select().from(t).where(and(...this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds)));
  }

  // --- institution profile (tenant-facing edit of the institutions row) ------

  /** The principal's own institution row. Always exactly one institution. */
  async getInstitution(institutionId: string): Promise<Institution | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return row;
  }

  /** Version-guarded update of the institution's own editable profile fields. */
  async updateInstitution(
    institutionId: string,
    version: number,
    patch: Partial<NewInstitution>,
  ): Promise<Institution | undefined> {
    const t = schema.institutions;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, institutionId), eq(t.version, version)))
      .returning();
    return row;
  }

  /** Insert-or-update one setting value by its logical key (institution-owned or campus-scoped). */
  async upsertValue(
    institutionId: string,
    campusId: string | null,
    category: string,
    key: string,
    label: string,
    valueType: string,
    value: string | null,
    userId: string | null,
  ): Promise<void> {
    const existing = await this.findByKey(institutionId, campusId, category, key);
    if (existing) {
      await this.update(existing.id, existing.version, { value, valueType, label, updatedBy: userId });
    } else {
      await this.insert({ institutionId, campusId, category, key, label, valueType, value, createdBy: userId });
    }
  }
}
