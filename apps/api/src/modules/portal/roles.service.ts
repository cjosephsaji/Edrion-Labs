import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import {
  ALL_INSTITUTION_PERMISSION_KEYS,
  INSTITUTION_DEFAULT_ROLES,
} from '@edrion/permissions/institution';
import { WILDCARD_PERMISSION } from '@edrion/permissions';
import type {
  CreatePortalRoleInput,
  PortalRolesListQuery,
  SetPortalRolePermissionsInput,
  UpdatePortalRoleInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { RolesRepository } from './roles.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-roles';
const VALID_KEYS = new Set<string>(ALL_INSTITUTION_PERMISSION_KEYS);

/** A role row as the editor sees it — code defaults (read-only) + the institution's custom roles. */
export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  permissionCount: number;
  isSystem: boolean;
  source: 'default' | 'custom';
  inUse: number;
  version: number;
  createdAt: string | null;
}

/**
 * Institution-portal Roles service (Phase 11). The default roles ship as code (read-only, system);
 * this service CRUDs the per-institution custom roles authored over the institution permission
 * catalogue. Every permission key is validated against the catalogue (friendly 400
 * INVALID_PERMISSION); the wildcard is rejected for custom roles. Reads need `roles.view`; writes
 * need the sensitive `roles.manage`. All mutations are audited; a role in use cannot be deleted.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly repo: RolesRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalRolesListQuery): Promise<ListResult<RoleView>> {
    const [custom, usage] = await Promise.all([
      this.repo.listCustom(ctx.principal.institutionId),
      this.repo.usageByKey(ctx.principal.institutionId),
    ]);
    const customKeys = new Set(custom.map((r) => r.key));
    const defaults: RoleView[] = INSTITUTION_DEFAULT_ROLES
      // a custom role with the same key overrides the default; don't list the default twice
      .filter((r) => !customKeys.has(r.key))
      .map((r) => ({
        id: `default:${r.key}`,
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: [...r.permissions],
        permissionCount: r.permissions.includes(WILDCARD_PERMISSION) ? VALID_KEYS.size : r.permissions.length,
        isSystem: true,
        source: 'default',
        inUse: usage.get(r.key) ?? 0,
        version: 0,
        createdAt: null,
      }));
    const customViews: RoleView[] = custom.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions ?? [],
      permissionCount: (r.permissions ?? []).length,
      isSystem: false,
      source: 'custom',
      inUse: usage.get(r.key) ?? 0,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
    }));

    let all = [...defaults, ...customViews];
    if (q.search) {
      const s = q.search.toLowerCase();
      all = all.filter((r) => r.name.toLowerCase().includes(s) || r.key.toLowerCase().includes(s));
    }
    const dir = q.sortDir === 'asc' ? 1 : -1;
    const sortBy = q.sortBy ?? 'name';
    all.sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortBy] ?? a.name);
      const bv = String((b as unknown as Record<string, unknown>)[sortBy] ?? b.name);
      return av.localeCompare(bv) * dir;
    });

    const total = all.length;
    const start = (q.page - 1) * q.pageSize;
    const items = all.slice(start, start + q.pageSize);
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: start + q.pageSize < total };
  }

  async create(ctx: PortalActionContext, input: CreatePortalRoleInput) {
    const key = input.key.trim();
    if (INSTITUTION_DEFAULT_ROLES.some((r) => r.key === key)) {
      throw new ConflictException({ code: 'ROLE_EXISTS', message: `"${key}" is a built-in role key. Choose another.` });
    }
    if (await this.repo.findByKey(ctx.principal.institutionId, key)) {
      throw new ConflictException({ code: 'ROLE_EXISTS', message: `A role with key "${key}" already exists.` });
    }
    const permissions = this.validatePermissions(input.permissions);
    const row = await this.repo.insert({
      institutionId: ctx.principal.institutionId,
      key,
      name: input.name,
      description: input.description ?? null,
      permissions,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'role.create', 'institution_role', row.id, {
      newState: { key: row.key, name: row.name, permissionCount: permissions.length },
    });
    return this.toView(row, 0);
  }

  async update(ctx: PortalActionContext, id: string, input: UpdatePortalRoleInput) {
    const existing = await this.requireCustom(ctx, id);
    const permissions = input.permissions === undefined ? existing.permissions ?? [] : this.validatePermissions(input.permissions);
    const updated = await this.repo.update(id, input.version, {
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      permissions,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'role.update', 'institution_role', id, {
      newState: { key: updated.key, name: updated.name, permissionCount: permissions.length },
    });
    return this.toView(updated, await this.repo.usageByKey(ctx.principal.institutionId).then((m) => m.get(updated.key) ?? 0));
  }

  async setPermissions(ctx: PortalActionContext, id: string, input: SetPortalRolePermissionsInput) {
    const existing = await this.requireCustom(ctx, id);
    const permissions = this.validatePermissions(input.permissions);
    const updated = await this.repo.update(id, input.version, {
      permissions,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'role.permissions.set', 'institution_role', id, {
      previousState: { permissionCount: (existing.permissions ?? []).length },
      newState: { permissionCount: permissions.length },
    });
    return this.toView(updated, 0);
  }

  async remove(ctx: PortalActionContext, id: string, version: number) {
    const existing = await this.requireCustom(ctx, id);
    const usage = await this.repo.usageByKey(ctx.principal.institutionId);
    if ((usage.get(existing.key) ?? 0) > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: 'This role is assigned to one or more users. Reassign them before deleting it.',
      });
    }
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'role.delete', 'institution_role', id, {
      previousState: { key: existing.key, name: existing.name },
    });
    return { deleted: true };
  }

  // === helpers ===============================================================

  /** Reject editing/deleting a built-in role; resolve a custom DB role by id. */
  private async requireCustom(ctx: PortalActionContext, id: string) {
    if (id.startsWith('default:')) {
      throw new BadRequestException({ code: 'ROLE_IS_SYSTEM', message: 'Built-in roles cannot be edited or deleted.' });
    }
    const row = await this.repo.find(id, ctx.principal.institutionId);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });
    return row;
  }

  private validatePermissions(keys: string[]): string[] {
    const cleaned = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    const invalid = cleaned.filter((k) => !VALID_KEYS.has(k));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION',
        message: `Unknown permission key(s): ${invalid.join(', ')}`,
      });
    }
    return cleaned;
  }

  private toView(row: { id: string; key: string; name: string; description: string | null; permissions: string[] | null; version: number; createdAt: Date }, inUse: number): RoleView {
    const permissions = row.permissions ?? [];
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      permissions,
      permissionCount: permissions.length,
      isSystem: false,
      source: 'custom',
      inUse,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
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
