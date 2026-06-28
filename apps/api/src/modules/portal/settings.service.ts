import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { CreatePortalSettingInput, PortalSettingsListQuery, UpdatePortalSettingInput } from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { SettingsRepository } from './settings.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-settings';

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
