import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, runInStudentTenant, schema } from '@edrion/database';
import { PETROS_PROJECTILE_CAPABILITY, PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  createEngineReferenceProgram, describeEngineCapabilities, petrosProjectileBindingSchema, type EngineCommand } from '@edrion/schemas';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { PetrosWorkspaceRepository } from '../student/petros-loop/petros-workspace.repository';
import { PetrosWorkspaceService } from '../student/petros-loop/petros-workspace.service';
import { StudentPetrosWorkspaceController } from '../student/petros-loop/petros-workspace.controller';
import { STUDENT_OWNS_TRANSACTIONS } from '../student/core/student-owned-transactions';
import { STUDENT_PERMISSIONS_KEY } from '../student/core/student.decorators';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../student/auth/student-auth.service';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 3 workspace / disposable PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });
  afterEach(() => vi.restoreAllMocks());

  it('registers no-store POST issue/answer routes behind the existing student owner boundary', () => {
    const controller = StudentPetrosWorkspaceController.prototype;
    for (const [handler, path] of [['issuePrediction', 'predictions'], ['answerPrediction', 'predictions/answer']] as const) {
      const method = controller[handler];
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(HEADERS_METADATA, method)).toEqual([{ name: 'Cache-Control', value: 'private, no-store' }]);
      expect(Reflect.getMetadata(STUDENT_OWNS_TRANSACTIONS, method)).toBe(true);
    }
    expect(Reflect.getMetadata(STUDENT_PERMISSIONS_KEY, StudentPetrosWorkspaceController)).toEqual(['student.learn.use']);
    expect(Reflect.getMetadata(GUARDS_METADATA, StudentPetrosWorkspaceController)).toHaveLength(4);
  });

  async function setup(generic = false) {
    const f = await phase2AuthorityFixture(database);
    if (generic) {
      const config = defaultInstitutionPolicy();
      config.syllabus.allowExternalSources = true;
      config.syllabus.knowledgeMode = 'source_primary';
      await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({
        institutionId: f.institutionId, scopeLevel: 'institution', version: 1, status: 'published',
        schemaVersion: PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION, config,
        reason: 'Synthetic general engineering comparison', authorId: f.student.institutionUserId,
        effectiveFrom: new Date(0), publishedAt: new Date(),
      });
    }
    await f.qualify();
    const approved = await f.approve();
    const blockId = randomUUID(), decisionId = randomUUID();
    const binding = petrosProjectileBindingSchema.parse({
      schemaVersion: 'petros.projectile-binding.v1', originalDiagramBlockId: blockId,
      pack: f.candidate.pack, objective: f.candidate.objective,
      curriculumRevision: f.candidate.curriculumRevision,
      conceptId: f.candidate.concepts[0]!.id,
      source: f.candidate.concepts[0]!.anchors[0]!.locator,
      capability: PETROS_PROJECTILE_CAPABILITY,
    });
    await f.admin.insert(schema.petrosPlanningDecisions).values({
      id: decisionId, sessionId: f.sessionId, institutionId: f.institutionId, studentId: f.student.studentId,
      sequence: 1, selectedMoveType: 'diagram', targetConcept: 'component_motion',
      studentSafeReason: 'Synthetic reviewed diagram', decisionFactors: [], moveParameters: {},
      expectedEvidence: 'none', progressEffect: {}, termination: {}, guessFirst: {}, observationResponse: {},
      source: 'deterministic_fallback', functionKey: 'synthetic', promptVersion: 'synthetic',
      schemaVersion: 'synthetic', correlationId: randomUUID(),
    });
    await f.admin.insert(schema.petrosTeachingBlocks).values({
      id: blockId, decisionId, sessionId: f.sessionId, institutionId: f.institutionId,
      studentId: f.student.studentId, sequence: 1, type: 'diagram', content: { original: 'preserved' },
      projectileBinding: binding, delivery: 'deterministic_fallback', functionKey: 'synthetic',
      promptVersion: 'synthetic', schemaVersion: 'synthetic', correlationId: randomUUID(),
    });
    const provider = { execute: vi.fn(() => { throw new Error('Provider calls are forbidden'); }) };
    const auth = new StudentAuthService(database.db, database.auditWriter, f.env as never,
      {} as never, {} as never, {} as never);
    const policies = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
      provider as never, database.auditWriter, f.env as never);
    const surfaces = { isPortalEnabled: vi.fn(async () => true) };
    const loop = new PetrosLoopRepository(database.db, f.knowledge);
    const env = { ...f.env, PETROS_WORKSPACE_ENABLED: true };
    const repo = new PetrosWorkspaceRepository(database.db);
    const service = new PetrosWorkspaceService(database.db, env as never, database.auditWriter,
      repo, loop, f.packs, policies, auth, surfaces as never);
    const ready = await service.read(f.student, f.sessionId, blockId);
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') throw new Error('Workspace fixture was not ready');
    const program = generic ? createEngineReferenceProgram({
      ownerScopeRef: `${f.institutionId}:${f.student.studentId}`, programId: blockId, source: null,
      allowedCapabilities: describeEngineCapabilities().capabilities.filter(capability => capability.enabled)
        .map(capability => capability.id),
    }, 'physics.pendulum.ideal') : ready.program;
    const create: EngineCommand = {
      schemaVersion: 'petros.engine-command.v1', programId: blockId, operationId: randomUUID(),
      expectedRevision: 0, expectedExperimentVersion: 0, expectedDraftVersion: 0,
      target: 'workspace', purpose: 'Open a reviewed projectile model',
      action: { type: 'create', program },
    };
    const counts = async () => ({
      workspaces: (await f.admin.select().from(schema.petrosWorkspaces).where(eq(schema.petrosWorkspaces.blockId, blockId))).length,
      checkpoints: (await f.admin.select().from(schema.petrosWorkspaceCheckpoints).where(eq(schema.petrosWorkspaceCheckpoints.workspaceId, blockId))).length,
      operations: (await f.admin.select().from(schema.petrosWorkspaceOperations).where(eq(schema.petrosWorkspaceOperations.blockId, blockId))).length,
      events: (await f.admin.select().from(schema.petrosSessionEvents).where(and(
        eq(schema.petrosSessionEvents.blockId, blockId), eq(schema.petrosSessionEvents.type, 'visual.workspace_command')))).length,
      audits: (await f.admin.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.entityId, blockId), eq(schema.auditEvents.action, 'petros.visual.workspace_command')))).length,
    });
    const predictionCounts = async () => ({
      challenges: (await f.admin.select().from(schema.petrosWorkspacePredictionChallenges)
        .where(eq(schema.petrosWorkspacePredictionChallenges.workspaceId, blockId))).length,
      responses: (await f.admin.select().from(schema.petrosWorkspacePredictionResponses)
        .where(eq(schema.petrosWorkspacePredictionResponses.workspaceId, blockId))).length,
      events: (await f.admin.select().from(schema.petrosSessionEvents).where(and(
        eq(schema.petrosSessionEvents.blockId, blockId), eq(schema.petrosSessionEvents.type, 'visual.workspace_prediction')))).length,
      audits: (await f.admin.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.entityId, blockId), eq(schema.auditEvents.action, 'petros.visual.workspace_prediction')))).length,
    });
    return { f, service, repo, blockId, binding, create, provider, surfaces, env, counts, predictionCounts, approved };
  }

  it('uses real source, pack, policy and auth owners; commits atomic immutable receipts and replays a lost reply', async () => {
    const x = await setup();
    const first = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    expect(first).toMatchObject({ status: 'available', replayed: false,
      snapshot: { execution: { version: 1 } }, recovery: { acknowledgedExperimentVersion: 1 } });
    expect(await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create))
      .toMatchObject({ status: 'available', replayed: true, receipt: first.receipt });
    expect(await x.counts()).toEqual({ workspaces: 1, checkpoints: 1, operations: 1, events: 1, audits: 1 });
    expect(x.provider.execute).not.toHaveBeenCalled();
    const foreign = { ...x.f.student, studentId: randomUUID() };
    expect(await runInStudentTenant(database.db, foreign,
      () => database.db.select().from(schema.petrosWorkspaceOperations))).toEqual([]);
    await expect(x.service.read(foreign, x.f.sessionId, x.blockId)).rejects.toThrow();
    await expect(runInStudentTenant(database.db, x.f.student,
      () => database.db.delete(schema.petrosWorkspaceOperations)
        .where(eq(schema.petrosWorkspaceOperations.blockId, x.blockId)))).rejects.toThrow();
    await expect(x.f.admin.delete(schema.petrosWorkspaceCheckpoints)
      .where(eq(schema.petrosWorkspaceCheckpoints.workspaceId, x.blockId))).rejects.toThrow();
  });

  it('rolls back checkpoint, receipt, event and audit on failure; cancellation tombstone wins', async () => {
    const x = await setup();
    const failure = vi.spyOn(database.auditWriter, 'logAudit').mockRejectedValueOnce(new Error('synthetic audit failure'));
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create)).rejects.toThrow('synthetic audit failure');
    expect(await x.counts()).toEqual({ workspaces: 0, checkpoints: 0, operations: 0, events: 0, audits: 0 });
    failure.mockRestore();
    expect(await x.service.cancel(x.f.student, x.f.sessionId, x.blockId, x.create))
      .toEqual({ status: 'cancelled', operationId: x.create.operationId });
    expect(await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create))
      .toEqual({ status: 'cancelled', operationId: x.create.operationId });
    expect(await x.counts()).toEqual({ workspaces: 0, checkpoints: 0, operations: 1, events: 1, audits: 1 });
  });

  it('branches only from a loaded owner checkpoint and rejects stale or changed commands', async () => {
    const x = await setup();
    const first = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (first.status !== 'available') throw new Error('Expected created workspace');
    const annotate: EngineCommand = { ...x.create, operationId: randomUUID(),
      expectedRevision: first.snapshot.program.revision,
      expectedExperimentVersion: first.snapshot.execution.version,
      action: { type: 'annotate', text: 'My own note' } };
    const second = await x.service.command(x.f.student, x.f.sessionId, x.blockId, annotate);
    expect(second).toMatchObject({ status: 'available', snapshot: { execution: { version: 2 }, draft: { version: 1 } } });
    if (second.status !== 'available') throw new Error('Expected annotation');
    const branch: EngineCommand = { ...annotate, operationId: randomUUID(),
      expectedExperimentVersion: second.snapshot.execution.version,
      expectedDraftVersion: second.snapshot.draft.version,
      action: { type: 'compare', checkpointId: first.receipt.checkpointId! } };
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId,
      { ...branch, action: { type: 'compare', checkpointId: randomUUID() } })).rejects.toThrow();
    const compared = await x.service.command(x.f.student, x.f.sessionId, x.blockId, branch);
    expect(compared).toMatchObject({ status: 'available', snapshot: { execution: { version: 3,
      branchId: branch.operationId }, draft: { text: 'My own note', version: 1 } } });
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId, branch)).resolves.toMatchObject({ replayed: true });
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId,
      { ...branch, purpose: 'Changed retry' })).rejects.toThrow();
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId,
      { ...annotate, operationId: randomUUID() })).rejects.toThrow();
    const read = await x.service.read(x.f.student, x.f.sessionId, x.blockId);
    expect(read).toMatchObject({ status: 'available', checkpoints: [{ version: 3 }, { version: 2 }, { version: 1 }] });
    expect(await x.counts()).toEqual({ workspaces: 1, checkpoints: 3, operations: 3, events: 3, audits: 3 });
  });

  it('maps malformed versions, unsupported units and forged capabilities to 400 without committing', async () => {
    const x = await setup();
    const assertBadRequest = async (work: Promise<unknown>) => {
      let failure: unknown;
      try { await work; } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(BadRequestException);
      expect((failure as BadRequestException).getStatus()).toBe(400);
    };

    await assertBadRequest(x.service.command(x.f.student, x.f.sessionId, x.blockId,
      { ...x.create, schemaVersion: 'petros.engine-command.v0' }));
    await assertBadRequest(x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId,
      { requestId: 'not-a-uuid', modelId: 'x' }));
    await assertBadRequest(x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId, {}));
    expect(await x.counts()).toEqual({ workspaces: 0, checkpoints: 0, operations: 0, events: 0, audits: 0 });

    const forgedProgram = structuredClone(x.create.action.type === 'create' ? x.create.action.program : null);
    if (!forgedProgram) throw new Error('Expected create program');
    forgedProgram.capabilities[0]!.id = 'resource.unapproved@1';
    const unsupportedCapability = { ...x.create, operationId: randomUUID(),
      action: { type: 'create' as const, program: forgedProgram } };
    await assertBadRequest(x.service.command(x.f.student, x.f.sessionId, x.blockId, unsupportedCapability));
    expect(await x.counts()).toEqual({ workspaces: 0, checkpoints: 0, operations: 0, events: 0, audits: 0 });

    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (created.status !== 'available') throw new Error('Expected created workspace');
    const unsupportedUnit: EngineCommand = { ...x.create, operationId: randomUUID(),
      expectedRevision: created.snapshot.program.revision,
      expectedExperimentVersion: created.snapshot.execution.version,
      expectedDraftVersion: created.snapshot.draft.version,
      action: { type: 'set_parameter', parameterId: 'vx', value: 3, unit: 'kg' } };
    await assertBadRequest(x.service.command(x.f.student, x.f.sessionId, x.blockId, unsupportedUnit));
    expect(await x.counts()).toEqual({ workspaces: 1, checkpoints: 1, operations: 1, events: 1, audits: 1 });
  });

  it('rechecks portal and real reviewer authority even for stored read and exact retry', async () => {
    const x = await setup();
    await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    x.surfaces.isPortalEnabled.mockResolvedValue(false);
    await expect(x.service.read(x.f.student, x.f.sessionId, x.blockId)).rejects.toThrow();
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create)).rejects.toThrow();
    x.surfaces.isPortalEnabled.mockResolvedValue(true);
    await x.f.institution(() => x.f.packs.revoke(x.f.ctx, x.approved.receipt.receiptId,
      { schemaVersion: 'petros.teaching-pack-review-revocation.v1', commandId: randomUUID(),
        expectedReviewVersion: x.approved.receipt.reviewVersion, reason: 'Synthetic revocation test' }));
    await expect(x.service.read(x.f.student, x.f.sessionId, x.blockId)).rejects.toThrow();
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create)).rejects.toThrow();
    expect(await x.counts()).toEqual({ workspaces: 1, checkpoints: 1, operations: 1, events: 1, audits: 1 });
  });

  it('admits a registry-validated pendulum comparison only under current source-primary policy', async () => {
    const x = await setup(true);
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    expect(created).toMatchObject({ status: 'available', snapshot: { program: {
      source: null, provenance: 'engineering_comparison', models: [{ capabilityId: 'physics.pendulum.ideal' }],
    }, report: { scientificStatus: 'validated_capabilities_only', generatedExecutable: 'disabled' } } });
    expect(x.provider.execute).not.toHaveBeenCalled();
    expect(await x.counts()).toEqual({ workspaces: 1, checkpoints: 1, operations: 1, events: 1, audits: 1 });
  });

  it('issues an idempotent hidden prediction criterion and records an uncertain observation without mastery', async () => {
    const x = await setup();
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (created.status !== 'available') throw new Error('Expected created workspace');
    const issue = { requestId: randomUUID(), modelId: created.snapshot.program.models[0]!.id };
    const challenge = await x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId, issue);
    expect(challenge).toMatchObject({ status: 'challenge', replayed: false,
      experimentVersion: created.snapshot.execution.version, priorExploration: true,
      assistanceStatus: 'external_help_unknown', evidenceEligibility: 'observation_only' });
    expect(challenge).not.toHaveProperty('referenceValue');
    expect(challenge).not.toHaveProperty('tolerance');
    expect(challenge).not.toHaveProperty('branchId');
    expect(await x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId, issue))
      .toMatchObject({ challengeId: challenge.challengeId, replayed: true });
    await expect(x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId,
      { ...issue, modelId: 'changed-model' })).rejects.toThrow();

    const answer = { requestId: randomUUID(), challengeId: challenge.challengeId,
      predictedValue: 1e9, assistance: 'unknown' as const };
    const evaluated = await x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId, answer);
    expect(evaluated).toMatchObject({ status: 'evaluated', predictedValue: 1e9,
      assistance: 'unknown', externalHelp: 'unknown', masteryAdmitted: false, replayed: false });
    expect(await x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId, answer))
      .toMatchObject({ result: evaluated.result, replayed: true, masteryAdmitted: false });
    await expect(x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId,
      { ...answer, predictedValue: 0 })).rejects.toThrow();
    expect(await x.predictionCounts()).toEqual({ challenges: 1, responses: 1, events: 2, audits: 2 });
    expect(x.provider.execute).not.toHaveBeenCalled();
  });

  it('rejects an answer pinned to a checkpoint made stale by later exploration', async () => {
    const x = await setup();
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (created.status !== 'available') throw new Error('Expected created workspace');
    const challenge = await x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), modelId: created.snapshot.program.models[0]!.id });
    const annotation: EngineCommand = { ...x.create, operationId: randomUUID(),
      expectedRevision: created.snapshot.program.revision,
      expectedExperimentVersion: created.snapshot.execution.version,
      expectedDraftVersion: created.snapshot.draft.version,
      action: { type: 'annotate', text: 'Explore before answering' } };
    await x.service.command(x.f.student, x.f.sessionId, x.blockId, annotation);
    await expect(x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), challengeId: challenge.challengeId,
        predictedValue: 2, assistance: 'none_observed' })).rejects.toThrow();
    expect(await x.predictionCounts()).toEqual({ challenges: 1, responses: 0, events: 1, audits: 1 });
  });

  it('rechecks the current workspace after waiting for the locked teaching block', async () => {
    const x = await setup();
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (created.status !== 'available') throw new Error('Expected created workspace');
    let blockLocked!: () => void;
    let continueBlock!: () => void;
    let serviceWaiting!: () => void;
    const blockLockReady = new Promise<void>(resolve => { blockLocked = resolve; });
    const releaseBlockLock = new Promise<void>(resolve => { continueBlock = resolve; });
    const serviceReachedBlock = new Promise<void>(resolve => { serviceWaiting = resolve; });
    const hold = database.adminSql.begin(async tx => {
      await tx`select id from petros_teaching_blocks where id = ${x.blockId} for no key update`;
      blockLocked();
      await releaseBlockLock;
    });
    await blockLockReady;
    const originalBlock = x.repo.block.bind(x.repo);
    vi.spyOn(x.repo, 'block').mockImplementation(async (scope, sessionId, blockId, lock) => {
      if (lock) serviceWaiting();
      return originalBlock(scope, sessionId, blockId, lock);
    });
    const issue = x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), modelId: created.snapshot.program.models[0]!.id });
    await serviceReachedBlock;
    await database.adminSql`update petros_workspaces set version = version + 1,
      snapshot = jsonb_set(snapshot, '{execution,version}', to_jsonb(version + 1)) where block_id = ${x.blockId}`;
    continueBlock();
    await hold;
    let stale: unknown;
    try { await issue; } catch (error) { stale = error; }
    expect(stale).toBeInstanceOf(ConflictException);
    expect((stale as ConflictException).getResponse()).toEqual({ code: 'PETROS_WORKSPACE_PREDICTION_STALE' });
    expect(await x.predictionCounts()).toEqual({ challenges: 0, responses: 0, events: 0, audits: 0 });
  });

  it('rolls back challenge/response, observation and audit together on audit failure', async () => {
    const x = await setup();
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (created.status !== 'available') throw new Error('Expected created workspace');
    const issue = { requestId: randomUUID(), modelId: created.snapshot.program.models[0]!.id };
    const failure = vi.spyOn(database.auditWriter, 'logAudit').mockRejectedValueOnce(new Error('synthetic prediction issue audit failure'));
    await expect(x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId, issue))
      .rejects.toThrow('synthetic prediction issue audit failure');
    expect(await x.predictionCounts()).toEqual({ challenges: 0, responses: 0, events: 0, audits: 0 });
    failure.mockRestore();
    const challenge = await x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId, issue);

    const answer = { requestId: randomUUID(), challengeId: challenge.challengeId,
      predictedValue: 1, assistance: 'petros_help' as const };
    const answerFailure = vi.spyOn(database.auditWriter, 'logAudit').mockRejectedValueOnce(new Error('synthetic prediction answer audit failure'));
    await expect(x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId, answer))
      .rejects.toThrow('synthetic prediction answer audit failure');
    expect(await x.predictionCounts()).toEqual({ challenges: 1, responses: 0, events: 1, audits: 1 });
    answerFailure.mockRestore();
    await expect(x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId, answer))
      .resolves.toMatchObject({ status: 'evaluated', assistance: 'petros_help', masteryAdmitted: false });
    expect(await x.predictionCounts()).toEqual({ challenges: 1, responses: 1, events: 2, audits: 2 });
  });

  it('rechecks current review authority and denies foreign-owner issue/answer reads', async () => {
    const x = await setup();
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, x.create);
    if (created.status !== 'available') throw new Error('Expected created workspace');
    const challenge = await x.service.issuePrediction(x.f.student, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), modelId: created.snapshot.program.models[0]!.id });
    const foreign = { ...x.f.student, studentId: randomUUID() };
    await expect(x.service.issuePrediction(foreign, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), modelId: created.snapshot.program.models[0]!.id })).rejects.toThrow();
    await expect(x.service.answerPrediction(foreign, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), challengeId: challenge.challengeId,
        predictedValue: 1, assistance: 'none_observed' })).rejects.toThrow();
    await x.f.institution(() => x.f.packs.revoke(x.f.ctx, x.approved.receipt.receiptId,
      { schemaVersion: 'petros.teaching-pack-review-revocation.v1', commandId: randomUUID(),
        expectedReviewVersion: x.approved.receipt.reviewVersion, reason: 'Synthetic prediction revocation test' }));
    await expect(x.service.answerPrediction(x.f.student, x.f.sessionId, x.blockId,
      { requestId: randomUUID(), challengeId: challenge.challengeId,
        predictedValue: 1, assistance: 'none_observed' })).rejects.toThrow();
    expect(await x.predictionCounts()).toEqual({ challenges: 1, responses: 0, events: 1, audits: 1 });
  });
});
