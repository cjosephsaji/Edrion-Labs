import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, runInStudentTenant, schema } from '@edrion/database';
import { petrosConceptPackCandidateSchema } from '@edrion/schemas';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosCohortEvidenceAuthority } from '../petros-institutional/petros-cohort-evidence-authority';
import { PetrosObjectiveEvidenceRepository } from '../petros-learner-model/petros-objective-evidence.repository';
import { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { publishKnowledgeExtraction } from '../student/knowledge/knowledge-document.service';
import { documentPageCitation } from '../student/petros-session-intent/petros-document-source';
import { phase4EvidenceAttempt } from './petros-phase4-evidence-fixture';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase4 canonical institutional cohort evidence / isolated PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });

  it('counts accepted current attempts and successes, then suppresses on tighter live policy and roster removal', async () => {
    const f = await phase2AuthorityFixture(database);
    const env: typeof f.env & { PETROS_CONTINUITY_ENABLED: boolean } = { ...f.env, PETROS_CONTINUITY_ENABLED: true };
    await f.qualify();
    await f.approve();
    const yearId = randomUUID();
    const gradeId = randomUUID();
    const classId = randomUUID();
    await f.admin.insert(schema.academicYears).values({ id: yearId, institutionId: f.institutionId,
      name: 'Synthetic current year', startDate: '2026-01-01', endDate: '2030-12-31', status: 'active', isCurrent: true });
    await f.admin.insert(schema.gradeLevels).values({ id: gradeId, institutionId: f.institutionId, name: 'Synthetic cohort' });
    await f.admin.insert(schema.classes).values({ id: classId, institutionId: f.institutionId,
      academicYearId: yearId, gradeLevelId: gradeId, name: 'Synthetic cohort' });
    await f.admin.insert(schema.classSubjectTeachers).values({ institutionId: f.institutionId,
      classId, subjectId: f.subjectId, teacherId: f.teacherId });
    await f.admin.update(schema.students).set({ classId, status: 'enrolled' }).where(eq(schema.students.id, f.student.studentId));
    const cohortPeers: Array<{ studentId: string; institutionUserId: string }> = [];
    for (let i = 0; i < 4; i += 1) {
      const peerUserId = randomUUID();
      await f.admin.insert(schema.institutionUsers).values({ id: peerUserId, institutionId: f.institutionId,
        fullName: `Synthetic peer ${i}`, email: `${peerUserId}@example.test`, status: 'active' });
      await f.admin.insert(schema.institutionUserRoles).values({ institutionUserId: peerUserId, roleKey: 'student' });
      const [peer] = await f.admin.insert(schema.students).values({ institutionId: f.institutionId, classId,
        institutionUserId: peerUserId, status: 'enrolled', admissionNo: randomUUID(), firstName: 'Synthetic', lastName: `Peer ${i}` }).returning();
      await f.admin.insert(schema.courseEnrollments).values({ institutionId: f.institutionId, studentId: peer!.id, courseId: f.course.id });
      cohortPeers.push({ studentId: peer!.id, institutionUserId: peerUserId });
    }
    const config = defaultInstitutionPolicy();
    config.classSignals.enabled = true;
    config.classSignals.minimumCohortSize = 5;
    config.classSignals.minimumIndependentEvidence = 2;
    await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({ institutionId: f.institutionId,
      scopeLevel: 'institution', version: 1, status: 'published', schemaVersion: 'petros.institutional-policy.v1', config,
      reason: 'Explicit synthetic cohort evidence authority', authorId: f.teacherUserId,
      effectiveFrom: new Date(0), publishedAt: new Date() });

    const policyOwner = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
      { execute: vi.fn(() => { throw new Error('No provider calls'); }) } as never, database.auditWriter, env as never);
    const auth = new StudentAuthService(database.db, database.auditWriter, env as never, {} as never, {} as never, {} as never);
    const surfaces = { isPortalEnabled: async () => true };
    const objectiveEvidence = new PetrosObjectiveEvidenceService(database.db, env as never, database.auditWriter,
      new PetrosObjectiveEvidenceRepository(database.db), f.packs, policyOwner, auth, surfaces as never);
    const adaptive = new PetrosAdaptiveService(database.db, env as never, database.auditWriter, auth, surfaces as never,
      f.packs, policyOwner);
    await f.owned(() => adaptive.bind(f.student, f.sessionId, { commandId: randomUUID(), pack: f.candidate.pack }));
    const currentPolicy = await f.owned(() => policyOwner.documentKnowledgePolicy(f.student, f.sessionId));
    const appendAttempt = phase4EvidenceAttempt(f,adaptive,objectiveEvidence,currentPolicy);

    const wrong = await appendAttempt('17 m');
    const secondSessionId = randomUUID();
    await f.admin.insert(schema.petrosLearningSessions).values({ id: secondSessionId, institutionId: f.institutionId,
      studentId: f.student.studentId, clientRequestId: randomUUID(), stateVersion: 'petros.session-state.v3', sessionType: 'learn',
      topic: 'Synthetic projectile retry', currentGoal: 'Compare vertical and horizontal motion.', timeBudgetSeconds: 600, maxMoves: 8,
      checkpoints: [], currentCheckpointId: 'synthetic-second-session', promptVersion: 'synthetic', outputSchemaVersion: 'synthetic',
      sourceContext: { door: 'uploaded_document', referenceId: f.source.id, sourceFingerprint: f.extraction.version.fingerprint,
        citations: [f.citation] } });
    await f.owned(() => adaptive.bind(f.student, secondSessionId, { commandId: randomUUID(), pack: f.candidate.pack }));
    const correct = await appendAttempt('vertical', secondSessionId, 0);
    expect(wrong.classification.projectionEligible).toBe(true);
    expect(correct.classification.projectionEligible).toBe(true);

    const peerSourceText = 'Under uniform gravity with no drag, horizontal velocity remains constant. Vertical velocity decreases by gravity times elapsed time. At the apex vertical velocity is zero. Level-ground landing returns vertical position to zero.';
    for (const peer of cohortPeers) {
      const [peerSource] = await f.admin.insert(schema.knowledgeItems).values({ institutionId: f.institutionId,
        studentId: peer.studentId, kind: f.source.kind, title: f.source.title, objectIds: [f.object.id], origin: f.source.origin,
        pageCount: 1, pagesDone: 1, extractedTextReady: true, status: 'ready' }).returning();
      const peerExtraction = await f.admin.transaction((tx) => publishKnowledgeExtraction(tx, peerSource!, [peerSourceText]));
      const peerPrincipal = await f.institution(() => auth.resolveInstitutionalWorker(peer.institutionUserId));
      const peerDocument = await runInStudentTenant(database.db, peerPrincipal, () => f.knowledge.resolve(peerPrincipal, peerSource!.id));
      const peerCitation = documentPageCitation(peerDocument.item, peerDocument.allPages[0]!, peerExtraction.version.fingerprint, 'Source');
      const peerCandidateInput = structuredClone(f.candidate);
      peerCandidateInput.pack.id = randomUUID();
      peerCandidateInput.sourceVersion = peerExtraction.version.fingerprint;
      for (const entries of [peerCandidateInput.claims, peerCandidateInput.concepts, peerCandidateInput.prerequisites,
        peerCandidateInput.examples, peerCandidateInput.misconceptions, peerCandidateInput.assessments].filter(Boolean)) {
        if (!entries) continue;
        for (const entry of entries) for (const anchor of entry.anchors) anchor.locator = peerCitation.locator;
      }
      const peerCandidate = petrosConceptPackCandidateSchema.parse(peerCandidateInput);
      const peerCompileCommand: typeof f.compileCommand = { schemaVersion: 'petros.teaching-pack-compile.v1', commandId: randomUUID(),
        courseId: f.course.id as typeof f.compileCommand.courseId, sourceItemId: peerSource!.id as typeof f.compileCommand.sourceItemId,
        candidate: peerCandidate };
      const peerCompiled = await f.institution(() => f.packs.compile(f.ctx, peerCompileCommand));
      const peerReviewCommand = { ...f.reviewCommand, commandId: randomUUID(), expectedPayloadHash: peerCompiled.payloadHash };
      await f.institution(() => f.packs.review(f.ctx, peerCompiled.candidateId, peerReviewCommand));
      const peerSessionId = randomUUID();
      await f.admin.insert(schema.petrosLearningSessions).values({ id: peerSessionId, institutionId: f.institutionId,
        studentId: peer.studentId, clientRequestId: randomUUID(), stateVersion: 'petros.session-state.v3', sessionType: 'learn',
        topic: 'Synthetic peer projectile', currentGoal: 'Compare vertical and horizontal motion.', timeBudgetSeconds: 600, maxMoves: 8,
        checkpoints: [], currentCheckpointId: `peer-${peer.studentId}`, promptVersion: 'synthetic', outputSchemaVersion: 'synthetic',
        sourceContext: { door: 'uploaded_document', referenceId: peerSource!.id, sourceFingerprint: peerExtraction.version.fingerprint,
          citations: [peerCitation] } });
      const peerOwned = <T>(work: () => Promise<T>) => runInStudentTenant(database.db, peerPrincipal, work);
      const peerFixture = { ...f, student: peerPrincipal, sessionId: peerSessionId,
        source: peerSource!, extraction: peerExtraction, citation: peerCitation, candidate: peerCandidate,
        compileCommand: peerCompileCommand, compiled: peerCompiled, reviewCommand: peerReviewCommand, owned: peerOwned };
      await peerOwned(() => adaptive.bind(peerPrincipal, peerSessionId, { commandId: randomUUID(), pack: peerCandidate.pack }));
      const peerPolicy = await peerOwned(() => policyOwner.documentKnowledgePolicy(peerPrincipal, peerSessionId));
      const appendPeerAttempt = phase4EvidenceAttempt(peerFixture, adaptive, objectiveEvidence, peerPolicy);
      const peerResult = await appendPeerAttempt('17 m');
      expect(peerResult.classification.projectionEligible).toBe(true);
    }

    const evidence = new PetrosCohortEvidenceAuthority(database.db, auth, f.knowledge, f.packs);
    const service = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
      { execute: vi.fn(() => { throw new Error('No provider calls'); }) } as never, database.auditWriter, env as never,
      undefined, evidence);
    const initial = await f.institution(() => service.refreshSignals(f.ctx, classId, f.subjectId));
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ classId, subjectId: f.subjectId, suppressed: false, cohortSize: 5, evidenceCount: 5,
      uncertaintyBasisPoints: 5_000 });
    const [stored] = await f.admin.select().from(schema.petrosClassStruggleSignals)
      .where(and(eq(schema.petrosClassStruggleSignals.institutionId, f.institutionId), eq(schema.petrosClassStruggleSignals.classId, classId)));
    expect(stored).toMatchObject({ eligibleCount: 5, evidenceCoveredCount: 5, independentAttemptCount: 6,
      affectedLearnerCount: 5, successfulAttemptCount: 1 });
    const visible = await f.institution(() => service.teacherSignals(f.ctx));
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ classId, subjectId: f.subjectId, suppressed: false, cohortSize: 5,
      eligibleCount: 5, evidenceCoveredCount: 5, independentAttemptCount: 6, affectedLearnerCount: 5,
      successfulAttemptCount: 1, evidenceCount: 6, uncertaintyBasisPoints: 5_000 });
    expect(visible[0]!.evidenceVersions).toMatchObject({
      source: expect.arrayContaining(cohortPeers.map(() => expect.any(String))),
      rubric: ['1'], evaluator: [f.candidate.compilerVersion],
    });
    const visibleJson = JSON.stringify(visible);
    expect(visibleJson).not.toMatch(new RegExp(f.student.studentId));
    for (const peer of cohortPeers) expect(visibleJson).not.toMatch(new RegExp(peer.studentId));
    expect(visibleJson).not.toMatch(/17 m|12 m|vertical/);

    const stricter = structuredClone(config);
    stricter.classSignals.minimumCohortSize = 6;
    await f.admin.update(schema.petrosInstitutionPolicyVersions).set({ config: stricter })
      .where(eq(schema.petrosInstitutionPolicyVersions.institutionId, f.institutionId));
    const current = await f.institution(() => service.teacherSignals(f.ctx));
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ suppressed: true, cohortSize: null, eligibleCount: null, evidenceCoveredCount: null,
      independentAttemptCount: null, affectedLearnerCount: null, successfulAttemptCount: null, evidenceCount: 0 });
    expect(JSON.stringify(current)).not.toMatch(new RegExp(f.student.studentId));
    expect(JSON.stringify(current)).not.toMatch(/17 m|12 m/);
    expect(current[0]).toMatchObject({ evidenceVersions: null, exclusions: null });

    await f.admin.update(schema.students).set({ status: 'left' }).where(eq(schema.students.id, f.student.studentId));
    const removed = await f.institution(() => service.teacherSignals(f.ctx));
    expect(removed[0]).toMatchObject({ suppressed: true, eligibleCount: null, evidenceCoveredCount: null, evidenceCount: 0 });
    const beforeDisabledCalls = await f.admin.select().from(schema.petrosClassStruggleSignals)
      .where(and(eq(schema.petrosClassStruggleSignals.institutionId, f.institutionId), eq(schema.petrosClassStruggleSignals.classId, classId)));
    env.PETROS_CONTINUITY_ENABLED = false;
    await expect(f.institution(() => service.teacherSignals(f.ctx))).rejects.toThrow();
    await expect(f.institution(() => service.refreshSignals(f.ctx, classId, f.subjectId))).rejects.toThrow();
    const afterDisabledCalls = await f.admin.select().from(schema.petrosClassStruggleSignals)
      .where(and(eq(schema.petrosClassStruggleSignals.institutionId, f.institutionId), eq(schema.petrosClassStruggleSignals.classId, classId)));
    expect(afterDisabledCalls).toEqual(beforeDisabledCalls);
  });
});
