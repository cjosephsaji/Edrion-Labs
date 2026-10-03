import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { RosterMappingContext, UpsertIdentityProviderInput } from '@edrion/schemas';
import { rosterMappingPreviewSchema } from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { ProviderMappingsService } from '../integrations/provider-mappings.service';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { signHs256, verifyHs256 } from '../../common/jwt';
import { parseOnerosterUsersCsv } from './oneroster-csv';
import { createSamlClient, samlLoginRedirectUrl, samlValidateResponse } from './saml-sp.service';

interface AuthStatePayload {
  pid: string;
  iid: string;
  rid: string;
  n: string;
  proto: 'oidc' | 'saml';
}

@Injectable()
export class FederationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly mappings: ProviderMappingsService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  private requireVerifiedFederation() {
    // A mapping is not token validation, reviewed account linking or local session issuance.
    // Remove this gate only in a separately accepted federation implementation.
    throw new ConflictException({ code: 'FEDERATION_AUTHENTICATION_DISABLED', message: 'Institutional federation authentication is not enabled.' });
  }

  private requireVerifiedRosterSync() {
    // These adapters only fetch one users page; they do not reconcile or apply a roster.
    // Keep every external sync route unavailable until a separately verified sync engine exists.
    throw new ConflictException({ code: 'EXTERNAL_ROSTER_SYNC_DISABLED', message: 'External roster synchronization is disabled. Use OneRoster CSV preview.' });
  }

  listProviders(institutionId: string) {
    return this.db
      .select({
        id: schema.institutionIdentityProviders.id,
        name: schema.institutionIdentityProviders.name,
        kind: schema.institutionIdentityProviders.kind,
        issuer: schema.institutionIdentityProviders.issuer,
        clientId: schema.institutionIdentityProviders.clientId,
        enabled: schema.institutionIdentityProviders.enabled,
        jitProvision: schema.institutionIdentityProviders.jitProvision,
        discoveryUrl: schema.institutionIdentityProviders.discoveryUrl,
        scopes: schema.institutionIdentityProviders.scopes,
        createdAt: schema.institutionIdentityProviders.createdAt,
      })
      .from(schema.institutionIdentityProviders)
      .where(eq(schema.institutionIdentityProviders.institutionId, institutionId))
      .orderBy(desc(schema.institutionIdentityProviders.createdAt));
  }

  async upsertProvider(institutionId: string, input: UpsertIdentityProviderInput) {
    if (input.kind === 'saml') {
      const [row] = await this.db
        .insert(schema.institutionIdentityProviders)
        .values({
          institutionId,
          kind: 'saml',
          name: input.name,
          issuer: input.issuer,
          clientId: input.clientId,
          clientSecret: null,
          discoveryUrl: null,
          scopes: '',
          enabled: input.enabled ?? false,
          jitProvision: input.jitProvision ?? true,
          metadata: {
            ssoUrl: input.ssoUrl,
            idpCertificate: input.idpCertificate,
          },
        })
        .returning();
      return row!;
    }

    const discoveryUrl = input.discoveryUrl ?? `${input.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const [row] = await this.db
      .insert(schema.institutionIdentityProviders)
      .values({
        institutionId,
        kind: 'oidc',
        name: input.name,
        issuer: input.issuer,
        clientId: input.clientId,
        clientSecret: input.clientSecret ?? null,
        discoveryUrl,
        scopes: input.scopes ?? 'openid email profile',
        enabled: input.enabled ?? false,
        jitProvision: input.jitProvision ?? true,
      })
      .returning();
    return row!;
  }

  samlAcsUrl(): string {
    return `${this.env.API_BASE_URL}/v1/portal/auth/saml/acs`;
  }

  async getSamlSpMetadata(institutionId: string, providerId: string): Promise<string> {
    const [provider] = await this.db
      .select()
      .from(schema.institutionIdentityProviders)
      .where(
        and(
          eq(schema.institutionIdentityProviders.id, providerId),
          eq(schema.institutionIdentityProviders.institutionId, institutionId),
        ),
      )
      .limit(1);
    if (!provider || provider.kind !== 'saml') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'SAML provider not found.' });
    }
    const meta = provider.metadata as { ssoUrl?: string; idpCertificate?: string };
    if (!meta.ssoUrl || !meta.idpCertificate) {
      throw new BadRequestException({ code: 'SAML_MISCONFIGURED', message: 'SAML metadata incomplete.' });
    }
    const saml = createSamlClient({
      spEntityId: provider.clientId,
      idpEntityId: provider.issuer,
      ssoUrl: meta.ssoUrl,
      idpCertificate: meta.idpCertificate,
      acsUrl: this.samlAcsUrl(),
    });
    return saml.generateServiceProviderMetadata(null);
  }

  async startSamlLogin(institutionId: string, providerId: string, redirectUri: string) {
    this.requireVerifiedFederation();
    const provider = await this.requireEnabledProvider(institutionId, providerId, 'saml');
    const meta = provider.metadata as { ssoUrl?: string; idpCertificate?: string };
    if (!meta.ssoUrl || !meta.idpCertificate) {
      throw new BadRequestException({ code: 'SAML_MISCONFIGURED', message: 'SAML metadata incomplete.' });
    }
    const nonce = randomBytes(16).toString('hex');
    const state = signHs256(
      { pid: providerId, iid: institutionId, rid: redirectUri, n: nonce, proto: 'saml' } satisfies AuthStatePayload,
      this.env.SESSION_COOKIE_SECRET,
      600,
    );
    const saml = createSamlClient({
      spEntityId: provider.clientId,
      idpEntityId: provider.issuer,
      ssoUrl: meta.ssoUrl,
      idpCertificate: meta.idpCertificate,
      acsUrl: this.samlAcsUrl(),
    });
    const authorizationUrl = await samlLoginRedirectUrl(saml, state);
    return { authorizationUrl, state };
  }

  async completeSamlAcs(samlResponse: string, relayState: string) {
    this.requireVerifiedFederation();
    let state: AuthStatePayload;
    try {
      state = verifyHs256(relayState, this.env.SESSION_COOKIE_SECRET) as unknown as AuthStatePayload;
    } catch {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'SAML relay state is invalid or expired.' });
    }
    if (state.proto !== 'saml') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Wrong federation protocol.' });
    }

    const [provider] = await this.db
      .select()
      .from(schema.institutionIdentityProviders)
      .where(eq(schema.institutionIdentityProviders.id, state.pid))
      .limit(1);
    if (!provider || provider.institutionId !== state.iid || provider.kind !== 'saml') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Provider not found.' });
    }
    const meta = provider.metadata as { ssoUrl?: string; idpCertificate?: string };
    const saml = createSamlClient({
      spEntityId: provider.clientId,
      idpEntityId: provider.issuer,
      ssoUrl: meta.ssoUrl!,
      idpCertificate: meta.idpCertificate!,
      acsUrl: this.samlAcsUrl(),
    });
    const { profile } = await samlValidateResponse(saml, { SAMLResponse: samlResponse });
    return {
      institutionId: provider.institutionId,
      providerId: provider.id,
      email: profile?.email ?? profile?.nameID ?? null,
      nameID: profile?.nameID ?? null,
      redirectUri: state.rid,
      jitProvision: provider.jitProvision,
    };
  }

  private async requireEnabledProvider(institutionId: string, providerId: string, kind?: 'oidc' | 'saml') {
    const conditions = [
      eq(schema.institutionIdentityProviders.id, providerId),
      eq(schema.institutionIdentityProviders.institutionId, institutionId),
      eq(schema.institutionIdentityProviders.enabled, true),
    ];
    const [provider] = await this.db
      .select()
      .from(schema.institutionIdentityProviders)
      .where(and(...conditions))
      .limit(1);
    if (!provider) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Identity provider not found or disabled.' });
    if (kind && provider.kind !== kind) {
      throw new BadRequestException({ code: 'WRONG_PROTOCOL', message: `Provider is not ${kind}.` });
    }
    return provider;
  }

  async startOidcLogin(institutionId: string, providerId: string, redirectUri: string) {
    this.requireVerifiedFederation();
    const provider = await this.requireEnabledProvider(institutionId, providerId, 'oidc');

    const discovery = await this.fetchJson(provider.discoveryUrl ?? `${provider.issuer}/.well-known/openid-configuration`);
    const authorizationEndpoint = String(discovery.authorization_endpoint ?? '');
    if (!authorizationEndpoint) {
      throw new BadRequestException({ code: 'OIDC_MISCONFIGURED', message: 'Missing authorization_endpoint.' });
    }

    const nonce = randomBytes(16).toString('hex');
    const state = signHs256(
      { pid: providerId, iid: institutionId, rid: redirectUri, n: nonce, proto: 'oidc' } satisfies AuthStatePayload,
      this.env.SESSION_COOKIE_SECRET,
      600,
    );

    const url = new URL(authorizationEndpoint);
    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.scopes);
    url.searchParams.set('redirect_uri', `${this.env.API_BASE_URL}/v1/portal/auth/oidc/callback`);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    return { authorizationUrl: url.toString(), state };
  }

  async completeOidcCallback(code: string, stateToken: string) {
    this.requireVerifiedFederation();
    let state: AuthStatePayload;
    try {
      state = verifyHs256(stateToken, this.env.SESSION_COOKIE_SECRET) as unknown as AuthStatePayload;
    } catch {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'OIDC state is invalid or expired.' });
    }
    if (state.proto !== 'oidc') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Wrong federation protocol.' });
    }

    const [provider] = await this.db
      .select()
      .from(schema.institutionIdentityProviders)
      .where(eq(schema.institutionIdentityProviders.id, state.pid))
      .limit(1);
    if (!provider || provider.institutionId !== state.iid) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Provider not found.' });
    }
    if (!provider.clientSecret) {
      throw new BadRequestException({ code: 'OIDC_MISCONFIGURED', message: 'Client secret required for code exchange.' });
    }

    const discovery = await this.fetchJson(provider.discoveryUrl ?? `${provider.issuer}/.well-known/openid-configuration`);
    const tokenEndpoint = String(discovery.token_endpoint ?? '');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${this.env.API_BASE_URL}/v1/portal/auth/oidc/callback`,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
    });
    const tokenRes = await fetch(tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!tokenRes.ok) {
      throw new BadRequestException({ code: 'OIDC_TOKEN_FAILED', message: 'Token exchange failed.' });
    }
    const tokenJson = (await tokenRes.json()) as { id_token?: string; access_token?: string };
    return {
      institutionId: provider.institutionId,
      providerId: provider.id,
      idToken: tokenJson.id_token ?? null,
      accessToken: tokenJson.access_token ?? null,
      redirectUri: state.rid,
      jitProvision: provider.jitProvision,
    };
  }

  async importOnerosterCsv(institutionId: string, csv: string, ctx: PortalActionContext, mappingContext?: RosterMappingContext, negotiated = false) {
    // The existing parser is a limited preview, not a complete OneRoster bulk/delta adapter.
    if (mappingContext) {
      const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const headers = (lines[0] ?? '').split(',').map((value) => value.trim().toLowerCase());
      const sourceIndex = headers.indexOf('sourcedid');
      if (lines.length > 201 || sourceIndex < 0 || !headers.includes('role') || new Set(headers).size !== headers.length ||
        csv.includes('"') || lines.some((line) => line.split(',').length !== headers.length) ||
        lines.slice(1).some((line) => { const id = line.split(',')[sourceIndex] ?? ''; return !id || id !== id.trim(); })) {
        throw new BadRequestException({ code: 'ROSTER_MAPPING_CSV_UNSUPPORTED', message: 'Quoted or irregular CSV cannot be used for mapping preview.' });
      }
    }
    const rows = parseOnerosterUsersCsv(csv);
    const compatibility = mappingContext ? await this.mappings.preview(ctx, mappingContext, rows) : null;
    const [job] = await this.db
      .insert(schema.rosterSyncJobs)
      .values({
        institutionId,
        provider: 'oneroster_csv',
        status: 'running',
        startedAt: new Date(),
        stats: { parsed: rows.length },
        compatibility,
      })
      .returning();

    const students = rows.filter((r) => r.role.toLowerCase() === 'student');
    const teachers = rows.filter((r) => r.role.toLowerCase() === 'teacher');
    await this.db
      .update(schema.rosterSyncJobs)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        stats: { parsed: rows.length, students: students.length, teachers: teachers.length, mode: 'preview' },
      })
      .where(eq(schema.rosterSyncJobs.id, job!.id));

    await this.audit.logAudit({ ...basePortalAudit(ctx), action: 'roster.preview', module: 'federation', entityType: 'roster_sync_job',
      entityId: job!.id, newState: { parsed: rows.length, mode: 'preview', applied: 0, mapped: compatibility?.mapped ?? 0 },
    } as AuditEventInput);
    const legacy = { jobId: job!.id, parsed: rows.length, students: students.length, teachers: teachers.length };
    return negotiated ? { ...legacy, compatibility: compatibility ?? { schemaVersion: 'petros.roster-preview.v1', mode: 'preview', applied: 0, status: 'unmapped' } } : legacy;
  }

  async syncClever(institutionId: string) {
    this.requireVerifiedRosterSync();
    const dryRun = !this.env.CLEVER_CLIENT_ID || !this.env.CLEVER_CLIENT_SECRET;
    const [job] = await this.db
      .insert(schema.rosterSyncJobs)
      .values({
        institutionId,
        provider: 'clever',
        status: 'running',
        startedAt: new Date(),
        stats: { dryRun },
      })
      .returning();

    if (dryRun) {
      await this.db
        .update(schema.rosterSyncJobs)
        .set({ status: 'succeeded', finishedAt: new Date(), stats: { dryRun: true, synced: 0 } })
        .where(eq(schema.rosterSyncJobs.id, job!.id));
      return { jobId: job!.id, dryRun: true, synced: 0 };
    }

    const tokenRes = await fetch('https://clever.com/oauth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.env.CLEVER_CLIENT_ID,
        client_secret: this.env.CLEVER_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });
    if (!tokenRes.ok) {
      await this.db
        .update(schema.rosterSyncJobs)
        .set({ status: 'failed', finishedAt: new Date(), errorMessage: 'Clever token request failed' })
        .where(eq(schema.rosterSyncJobs.id, job!.id));
      throw new BadRequestException({ code: 'CLEVER_AUTH_FAILED', message: 'Could not authenticate with Clever.' });
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const usersRes = await fetch('https://api.clever.com/v3.0/users?limit=100', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const usersJson = (await usersRes.json()) as { data?: unknown[] };
    const count = usersJson.data?.length ?? 0;
    await this.db
      .update(schema.rosterSyncJobs)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        stats: { dryRun: false, synced: count },
      })
      .where(eq(schema.rosterSyncJobs.id, job!.id));
    return { jobId: job!.id, dryRun: false, synced: count };
  }

  async syncClasslink(institutionId: string) {
    this.requireVerifiedRosterSync();
    const dryRun = !this.env.CLASSLINK_CLIENT_ID || !this.env.CLASSLINK_CLIENT_SECRET;
    const [job] = await this.db
      .insert(schema.rosterSyncJobs)
      .values({
        institutionId,
        provider: 'classlink',
        status: 'running',
        startedAt: new Date(),
        stats: { dryRun },
      })
      .returning();

    if (dryRun) {
      await this.db
        .update(schema.rosterSyncJobs)
        .set({ status: 'succeeded', finishedAt: new Date(), stats: { dryRun: true, synced: 0 } })
        .where(eq(schema.rosterSyncJobs.id, job!.id));
      return { jobId: job!.id, dryRun: true, synced: 0 };
    }

    const tokenRes = await fetch('https://launchpad.classlink.com/oauth2/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.env.CLASSLINK_CLIENT_ID!,
        client_secret: this.env.CLASSLINK_CLIENT_SECRET!,
      }),
    });
    if (!tokenRes.ok) {
      await this.db
        .update(schema.rosterSyncJobs)
        .set({ status: 'failed', finishedAt: new Date(), errorMessage: 'ClassLink token request failed' })
        .where(eq(schema.rosterSyncJobs.id, job!.id));
      throw new BadRequestException({ code: 'CLASSLINK_AUTH_FAILED', message: 'Could not authenticate with ClassLink.' });
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const usersRes = await fetch('https://oneroster.api.classlink.com/v1p1/users?limit=100', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const usersJson = (await usersRes.json()) as { users?: unknown[] };
    const count = Array.isArray(usersJson.users) ? usersJson.users.length : 0;
    await this.db
      .update(schema.rosterSyncJobs)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        stats: { dryRun: false, synced: count },
      })
      .where(eq(schema.rosterSyncJobs.id, job!.id));
    return { jobId: job!.id, dryRun: false, synced: count };
  }

  async syncOnerosterRest(institutionId: string, baseUrl: string, token: string) {
    this.requireVerifiedRosterSync();
    const [job] = await this.db
      .insert(schema.rosterSyncJobs)
      .values({
        institutionId,
        provider: 'oneroster_csv',
        status: 'running',
        startedAt: new Date(),
        stats: { mode: 'rest', baseUrl },
      })
      .returning();

    const url = `${baseUrl.replace(/\/$/, '')}/users?limit=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) {
      await this.db
        .update(schema.rosterSyncJobs)
        .set({ status: 'failed', finishedAt: new Date(), errorMessage: `OneRoster HTTP ${res.status}` })
        .where(eq(schema.rosterSyncJobs.id, job!.id));
      throw new BadRequestException({ code: 'ONEROSTER_FETCH_FAILED', message: 'OneRoster users request failed.' });
    }
    const body = (await res.json()) as { users?: unknown[] };
    const count = Array.isArray(body.users) ? body.users.length : 0;
    await this.db
      .update(schema.rosterSyncJobs)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        stats: { mode: 'rest', synced: count, baseUrl },
      })
      .where(eq(schema.rosterSyncJobs.id, job!.id));
    return { jobId: job!.id, synced: count };
  }

  async listRosterJobs(institutionId: string, negotiated = false) {
    const rows = await this.db
      .select()
      .from(schema.rosterSyncJobs)
      .where(eq(schema.rosterSyncJobs.institutionId, institutionId))
      .orderBy(desc(schema.rosterSyncJobs.createdAt))
      .limit(50);
    return rows.map(({ compatibility, ...legacy }) => {
      if (!negotiated) return legacy;
      const parsed = compatibility ? rosterMappingPreviewSchema.safeParse(compatibility) : null;
      return { ...legacy, compatibility: parsed?.success ? {
        schemaVersion: 'petros.roster-preview.v1', mode: 'preview', applied: 0,
        historical: true, currentMappingStatus: 'not_revalidated',
        mappedAtPreview: parsed.data.mapped, unresolvedAtPreview: parsed.data.unresolved,
      } : { status: compatibility ? 'unsupported_version' : 'legacy_unmapped' } };
    });
  }

  private async fetchJson(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url);
    if (!res.ok) throw new BadRequestException({ code: 'DISCOVERY_FAILED', message: 'OIDC discovery failed.' });
    return (await res.json()) as Record<string, unknown>;
  }
}
