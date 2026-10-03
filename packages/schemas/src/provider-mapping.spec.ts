import { describe, expect, it } from 'vitest';
import {
  providerConnectionSnapshotSchema,
  providerMappingInputSchema,
  providerMappingResolutionSchema,
  rosterMappingPreviewSchema,
} from './provider-mapping';

const ids = {
  command: '11111111-1111-4111-8111-111111111111',
  connection: '22222222-2222-4222-8222-222222222222',
  internal: '33333333-3333-4333-8333-333333333333',
  mapping: '44444444-4444-4444-8444-444444444444',
};
const hash = 'a'.repeat(64);
const provenance = { method: 'manual' as const, sourceRef: 'synthetic', sourceHash: hash,
  observedAt: '2026-09-20T00:00:00.000Z', licence: 'synthetic-only' };
const proposed = {
  schemaVersion: 'petros.provider-mapping.v1' as const,
  namespace: 'Provider.Namespace', entityKind: 'student' as const, externalId: 'Student-007',
  commandId: ids.command, expectedVersion: 0, internalId: ids.internal, purpose: 'roster' as const,
  status: 'proposed' as const, effective: { from: '2026-09-20T00:00:00.000Z', until: null },
  upstreamRevision: 'rev-1', upstreamHash: hash,
  fieldAuthority: [{ field: 'identity' as const, owner: 'canonical' as const }], provenance, reason: 'Synthetic review',
};

describe('provider mapping compatibility contract', () => {
  it('preserves exact case-sensitive keys and rejects padding and unknown fields', () => {
    expect(providerMappingInputSchema.parse(proposed).externalId).toBe('Student-007');
    expect(providerMappingInputSchema.parse({ ...proposed, externalId: 'student-007' }).externalId).toBe('student-007');
    expect(providerMappingInputSchema.safeParse({ ...proposed, externalId: ' Student-007' }).success).toBe(false);
    expect(providerMappingInputSchema.safeParse({ ...proposed, unknown: true }).success).toBe(false);
  });

  it('requires a canonical reference for approval and constrains SSO subjects', () => {
    expect(providerMappingInputSchema.safeParse({ ...proposed, status: 'approved', internalId: null }).success).toBe(false);
    expect(providerMappingInputSchema.safeParse({ ...proposed, purpose: 'sso_subject', entityKind: 'student' }).success).toBe(false);
    expect(providerMappingInputSchema.safeParse({ ...proposed, purpose: 'sso_subject', entityKind: 'institution_user' }).success).toBe(true);
  });

  it('rejects duplicate field authorities and unsupported connection ownership/authentication', () => {
    expect(providerMappingInputSchema.safeParse({ ...proposed, fieldAuthority: [
      { field: 'identity', owner: 'canonical' }, { field: 'identity', owner: 'provider' },
    ] }).success).toBe(false);
    expect(providerConnectionSnapshotSchema.safeParse({ schemaVersion: 'petros.provider-connection.v1',
      connectionId: ids.connection, owner: 'other', configurationHash: hash, enabled: true, authentication: 'disabled' }).success).toBe(false);
    expect(providerConnectionSnapshotSchema.safeParse({ schemaVersion: 'petros.provider-connection.v1',
      connectionId: ids.connection, owner: 'institution_identity_providers', configurationHash: hash, enabled: true, authentication: 'enabled' }).success).toBe(false);
  });

  it('never exposes a canonical ID for a non-mapped resolution', () => {
    expect(providerMappingResolutionSchema.parse({ status: 'mapped', mappingId: ids.mapping, version: 1, canonicalId: ids.internal })).toBeTruthy();
    expect(providerMappingResolutionSchema.safeParse({ status: 'mapped', mappingId: ids.mapping, version: 1 }).success).toBe(false);
    expect(providerMappingResolutionSchema.safeParse({ status: 'stale', canonicalId: ids.internal }).success).toBe(false);
  });

  it('keeps roster preview read-only with exact counts and unique external IDs', () => {
    const context = { schemaVersion: 'petros.provider-mapping.v1' as const, connectionId: ids.connection,
      namespace: 'Provider.Namespace', upstreamRevision: 'rev-1' };
    const rows = [
      { status: 'mapped' as const, mappingId: ids.mapping, version: 1, canonicalId: ids.internal, externalId: 'Student-007', upstreamHash: hash },
      { status: 'missing' as const, externalId: 'Student-008', upstreamHash: 'b'.repeat(64) },
    ];
    expect(rosterMappingPreviewSchema.parse({ schemaVersion: 'petros.roster-preview.v1', mode: 'preview', applied: 0,
      context, rows, mapped: 1, unresolved: 1 }).applied).toBe(0);
    expect(rosterMappingPreviewSchema.safeParse({ schemaVersion: 'petros.roster-preview.v1', mode: 'preview', applied: 0,
      context, rows, mapped: 2, unresolved: 0 }).success).toBe(false);
    expect(rosterMappingPreviewSchema.safeParse({ schemaVersion: 'petros.roster-preview.v1', mode: 'preview', applied: 0,
      context, rows: [rows[0], { ...rows[1], externalId: rows[0]!.externalId }], mapped: 1, unresolved: 1 }).success).toBe(false);
  });
});
