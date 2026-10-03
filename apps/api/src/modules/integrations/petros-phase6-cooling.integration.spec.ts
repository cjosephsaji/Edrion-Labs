import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, schema } from '@edrion/database';
import { createEngineReferenceProgram, describeEngineCapabilities, PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  PETROS_PROJECTILE_CAPABILITY, petrosProjectileBindingSchema, type EngineAction, type EngineCommand } from '@edrion/schemas';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosWorkspaceRepository } from '../student/petros-loop/petros-workspace.repository';
import { PetrosWorkspaceService } from '../student/petros-loop/petros-workspace.service';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

/** Cooling owner/capability checks against a private disposable PostgreSQL cluster. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 6 Newton cooling workspace / disposable PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });

  async function setup(advancedModelsEnabled: boolean) {
    const f = await phase2AuthorityFixture(database);
    const config = defaultInstitutionPolicy();
    config.syllabus.allowExternalSources = true;
    config.syllabus.knowledgeMode = 'source_primary';
    await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({
      institutionId: f.institutionId, scopeLevel: 'institution', version: 1, status: 'published',
      schemaVersion: PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION, config,
      reason: 'Synthetic Phase 6 analytic comparison policy', authorId: f.student.institutionUserId,
      effectiveFrom: new Date(0), publishedAt: new Date(),
    });
    await f.qualify();
    await f.approve();
    const blockId = randomUUID(), decisionId = randomUUID();
    const binding = petrosProjectileBindingSchema.parse({
      schemaVersion: 'petros.projectile-binding.v1', originalDiagramBlockId: blockId,
      pack: f.candidate.pack, objective: f.candidate.objective,
      curriculumRevision: f.candidate.curriculumRevision, conceptId: f.candidate.concepts[0]!.id,
      source: f.candidate.concepts[0]!.anchors[0]!.locator, capability: PETROS_PROJECTILE_CAPABILITY,
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
    const provider = { execute: vi.fn(() => { throw new Error('Cooling workspace must not call a provider'); }) };
    const auth = new StudentAuthService(database.db, database.auditWriter, f.env as never,
      {} as never, {} as never, {} as never);
    const policies = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
      provider as never, database.auditWriter, f.env as never);
    const surfaces = { isPortalEnabled: vi.fn(async () => true) };
    const loop = new PetrosLoopRepository(database.db, f.knowledge);
    const env = { ...f.env, PETROS_WORKSPACE_ENABLED: true, PETROS_ADVANCED_MODELS_ENABLED: advancedModelsEnabled };
    const repo = new PetrosWorkspaceRepository(database.db);
    const service = new PetrosWorkspaceService(database.db, env as never, database.auditWriter,
      repo, loop, f.packs, policies, auth, surfaces as never);
    const command = (snapshot: { program: { revision: number }; execution: { version: number }; draft: { version: number } },
      action: EngineAction, overrides: Partial<EngineCommand> = {}): EngineCommand => ({
      schemaVersion: 'petros.engine-command.v1', programId: blockId, operationId: randomUUID(),
      expectedRevision: snapshot.program.revision, expectedExperimentVersion: snapshot.execution.version,
      expectedDraftVersion: snapshot.draft.version, target: 'workspace', purpose: 'Synthetic cooling verification', action,
      ...overrides,
    });
    const counts = async () => ({
      workspaces: (await f.admin.select().from(schema.petrosWorkspaces).where(eq(schema.petrosWorkspaces.blockId, blockId))).length,
      checkpoints: (await f.admin.select().from(schema.petrosWorkspaceCheckpoints).where(eq(schema.petrosWorkspaceCheckpoints.workspaceId, blockId))).length,
      operations: (await f.admin.select().from(schema.petrosWorkspaceOperations).where(eq(schema.petrosWorkspaceOperations.blockId, blockId))).length,
      audits: (await f.admin.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, blockId))).length,
    });
    return { f, service, provider, blockId, env, command, counts };
  }

  function coolingProgram(x: Awaited<ReturnType<typeof setup>>) {
    const ready = describeEngineCapabilities();
    return createEngineReferenceProgram({
      ownerScopeRef: `${x.f.institutionId}:${x.f.student.studentId}`, programId: x.blockId, source: null,
      allowedCapabilities: ready.capabilities.filter(capability => capability.enabled &&
        (capability.id !== 'thermal.newton-cooling.lumped' || x.env.PETROS_ADVANCED_MODELS_ENABLED)).map(c => c.id),
    }, 'thermal.newton-cooling.lumped');
  }

  it('keeps the new capability default-off and rejects owner create without durable writes', async () => {
    const x = await setup(false);
    const ready = await x.service.read(x.f.student, x.f.sessionId, x.blockId);
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') throw new Error('Cooling flag probe needs a ready source-bound workspace');
    expect(ready.capabilities.capabilities.find(c => c.id === 'thermal.newton-cooling.lumped'))
      .toMatchObject({ enabled: false });
    const program = coolingProgram(x);
    const create: EngineCommand = { schemaVersion: 'petros.engine-command.v1', programId: x.blockId,
      operationId: randomUUID(), expectedRevision: 0, expectedExperimentVersion: 0, expectedDraftVersion: 0,
      target: 'workspace', purpose: 'Attempt disabled synthetic capability', action: { type: 'create', program } };
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId, create)).rejects.toThrow();
    expect(await x.counts()).toEqual({ workspaces: 0, checkpoints: 0, operations: 0, audits: 0 });
    expect(x.provider.execute).not.toHaveBeenCalled();
  });

  it('executes enabled owner create, seek, restart, branch, exact replay and authorized resume across tenants', async () => {
    const x = await setup(true);
    const other = await setup(true);
    const ready = await x.service.read(x.f.student, x.f.sessionId, x.blockId);
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') throw new Error('Cooling capability was not offered');
    expect(ready.capabilities.capabilities.find(c => c.id === 'thermal.newton-cooling.lumped'))
      .toMatchObject({ enabled: true, units: expect.arrayContaining(['K', 'K/s', 's^-1']) });
    const create: EngineCommand = { schemaVersion: 'petros.engine-command.v1', programId: x.blockId,
      operationId: randomUUID(), expectedRevision: 0, expectedExperimentVersion: 0, expectedDraftVersion: 0,
      target: 'workspace', purpose: 'Create the enabled bounded analytic model',
      action: { type: 'create', program: coolingProgram(x) } };
    const created = await x.service.command(x.f.student, x.f.sessionId, x.blockId, create);
    expect(created).toMatchObject({ status: 'available', snapshot: {
      program: { source: null, provenance: 'engineering_comparison', models: [{ capabilityId: 'thermal.newton-cooling.lumped' }] },
      execution: { time: 0, values: { 'model.temperature': 373.15, 'model.ambientTemperature': 293.15 } },
      report: { generatedExecutable: 'disabled', scientificStatus: 'validated_capabilities_only' },
    } });
    if (created.status !== 'available') throw new Error('Cooling create did not commit');
    x.env.PETROS_ADVANCED_MODELS_ENABLED = false;
    await expect(x.service.read(x.f.student, x.f.sessionId, x.blockId)).rejects.toThrow();
    await expect(x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(created.snapshot, { type: 'annotate', text: 'Must not commit while the capability is disabled.' }))).rejects.toThrow();
    expect(await x.counts()).toMatchObject({ workspaces: 1, checkpoints: 1, operations: 1, audits: 1 });
    x.env.PETROS_ADVANCED_MODELS_ENABLED = true;
    const sought = await x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(created.snapshot, { type: 'seek', time: 100 }));
    expect(sought).toMatchObject({ status: 'available', snapshot: { execution: {
      time: 100, values: { 'model.temperature': expect.closeTo(322.5803552937154, 10) },
    } } });
    if (sought.status !== 'available') throw new Error('Cooling seek did not commit');
    const replay = await x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(created.snapshot, { type: 'seek', time: 100 }, { operationId: sought.receipt.operationId }));
    expect(replay).toMatchObject({ status: 'available', replayed: true, receipt: sought.receipt,
      snapshot: { execution: { values: { 'model.temperature': expect.closeTo(322.5803552937154, 10) } } } });

    const restarted = await x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(sought.snapshot, { type: 'set_parameter', parameterId: 'initialTemperature', value: 393.15, unit: 'K' }));
    expect(restarted).toMatchObject({ status: 'available', snapshot: { execution: {
      time: 0, inputEvents: [], parameters: { initialTemperature: 393.15 }, values: { 'model.temperature': 393.15 },
    } } });
    if (restarted.status !== 'available') throw new Error('Cooling parameter restart did not commit');
    const secondSeek = await x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(restarted.snapshot, { type: 'seek', time: 100 }));
    expect(secondSeek).toMatchObject({ status: 'available', snapshot: { execution: {
      values: { 'model.temperature': expect.closeTo(329.9379441171442, 10) },
    } } });
    if (secondSeek.status !== 'available') throw new Error('Cooling replay after restart failed');
    const branch = x.command(secondSeek.snapshot, { type: 'compare', checkpointId: created.receipt.checkpointId! });
    const branched = await x.service.command(x.f.student, x.f.sessionId, x.blockId, branch);
    expect(branched).toMatchObject({ status: 'available', snapshot: { execution: {
      branchId: branch.operationId, time: 0, parameters: { initialTemperature: 373.15 }, values: { 'model.temperature': 373.15 },
    } } });
    if (branched.status !== 'available') throw new Error('Cooling checkpoint branch failed');
    const interrupted = await x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(branched.snapshot, { type: 'interrupt', mode: 'freeze', beat: 0, offset: 3 }));
    if (interrupted.status !== 'available') throw new Error('Cooling interruption failed');
    expect(await x.service.read(x.f.student, x.f.sessionId, x.blockId)).toMatchObject({ status: 'available', snapshot: {
      teaching: { interrupted: true, returnPoint: { time: 0 } }, execution: { branchId: branch.operationId },
    } });
    const resumed = await x.service.command(x.f.student, x.f.sessionId, x.blockId,
      x.command(interrupted.snapshot, { type: 'resume' }));
    expect(resumed).toMatchObject({ status: 'available', snapshot: { teaching: { interrupted: false, returnPoint: null } } });

    await expect(other.service.read(other.f.student, x.f.sessionId, x.blockId)).rejects.toThrow();
    await expect(other.service.command(other.f.student, x.f.sessionId, x.blockId, create)).rejects.toThrow();
    expect(await x.counts()).toMatchObject({ workspaces: 1, checkpoints: 7, operations: 7, audits: 7 });
    expect(await other.counts()).toEqual({ workspaces: 0, checkpoints: 0, operations: 0, audits: 0 });
    expect(x.provider.execute).not.toHaveBeenCalled();
    expect(other.provider.execute).not.toHaveBeenCalled();
  }, 30_000);
});
