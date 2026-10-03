import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, runInStudentTenant, schema } from '@edrion/database';
import {
  createEngineReferenceProgram, describeEngineCapabilities, PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  PETROS_PROJECTILE_CAPABILITY, petrosProjectileBindingSchema,
  type EngineAction, type EngineCommand, type EngineProgram, type EngineSnapshot,
} from '@edrion/schemas';
import { createHeldOutEngineProgram } from '../../../../../packages/schemas/src/__fixtures__/petros-engine-held-out';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosTopicProfilesRepository } from '../petros-topic-profiles/petros-topic-profiles.repository';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosWorkspaceRepository } from '../student/petros-loop/petros-workspace.repository';
import { PetrosWorkspaceService } from '../student/petros-loop/petros-workspace.service';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

/** Synthetic owner journey only; all authority and persistence run against a private disposable cluster. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 3 workspace integrated journey / disposable PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });
  afterAll(() => vi.restoreAllMocks());

  async function setup(options: { sourcePrimary?: boolean } = {}) {
    const f = await phase2AuthorityFixture(database, candidate => {
      const misconception = candidate.misconceptions[0]!;
      misconception.id = 'apex_stops_all_motion';
      misconception.claim = 'Both velocity components become zero at the apex.';
      misconception.discriminator = 'Compare horizontal and vertical velocity at the apex.';
      misconception.correction = 'Only the vertical velocity component becomes zero at the apex.';
    });
    if (options.sourcePrimary) {
      const config = defaultInstitutionPolicy();
      config.syllabus.allowExternalSources = true;
      config.syllabus.knowledgeMode = 'source_primary';
      await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({
        institutionId: f.institutionId, scopeLevel: 'institution', version: 1, status: 'published',
        schemaVersion: PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION, config,
        reason: 'Synthetic source-primary workspace journey', authorId: f.student.institutionUserId,
        effectiveFrom: new Date(0), publishedAt: new Date(),
      });
    }
    await f.qualify();
    const approval = await f.approve();
    const provider = { execute: vi.fn(() => { throw new Error('Workspace operations must never call a provider'); }) };
    const auth = new StudentAuthService(database.db, database.auditWriter, f.env as never,
      {} as never, {} as never, {} as never);
    const policies = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
      provider as never, database.auditWriter, f.env as never);
    const surfaces = { isPortalEnabled: vi.fn(async () => true) };
    const loop = new PetrosLoopRepository(database.db, f.knowledge);
    const repo = new PetrosWorkspaceRepository(database.db);
    const env = { ...f.env, PETROS_WORKSPACE_ENABLED: true };
    const service = new PetrosWorkspaceService(database.db, env as never, database.auditWriter,
      repo, loop, f.packs, policies, auth, surfaces as never);

    async function addBlock(withBinding: boolean) {
      const blockId = randomUUID();
      const binding = withBinding ? petrosProjectileBindingSchema.parse({
        schemaVersion: 'petros.projectile-binding.v1', originalDiagramBlockId: blockId,
        pack: f.candidate.pack, objective: f.candidate.objective,
        curriculumRevision: f.candidate.curriculumRevision, conceptId: f.candidate.concepts[0]!.id,
        source: f.candidate.concepts[0]!.anchors[0]!.locator, capability: PETROS_PROJECTILE_CAPABILITY,
      }) : null;
      const decisionId = randomUUID();
      await f.admin.insert(schema.petrosPlanningDecisions).values({
        id: decisionId, sessionId: f.sessionId, institutionId: f.institutionId, studentId: f.student.studentId,
        sequence: (await f.admin.select({ id: schema.petrosPlanningDecisions.id }).from(schema.petrosPlanningDecisions)
          .where(eq(schema.petrosPlanningDecisions.sessionId, f.sessionId))).length + 1,
        selectedMoveType: 'diagram', targetConcept: 'apex_stops_all_motion',
        studentSafeReason: 'Compare the velocity components at the apex.',
        decisionFactors: ['approved_misconception_discriminator'],
        moveParameters: { misconceptionId: 'apex_stops_all_motion', packId: f.candidate.pack.id,
          packVersion: f.candidate.pack.version }, expectedEvidence: 'observation_only',
        progressEffect: {}, termination: {}, guessFirst: {}, observationResponse: {},
        source: 'deterministic_fallback', functionKey: 'synthetic-approved-misconception',
        promptVersion: 'synthetic', schemaVersion: 'synthetic', correlationId: randomUUID(),
      });
      await f.admin.insert(schema.petrosTeachingBlocks).values({
        id: blockId, decisionId, sessionId: f.sessionId, institutionId: f.institutionId,
        studentId: f.student.studentId, sequence: (await f.admin.select({ id: schema.petrosTeachingBlocks.id })
          .from(schema.petrosTeachingBlocks).where(eq(schema.petrosTeachingBlocks.sessionId, f.sessionId))).length + 1,
        type: 'diagram', content: { original: 'Preserved lesson diagram', misconceptionId: 'apex_stops_all_motion' },
        projectileBinding: binding, delivery: 'deterministic_fallback', functionKey: 'synthetic',
        promptVersion: 'synthetic', schemaVersion: 'synthetic', correlationId: randomUUID(),
      });
      return blockId;
    }

    const command = (snapshot: EngineSnapshot, programId: string, action: EngineAction,
      overrides: Partial<EngineCommand> = {}): EngineCommand => ({
      schemaVersion: 'petros.engine-command.v1', programId, operationId: randomUUID(),
      expectedRevision: snapshot.program.revision,
      expectedExperimentVersion: snapshot.execution.version,
      expectedDraftVersion: snapshot.draft.version,
      target: 'workspace', purpose: 'Synthetic controlled analytic exploration', action, ...overrides,
    });
    const counts = async (blockId: string) => ({
      workspaces: (await f.admin.select().from(schema.petrosWorkspaces).where(eq(schema.petrosWorkspaces.blockId, blockId))).length,
      checkpoints: (await f.admin.select().from(schema.petrosWorkspaceCheckpoints).where(eq(schema.petrosWorkspaceCheckpoints.workspaceId, blockId))).length,
      operations: (await f.admin.select().from(schema.petrosWorkspaceOperations).where(eq(schema.petrosWorkspaceOperations.blockId, blockId))).length,
      events: (await f.admin.select().from(schema.petrosSessionEvents).where(eq(schema.petrosSessionEvents.blockId, blockId))).length,
      audits: (await f.admin.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, blockId))).length,
    });
    const referenceProgram = (blockId: string, capabilityId: string, revision = 1) => createEngineReferenceProgram({
      ownerScopeRef: `${f.institutionId}:${f.student.studentId}`, programId: blockId,
      source: null, allowedCapabilities: describeEngineCapabilities().capabilities
        .filter(capability => capability.enabled).map(capability => capability.id),
    }, capabilityId, revision);
    const createCommand = (program: EngineProgram, blockId: string): EngineCommand => ({
      schemaVersion: 'petros.engine-command.v1', programId: blockId, operationId: randomUUID(),
      expectedRevision: 0, expectedExperimentVersion: 0, expectedDraftVersion: 0,
      target: 'workspace', purpose: 'Initialize a server-approved analytic capability',
      action: { type: 'create', program },
    });
    return { f, approval, provider, auth, policies, surfaces, loop, repo, env, service,
      addBlock, command, counts, referenceProgram, createCommand };
  }

  it('keeps an approved misconception-bound projectile lesson resumable, replay-safe and explicitly branchable', async () => {
    const x = await setup();
    expect(x.approval.receipt.decision).toBe('approved');
    expect(x.approval.receipt.reviewedCandidate.misconceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'apex_stops_all_motion' }),
    ]));
    const blockId = await x.addBlock(true);
    const ready = await x.service.read(x.f.student, x.f.sessionId, blockId);
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') throw new Error('APPROVED_PROJECTILE_WORKSPACE_NOT_READY');
    const initialized = await x.service.command(x.f.student, x.f.sessionId, blockId, x.createCommand(ready.program, blockId));
    expect(initialized.status).toBe('available');
    if (initialized.status !== 'available') throw new Error('PROJECTILE_WORKSPACE_NOT_INITIALIZED');
    let current = initialized.snapshot;
    const apply = async (action: EngineAction) => {
      const cmd = x.command(current, blockId, action);
      const result = await x.service.command(x.f.student, x.f.sessionId, blockId, cmd);
      expect(result.status).toBe('available');
      if (result.status !== 'available') throw new Error('PROJECTILE_COMMAND_NOT_AVAILABLE');
      current = result.snapshot;
      return { cmd, result };
    };

    await apply({ type: 'isolate', entityId: 'body' });
    const switched = await apply({ type: 'switch_representation', viewIds: ['vectors', 'plot'] });
    expect(switched.result.snapshot.presentation).toMatchObject({ viewIds: ['vectors', 'plot'], selectedEntityId: 'body' });
    await apply({ type: 'set_parameter', parameterId: 'vx', value: 10, unit: 'm/s' });
    await apply({ type: 'set_parameter', parameterId: 'vy', value: 20, unit: 'm/s' });
    await apply({ type: 'set_parameter', parameterId: 'gravity', value: 10, unit: 'm/s^2' });
    await apply({ type: 'step', time: 2 });
    const apex = await apply({ type: 'set_beat', beat: 1, offset: 0 });
    expect(apex.result.snapshot.execution.time).toBe(2);
    expect(apex.result.snapshot.execution.values).toMatchObject({ 'model.vx': 10, 'model.vy': 0, 'model.y': 20 });

    const draft = await apply({ type: 'annotate', text: 'At the apex, vertical velocity is zero; horizontal velocity remains 10 m/s.' });
    const interruption = await apply({ type: 'interrupt', mode: 'freeze', beat: 2, offset: 94 });
    expect(interruption.result.snapshot.teaching).toMatchObject({ interrupted: true, mode: 'freeze', beat: 2 });
    const resumedRead = await x.service.read(x.f.student, x.f.sessionId, blockId);
    expect(resumedRead).toMatchObject({ status: 'available', snapshot: {
      teaching: { interrupted: true, returnPoint: { time: 2 } },
      draft: { text: draft.result.snapshot.draft.text, version: 1 },
    }, recovery: { acknowledgedExperimentVersion: current.execution.version } });
    const resumeCommand = x.command(current, blockId, { type: 'resume' });
    const resumed = await x.service.command(x.f.student, x.f.sessionId, blockId, resumeCommand);
    expect(resumed).toMatchObject({ status: 'available', replayed: false,
      snapshot: { teaching: { interrupted: false }, draft: { text: draft.result.snapshot.draft.text, version: 1 } } });
    if (resumed.status !== 'available') throw new Error('PROJECTILE_WORKSPACE_RESUME_FAILED');
    current = resumed.snapshot;
    const replay = await x.service.command(x.f.student, x.f.sessionId, blockId, resumeCommand);
    expect(replay).toMatchObject({ status: 'available', replayed: true, receipt: resumed.receipt });
    await apply({ type: 'expand' });
    expect(current.presentation.expanded).toBe(true);

    await expect(x.service.command(x.f.student, x.f.sessionId, blockId,
      x.command(interruption.result.snapshot, blockId, { type: 'set_speed', speed: 2 }))).rejects.toThrow();
    const branch = x.command(current, blockId, { type: 'compare', checkpointId: initialized.receipt.checkpointId! });
    const fork = await x.service.command(x.f.student, x.f.sessionId, blockId, branch);
    expect(fork).toMatchObject({ status: 'available', snapshot: {
      execution: { branchId: branch.operationId, time: 0 },
      draft: { text: draft.result.snapshot.draft.text, version: 1 },
    } });
    expect(await x.counts(blockId)).toMatchObject({ workspaces: 1, operations: 13, events: 13, audits: 13 });
    // This synthetic approval covers the source-bound teaching pack, not a rubric for newly
    // authored workspace models. Until such independent model assessments are reviewed, these
    // numerical trajectories remain exploration receipts and confer no mastery evidence.
    const objectiveEvidence = await x.f.admin.select().from(schema.petrosObjectiveEvidenceEvents)
      .where(eq(schema.petrosObjectiveEvidenceEvents.sessionId, x.f.sessionId));
    expect(objectiveEvidence).toHaveLength(0);
    expect(x.provider.execute).not.toHaveBeenCalled();
  }, 15_000);

  it('runs pendulum, DC and RC models plus a held-out replacement under source-primary authority', async () => {
    const x = await setup({ sourcePrimary: true });
    const scenarios = [
      ['physics.pendulum.ideal', 'angle'],
      ['circuits.dc.series', 'current'],
      ['circuits.rc.series', 'capacitorVoltage'],
    ] as const;
    const blocks = new Map<string, string>();
    for (const [capability, output] of scenarios) {
      const blockId = await x.addBlock(false);
      blocks.set(capability, blockId);
      const program = x.referenceProgram(blockId, capability);
      expect(program.source).toBeNull();
      const created = await x.service.command(x.f.student, x.f.sessionId, blockId,
        x.createCommand(program, blockId));
      expect(created).toMatchObject({ status: 'available', snapshot: {
        program: { source: null, provenance: 'engineering_comparison', models: [{ capabilityId: capability }] },
      } });
      if (created.status !== 'available') throw new Error('SOURCE_PRIMARY_MODEL_NOT_CREATED');
      expect(typeof created.snapshot.execution.values[`model.${output}`]).toBe('number');
      expect((await x.service.read(x.f.student, x.f.sessionId, blockId)).status).toBe('available');
    }
    const dcId = blocks.get('circuits.dc.series')!;
    const dc = await x.service.read(x.f.student, x.f.sessionId, dcId);
    if (dc.status !== 'available') throw new Error('DC_WORKSPACE_NOT_AVAILABLE');
    const badUnit = x.command(dc.snapshot, dcId,
      { type: 'set_parameter', parameterId: 'voltage', value: 12, unit: 'ohm' });
    await expect(x.service.command(x.f.student, x.f.sessionId, dcId, badUnit)).rejects.toThrow();
    expect(await x.counts(dcId)).toMatchObject({ workspaces: 1, checkpoints: 1, operations: 1, events: 1, audits: 1 });

    const heldOutId = await x.addBlock(false);
    const first = x.referenceProgram(heldOutId, 'physics.pendulum.ideal');
    const initial = await x.service.command(x.f.student, x.f.sessionId, heldOutId,
      x.createCommand(first, heldOutId));
    if (initial.status !== 'available') throw new Error('HELDOUT_INITIAL_MODEL_MISSING');
    const draftCommand = x.command(initial.snapshot, heldOutId, { type: 'annotate', text: 'Preserve this model note.' });
    const drafted = await x.service.command(x.f.student, x.f.sessionId, heldOutId, draftCommand);
    if (drafted.status !== 'available') throw new Error('HELDOUT_DRAFT_MISSING');
    const expanded = await x.service.command(x.f.student, x.f.sessionId, heldOutId,
      x.command(drafted.snapshot, heldOutId, { type: 'expand' }));
    if (expanded.status !== 'available') throw new Error('HELDOUT_VIEW_NOT_EXPANDED');
    const replacement = x.referenceProgram(heldOutId, 'circuits.rc.series', 2);
    const compose = x.command(expanded.snapshot, heldOutId, { type: 'compose', program: replacement });
    const composed = await x.service.command(x.f.student, x.f.sessionId, heldOutId, compose);
    expect(composed).toMatchObject({ status: 'available', snapshot: {
      program: { revision: 2, source: null, models: [{ capabilityId: 'circuits.rc.series' }] },
      draft: { text: 'Preserve this model note.', version: 1 }, presentation: { expanded: true },
    } });

    const mixedId = await x.addBlock(false);
    const mixedProgram = createHeldOutEngineProgram({
      ownerScopeRef: `${x.f.institutionId}:${x.f.student.studentId}`,
      programId: mixedId,
      source: null,
      allowedCapabilities: describeEngineCapabilities().capabilities
        .filter(capability => capability.enabled).map(capability => capability.id),
    });
    const mixedCreated = await x.service.command(x.f.student, x.f.sessionId, mixedId,
      x.createCommand(mixedProgram, mixedId));
    if (mixedCreated.status !== 'available') throw new Error('HELDOUT_MIXED_MODEL_MISSING');
    expect(mixedCreated.snapshot.program.models.map(model => model.capabilityId)).toEqual([
      'physics.projectile.no-drag', 'circuits.dc.series',
    ]);
    const sharedStep = await x.service.command(x.f.student, x.f.sessionId, mixedId,
      x.command(mixedCreated.snapshot, mixedId, { type: 'seek', time: 0.5 }));
    if (sharedStep.status !== 'available') throw new Error('HELDOUT_SHARED_STEP_MISSING');
    expect(sharedStep.snapshot.execution.values).toMatchObject({
      'flight.x': 1.5, 'flight.y': 2.75, 'loop.current': 2, crossed: true,
    });
    const displayOnly = await x.service.command(x.f.student, x.f.sessionId, mixedId,
      x.command(sharedStep.snapshot, mixedId,
        { type: 'set_parameter', parameterId: 'display.gain', value: 3, unit: '1' }));
    if (displayOnly.status !== 'available') throw new Error('HELDOUT_DISPLAY_PARAMETER_FAILED');
    expect(displayOnly.snapshot.execution.parameters['display.gain']).toBe(3);
    expect(displayOnly.snapshot.execution.values).toMatchObject({
      'flight.x': 1.5, 'flight.y': 2.75, 'loop.current': 2,
    });
    const switchCommand = x.command(displayOnly.snapshot, mixedId,
      { type: 'set_parameter', parameterId: 'loop.closed', value: false, unit: '1' });
    const switched = await x.service.command(x.f.student, x.f.sessionId, mixedId, switchCommand);
    expect(switched).toMatchObject({ status: 'available', replayed: false,
      snapshot: { execution: { inputEvents: [{ parameterId: 'loop.closed', value: false, time: 0.5 }] } } });
    if (switched.status !== 'available') throw new Error('HELDOUT_SWITCH_INTERVENTION_FAILED');
    expect(switched.snapshot.execution.values).toMatchObject({ 'loop.isClosed': false, 'loop.current': 0 });
    expect(await x.service.command(x.f.student, x.f.sessionId, mixedId, switchCommand))
      .toMatchObject({ status: 'available', replayed: true, receipt: switched.receipt });
    expect(await x.counts(mixedId)).toMatchObject({ workspaces: 1, operations: 4, events: 4, audits: 4 });

    const forgedId = await x.addBlock(false);
    const forged = x.referenceProgram(forgedId, 'circuits.dc.series');
    forged.capabilities.push({ id: 'physics.unregistered-solver', version: 1 });
    await expect(x.service.command(x.f.student, x.f.sessionId, forgedId,
      x.createCommand(forged, forgedId))).rejects.toThrow();
    expect(await x.counts(forgedId)).toMatchObject({ workspaces: 0, checkpoints: 0, operations: 0, events: 0, audits: 0 });
    const appOwnerRows = await runInStudentTenant(database.db, x.f.student,
      () => database.db.select().from(schema.petrosWorkspaces));
    const foreignRows = await runInStudentTenant(database.db, { ...x.f.student, studentId: randomUUID() },
      () => database.db.select().from(schema.petrosWorkspaces));
    expect(appOwnerRows.some(row => row.blockId === dcId)).toBe(true);
    expect(foreignRows).toEqual([]);
    expect(x.provider.execute).not.toHaveBeenCalled();
  });

  it('denies a changed assignment answer restriction, portal revocation and permission revocation', async () => {
    const x = await setup();
    const yearId = randomUUID(), gradeId = randomUUID(), classId = randomUUID(), assignmentId = randomUUID();
    await x.f.admin.insert(schema.academicYears).values({ id: yearId, institutionId: x.f.institutionId,
      name: 'Synthetic year', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' });
    await x.f.admin.insert(schema.gradeLevels).values({ id: gradeId, institutionId: x.f.institutionId, name: 'Synthetic level' });
    await x.f.admin.insert(schema.classes).values({ id: classId, institutionId: x.f.institutionId,
      academicYearId: yearId, gradeLevelId: gradeId, name: 'Synthetic class' });
    await x.f.admin.insert(schema.assignments).values({ id: assignmentId, institutionId: x.f.institutionId,
      classId, courseId: x.f.course.id, title: 'Synthetic workspace task', status: 'published', aiPolicy: 'full', version: 0 });
    await x.f.admin.insert(schema.assignmentAssignees).values({ assignmentId, studentId: x.f.student.studentId });
    const [session] = await x.f.admin.select().from(schema.petrosLearningSessions)
      .where(eq(schema.petrosLearningSessions.id, x.f.sessionId));
    await x.f.admin.update(schema.petrosLearningSessions).set({ sourceContext: {
      ...session!.sourceContext!, assignmentContext: { assignmentId },
    } }).where(eq(schema.petrosLearningSessions.id, x.f.sessionId));
    const blockId = await x.addBlock(true);
    const ready = await x.service.read(x.f.student, x.f.sessionId, blockId);
    if (ready.status !== 'ready') throw new Error('ASSIGNMENT_BOUND_WORKSPACE_NOT_READY');
    const created = await x.service.command(x.f.student, x.f.sessionId, blockId,
      x.createCommand(ready.program, blockId));
    if (created.status !== 'available') throw new Error('ASSIGNMENT_BOUND_WORKSPACE_NOT_CREATED');
    await x.f.admin.update(schema.assignments).set({ aiPolicy: 'hints_only', version: 1 })
      .where(eq(schema.assignments.id, assignmentId));
    await expect(x.service.command(x.f.student, x.f.sessionId, blockId,
      x.command(created.snapshot, blockId, { type: 'annotate', text: 'Must not commit.' }))).rejects.toThrow();
    expect(await x.counts(blockId)).toMatchObject({ workspaces: 1, checkpoints: 1, operations: 1, events: 1, audits: 1 });

    x.surfaces.isPortalEnabled.mockResolvedValue(false);
    await expect(x.service.read(x.f.student, x.f.sessionId, blockId)).rejects.toThrow();
    x.surfaces.isPortalEnabled.mockResolvedValue(true);
    await x.f.admin.delete(schema.institutionUserRoles)
      .where(eq(schema.institutionUserRoles.institutionUserId, x.f.student.institutionUserId));
    await expect(x.service.read(x.f.student, x.f.sessionId, blockId)).rejects.toThrow();
    expect(x.provider.execute).not.toHaveBeenCalled();
  });

  it('resolves concurrent canonical-profile identity creation across separate app-role transactions', async () => {
    const x = await setup();
    const first = new PetrosTopicProfilesRepository(database.db);
    const second = new PetrosTopicProfilesRepository(database.db);
    const topicKey = `synthetic-${randomUUID()}`;
    const topic = await x.f.owned(() => first.findOrCreateLearnTopic({
      topicKey, canonicalTitle: 'Synthetic concurrent bootstrap', subjectLabel: 'Physics', curriculumKey: 'fixture',
    }));
    const values = { learnTopicId: topic.id, topicKey, canonicalTitle: 'Synthetic concurrent bootstrap',
      subjectKey: 'physics', subjectLabel: 'Physics', gradeBand: 'fixture', curriculumKey: 'fixture',
      curriculumLabel: 'Synthetic curriculum', cacheKey: `fixture:${topicKey}`, invalidationInputs: {}, status: 'draft' as const };
    const results = await Promise.all([
      x.f.owned(() => first.createProfile(values)),
      x.f.owned(() => second.createProfile(values)),
    ]);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(results[0]!.profile.id).toBe(results[1]!.profile.id);
    expect(results[0]!.profile.publishedVersionId).toBeNull();
  });

  it('checks migration 0227 grants/RLS, removes its objects transactionally and reapplies it', async () => {
    const before = await database.adminSql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
        has_table_privilege('edrion_app', c.oid, 'select') as can_select,
        has_table_privilege('edrion_app', c.oid, 'insert') as can_insert,
        has_table_privilege('edrion_app', c.oid, 'update') as can_update,
        has_table_privilege('edrion_app', c.oid, 'delete') as can_delete
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('petros_workspaces','petros_workspace_checkpoints',
        'petros_workspace_operations','petros_workspace_prediction_challenges','petros_workspace_prediction_responses')
      order by c.relname`;
    expect(before).toHaveLength(5);
    for (const table of before) expect(table).toMatchObject({ rls: true, force_rls: true, can_select: true, can_insert: true });
    expect(before.find(row => row.relname === 'petros_workspaces')).toMatchObject({ can_update: true, can_delete: false });
    for (const table of before.filter(row => row.relname !== 'petros_workspaces'))
      expect(table).toMatchObject({ can_update: false, can_delete: false });

    await database.adminSql.begin(async tx => {
      await tx.unsafe(`drop table petros_workspace_prediction_responses, petros_workspace_prediction_challenges,
        petros_workspace_operations, petros_workspace_checkpoints, petros_workspaces`);
      await tx.unsafe('alter table petros_teaching_blocks drop constraint petros_block_session_owner_uq');
      await tx.unsafe('drop function petros_workspace_identity_immutable()');
      // Phase 4 reuses the append-only history guard. Remove its dependent triggers
      // before this isolated rollback and restore them after the Phase 3 function.
      await tx.unsafe('drop trigger petros_continuity_receipt_immutable on petros_continuity_receipts');
      await tx.unsafe('drop trigger petros_journey_session_immutable on petros_journey_sessions');
      await tx.unsafe('drop function petros_workspace_history_immutable()');
    });
    expect(await database.adminSql`select to_regclass('public.petros_workspaces') as table_name`).toMatchObject([{ table_name: null }]);

    const migration = readFileSync(join(process.cwd(), '../../packages/database/migrations/0227_petros_workspace.sql'), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean))
      await database.adminSql.unsafe(statement);
    await database.adminSql.unsafe(`create trigger petros_continuity_receipt_immutable before update or delete on petros_continuity_receipts
      for each row execute function petros_workspace_history_immutable();
      create trigger petros_journey_session_immutable before update or delete on petros_journey_sessions
      for each row execute function petros_workspace_history_immutable();`);
    const after = await database.adminSql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
        has_table_privilege('edrion_app', c.oid, 'select') as can_select,
        has_table_privilege('edrion_app', c.oid, 'insert') as can_insert,
        has_table_privilege('edrion_app', c.oid, 'update') as can_update,
        has_table_privilege('edrion_app', c.oid, 'delete') as can_delete
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('petros_workspaces','petros_workspace_checkpoints',
        'petros_workspace_operations','petros_workspace_prediction_challenges','petros_workspace_prediction_responses')
      order by c.relname`;
    expect(after).toEqual(before);
    const policies = await database.adminSql`
      select tablename, policyname from pg_policies where schemaname='public'
        and tablename like 'petros_workspace%' order by tablename`;
    expect(policies).toHaveLength(5);
    const triggers = await database.adminSql`
      select event_object_table, trigger_name from information_schema.triggers
      where trigger_schema='public' and trigger_name like 'petros_workspace_%' order by trigger_name`;
    expect(triggers.length).toBeGreaterThanOrEqual(4);
  });
});
