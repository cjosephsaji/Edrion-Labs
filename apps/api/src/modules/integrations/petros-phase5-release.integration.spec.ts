import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInStudentTenant } from '@edrion/database';
import { AuditWriter } from '@edrion/audit';
import type { PetrosProductionQualityReport } from '@edrion/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActionContext } from '../../common/action-context';
import { PetrosAiRoutingRepository } from '../petros-ai-routing/petros-ai-routing.repository';
import { PetrosAiRoutingService } from '../petros-ai-routing/petros-ai-routing.service';
import { PetrosReleaseRepository } from '../petros-quality/petros-release.repository';
import { PetrosReleaseService, promptIdentity, releaseDigest } from '../petros-quality/petros-release.service';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

const gates = ['sources','teaching','evidence','memory','recommendations','institutional','recovery','visuals'] as const;
const digest = (n: string) => n.repeat(64);

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Petros Phase 5 release gate owners / disposable app-role PostgreSQL', () => {
  let db: Phase2TestDatabase;
  let releaseRepo: PetrosReleaseRepository;
  let release: PetrosReleaseService;
  let routingRepo: PetrosAiRoutingRepository;
  let routing: PetrosAiRoutingService;
  let audit: AuditWriter;
  let context: ActionContext;
  let actorId: string;
  let identities: PetrosProductionQualityReport['identities'];
  let env: Record<string, unknown>;
  let functionId: string;

  beforeAll(async () => {
    db = await startPhase2TestDatabase();
    audit = db.auditWriter;
    actorId = randomUUID();
    await db.adminSql`insert into platform_employees (id,email,full_name,status) values (${actorId},${`phase5-${actorId}@example.test`},'Synthetic release operator','active')`;
    context = { principalContext: { principal: { employeeId: actorId, fullName: 'Synthetic release operator', roleKeys: ['ai_admin'] }, support: null }, request: {} } as unknown as ActionContext;
    identities = { application:digest('a'),migrations:digest('b'),sourcePack:digest('c'),promptSchema:digest('d'),policy:digest('e'),modelRouting:digest('f'),fixtures:digest('1'),evaluator:digest('2') };
    env = { PETROS_RELEASE_IDENTITIES_JSON: JSON.stringify(identities), PETROS_AI_MODE: 'live' };
    releaseRepo = new PetrosReleaseRepository(db.db);
    release = new PetrosReleaseService(releaseRepo, env as never, audit);
    routingRepo = new PetrosAiRoutingRepository(db.db);
    routing = new PetrosAiRoutingService(routingRepo, {} as never, {} as never, audit, release);
    await routing.ensureRegistry();
    const fn = await routingRepo.findFunctionByKey('teaching.next_action.select');
    expect(fn).toBeTruthy();
    functionId = fn!.id;
  }, 90_000);
  afterAll(async () => { await db?.close(); });

  async function versions() {
    const nonce = randomUUID();
    const candidate = await routing.createFunctionVersion(functionId, {
      promptVersion: `p5-candidate-${nonce}`, schemaVersion: `p5-schema-${nonce}`,
      promptTemplate: 'Synthetic candidate guidance; fixed fixture only.', responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      status: 'draft', reason: 'Create synthetic release candidate', notes: 'Disposable integration fixture',
    } as never, context);
    const rollback = await routing.createFunctionVersion(functionId, {
      promptVersion: `p5-rollback-${nonce}`, schemaVersion: `p5-schema-rollback-${nonce}`,
      promptTemplate: 'Synthetic known-good rollback guidance.', responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      status: 'draft', reason: 'Create synthetic rollback target', notes: 'Disposable integration fixture',
    } as never, context);
    const configuration = await releaseRepo.configuration(functionId);
    expect(configuration).toBeTruthy();
    const candidateSha256 = releaseDigest(promptIdentity(candidate as never));
    const rollbackSha256 = releaseDigest(promptIdentity(rollback as never));
    const configurationSha256 = releaseDigest(configuration);
    const fnIdentity = { functionId, candidateSha256, rollbackSha256 };
    const configIdentity = { functionId, configurationSha256 };
    identities.promptSchema = releaseDigest([fnIdentity]);
    identities.modelRouting = releaseDigest([configIdentity]);
    env.PETROS_RELEASE_IDENTITIES_JSON = JSON.stringify(identities);
    return { candidate, rollback, candidateSha256, rollbackSha256, configurationSha256, configuration };
  }

  function report(identity: PetrosProductionQualityReport['identities'] = identities, patch: Record<string, unknown> = {}): PetrosProductionQualityReport {
    const createdAt = new Date(Date.now() - 1_000).toISOString();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const checks = gates.map(gate => ({ gate, layer: 'deterministic' as const, status: 'pass' as const,
      samples: 2, evidenceSha256: digest('3') }));
    return { schemaVersion: 'petros.production-quality.v1', id: randomUUID(), environment: 'disposable_synthetic',
      runtime: 'production_owners', identities: structuredClone(identity), fixtureVersion: 'phase5-release-fixture.v1',
      evaluatorVersion: 'phase5-release-assertions.v1', createdAt, expiresAt, checks,
      accounting: { attempts: 2, failed: 0, cancelled: 0, costMicros: 0, maxCostMicros: 100,
        openReservations: 0, reconciled: true, evidenceSha256: digest('4') },
      educatorAcceptance: 'pending', pilotAcceptance: 'pending', ...patch };
  }

  function bundle(v: Awaited<ReturnType<typeof versions>>, evaluationId: string, patch: Record<string, unknown> = {}) {
    const createdAt = new Date(Date.now() - 500).toISOString();
    const expiresAt = new Date(Date.now() + 43_200_000).toISOString();
    return { schemaVersion: 'petros.release-bundle.v1', id: randomUUID(), identities: structuredClone(identities),
      evaluationId, createdAt, expiresAt, functions: [{ functionId, versionId: v.candidate.id, rollbackVersionId: v.rollback.id,
        candidateSha256: v.candidateSha256, rollbackSha256: v.rollbackSha256, configurationSha256: v.configurationSha256 }],
      admissions: 'disabled', externalAcceptance: 'pending', ...patch };
  }

  async function registerValid(v?: Awaited<ReturnType<typeof versions>>) {
    v ??= await versions();
    const r = report();
    await release.importReport(r, 'Import synthetic production-owner evaluation', context);
    const b = bundle(v, r.id);
    await release.register(b, 'Register synthetic release bundle', context);
    return { v, r, b };
  }

  it('imports and registers matching immutable identities, activates through the routing owner, and exposes only content-free status', async () => {
    const v = await versions();
    const r = report();
    const imported = await release.importReport(r, 'Import passing synthetic report', context);
    expect(imported).toMatchObject({ id: r.id, duplicate: false });
    expect(await release.importReport(r, 'Replay passing synthetic report', context)).toMatchObject({ duplicate: true });
    await expect(release.importReport({ ...r, fixtureVersion: 'changed' }, 'Conflicting replay', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_REPORT_CONFLICT' }) });
    const b = bundle(v, r.id);
    const pair = await Promise.all([
      release.register(b, 'Concurrent synthetic bundle registration', context),
      release.register(b, 'Concurrent synthetic bundle registration', context),
    ]);
    expect(pair.map(x => x.duplicate).sort()).toEqual([false, true]);
    await expect(release.register({ ...b, createdAt: new Date(Date.now() - 400).toISOString() }, 'Changed bundle replay', context))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_BUNDLE_CONFLICT' }) });
    const activated = await routing.activateFunctionVersion(functionId, v.candidate.id, 'Activate passing evaluated prompt', context);
    expect(activated).toMatchObject({ id: v.candidate.id, status: 'active' });
    const status = await release.status();
    expect(status).toMatchObject({ admissions: 'disabled', pilotAcceptance: 'pending', releases: [{ id: b.id, gate: 'pass', admissions: 'disabled', externalAcceptance: 'pending' }] });
    expect(JSON.stringify(status)).not.toContain('Synthetic candidate guidance');
    const principal = { kind: 'institutional', institutionId: randomUUID(), studentId: randomUUID(), institutionUserId: randomUUID(),
      email: 'fixture@example.test', fullName: 'Fixture', campusId: null, permissions: ['student.learn.use'], lastAuthAt: null } as never;
    const projected = await runInStudentTenant(db.db, principal, () => releaseRepo.runtimeRelease(functionId, v.candidate.id));
    expect(projected).toMatchObject({ manifest: { id: b.id }, disabled: false, report: { id: r.id } });
    expect(await db.appSql`select has_table_privilege('edrion_app','petros_release_bundles','UPDATE') as can_update`)
      .toMatchObject([{ can_update: false }]);
  });

  it('rejects missing, invalid, failing, over-budget, expired, mismatched, stale-prompt, and unknown-rollback evidence', async () => {
    const v = await versions();
    const missing = bundle(v, randomUUID());
    await expect(release.register(missing, 'Register missing report fixture', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_REPORT_MISSING' }) });

    const invalid = report();
    invalid.checks.pop();
    await expect(release.importReport(invalid, 'Import malformed contract fixture', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_REPORT_INVALID' }) });

    const failing = report();
    failing.checks[0]!.status = 'fail';
    await release.importReport(failing, 'Import failed quality evidence', context);
    await expect(release.register(bundle(v, failing.id), 'Register failed quality bundle', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_QUALITY_FAILED' }) });

    const costly = report();
    costly.accounting.costMicros = 101;
    await release.importReport(costly, 'Import over-budget evidence', context);
    await expect(release.register(bundle(v, costly.id), 'Register over-budget bundle', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_QUALITY_FAILED' }) });

    const expired = report(identities, { createdAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-09-02T00:00:00.000Z' });
    await release.importReport(expired, 'Import expired evidence fixture', context);
    await expect(release.register(bundle(v, expired.id), 'Register expired bundle', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_REPORT_EXPIRED' }) });

    const mismatch = report({ ...structuredClone(identities), application: digest('9') });
    await release.importReport(mismatch, 'Import identity mismatch fixture', context);
    await expect(release.register(bundle(v, mismatch.id), 'Register mismatched report bundle', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_REPORT_MISMATCH' }) });

    const validReport = report();
    await release.importReport(validReport, 'Import stale candidate fixture', context);
    const staleBundle = bundle(v, validReport.id, { functions: [{ functionId, versionId: v.candidate.id,
      rollbackVersionId: v.rollback.id, candidateSha256: digest('8'), rollbackSha256: v.rollbackSha256,
      configurationSha256: v.configurationSha256 }] });
    await expect(release.register(staleBundle, 'Register stale prompt fixture', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_PROMPT_STALE' }) });

    const unknownRollback = bundle(v, validReport.id, { functions: [{ functionId, versionId: v.candidate.id,
      rollbackVersionId: randomUUID(), candidateSha256: v.candidateSha256, rollbackSha256: digest('7'),
      configurationSha256: v.configurationSha256 }] });
    await expect(release.register(unknownRollback, 'Register unknown rollback fixture', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_ROLLBACK_MISSING' }) });
  });

  it('fails closed on identity, provider options, route, routing rule, budget, and function configuration drift', async () => {
    const v = await versions();
    const r = report();
    await release.importReport(r, 'Import identity freshness fixture', context);
    const b = bundle(v, r.id);
    env.PETROS_RELEASE_IDENTITIES_JSON = JSON.stringify({ ...identities, sourcePack: digest('9') });
    await expect(release.register(b, 'Register stale source fixture', context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_IDENTITY_STALE' }) });
    env.PETROS_RELEASE_IDENTITIES_JSON = JSON.stringify(identities);
    await release.register(b, 'Register before configuration change', context);
    const current = await routingRepo.findFunction(functionId);
    const changed = await routingRepo.configureFunction(functionId, current!.version, {
      enabled: !current!.enabled, allowedInputTypes: current!.allowedInputTypes, responseFormat: current!.responseFormat,
      requiredCapabilities: current!.requiredCapabilities, settings: current!.settings, routes: [],
    } as never, actorId);
    expect(changed).toBeTruthy();
    await expect(release.activation(functionId, v.candidate.id, async () => 'activated'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_CONFIGURATION_STALE' }) });
  });

  it('binds provider options, route overrides, routing rules, and budget policies through their routing owners', async () => {
    const provider = await routing.createProvider({ key: `p5-${randomUUID().slice(0, 8)}`, displayName: 'Synthetic local provider',
      adapterType: 'self_hosted', baseUrl: 'http://127.0.0.1:9', enabled: true, paused: false, priority: 100,
      capabilities: ['text', 'structured_output'], metadata: {}, reason: 'Create local synthetic route' } as never, context);
    const model = await routing.createModel({ providerId: provider.id, modelKey: 'fixture-model', displayName: 'Synthetic fixture model',
      enabled: true, custom: true, capabilities: ['text', 'structured_output'], contextWindow: 4096, maxOutputTokens: 512,
      pricing: {}, providerOptions: { fixture: 'initial' }, reason: 'Create local synthetic model' } as never, context);
    const fn = await routingRepo.findFunction(functionId);
    const route = { providerId: provider.id, modelId: model.id, tier: 0, trafficPercent: 100, enabled: true, overrides: {} };
    await routing.configureFunction(functionId, { enabled: true, allowedInputTypes: fn!.allowedInputTypes,
      responseFormat: fn!.responseFormat, requiredCapabilities: fn!.requiredCapabilities, settings: fn!.settings,
      routes: [route], reason: 'Install local synthetic route', version: fn!.version } as never, context);

    const expectDriftDenied = async (v: Awaited<ReturnType<typeof versions>>) => {
      await expect(release.activation(functionId, v.candidate.id, async () => 'activated'))
        .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_CONFIGURATION_STALE' }) });
    };

    let prepared = await registerValid();
    await routing.updateModel(model.id, { providerId: provider.id, modelKey: model.modelKey, displayName: model.displayName,
      enabled: true, custom: true, capabilities: model.capabilities, contextWindow: 4096, maxOutputTokens: 512,
      pricing: {}, providerOptions: { fixture: 'changed' }, reason: 'Change synthetic provider options', version: model.version } as never, context);
    await expectDriftDenied(prepared.v);

    prepared = await registerValid();
    const currentFn = await routingRepo.findFunction(functionId);
    await routing.configureFunction(functionId, { enabled: currentFn!.enabled, allowedInputTypes: currentFn!.allowedInputTypes,
      responseFormat: currentFn!.responseFormat, requiredCapabilities: currentFn!.requiredCapabilities, settings: currentFn!.settings,
      routes: [{ ...route, overrides: { fixture: 'changed' } }], reason: 'Change synthetic route override', version: currentFn!.version } as never, context);
    await expectDriftDenied(prepared.v);

    prepared = await registerValid();
    const rule = await routing.createRule({ name: `p5-rule-${randomUUID().slice(0, 8)}`, functionId,
      priority: 9999, enabled: true, conditions: { all: [{ field: 'subject', operator: 'eq', value: 'synthetic' }] },
      action: { kind: 'prefer_cost' }, reason: 'Create synthetic routing rule' } as never, context);
    await expectDriftDenied(prepared.v);
    await routing.removeRule(rule.id, 'Remove synthetic routing rule', context);

    prepared = await registerValid();
    const budget = await routing.budget();
    await routing.updateBudget({ monthlyBudgetMicros: budget.monthlyBudgetMicros, dailyBudgetMicros: budget.dailyBudgetMicros,
      thresholds: [...budget.thresholds], preserveEssentialFunctions: budget.preserveEssentialFunctions,
      enabled: !budget.enabled, reason: 'Change synthetic global budget policy', version: budget.version } as never, context);
    await expectDriftDenied(prepared.v);
  });

  it('rolls back report insertion when the real audit write fails, then allows retry', async () => {
    const r = report();
    await db.adminSql`revoke insert on audit_events from edrion_app`;
    try {
      await expect(release.importReport(r, 'Atomic failure injection', context)).rejects.toThrow();
      expect(await releaseRepo.report(r.id)).toBeUndefined();
    } finally {
      await db.adminSql`grant insert on audit_events to edrion_app`;
    }
    expect(await release.importReport(r, 'Retry after audit grant restored', context)).toMatchObject({ id: r.id, duplicate: false });
  });

  it('disablement blocks candidate reactivation/runtime while allowing only the exact evaluated rollback', async () => {
    const { v, r, b } = await registerValid();
    await routing.activateFunctionVersion(functionId, v.candidate.id, 'Activate before disabling release', context);
    const commandId = randomUUID();
    expect(await release.disable(b.id, commandId, 'Disable synthetic release fixture', context)).toMatchObject({ disabled: true, duplicate: false });
    expect(await release.disable(b.id, commandId, 'Disable synthetic release fixture', context)).toMatchObject({ disabled: true, duplicate: true });
    await expect(routing.activateFunctionVersion(functionId, v.candidate.id, 'Try disabled activation', context))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_DISABLED' }) });
    await expect(release.assertRuntimeVersion(functionId, v.candidate.id))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_RELEASE_DISABLED' }) });
    await routing.activateFunctionVersion(functionId, v.rollback.id, 'Restore exact evaluated rollback', context);
    await expect(release.assertRuntimeVersion(functionId, v.rollback.id)).resolves.toBeUndefined();
    const rollbackProjection = await releaseRepo.runtimeRelease(functionId, v.rollback.id);
    expect(rollbackProjection).toMatchObject({ disabled: true, report: { id: r.id }, manifest: { id: b.id } });
    const projected = await releaseRepo.runtimeRelease(functionId, v.candidate.id);
    expect(projected).toMatchObject({ disabled: true, report: { id: r.id }, manifest: { id: b.id } });
    expect(await releaseRepo.report(r.id)).toBeTruthy();
    expect(await releaseRepo.bundle(b.id)).toBeTruthy();
  });

  it('replays migration 0230 with identical FORCE RLS, app-role grants, immutability, and no PUBLIC function grant', async () => {
    const migrationPath = join(__dirname, '../../../../../packages/database/migrations/0230_petros_phase5_release.sql');
    const policySnapshot = async () => db.adminSql`
      select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
      where tablename in ('petros_release_evaluations','petros_release_bundles','petros_release_disables','petros_pilot_events') order by tablename,policyname`;
    const tableSnapshot = async () => db.adminSql`
      select c.relname as tablename,c.relforcerowsecurity as force_rls,
        has_table_privilege('edrion_app',c.oid,'SELECT') as app_select,
        has_table_privilege('edrion_app',c.oid,'INSERT') as app_insert,
        has_table_privilege('edrion_app',c.oid,'UPDATE') as app_update,
        has_table_privilege('edrion_app',c.oid,'DELETE') as app_delete
      from pg_class c where c.relname in ('petros_release_evaluations','petros_release_bundles','petros_release_disables','petros_pilot_events') order by c.relname`;
    const publicFunctionPrivilege = async () => db.adminSql`
      select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where p.oid='edrion_petros_runtime_release(uuid,uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') as public_execute`;
    const beforePolicies = await policySnapshot();
    const beforeTables = await tableSnapshot();
    const beforePublic = await publicFunctionPrivilege();
    expect(beforeTables).toHaveLength(4);
    expect(beforeTables.every(row => row.force_rls && row.app_select && row.app_insert && !row.app_update && !row.app_delete)).toBe(true);
    expect(beforePublic).toMatchObject([{ public_execute: false }]);
    await db.adminSql`drop function edrion_petros_operations()`;
    await db.adminSql`drop function edrion_petros_runtime_release(uuid,uuid)`;
    await db.adminSql`drop table petros_pilot_events,petros_release_disables,petros_release_bundles,petros_release_evaluations`;
    await db.adminSql`drop function petros_phase5_immutable()`;
    await db.adminSql.unsafe(readFileSync(migrationPath, 'utf8'));
    await db.adminSql.unsafe(readFileSync(join(__dirname,'../../../../../packages/database/migrations/sql/zzz_grants.sql'),'utf8'));
    expect(await policySnapshot()).toEqual(beforePolicies);
    expect(await tableSnapshot()).toEqual(beforeTables);
    expect(await publicFunctionPrivilege()).toEqual(beforePublic);
  });
});
