import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import {
  SETTINGS_REGISTRY,
  SETTINGS_BY_KEY,
  currencyForCountry,
  currencyLabel,
  type CreatePortalSettingInput,
  type EffectiveSettings,
  type InstitutionProfile,
  type PortalSettingsListQuery,
  type PutEffectiveSettingsInput,
  type SettingDef,
  type UpdateInstitutionProfileInput,
  type UpdatePortalSettingInput,
} from '@edrion/schemas';
import { Currency } from '@edrion/shared-types';
import type { Institution, NewInstitution } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { SettingsRepository } from './settings.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-settings';

/** The currencies the platform billing enum (`institutions.currency`) actually accepts. */
const SUPPORTED_BILLING_CURRENCIES = new Set<string>(Object.values(Currency));

/**
 * Institution-portal Settings service (Phase 11). A flat, campus-scoped, version-guarded key/value
 * tree. New rows are stamped to the active campus (or institution-owned in institution scope); the
 * logical key (institution, campus, category, key) is pre-checked for a friendly 409 SETTING_EXISTS;
 * every mutation is audited. Reads need `institution_settings.view`; writes the sensitive
 * `institution_settings.manage`.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalSettingsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.list(ctx.principal.institutionId, f.campusIds, q), q);
  }

  // --- effective settings (Phase 6) ------------------------------------------

  /**
   * Registry defaults overlaid with stored overrides. In campus scope the ACTIVE campus's override
   * beats the institution-owned value; in institution scope only institution-owned rows apply (a
   * single campus's override must not leak into the institution-wide view).
   */
  async getEffective(ctx: PortalActionContext): Promise<{ values: EffectiveSettings }> {
    const f = this.filter(ctx);
    const activeCampusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const rows = await this.repo.getAll(ctx.principal.institutionId, f.campusIds);
    // Keep the institution-owned row and (in campus scope) the active-campus row; ignore other campuses.
    const stored = new Map<string, { value: string | null; campusId: string | null }>();
    for (const r of rows) {
      if (r.campusId !== null && r.campusId !== activeCampusId) continue;
      const prev = stored.get(r.key);
      // Active-campus override beats institution-owned.
      if (!prev || (prev.campusId === null && r.campusId === activeCampusId)) {
        stored.set(r.key, { value: r.value, campusId: r.campusId });
      }
    }
    const values: EffectiveSettings = {};
    for (const def of SETTINGS_REGISTRY) {
      const override = stored.get(def.key);
      values[def.key] = override && override.value !== null ? this.parse(def, override.value) : def.default;
    }
    return { values };
  }

  /** Upsert the curated form's known keys; unknown keys are ignored. Institution- or campus-scoped. */
  async putEffective(ctx: PortalActionContext, input: PutEffectiveSettingsInput): Promise<{ values: EffectiveSettings }> {
    const campusId = this.createCampusId(ctx.scope);
    for (const [key, raw] of Object.entries(input.values)) {
      const def = SETTINGS_BY_KEY[key];
      if (!def) continue; // ignore anything not in the canonical registry
      const value = raw === null || raw === undefined ? null : String(raw);
      const valueType = def.type === 'number' ? 'number' : def.type === 'boolean' ? 'boolean' : 'string';
      await this.repo.upsertValue(ctx.principal.institutionId, campusId, def.category, def.key, def.label, valueType, value, ctx.principal.institutionUserId);
    }
    await this.write(ctx, 'setting.bulk_update', 'institution_setting', 'effective', campusId, {
      newState: { keys: Object.keys(input.values).filter((k) => SETTINGS_BY_KEY[k]) },
    });
    return this.getEffective(ctx);
  }

  // --- institution profile (tenant-facing edit of the institutions row) ------

  /** The principal's own institution profile, with the operating currency derived from its country. */
  async getProfile(ctx: PortalActionContext): Promise<InstitutionProfile> {
    const inst = await this.repo.getInstitution(ctx.principal.institutionId);
    if (!inst) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution not found' });
    return this.toProfile(inst);
  }

  /**
   * Update the institution's editable identity/location/contact. Currency is DERIVED from the
   * country (never entered): mirrored into the `finance.currency` setting so the whole app resolves
   * it, and into the platform `institutions.currency` enum only when it's a supported billing value.
   */
  async updateProfile(ctx: PortalActionContext, input: UpdateInstitutionProfileInput): Promise<InstitutionProfile> {
    const existing = await this.repo.getInstitution(ctx.principal.institutionId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution not found' });

    const derivedCurrency = currencyForCountry(input.country) ?? null;
    const patch: Partial<NewInstitution> = {
      displayName: input.displayName,
      legalName: input.legalName,
      type: input.type,
      logoUrl: input.logoUrl ?? null,
      country: input.country,
      region: input.region ?? null,
      timezone: input.timezone,
      address: this.buildAddress(input.address, input.country),
      primaryContact: {
        name: input.primaryContact.name,
        email: input.primaryContact.email,
        phone: input.primaryContact.phone,
        title: input.primaryContact.title,
      },
    };
    // Keep the platform billing-currency enum in step only for a supported value; never store a code
    // outside the enum (that would violate the column).
    if (derivedCurrency && SUPPORTED_BILLING_CURRENCIES.has(derivedCurrency)) {
      patch.currency = derivedCurrency as Currency;
    }

    const updated = await this.repo.updateInstitution(ctx.principal.institutionId, input.version, patch);
    if (!updated) throw this.versionConflict();

    // Profile is the single source of truth for currency + timezone: mirror both into the
    // institution-owned settings the rest of the app resolves (finance.currency, localization.timezone).
    await this.mirrorSetting(ctx, 'currency', derivedCurrency);
    await this.mirrorSetting(ctx, 'timezone', input.timezone);

    await this.write(ctx, 'institution.profile_update', 'institution', updated.id, null, {
      previousState: { displayName: existing.displayName, country: existing.country, currency: existing.currency },
      newState: { displayName: updated.displayName, country: updated.country, currency: derivedCurrency },
    });
    return this.toProfile(updated);
  }

  private toProfile(inst: Institution): InstitutionProfile {
    const currency = currencyForCountry(inst.country) ?? (inst.currency as string | null) ?? null;
    return {
      id: inst.id,
      publicId: inst.publicId,
      displayName: inst.displayName,
      legalName: inst.legalName,
      type: inst.type as InstitutionProfile['type'],
      logoUrl: inst.logoUrl ?? null,
      country: inst.country,
      region: inst.region ?? null,
      timezone: inst.timezone,
      address: inst.address ?? null,
      primaryContact: inst.primaryContact,
      currency,
      currencyLabel: currency ? currencyLabel(currency) : '',
      status: inst.status,
      onboardingStatus: inst.onboardingStatus,
      version: inst.version,
    };
  }

  /** Upsert a single institution-owned registry setting from a canonical Profile value. */
  private async mirrorSetting(ctx: PortalActionContext, key: string, value: string | null): Promise<void> {
    if (!value) return;
    const def = SETTINGS_BY_KEY[key];
    if (!def) return;
    await this.repo.upsertValue(
      ctx.principal.institutionId, null, def.category, def.key, def.label, 'string', value, ctx.principal.institutionUserId,
    );
  }

  /** Build the stored address JSON, or null when the admin left every field blank. */
  private buildAddress(
    a: UpdateInstitutionProfileInput['address'],
    fallbackCountry: string,
  ): NewInstitution['address'] {
    if (!a) return null;
    const hasAny = a.line1 || a.line2 || a.city || a.region || a.postalCode || a.country;
    if (!hasAny) return null;
    return {
      line1: a.line1 ?? '',
      line2: a.line2,
      city: a.city ?? '',
      region: a.region,
      postalCode: a.postalCode,
      country: a.country ?? fallbackCountry,
    };
  }

  private parse(def: SettingDef, value: string): string | number | boolean {
    if (def.type === 'number') {
      const n = Number(value);
      return Number.isFinite(n) ? n : (def.default as number);
    }
    if (def.type === 'boolean') return value === 'true' || value === '1';
    return value;
  }

  async create(ctx: PortalActionContext, input: CreatePortalSettingInput) {
    const campusId = this.createCampusId(ctx.scope);
    const key = input.key.trim();
    if (await this.repo.findByKey(ctx.principal.institutionId, campusId, input.category, key)) {
      throw new ConflictException({
        code: 'SETTING_EXISTS',
        message: `A "${input.category}" setting with key "${key}" already exists in this scope.`,
      });
    }
    const row = await this.repo.insert({
      institutionId: ctx.principal.institutionId,
      campusId,
      category: input.category,
      key,
      label: input.label,
      valueType: input.valueType,
      value: input.value ?? null,
      description: input.description ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'setting.create', 'institution_setting', row.id, campusId, {
      newState: { category: row.category, key: row.key, valueType: row.valueType },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdatePortalSettingInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const nextCategory = input.category ?? existing!.category;
    const nextKey = (input.key ?? existing!.key).trim();
    if (nextCategory !== existing!.category || nextKey !== existing!.key) {
      const dupe = await this.repo.findByKey(ctx.principal.institutionId, existing!.campusId, nextCategory, nextKey);
      if (dupe && dupe.id !== id) {
        throw new ConflictException({
          code: 'SETTING_EXISTS',
          message: `A "${nextCategory}" setting with key "${nextKey}" already exists in this scope.`,
        });
      }
    }
    const updated = await this.repo.update(id, input.version, {
      category: nextCategory,
      key: nextKey,
      label: input.label ?? existing!.label,
      valueType: input.valueType ?? existing!.valueType,
      value: input.value === undefined ? existing!.value : input.value,
      description: input.description === undefined ? existing!.description : input.description,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'setting.update', 'institution_setting', id, updated.campusId, {
      newState: { category: updated.category, key: updated.key },
    });
    return updated;
  }

  async remove(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'setting.delete', 'institution_setting', id, existing!.campusId, {
      previousState: { category: existing!.category, key: existing!.key },
    });
    return { deleted: true };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
