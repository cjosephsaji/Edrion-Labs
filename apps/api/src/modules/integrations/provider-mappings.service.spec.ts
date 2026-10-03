import { describe, expect, it, vi } from 'vitest';
import type { ProviderMappingInput } from '@edrion/schemas';
import type { PortalActionContext } from '../portal/portal-action-context';
import { ProviderMappingsService } from './provider-mappings.service';

const ids = {
  institution: '10000000-0000-4000-8000-000000000001',
  foreignInstitution: '10000000-0000-4000-8000-000000000002',
  actor: '20000000-0000-4000-8000-000000000001',
  connection: '30000000-0000-4000-8000-000000000001',
  internal: '40000000-0000-4000-8000-000000000001',
  mapping: '50000000-0000-4000-8000-000000000001',
  command1: '60000000-0000-4000-8000-000000000001',
  command2: '60000000-0000-4000-8000-000000000002',
};
const upstreamHash = 'a'.repeat(64);

const permissions = (...keys: string[]) => ({ keys: new Set(keys), hasWildcard: false });

function context(input: {
  permissionKeys?: string[];
  institutionId?: string;
  institutionWide?: boolean;
  scope?: PortalActionContext['scope'];
} = {}): PortalActionContext {
  return {
    principal: {
      institutionUserId: ids.actor,
      institutionId: input.institutionId ?? ids.institution,
      email: 'synthetic@example.test',
      fullName: 'Synthetic Reviewer',
      roleKeys: ['synthetic'],
      permissions: permissions(...(input.permissionKeys ?? ['integrations.mappings.manage', 'students.update'])),
      allowedCampusIds: [],
      isInstitutionWide: input.institutionWide ?? true,
      mfaEnrolled: false,
      lastAuthAt: new Date('2026-09-22T00:00:00.000Z'),
    },
    scope: input.scope ?? { mode: 'institution' },
    request: {
      requestId: 'request-v10',
      correlationId: 'correlation-v10',
      apiEndpoint: '/v1/portal/federation/identity-providers/:id/mappings',
      ip: '127.0.0.1',
      userAgent: 'vitest',
    },
  };
}

function mapping(overrides: Partial<ProviderMappingInput> = {}): ProviderMappingInput {
  return {
    schemaVersion: 'petros.provider-mapping.v1',
    namespace: 'Provider.Namespace',
    entityKind: 'student',
    externalId: 'Student-007',
    commandId: ids.command1,
    expectedVersion: 0,
    internalId: ids.internal,
    purpose: 'roster',
    status: 'proposed',
    effective: { from: '2026-09-22T00:00:00.000Z', until: null },
    upstreamRevision: 'revision-1',
    upstreamHash,
    fieldAuthority: [{ field: 'identity', owner: 'canonical' }],
    provenance: {
      method: 'manual',
      sourceRef: 'synthetic-row',
      sourceHash: upstreamHash,
      observedAt: '2026-09-22T00:00:00.000Z',
      licence: 'synthetic-only',
    },
    reason: 'Synthetic proposal',
    ...overrides,
  };
}

function harness() {
  const connection = {
    id: ids.connection,
    institutionId: ids.institution,
    kind: 'oidc',
    issuer: 'https://provider.example.test',
    clientId: 'synthetic-client',
    discoveryUrl: 'https://provider.example.test/.well-known/openid-configuration',
    scopes: 'openid',
    enabled: true,
    metadata: {},
  };
  let latest: Record<string, unknown> | undefined;
  let receipts = new Map<string, Record<string, unknown>>();
  const repo = {
    connection: vi.fn(async (institutionId: string, connectionId: string) =>
      institutionId === ids.institution && connectionId === ids.connection ? connection : undefined),
    canonical: vi.fn(async (institutionId: string, _kind: string, id: string) =>
      institutionId === ids.institution && id === ids.internal
        ? { id, version: 3, status: 'enrolled', campusId: null }
        : null),
    latest: vi.fn(async () => latest),
    receipt: vi.fn(async (_institutionId: string, _connectionId: string, commandId: string) => receipts.get(commandId)),
    insert: vi.fn(async (values: Record<string, unknown>) => {
      const row = { id: ids.mapping, ...values };
      latest = row;
      receipts.set(String(values.commandId), row);
      return row;
    }),
  };
  const transaction = vi.fn(async (callback: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const previousLatest = latest;
    const previousReceipts = new Map(receipts);
    try {
      return await callback({ execute: vi.fn(async () => []) });
    } catch (error) {
      latest = previousLatest;
      receipts = previousReceipts;
      throw error;
    }
  });
  const audit = { logAudit: vi.fn(async () => undefined) };
  const service = new ProviderMappingsService(
    repo as never,
    { transaction } as never,
    { PETROS_PROVIDER_MAPPING_ENABLED: true } as never,
    audit as never,
  );
  return { service, repo, audit, transaction, connection, current: () => latest };
}

describe('ProviderMappingsService V10 boundaries', () => {
  it('allows an institution-wide reviewer only with integration and canonical-owner permissions', async () => {
    const h = harness();
    const result = await h.service.write(context(), ids.connection, mapping());

    expect(result.record.input.status).toBe('proposed');
    expect(h.repo.canonical).toHaveBeenCalledWith(ids.institution, 'student', ids.internal);
    expect(h.repo.insert).toHaveBeenCalledOnce();
    expect(h.audit.logAudit).toHaveBeenCalledOnce();
    expect(h.transaction).toHaveBeenCalledOnce();
  });

  it.each([
    ['campus scope', context({ scope: { mode: 'campus', campusId: '70000000-0000-4000-8000-000000000001' } })],
    ['campus-confined actor', context({ institutionWide: false })],
    ['unrelated role', context({ permissionKeys: ['integrations.mappings.manage', 'courses.manage'] })],
    ['student-like caller', context({ permissionKeys: [], institutionWide: false })],
    ['independent-like caller', context({ permissionKeys: [], institutionWide: false })],
  ])('denies %s before repository mutation', async (_label, ctx) => {
    const h = harness();
    await expect(h.service.write(ctx, ids.connection, mapping())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROVIDER_MAPPING_AUTHORITY' }),
    });
    expect(h.repo.insert).not.toHaveBeenCalled();
    expect(h.audit.logAudit).not.toHaveBeenCalled();
  });

  it('does not disclose a foreign-tenant connection', async () => {
    const h = harness();
    await expect(h.service.write(context({ institutionId: ids.foreignInstitution }), ids.connection, mapping()))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_CONNECTION_NOT_FOUND' }) });
    expect(h.repo.insert).not.toHaveBeenCalled();
  });

  it('requires the same current proposal before approval', async () => {
    const missing = harness();
    await expect(missing.service.write(context(), ids.connection, mapping({
      status: 'approved', expectedVersion: 0, commandId: ids.command2,
    }))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_MAPPING_REVIEW_REQUIRED' }) });

    const h = harness();
    await h.service.write(context(), ids.connection, mapping());
    const approved = await h.service.write(context(), ids.connection, mapping({
      status: 'approved', expectedVersion: 1, commandId: ids.command2, reason: 'Approve exact proposal',
    }));
    expect(approved.record.input.status).toBe('approved');
    expect(approved.record.version).toBe(2);

    const changed = harness();
    await changed.service.write(context(), ids.connection, mapping());
    await expect(changed.service.write(context(), ids.connection, mapping({
      status: 'approved', expectedVersion: 1, commandId: ids.command2, upstreamRevision: 'revision-2',
    }))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_MAPPING_REVIEW_REQUIRED' }) });
  });

  it('handles exact replay, changed replay, version conflict, and stale replay', async () => {
    const h = harness();
    const first = await h.service.write(context(), ids.connection, mapping());
    const replay = await h.service.write(context(), ids.connection, mapping());
    expect(replay).toEqual(first);
    expect(h.repo.insert).toHaveBeenCalledOnce();
    expect(h.audit.logAudit).toHaveBeenCalledOnce();

    await expect(h.service.write(context(), ids.connection, mapping({ reason: 'Changed retry' })))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_MAPPING_RETRY_CONFLICT' }) });
    await expect(h.service.write(context(), ids.connection, mapping({ commandId: ids.command2 })))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_MAPPING_VERSION_CONFLICT' }) });

    h.connection.issuer = 'https://changed.example.test';
    await expect(h.service.write(context(), ids.connection, mapping()))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_MAPPING_STALE' }) });
  });

  it('refuses approval after the connection is disabled', async () => {
    const h = harness();
    await h.service.write(context(), ids.connection, mapping());
    h.connection.enabled = false;
    await expect(h.service.write(context(), ids.connection, mapping({
      status: 'approved', expectedVersion: 1, commandId: ids.command2,
    }))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_MAPPING_REVIEW_REQUIRED' }) });
  });

  it('keeps preview bounded and read-only with applied zero', async () => {
    const h = harness();
    const ctx = context({ permissionKeys: ['integrations.view'] });
    const preview = await h.service.preview(ctx, {
      schemaVersion: 'petros.provider-mapping.v1',
      connectionId: ids.connection,
      namespace: 'Provider.Namespace',
      upstreamRevision: 'revision-1',
    }, [{ sourcedId: 'Unknown-1', role: 'administrator' }]);
    expect(preview).toMatchObject({ applied: 0, mapped: 0, unresolved: 1 });
    expect(preview.rows[0]).toMatchObject({ status: 'incompatible', externalId: 'Unknown-1' });

    const rows = Array.from({ length: 201 }, (_, index) => ({ sourcedId: `Student-${index}`, role: 'student' }));
    await expect(h.service.preview(ctx, {
      schemaVersion: 'petros.provider-mapping.v1', connectionId: ids.connection,
      namespace: 'Provider.Namespace', upstreamRevision: 'revision-1',
    }, rows)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_PREVIEW_BOUNDS' }) });
    await expect(h.service.preview(ctx, {
      schemaVersion: 'petros.provider-mapping.v1', connectionId: ids.connection,
      namespace: 'Provider.Namespace', upstreamRevision: 'revision-1',
    }, [{ sourcedId: 'duplicate', role: 'student' }, { sourcedId: 'duplicate', role: 'student' }]))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PROVIDER_PREVIEW_BOUNDS' }) });
    expect(h.repo.insert).not.toHaveBeenCalled();
  });

  it('propagates audit rejection so the enclosing tenant transaction rolls back the append', async () => {
    const h = harness();
    h.audit.logAudit.mockRejectedValueOnce(new Error('synthetic audit rejection'));
    await expect(h.service.write(context(), ids.connection, mapping())).rejects.toThrow('synthetic audit rejection');
    expect(h.repo.insert).toHaveBeenCalledOnce();
    expect(h.current()).toBeUndefined();
    expect(h.transaction).toHaveBeenCalledOnce();
  });
});
