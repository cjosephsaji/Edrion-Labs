import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, schema } from '@edrion/database';
import {
  PETROS_PROJECTILE_ASSUMPTIONS,
  PETROS_PROJECTILE_CAPABILITY,
  petrosFlashcardContentSchema,
  petrosNoteContentSchema,
  type EngineAction,
  type EngineSnapshot,
  type PetrosProjectileCommand,
} from '@edrion/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PetrosLearnerModelRepository } from '../petros-learner-model/petros-learner-model.repository';
import { PetrosLearnerModelService } from '../petros-learner-model/petros-learner-model.service';
import { PetrosObjectiveEvidenceRepository } from '../petros-learner-model/petros-objective-evidence.repository';
import { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosLoopService } from '../student/petros-loop/petros-loop.service';
import { PetrosProjectileRepository } from '../student/petros-loop/petros-projectile.repository';
import { PetrosProjectileService } from '../student/petros-loop/petros-projectile.service';
import { PetrosWorkspaceRepository } from '../student/petros-loop/petros-workspace.repository';
import { PetrosWorkspaceService } from '../student/petros-loop/petros-workspace.service';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import { PetrosArtifactsRepository } from '../student/petros-artifacts/petros-artifacts.repository';
import { PetrosArtifactsService } from '../student/petros-artifacts/petros-artifacts.service';
import { PetrosLearningArtifactsService } from '../student/petros-artifacts/petros-learning-artifacts.service';
import { PetrosQualitativeReviewRepository } from '../student/petros-artifacts/petros-qualitative-review.repository';
import { PetrosQualitativeReviewService } from '../student/petros-artifacts/petros-qualitative-review.service';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

/**
 * One synthetic physics journey through the real Phase 2 owners. It proves generic engineering
 * infrastructure only: the fixture's subject, source, rubric and educator records grant no rollout
 * or educational approval. The database is private, disposable and never loaded from .env.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Petros Phase 2 full real-owner journey / disposable PostgreSQL',
  () => {
    let database: Phase2TestDatabase;

    beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
    afterAll(async () => { await database?.close(); });

    it('teaches, adapts, simulates, records bounded evidence, reviews a revision and resumes honestly', async () => {
      const f = await phase2AuthorityFixture(database, (candidate) => {
        const diagnostic = candidate.assessments[0]!;
        diagnostic.misconceptionDiscriminators = [{
          misconceptionId: 'apex_stops_all_motion', exactResponses: ['both'],
        }];
        candidate.assessments.splice(1, 0, {
          id: 'component-followup',
          variant: 'second-independent-check',
          prompt: 'Which velocity component remains constant in the reviewed no-drag model?',
          unseenContext: false,
          criteria: [...diagnostic.criteria],
          evaluator: {
            kind: 'exact_text', answerKey: 'horizontal', aliases: ['horizontal velocity'],
            caseSensitive: false,
          },
          misconceptionDiscriminators: [],
          anchors: structuredClone(diagnostic.anchors),
        });
        candidate.assessments.push({
          id: 'cross-session-check',
          variant: 'fresh-after-prior-exposure',
          prompt: 'At the apex, which velocity component remains unchanged in the reviewed no-drag model?',
          unseenContext: false,
          criteria: [...diagnostic.criteria],
          evaluator: {
            kind: 'exact_text', answerKey: 'horizontal', aliases: ['horizontal velocity'],
            caseSensitive: false,
          },
          misconceptionDiscriminators: [],
          anchors: structuredClone(diagnostic.anchors),
        });
      });

      const source = await f.owned(() => f.knowledge.resolve(
        f.student, f.source.id, 1, f.extraction.version.fingerprint,
      ));
      expect(source).toMatchObject({
        item: {
          id: f.source.id, status: 'ready', extractedTextReady: true,
          origin: { source: 'teacher_class_material', classMaterialId: f.material.id,
            petrosExtraction: { representation: 'pdf_text', readable: true } },
        },
        version: { fingerprint: f.extraction.version.fingerprint, state: 'complete', admissible: true },
        currentVersion: f.source.version,
      });
      const located = await f.owned(() => f.knowledge.locator(f.student, f.source.id, f.citation.locator));
      expect(located).toEqual({ locator: f.citation.locator, text: f.citation.excerpt });
      expect(await f.owned(() => f.knowledge.canReadSession(f.student, f.sessionId))).toBe(true);

      const [curriculum] = await f.admin.select().from(schema.courseCurriculumRevisions)
        .where(and(eq(schema.courseCurriculumRevisions.institutionId, f.institutionId),
          eq(schema.courseCurriculumRevisions.courseId, f.course.id)))
        .orderBy(desc(schema.courseCurriculumRevisions.revision)).limit(1);
      expect(curriculum).toMatchObject({ revision: 2, subjectId: f.subjectId,
        payload: { objectives: [{ id: f.candidate.objective.id, version: f.candidate.objective.version }],
          alignments: [{ objective: f.candidate.objective, status: 'approved' }] } });

      await f.qualify();
      const packApproval = await f.approve();
      expect(packApproval.receipt).toMatchObject({
        decision: 'approved',
        coverage: {
          sourceFidelity: 'reviewed', scientificCorrectness: 'reviewed',
          prerequisitesAndMisconceptions: 'reviewed', examplesAndExplanations: 'reviewed',
          rubricAndUnseenTransfer: 'reviewed',
        },
        reviewer: { authoritySnapshot: { qualificationId: f.qualificationId, subjectKey: f.subjectId } },
        reviewedCandidate: { curriculumRevision: 2, objective: f.candidate.objective,
          assessments: [{ id: 'practice' }, { id: 'component-followup' },
            { id: 'transfer', unseenContext: true }, { id: 'cross-session-check' }] },
      });
      expect((await f.current()).candidate.sourceVersion).toBe(f.extraction.version.fingerprint);

      const provider = { execute: vi.fn(() => { throw new Error('Provider calls are not permitted'); }) };
      const surfaces = { isPortalEnabled: vi.fn(async () => true) };
      const auth = new StudentAuthService(
        database.db, database.auditWriter, f.env as never, {} as never, {} as never, {} as never,
      );
      const policies = new PetrosInstitutionalService(
        new PetrosInstitutionalRepository(database.db), provider as never,
        database.auditWriter, f.env as never,
      );
      const adaptive = new PetrosAdaptiveService(
        database.db, f.env as never, database.auditWriter, auth, surfaces as never,
        f.packs, policies,
      );
      const evidence = new PetrosObjectiveEvidenceService(
        database.db, f.env as never, database.auditWriter,
        new PetrosObjectiveEvidenceRepository(database.db), f.packs, policies,
        auth, surfaces as never,
      );
      const learner = new PetrosLearnerModelService(
        new PetrosLearnerModelRepository(database.db), database.auditWriter,
      );
      const loopRepository = new PetrosLoopRepository(database.db, f.knowledge);
      const loop = new PetrosLoopService(
        loopRepository, provider as never, {} as never, learner, database.auditWriter,
        policies, f.env as never, adaptive, evidence,
      );
      const projectile = new PetrosProjectileService(
        database.db, f.env as never, database.auditWriter,
        new PetrosProjectileRepository(database.db), loopRepository, f.packs, policies,
        auth, surfaces as never,
      );
      const workspaceEnv = { ...f.env, PETROS_WORKSPACE_ENABLED: true };
      const workspace = new PetrosWorkspaceService(
        database.db, workspaceEnv as never, database.auditWriter,
        new PetrosWorkspaceRepository(database.db), loopRepository, f.packs, policies,
        auth, surfaces as never,
      );
      const learningArtifacts = new PetrosLearningArtifactsService(
        database.db, f.env as never, database.auditWriter, auth, surfaces as never,
        f.packs, policies,
      );
      const artifacts = new PetrosArtifactsService(
        new PetrosArtifactsRepository(database.db, f.knowledge), learner, learningArtifacts,
      );
      const qualitative = new PetrosQualitativeReviewService(
        database.db, f.env as never, database.auditWriter,
        new PetrosQualitativeReviewRepository(database.db), f.packs, policies,
        auth, surfaces as never,
      );

      await f.owned(() => adaptive.bind(f.student, f.sessionId, {
        commandId: randomUUID(), pack: f.candidate.pack,
      }));
      const checkpoints = Array.from({ length: 12 }, (_, index) => ({
        id: `checkpoint-${index + 1}`,
        label: `Step ${index + 1}`,
        status: index === 0 ? 'current' as const : 'pending' as const,
      }));
      await f.admin.update(schema.petrosLearningSessions).set({
        maxMoves: 12,
        checkpoints,
        currentCheckpointId: checkpoints[0]!.id,
        resolvedTopicProfile: stage4ProfileFixture('projectile', f.institutionId),
      }).where(eq(schema.petrosLearningSessions.id, f.sessionId));

      const next = (sessionId = f.sessionId) =>
        f.owned(() => loop.continue(f.student, sessionId, randomUUID()));
      const complete = async (sessionId = f.sessionId) => {
        const document = await f.owned(() => loop.document(f.student, sessionId));
        const block = document.blocks.find((item) => item.status === 'current')!;
        return f.owned(() => loop.complete(f.student, sessionId, block.id, {
          idempotencyKey: randomUUID(), expectedBlockVersion: block.version,
          blockType: block.content.type, interactionState: block.interactionState,
          observedOutcome: {},
        }));
      };
      const answer = (block: Awaited<ReturnType<typeof next>>['blocks'][number], value: string,
        sessionId = f.sessionId) => f.owned(() => loop.submitAnswer(f.student, sessionId, block.id, {
          idempotencyKey: randomUUID(), expectedBlockVersion: block.version,
          questionId: block.questions[0]!.id, answer: value, confidence: 'sure',
        }));

      const explanation = await next();
      expect(explanation.blocks.at(-1)!.content.type).toBe('layered_explanation');
      await complete();

      const diagnostic = (await next()).blocks.at(-1)!;
      expect(diagnostic.content.type).toBe('recall_check');
      expect(diagnostic.questions[0]!.prompt).toContain('zero at the apex');
      await answer(diagnostic, 'both');
      await complete();

      const contrast = (await next()).blocks.at(-1)!;
      expect(contrast.content.type).toBe('contrast_case');
      const contrastDecision = (await f.admin.select().from(schema.petrosPlanningDecisions)
        .where(eq(schema.petrosPlanningDecisions.id, contrast.decisionId)))[0]!;
      expect(contrastDecision.adaptiveSnapshot).toMatchObject({
        input: { signal: { kind: 'misconception', misconceptionId: 'apex_stops_all_motion', diagnosis: 'supported' } },
        output: { decision: { reason: 'supported_misconception', diagnosis: 'supported' } },
      });
      expect(contrastDecision.studentSafeReason).toBe(
        'Compare two cases to test the distinction behind the earlier answer.',
      );
      await complete();

      const secondCheck = (await next()).blocks.at(-1)!;
      expect(secondCheck.questions[0]!.prompt).toContain('remains constant');
      await answer(secondCheck, 'vertical');
      await complete();

      const diagram = (await next()).blocks.at(-1)!;
      expect(diagram.content.type).toBe('diagram');
      const diagramDecision = (await f.admin.select().from(schema.petrosPlanningDecisions)
        .where(eq(schema.petrosPlanningDecisions.id, diagram.decisionId)))[0]!;
      expect(diagramDecision.adaptiveSnapshot).toMatchObject({
        input: { signal: { kind: 'repeated_confusion' } },
        output: { decision: { selectedMove: 'diagram', reason: 'representation_change' } },
      });

      const simulation = await projectile.read(f.student, f.sessionId, diagram.id);
      expect(simulation).toMatchObject({ status: 'ready' });
      if (simulation.status !== 'ready') throw new Error('PETROS_FULL_JOURNEY_PROJECTILE_NOT_READY');
      const initialise: PetrosProjectileCommand = {
        schemaVersion: 'petros.projectile-command.v1', operationId: randomUUID(), expectedVersion: 0,
        binding: simulation.binding,
        action: { kind: 'initialise', input: {
          ...simulation.defaultInput,
          capability: PETROS_PROJECTILE_CAPABILITY,
          assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
          launchVelocity: { x: 10, y: 10, unit: 'm/s' },
          gravity: { value: 10, unit: 'm/s^2' },
          elapsedTime: { value: 0, unit: 's' },
        } },
      };
      const launch = await projectile.command(f.student, f.sessionId, diagram.id, initialise);
      expect(launch).toMatchObject({
        status: 'available', replayed: false,
        snapshot: { version: 1, state: { phase: 'launch', velocity: { x: 10, y: 10, unit: 'm/s' } } },
      });
      expect(await projectile.command(f.student, f.sessionId, diagram.id, initialise))
        .toEqual({ ...launch, replayed: true });
      const apex: PetrosProjectileCommand = {
        ...initialise, operationId: randomUUID(), expectedVersion: 1,
        action: { kind: 'parameter', change: { parameter: 'elapsed_time', value: 1, unit: 's' } },
      };
      expect(await projectile.command(f.student, f.sessionId, diagram.id, apex)).toMatchObject({
        status: 'available', snapshot: { version: 2, state: {
          phase: 'flight', position: { x: 10, y: 5, unit: 'm' },
          velocity: { x: 10, y: 0, unit: 'm/s' },
        } },
      });

      const evidenceBeforeWorkspace = await evidence.readCurrentEvidence(f.student, f.sessionId, {
        packId: f.candidate.pack.id, packVersion: f.candidate.pack.version,
      });
      const workspaceReady = await workspace.read(f.student, f.sessionId, diagram.id);
      expect(workspaceReady).toMatchObject({ status: 'ready' });
      if (workspaceReady.status !== 'ready') throw new Error('PETROS_FULL_JOURNEY_WORKSPACE_NOT_READY');
      const openWorkspace = {
        schemaVersion: 'petros.engine-command.v1' as const,
        programId: diagram.id,
        operationId: randomUUID(),
        expectedRevision: 0,
        expectedExperimentVersion: 0,
        expectedDraftVersion: 0,
        target: 'workspace' as const,
        purpose: 'Open the reviewed diagram in a generic workspace',
        action: { type: 'create' as const, program: workspaceReady.program },
      };
      const openedWorkspace = await workspace.command(f.student, f.sessionId, diagram.id, openWorkspace);
      expect(openedWorkspace).toMatchObject({ status: 'available', replayed: false,
        snapshot: { program: { programId: diagram.id, source: simulation.binding } } });
      if (openedWorkspace.status !== 'available') throw new Error('PETROS_FULL_JOURNEY_WORKSPACE_OPEN_FAILED');
      const workspaceCommand = (snapshot: EngineSnapshot, action: EngineAction) => ({
        schemaVersion: 'petros.engine-command.v1' as const,
        programId: diagram.id,
        operationId: randomUUID(),
        expectedRevision: snapshot.program.revision,
        expectedExperimentVersion: snapshot.execution.version,
        expectedDraftVersion: snapshot.draft.version,
        target: 'workspace' as const,
        purpose: 'Explore the approved lesson representation',
        action,
      });
      let workspaceSnapshot = openedWorkspace.snapshot;
      for (const action of [
        { type: 'isolate', entityId: workspaceSnapshot.program.entities[0]!.id } as const,
        { type: 'switch_representation', viewIds: workspaceSnapshot.program.views.slice(0, 2).map(view => view.id) } as const,
        { type: 'annotate', text: 'Keep the source-bound diagram notes.' } as const,
        { type: 'interrupt', mode: 'freeze', beat: 0, offset: 20 } as const,
      ]) {
        const result = await workspace.command(f.student, f.sessionId, diagram.id,
          workspaceCommand(workspaceSnapshot, action));
        expect(result.status).toBe('available');
        if (result.status !== 'available') throw new Error(`PETROS_FULL_JOURNEY_WORKSPACE_${action.type}_FAILED`);
        workspaceSnapshot = result.snapshot;
      }
      const interruptedWorkspace = await workspace.read(f.student, f.sessionId, diagram.id);
      expect(interruptedWorkspace).toMatchObject({ status: 'available', snapshot: {
        program: { programId: diagram.id, source: simulation.binding },
        draft: { text: 'Keep the source-bound diagram notes.', version: 1 },
        teaching: { interrupted: true, mode: 'freeze' },
      } });
      const resumedWorkspace = await workspace.command(f.student, f.sessionId, diagram.id,
        workspaceCommand(workspaceSnapshot, { type: 'resume' }));
      expect(resumedWorkspace).toMatchObject({ status: 'available', snapshot: {
        draft: { text: 'Keep the source-bound diagram notes.', version: 1 },
        teaching: { interrupted: false },
      } });
      if (resumedWorkspace.status !== 'available') throw new Error('PETROS_FULL_JOURNEY_WORKSPACE_RESUME_FAILED');
      const evidenceAfterWorkspace = await evidence.readCurrentEvidence(f.student, f.sessionId, {
        packId: f.candidate.pack.id, packVersion: f.candidate.pack.version,
      });
      expect(evidenceAfterWorkspace.events).toEqual(evidenceBeforeWorkspace.events);
      expect(evidenceAfterWorkspace.projection).toEqual(evidenceBeforeWorkspace.projection);
      expect(await projectile.read(f.student, f.sessionId, diagram.id)).toMatchObject({
        status: 'available', snapshot: { version: 2, state: {
          phase: 'flight', position: { x: 10, y: 5, unit: 'm' },
          velocity: { x: 10, y: 0, unit: 'm/s' },
        } },
      });
      const cancelled: PetrosProjectileCommand = {
        ...initialise, operationId: randomUUID(), expectedVersion: 2,
        action: { kind: 'parameter', change: { parameter: 'gravity', value: 5, unit: 'm/s^2' } },
      };
      expect(await projectile.cancel(f.student, f.sessionId, diagram.id, cancelled))
        .toEqual({ status: 'cancelled', operationId: cancelled.operationId });
      expect(await projectile.command(f.student, f.sessionId, diagram.id, cancelled))
        .toEqual({ status: 'cancelled', operationId: cancelled.operationId });
      await complete();

      // This is the pack's independently reviewed unseen transfer assessment, not the workspace's
      // exploratory future-output forecast. Only this authored numeric rubric can project evidence.
      const transfer = (await next()).blocks.at(-1)!;
      expect(transfer.questions[0]!.prompt).toContain('6 m/s');
      await answer(transfer, '12 m');
      await complete();
      const synthesis = (await next()).blocks.at(-1)!;
      expect(synthesis.content.type).toBe('synthesis');

      const currentEvidence = await evidence.readCurrentEvidence(f.student, f.sessionId, {
        packId: f.candidate.pack.id, packVersion: f.candidate.pack.version,
      });
      expect(currentEvidence.events).toHaveLength(3);
      const eligibleTransfer = currentEvidence.events.filter((item) =>
        item.event.task.unseenContext && item.classification.projectionEligible &&
        item.event.assessment.result.kind === 'objective' &&
        item.event.assessment.result.judgment.status === 'evaluated' &&
        item.event.assessment.result.judgment.outcome === 'correct');
      expect(eligibleTransfer).toHaveLength(1);
      expect(eligibleTransfer[0]!.event).toMatchObject({
        owner: { institutionId: f.institutionId, studentId: f.student.studentId },
        sessionId: f.sessionId, objective: f.candidate.objective,
        task: { id: 'transfer', variant: 'b', unseenContext: true },
        rubric: { id: f.candidate.rubric.id, version: f.candidate.rubric.version },
        pack: f.candidate.pack, sourceVersion: f.extraction.version.fingerprint,
        response: { modality: 'written', workId: null, revisionId: null },
        assessment: { result: { kind: 'objective', judgment: { status: 'evaluated', outcome: 'correct' },
          provenance: { uncertainty: 'low' } } },
      });
      expect(eligibleTransfer[0]!.classification).toMatchObject({
        observation: 'petros_unassisted', externalAssistance: 'unknown',
        petrosAssistance: 'none_observed', projectionEligible: true,
      });
      await complete();
      const artifactBlock = (await next()).blocks.at(-1)!;
      expect(artifactBlock.content.type).toBe('artifact_commit');

      const note = petrosNoteContentSchema.parse({
        kind: 'note', title: 'Projectile component explanation',
        body: 'Both components are zero at the apex.', tags: ['projectile'],
      });
      const card = petrosFlashcardContentSchema.parse({
        kind: 'flashcard', title: 'Projectile apex components',
        front: 'Which velocity component is zero at the apex?',
        back: 'Vertical velocity is zero while horizontal velocity remains constant.',
        tags: ['projectile'],
      });
      const savedNote = await f.owned(() => artifacts.saveBlockArtifact(
        f.student, f.sessionId, artifactBlock.id, { idempotencyKey: randomUUID(), content: note },
      ));
      const savedCard = await f.owned(() => artifacts.saveBlockArtifact(
        f.student, f.sessionId, artifactBlock.id, { idempotencyKey: randomUUID(), content: card },
      ));
      expect(savedCard.dueAt).not.toBeNull();
      expect(await f.owned(() => learningArtifacts.resume(f.student, savedCard.id))).toMatchObject({
        status: 'available', objective: f.candidate.objective,
        currentEvidence: { observedResponses: 3, demonstratedApplications: 1,
          externalAssistance: 'unknown', coverageIsEvidence: false },
        masteryProjectionEligible: false,
      });
      const delayedAt = new Date(Date.parse(savedCard.dueAt!) + 1_000);
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(delayedAt);
        expect(await f.owned(() => artifacts.due(f.student, 10))).toMatchObject({
          cards: [{ artifact: { id: savedCard.id, dueAt: savedCard.dueAt } }],
        });
        const reviewInput = {
          clientReviewId: randomUUID(), grade: 'good' as const, confidence: 'sure' as const,
          reviewedAt: delayedAt.toISOString(), elapsedMs: 1_200, timezone: 'Asia/Kolkata',
        };
        const delayedReview = await f.owned(() => artifacts.review(f.student, savedCard.id, reviewInput));
        expect(delayedReview).toMatchObject({ duplicate: false });
        expect(delayedReview.nextDueAt).not.toBe(savedCard.dueAt);
        expect(await f.owned(() => artifacts.review(f.student, savedCard.id, reviewInput)))
          .toMatchObject({ duplicate: true, outcomeId: delayedReview.outcomeId });
        const [storedReview] = await f.admin.select().from(schema.petrosArtifactReviewOutcomes)
          .where(eq(schema.petrosArtifactReviewOutcomes.id, delayedReview.outcomeId));
        expect(storedReview?.reviewedAt.toISOString()).toBe(delayedAt.toISOString());
        expect(await f.owned(() => learningArtifacts.resume(f.student, savedCard.id))).toMatchObject({
          status: 'available', reviewMeaning: 'self_reported_artifact_recall',
          currentEvidence: { observedResponses: 3, demonstratedApplications: 1,
            externalAssistance: 'unknown', coverageIsEvidence: false },
          masteryProjectionEligible: false,
        });
      } finally {
        vi.useRealTimers();
      }

      const firstTask = f.candidate.assessments[0]!;
      const draftCommand = {
        schemaVersion: 'petros.qualitative-review.v1', commandId: randomUUID(),
        artifactId: savedNote.id, expectedRevision: 1, sessionId: f.sessionId,
        courseId: f.course.id, objective: f.candidate.objective, pack: f.candidate.pack,
        task: { id: firstTask.id, variant: firstTask.variant },
      };
      const draftRequest = await qualitative.requestDraftFeedback(f.student, draftCommand);
      expect(await qualitative.draftStatus(f.student, draftRequest.request.submissionId))
        .toMatchObject({ status: 'pending' });
      const criterionId = f.candidate.rubric.criteria[0]!.id;
      const draftFeedback = await f.institution(() => qualitative.draftFeedback(f.principal, {
        schemaVersion: 'petros.qualitative-review.v1', commandId: randomUUID(),
        requestId: draftRequest.request.submissionId,
        qualificationId: f.qualificationId, expectedQualificationVersion: 1,
        reason: 'Revise the explanation to distinguish horizontal and vertical velocity.',
        productFeedback: [{ criterionId,
          observation: { status: 'observed', spans: [{ start: 0, end: 20 }] },
          feedback: 'State which component gravity changes.', uncertainty: 'low' }],
      }));
      const revisedNote = {
        ...note,
        body: 'At the apex, vertical velocity is zero while horizontal velocity remains constant.',
      };
      await f.owned(() => artifacts.updateSaved(
        f.student, savedNote.id, { expectedRevision: 1, content: revisedNote },
      ));
      const submission = await qualitative.submit(f.student, {
        ...draftCommand, commandId: randomUUID(), expectedRevision: 2,
        draftFeedbackId: draftFeedback.feedback.id, shareLearningProvenance: true,
      });
      expect(await qualitative.current(f.student, submission.submissionId)).toMatchObject({
        status: 'unavailable', reason: 'review_pending', evidenceAdmission: 'not_granted',
        numericProjection: false,
      });
      const qualitativeApproval = await f.institution(() => qualitative.review(f.principal, {
        schemaVersion: 'petros.qualitative-review.v1', commandId: randomUUID(),
        submissionId: submission.submissionId,
        qualificationId: f.qualificationId, expectedQualificationVersion: 1,
        decision: 'approved', reason: 'The submitted revision now makes the distinction explicit.',
        productFeedback: [{ criterionId,
          observation: { status: 'observed', spans: [{ start: 0, end: 20 }] },
          feedback: 'The revision distinguishes the two components.', uncertainty: 'low' }],
      }));
      expect(qualitativeApproval).toMatchObject({
        receipt: { decision: 'approved', work: { revision: 2 } },
        evidenceAdmission: 'not_granted', numericProjection: false,
      });
      expect(await qualitative.current(f.student, submission.submissionId)).toMatchObject({
        status: 'valid_approval', evidenceAdmission: 'not_granted', numericProjection: false,
      });
      const inspection = await f.institution(() => qualitative.inspect(f.principal, submission.submissionId));
      expect(inspection).toMatchObject({
        reviewStatus: 'approved', provenance: { status: 'shared' },
        evidenceAdmission: 'not_granted', numericProjection: false,
      });
      const inspectionJson = JSON.stringify(inspection);
      for (const privateField of ['rawAnswer', 'answerKey', 'chainOfThought', 'privateHistory'])
        expect(inspectionJson).not.toContain(privateField);

      const originalSession = (await f.admin.select().from(schema.petrosLearningSessions)
        .where(eq(schema.petrosLearningSessions.id, f.sessionId)))[0]!;
      const createFollowupSession = async (sessionId: string, prefix: string, maxMoves: number) => {
        const followupCheckpoints = Array.from({ length: maxMoves }, (_, index) => ({
          id: `${prefix}-${index + 1}`, label: `${prefix} ${index + 1}`,
          status: index === 0 ? 'current' as const : 'pending' as const,
        }));
        await f.admin.insert(schema.petrosLearningSessions).values({
          id: sessionId, institutionId: f.institutionId, studentId: f.student.studentId,
          clientRequestId: randomUUID(), stateVersion: originalSession.stateVersion,
          sessionType: originalSession.sessionType, topic: originalSession.topic,
          currentGoal: originalSession.currentGoal, timeBudgetSeconds: 600, maxMoves,
          checkpoints: followupCheckpoints, currentCheckpointId: followupCheckpoints[0]!.id,
          learnerContext: originalSession.learnerContext, topicContext: originalSession.topicContext,
          resolvedTopicProfile: originalSession.resolvedTopicProfile,
          sourceContext: originalSession.sourceContext, promptVersion: originalSession.promptVersion,
          outputSchemaVersion: originalSession.outputSchemaVersion,
        });
        await f.owned(() => adaptive.bind(f.student, sessionId, {
          commandId: randomUUID(), pack: f.candidate.pack,
        }));
      };

      // Task selection is student-wide for this reviewed pack. A new session receives only the
      // unexposed reviewed item, and its wrong response remains tentative without a discriminator.
      const freshSessionId = randomUUID();
      await createFollowupSession(freshSessionId, 'fresh', 4);
      expect((await next(freshSessionId)).blocks.at(-1)!.content.type).toBe('layered_explanation');
      await complete(freshSessionId);
      const freshCheck = (await next(freshSessionId)).blocks.at(-1)!;
      expect(freshCheck.questions[0]!.prompt).toContain('remains unchanged');
      const freshDecision = (await f.admin.select().from(schema.petrosPlanningDecisions)
        .where(eq(schema.petrosPlanningDecisions.id, freshCheck.decisionId)))[0]!;
      expect(freshDecision.adaptiveSnapshot).toMatchObject({
        input: { availableTasks: [{ id: 'cross-session-check', variant: 'fresh-after-prior-exposure' }] },
        output: { selectedTask: { id: 'cross-session-check', variant: 'fresh-after-prior-exposure' } },
      });
      await answer(freshCheck, 'vertical', freshSessionId);
      await complete(freshSessionId);
      const tentativeIntervention = (await next(freshSessionId)).blocks.at(-1)!;
      expect(tentativeIntervention.content.type).toBe('contrast_case');
      const tentativeDecision = (await f.admin.select().from(schema.petrosPlanningDecisions)
        .where(eq(schema.petrosPlanningDecisions.id, tentativeIntervention.decisionId)))[0]!;
      expect(tentativeDecision.adaptiveSnapshot).toMatchObject({
        input: { signal: { kind: 'wrong_confident' } },
        output: { decision: { reason: 'confident_error', diagnosis: 'tentative' } },
      });

      // A directly seeded equivalent of the reviewed transfer task remains a repeat in another
      // session even though the pack marks its original context unseen.
      const repeatedSessionId = randomUUID();
      await createFollowupSession(repeatedSessionId, 'repeat', 2);
      const transferQuestion = (await f.admin.select().from(schema.petrosQuestionSpecs)
        .where(eq(schema.petrosQuestionSpecs.id, transfer.questions[0]!.id)))[0]!;
      const repeatedDecisionId = randomUUID();
      const repeatedBlockId = randomUUID();
      const repeatedQuestionId = randomUUID();
      await f.admin.insert(schema.petrosPlanningDecisions).values({
        id: repeatedDecisionId, sessionId: repeatedSessionId, institutionId: f.institutionId,
        studentId: f.student.studentId, sequence: 1, selectedMoveType: 'recall_check',
        targetConcept: f.candidate.objective.id, studentSafeReason: 'Repeat classification check',
        decisionFactors: [], moveParameters: {}, expectedEvidence: 'new_independent_item',
        progressEffect: {}, termination: {}, guessFirst: {}, observationResponse: {},
        source: 'deterministic_fallback', functionKey: 'synthetic', promptVersion: 'synthetic',
        schemaVersion: 'synthetic', correlationId: randomUUID(),
      });
      await f.admin.insert(schema.petrosTeachingBlocks).values({
        id: repeatedBlockId, sessionId: repeatedSessionId, decisionId: repeatedDecisionId,
        institutionId: f.institutionId, studentId: f.student.studentId, sequence: 1,
        type: 'recall_check', content: transfer.content, interactionState: transfer.interactionState,
        delivery: 'deterministic_fallback', functionKey: 'synthetic', promptVersion: 'synthetic',
        schemaVersion: 'synthetic', correlationId: randomUUID(),
      });
      await f.admin.insert(schema.petrosQuestionSpecs).values({
        id: repeatedQuestionId, sessionId: repeatedSessionId, blockId: repeatedBlockId,
        institutionId: f.institutionId, studentId: f.student.studentId,
        rootQuestionId: repeatedQuestionId, parentQuestionId: null,
        targetId: transferQuestion.targetId, equivalenceKey: transferQuestion.equivalenceKey,
        learningTask: transferQuestion.learningTask, prompt: transferQuestion.prompt,
        responseType: transferQuestion.responseType, choices: transferQuestion.choices,
        purpose: transferQuestion.purpose, evaluationMode: transferQuestion.evaluationMode,
        acceptableAnswers: transferQuestion.acceptableAnswers,
        correctChoiceId: transferQuestion.correctChoiceId, rubric: transferQuestion.rubric,
        hint: transferQuestion.hint, missingStep: transferQuestion.missingStep,
        workedSolution: transferQuestion.workedSolution, rewordedPrompt: transferQuestion.rewordedPrompt,
        attemptOrdinal: 1, active: true,
      });
      await f.owned(() => loop.submitAnswer(f.student, repeatedSessionId, repeatedBlockId, {
        idempotencyKey: randomUUID(), expectedBlockVersion: 0,
        questionId: repeatedQuestionId, answer: '12 m', confidence: 'sure',
      }));
      const repeatedEvidence = await evidence.readCurrentEvidence(f.student, repeatedSessionId, {
        packId: f.candidate.pack.id, packVersion: f.candidate.pack.version,
      });
      expect(repeatedEvidence.events).toHaveLength(1);
      expect(repeatedEvidence.events[0]).toMatchObject({
        event: { task: { id: 'transfer', unseenContext: true } },
        classification: { observation: 'repeated', projectionEligible: false },
      });

      const visualEvents = await f.admin.select().from(schema.petrosSessionEvents).where(and(
        eq(schema.petrosSessionEvents.sessionId, f.sessionId),
        eq(schema.petrosSessionEvents.type, 'visual.projectile_command'),
      )).orderBy(asc(schema.petrosSessionEvents.createdAt));
      expect(visualEvents).toHaveLength(3);
      expect(visualEvents.every((event) => event.payload.learningEvidenceCreated === false)).toBe(true);
      expect(provider.execute).not.toHaveBeenCalled();
      // Capture replayable synthetic identities without source text, learner work or private reasoning.
      const auditIds = await f.admin.select({ id: schema.auditEvents.id }).from(schema.auditEvents)
        .where(eq(schema.auditEvents.institutionId, f.institutionId));
      console.info('PETROS_PHASE2_SYNTHETIC_IDS', JSON.stringify({
        institutionId: f.institutionId, studentId: f.student.studentId, courseId: f.course.id,
        sessionId: f.sessionId, sourceId: f.source.id, sourceVersion: f.extraction.version.fingerprint,
        objective: f.candidate.objective, pack: f.candidate.pack, rubricVersion: f.candidate.rubric.version,
        packCandidateId: f.compiled.candidateId, qualificationId: f.qualificationId,
        simulationOperationIds: [initialise.operationId, apex.operationId, cancelled.operationId],
        evidenceEventIds: currentEvidence.events.map((item) => item.event.eventId),
        savedArtifactIds: [savedNote.id, savedCard.id], scheduledAt: savedCard.dueAt,
        simulatedReviewAt: delayedAt.toISOString(), submissionId: submission.submissionId,
        draftFeedbackId: draftFeedback.feedback.id, auditIds: auditIds.map((row) => row.id),
        providerCalls: provider.execute.mock.calls.length,
      }));
    }, 90_000);
  },
);
