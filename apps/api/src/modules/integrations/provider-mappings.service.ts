import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { runInInstitutionTenant, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { canAll } from '@edrion/permissions';
import {
  compatibilityCanonicalJson, compatibilityIsEffective, providerConnectionSnapshotSchema,
  providerMappingInputSchema, providerMappingRecordSchema, rosterMappingPreviewSchema,
  type ProviderEntityKind, type ProviderMappingInput, type ProviderMappingResolution,
  type RosterMappingContext,
} from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { ProviderMappingsRepository } from './provider-mappings.repository';

const hash = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const authority: Record<ProviderEntityKind, [string, string]> = {
  institution: ['institution_settings.view', 'institution_settings.manage'], campus: ['campuses.view', 'campuses.manage'],
  institution_user: ['users.view', 'users.manage'], student: ['students.view', 'students.update'],
  staff: ['staff.view', 'staff.manage'], course: ['courses.manage', 'courses.manage'], class: ['academics.view', 'academics.manage'],
  academic_term: ['academics.view', 'academics.manage'], assignment: ['assignments.view', 'assignments.manage'],
};
const reviewBasis = (input: ProviderMappingInput) => {
  const { status: _status, commandId: _command, expectedVersion: _version, reason: _reason, ...basis } = input;
  return hash(basis);
};

@Injectable()
export class ProviderMappingsService {
  constructor(
    private readonly repo: ProviderMappingsRepository,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  private requireAuthority(ctx: PortalActionContext, kind: ProviderEntityKind, write: boolean) {
    // Connections are institution-wide; a campus-only principal cannot review institution identities.
    if (!ctx.principal.isInstitutionWide || ctx.scope.mode !== 'institution' || !canAll(ctx.principal.permissions,
      [write ? 'integrations.mappings.manage' : 'integrations.view', authority[kind][write ? 1 : 0]])) {
      throw new ForbiddenException({ code: 'PROVIDER_MAPPING_AUTHORITY', message: 'This mapping requires institution-wide integration and canonical-owner authority.' });
    }
  }

  private async connection(institutionId: string, connectionId: string) {
    const row = await this.repo.connection(institutionId, connectionId);
    if (!row) throw new NotFoundException({ code: 'PROVIDER_CONNECTION_NOT_FOUND' });
    if (!['oidc', 'saml'].includes(row.kind)) throw new ConflictException({ code: 'PROVIDER_CONNECTION_UNSUPPORTED' });
    return providerConnectionSnapshotSchema.parse({
      schemaVersion: 'petros.provider-connection.v1', connectionId: row.id, owner: 'institution_identity_providers',
      configurationHash: hash({ kind: row.kind, issuer: row.issuer, clientId: row.clientId, discoveryUrl: row.discoveryUrl,
        scopes: row.scopes, enabled: row.enabled, metadata: row.metadata }),
      enabled: row.enabled, authentication: 'disabled',
    });
  }

  async write(ctx: PortalActionContext, connectionId: string, raw: ProviderMappingInput) {
    if (!this.env.PETROS_PROVIDER_MAPPING_ENABLED) throw new ConflictException({ code: 'PROVIDER_MAPPING_DISABLED' });
    const input = providerMappingInputSchema.parse(raw);
    this.requireAuthority(ctx, input.entityKind, true);
    return runInInstitutionTenant(this.db, ctx.principal.institutionId, async () => {
      const connection = await this.connection(ctx.principal.institutionId, connectionId);
      const canonical = input.internalId ? await this.repo.canonical(ctx.principal.institutionId, input.entityKind, input.internalId) : null;
      if (input.internalId && !canonical) throw new NotFoundException({ code: 'PROVIDER_MAPPING_REFERENCE_MISSING' });
      const canonicalReferenceHash = canonical ? hash(canonical) : null;
      const latest = await this.repo.latest(ctx.principal.institutionId, connectionId, input);
      if (latest && !providerMappingRecordSchema.safeParse(latest.record).success) {
        throw new ConflictException({ code: 'PROVIDER_MAPPING_VERSION_UNSUPPORTED' });
      }
      const receipt = await this.repo.receipt(ctx.principal.institutionId, connectionId, input.commandId);
      const requestHash = hash(input);
      if (receipt) {
        if (receipt.id !== latest?.id || receipt.requestHash !== requestHash) throw new ConflictException({ code: 'PROVIDER_MAPPING_RETRY_CONFLICT' });
        const record = providerMappingRecordSchema.parse(receipt.record);
        if (record.connection.configurationHash !== connection.configurationHash || record.canonicalReferenceHash !== canonicalReferenceHash) {
          throw new ConflictException({ code: 'PROVIDER_MAPPING_STALE' });
        }
        return { id: receipt.id, record };
      }
      if ((latest?.version ?? 0) !== input.expectedVersion) throw new ConflictException({ code: 'PROVIDER_MAPPING_VERSION_CONFLICT' });
      if (input.status === 'approved') {
        const prior = latest ? providerMappingRecordSchema.safeParse(latest.record) : null;
        if (!connection.enabled || !prior?.success || prior.data.input.status !== 'proposed' ||
          reviewBasis(prior.data.input) !== reviewBasis(input) || prior.data.canonicalReferenceHash !== canonicalReferenceHash ||
          prior.data.connection.configurationHash !== connection.configurationHash) {
          throw new ConflictException({ code: 'PROVIDER_MAPPING_REVIEW_REQUIRED', message: 'Submit a current proposal before approving the same mapping.' });
        }
      }
      const record = providerMappingRecordSchema.parse({ schemaVersion: input.schemaVersion, input, connection,
        version: input.expectedVersion + 1, actorId: ctx.principal.institutionUserId, recordedAt: new Date().toISOString(), canonicalReferenceHash });
      const row = await this.repo.insert({ institutionId: ctx.principal.institutionId, connectionId,
        namespace: input.namespace, entityKind: input.entityKind, externalId: input.externalId,
        version: record.version, commandId: input.commandId, requestHash, record });
      await this.audit.logAudit({ ...basePortalAudit(ctx), action: 'roster.mapping_changed', module: 'integrations',
        entityType: 'provider_mapping', entityId: row.id, reason: input.reason,
        newState: { connectionId, version: record.version, status: input.status, entityKind: input.entityKind },
      } as AuditEventInput);
      return { id: row.id, record };
    });
  }

  async read(ctx: PortalActionContext, connectionId: string, key: Pick<ProviderMappingInput, 'namespace' | 'entityKind' | 'externalId'>) {
    this.requireAuthority(ctx, key.entityKind, false);
    return runInInstitutionTenant(this.db, ctx.principal.institutionId, async () => {
      const connection = await this.connection(ctx.principal.institutionId, connectionId);
      const row = await this.repo.latest(ctx.principal.institutionId, connectionId, key);
      const record = row ? providerMappingRecordSchema.safeParse(row.record) : null;
      return { connection, record: record?.success ? record.data : null, resolution: await this.resolve(ctx, connectionId, key) };
    });
  }

  async resolve(ctx: PortalActionContext, connectionId: string, key: Pick<ProviderMappingInput, 'namespace' | 'entityKind' | 'externalId'>,
    upstream?: { hash: string; revision: string }) : Promise<ProviderMappingResolution> {
    this.requireAuthority(ctx, key.entityKind, false);
    const connection = await this.connection(ctx.principal.institutionId, connectionId);
    const row = await this.repo.latest(ctx.principal.institutionId, connectionId, key);
    if (!row) return { status: 'missing' };
    const parsed = providerMappingRecordSchema.safeParse(row.record);
    const base = { mappingId: row.id, version: row.version };
    if (!parsed.success) return { ...base, status: 'unsupported_version' };
    const record = parsed.data;
    if (record.input.status === 'tombstoned') return { ...base, status: 'tombstoned' };
    if (record.input.status !== 'approved') return { ...base, status: 'unreviewed' };
    if (!connection.enabled || connection.configurationHash !== record.connection.configurationHash) return { ...base, status: 'stale' };
    if (!compatibilityIsEffective(record.input.effective, Date.now())) return { ...base, status: 'not_effective' };
    if (upstream && (record.input.purpose !== 'roster' || record.input.upstreamHash !== upstream.hash || record.input.upstreamRevision !== upstream.revision)) return { ...base, status: 'stale' };
    const canonical = record.input.internalId ? await this.repo.canonical(ctx.principal.institutionId, key.entityKind, record.input.internalId) : null;
    if (!canonical) return { ...base, status: 'missing_reference' };
    if (hash(canonical) !== record.canonicalReferenceHash) return { ...base, status: 'stale' };
    return { ...base, status: 'mapped', canonicalId: canonical.id };
  }

  async preview(ctx: PortalActionContext, context: RosterMappingContext, rows: Array<{ sourcedId: string; role: string }>) {
    if (!this.env.PETROS_PROVIDER_MAPPING_ENABLED) throw new ConflictException({ code: 'PROVIDER_MAPPING_DISABLED' });
    if (!ctx.principal.isInstitutionWide || ctx.scope.mode !== 'institution' || !canAll(ctx.principal.permissions, ['integrations.view'])) {
      throw new ForbiddenException({ code: 'PROVIDER_MAPPING_AUTHORITY' });
    }
    await this.connection(ctx.principal.institutionId, context.connectionId);
    if (rows.length > 200 || new Set(rows.map((r) => r.sourcedId)).size !== rows.length) {
      throw new BadRequestException({ code: 'PROVIDER_PREVIEW_BOUNDS', message: 'Mapping preview requires at most 200 distinct sourced IDs.' });
    }
    const resolutions: Array<ProviderMappingResolution & { externalId: string; upstreamHash: string }> = [];
    for (const row of rows) {
      const kind = row.role.toLowerCase() === 'student' ? 'student' : row.role.toLowerCase() === 'teacher' ? 'staff' : null;
      const resolution: ProviderMappingResolution = kind ? await this.resolve(ctx, context.connectionId, { namespace: context.namespace, entityKind: kind, externalId: row.sourcedId },
        { hash: hash(row), revision: context.upstreamRevision }) : { status: 'incompatible' };
      resolutions.push({ ...resolution, externalId: row.sourcedId, upstreamHash: hash(row) });
    }
    const preview = rosterMappingPreviewSchema.safeParse({ schemaVersion: 'petros.roster-preview.v1', mode: 'preview', context, applied: 0,
      rows: resolutions, mapped: resolutions.filter((r) => r.status === 'mapped').length, unresolved: resolutions.filter((r) => r.status !== 'mapped').length });
    if (!preview.success) throw new BadRequestException({ code: 'PROVIDER_PREVIEW_BOUNDS', message: 'Preview identifiers or payload exceed the supported contract.' });
    return preview.data;
  }
}
