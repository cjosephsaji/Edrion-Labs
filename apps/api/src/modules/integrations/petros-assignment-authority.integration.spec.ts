import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, schema } from '@edrion/database';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PortalAuthService } from '../portal/portal-auth.service';
import { PetrosAssignmentLearningService } from '../portal/petros-assignment-learning.service';
import { phase2AuthorityFixture, type Phase2CandidateConfigurator } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

/**
 * Uses real assignment, S9 policy, source/curriculum, portal-principal and pack-review owners.
 * The only controlled adapter is a provider that throws if this deterministic flow calls it.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Phase 2 assignment release current authority',
  () => {
    let database: Phase2TestDatabase;
    beforeAll(async () => { database = await startPhase2TestDatabase(); });
    afterAll(async () => { await database?.close(); });

    async function setup(kind: 'document' | 'objective' = 'objective', configure?: Phase2CandidateConfigurator) {
      const f = await phase2AuthorityFixture(database, configure);
      await f.qualify();
      await f.approve();
      const approved = await f.current();

      const [year] = await f.admin.insert(schema.academicYears).values({
        institutionId: f.institutionId,
        name: `Synthetic ${randomUUID()}`,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'active',
      }).returning();
      const [grade] = await f.admin.insert(schema.gradeLevels).values({
        institutionId: f.institutionId,
        name: `Synthetic ${randomUUID()}`,
      }).returning();
      const [klass] = await f.admin.insert(schema.classes).values({
        institutionId: f.institutionId,
        academicYearId: year!.id,
        gradeLevelId: grade!.id,
        name: 'Synthetic authority class',
        classTeacherId: f.teacherId,
      }).returning();
      await f.admin.update(schema.students).set({ classId: klass!.id })
        .where(eq(schema.students.id, f.student.studentId));

      const [assignment] = await f.admin.insert(schema.assignments).values({
        institutionId: f.institutionId,
        classId: klass!.id,
        academicYearId: year!.id,
        courseId: f.course.id,
        subjectId: f.subjectId,
        teacherId: f.teacherId,
        title: 'Synthetic reviewed learning release',
        status: 'published',
        aiPolicy: 'full',
        audience: [{ kind: 'student', refId: f.student.studentId }],
      }).returning();
      await f.admin.insert(schema.assignmentAssignees).values({
        assignmentId: assignment!.id,
        studentId: f.student.studentId,
      });
      const [session] = await f.admin.select().from(schema.petrosLearningSessions)
        .where(eq(schema.petrosLearningSessions.id, f.sessionId)).limit(1);
      await f.admin.update(schema.petrosLearningSessions).set({
        sourceContext: {
          ...session!.sourceContext,
          assignmentContext: { assignmentId: assignment!.id },
        },
      }).where(eq(schema.petrosLearningSessions.id, f.sessionId));

      const provider = { execute: vi.fn(() => { throw new Error('Provider must not be called'); }) };
      const policies = new PetrosInstitutionalService(
        new PetrosInstitutionalRepository(database.db),
        provider as never,
        database.auditWriter,
        f.env as never,
      );
      const auth = new PortalAuthService(database.db, f.env as never);
      const service = new PetrosAssignmentLearningService(
        database.db,
        f.env as never,
        database.auditWriter,
        auth,
        f.packs,
        policies,
      );
      const source = {
        sessionId: f.sessionId,
        sourceVersion: f.candidate.sourceVersion,
        locators: approved.trustedContext.resolvedAnchors.map(anchor => anchor.locator),
      };
      const target = kind === 'document'
        ? { kind, courseId: f.course.id, source, pack: f.candidate.pack }
        : {
            kind,
            courseId: f.course.id,
            source,
            objective: f.candidate.objective,
            curriculumRevision: f.candidate.curriculumRevision,
            pack: f.candidate.pack,
          };
      const input = {
        schemaVersion: 'petros.assignment-learning-release.v1' as const,
        expectedAssignmentVersion: assignment!.version,
        target,
        policy: {
          assistance: 'guided_learning' as const,
          resourceMode: 'source_bound' as const,
          answerDisclosure: 'never' as const,
          evidenceRequirement: 'unseen_transfer' as const,
        },
        recipientContexts: [{ studentId: f.student.studentId, sessionId: f.sessionId }],
      };
      return { ...f, assignment: assignment!, service, policies, provider, input };
    }

    it('previews and publishes one exact objective through every current authority owner', async () => {
      const f = await setup();
      const preview = await f.service.preview(f.ctx, f.assignment.id, f.input);
      expect(preview).toMatchObject({
        assignment: { id: f.assignment.id, version: f.assignment.version, status: 'published' },
        target: { kind: 'objective', objective: f.candidate.objective,
          curriculumRevision: f.candidate.curriculumRevision },
        sourceSnapshot: { sessionId: f.sessionId, sourceVersion: f.extraction.version.fingerprint },
        packSnapshot: { candidateId: f.compiled.candidateId, candidate: { pack: f.candidate.pack },
          reviewReceipt: { decision: 'approved' } },
        curriculumSnapshot: { courseId: f.course.id, subjectKey: f.subjectId,
          revision: f.candidate.curriculumRevision },
        rubricSnapshot: f.candidate.rubric,
        evidenceSnapshot: { answerDisclosure: 'never', externalAssistance: 'unknown' },
        rolloutGates: { singleRecipientOnly: true, cohortPolicyApproved: false,
          productionPilotApproved: false },
      });
      const receipt = await f.service.commit(f.ctx, f.assignment.id, {
        schemaVersion: f.input.schemaVersion,
        commandId: randomUUID(),
        candidate: preview,
      });
      expect(receipt).toMatchObject({ assignmentId: f.assignment.id, state: 'released', replayed: false });
      const [recipient] = await f.admin.select().from(schema.petrosAssignmentLearningRecipients)
        .where(eq(schema.petrosAssignmentLearningRecipients.releaseId, receipt.releaseId));
      expect(recipient).toMatchObject({ studentId: f.student.studentId, sessionId: f.sessionId });
      const currentPolicy = await f.owned(() => f.policies.documentKnowledgePolicy(
        f.student,
        f.sessionId,
        'source_bound',
      ));
      expect(currentPolicy.authorityHash).toBe(preview.institutionalPolicySnapshot.authorityHash);
      expect(f.provider.execute).not.toHaveBeenCalled();
      expect((await f.admin.select().from(schema.assignments)
        .where(eq(schema.assignments.id, f.assignment.id)))[0]).toMatchObject({
        status: 'published',
        version: f.assignment.version,
        aiPolicy: 'full',
        audience: [{ kind: 'student', refId: f.student.studentId }],
      });
    }, 30_000);

    it('supports the bounded document target and denies an unowned journey target', async () => {
      const f = await setup('document');
      expect(await f.service.preview(f.ctx, f.assignment.id, f.input)).toMatchObject({
        target: { kind: 'document', courseId: f.course.id, pack: f.candidate.pack },
      });
      const journey = {
        ...f.input,
        target: {
          kind: 'journey' as const,
          courseId: f.course.id,
          source: f.input.target.source,
          objective: f.candidate.objective,
          curriculumRevision: f.candidate.curriculumRevision,
          pack: f.candidate.pack,
          journey: { id: randomUUID(), version: 1 },
        },
      };
      await expect(f.service.preview(f.ctx, f.assignment.id, journey)).rejects.toMatchObject({
        response: { code: 'PETROS_ASSIGNMENT_JOURNEY_AUTHORITY_UNAVAILABLE' },
      });
    }, 30_000);

    it('rejects partial locator publication and accepts only the complete reviewed pack scope', async () => {
      const f = await setup('objective', candidate => {
        candidate.claims![0]!.anchors[0]!.locator.end = 72;
      });
      expect(f.input.target.source.locators).toHaveLength(2);
      const narrow = structuredClone(f.input);
      narrow.target.source.locators = narrow.target.source.locators.slice(0, 1);
      await expect(f.service.preview(f.ctx, f.assignment.id, narrow)).rejects.toMatchObject({
        response: { code: 'PETROS_ASSIGNMENT_PARTIAL_PACK_SCOPE_UNSUPPORTED' },
      });
      expect(await f.admin.select().from(schema.petrosAssignmentLearningReleases)
        .where(eq(schema.petrosAssignmentLearningReleases.assignmentId, f.assignment.id))).toEqual([]);
      const candidate = await f.service.preview(f.ctx, f.assignment.id, f.input);
      await f.service.commit(f.ctx, f.assignment.id, {
        schemaVersion: f.input.schemaVersion, commandId: randomUUID(), candidate,
      });
      expect((await f.current()).candidate.pack).toEqual(f.candidate.pack);
      expect(f.provider.execute).not.toHaveBeenCalled();
    }, 30_000);

    it('fails closed on a previously stored partial or mismatched assignment target', async () => {
      for (const invalid of ['partial', 'objective', 'curriculum', 'session', 'course'] as const) {
        const f = await setup('objective', candidate => {
          candidate.claims![0]!.anchors[0]!.locator.end = 72;
        });
        const candidate = await f.service.preview(f.ctx, f.assignment.id, f.input);
        const target = structuredClone(candidate.target);
        if (invalid === 'partial') target.source.locators = target.source.locators.slice(0, 1);
        if (invalid === 'session') target.source.sessionId = randomUUID();
        if (invalid === 'course') target.courseId = randomUUID();
        if (target.kind === 'objective') {
          if (invalid === 'objective') target.objective.id = randomUUID();
          if (invalid === 'curriculum') target.curriculumRevision += 1;
        }
        // Administrative fixture represents an immutable release accepted by an older
        // writer. Runtime consumers must defend the boundary independently of preview.
        const releaseId = randomUUID();
        await f.admin.insert(schema.petrosAssignmentLearningReleases).values({
          id: releaseId, institutionId: f.institutionId, assignmentId: f.assignment.id,
          assignmentVersion: candidate.assignment.version, authorityHash: candidate.authorityHash,
          audienceHash: candidate.audienceSnapshot.hash, candidate, createdByUserId: f.teacherUserId,
        });
        await f.admin.insert(schema.petrosAssignmentLearningRecipients).values({
          id: randomUUID(), institutionId: f.institutionId, releaseId,
          studentId: f.student.studentId, sessionId: f.sessionId,
          eligibilitySnapshot: candidate.audienceSnapshot.recipients[0]!,
          binding: { schemaVersion: candidate.schemaVersion, assignmentId: f.assignment.id,
            assignmentVersion: candidate.assignment.version, courseId: f.course.id,
            courseVersion: candidate.curriculumSnapshot.courseVersion, target,
            authorityHash: candidate.authorityHash, policy: f.input.policy,
            institutionalPolicySnapshot: candidate.institutionalPolicySnapshot },
        });
        const response = { code: invalid === 'partial'
          ? 'PETROS_ASSIGNMENT_PARTIAL_PACK_SCOPE_UNSUPPORTED' : 'PETROS_ASSIGNMENT_TARGET_STALE' };
        await expect(f.current()).rejects.toMatchObject({ response });
        await expect(f.owned(() => f.packs.requireApprovedPackForResume(f.student, f.sessionId, {
          packId: f.candidate.pack.id, packVersion: f.candidate.pack.version,
        }))).rejects.toMatchObject({ response });
      }
    }, 60_000);

    it('rejects a commit candidate whose target was rebound to a different session', async () => {
      const f = await setup();
      const preview = await f.service.preview(f.ctx, f.assignment.id, f.input);
      await expect(f.service.commit(f.ctx, f.assignment.id, {
        schemaVersion: f.input.schemaVersion,
        commandId: randomUUID(),
        candidate: {
          ...preview,
          target: {
            ...preview.target,
            source: { ...preview.target.source, sessionId: randomUUID() },
          },
        },
      })).rejects.toMatchObject({ response: { code: 'PETROS_ASSIGNMENT_SESSION_MISMATCH' } });
      expect(await f.admin.select().from(schema.petrosAssignmentLearningReleases)
        .where(eq(schema.petrosAssignmentLearningReleases.assignmentId, f.assignment.id))).toEqual([]);
    }, 30_000);

    it('rejects revoked live permission, membership, source, and reviewer authority', async () => {
      const permission = await setup();
      await permission.admin.delete(schema.institutionUserRoles).where(and(
        eq(schema.institutionUserRoles.institutionUserId, permission.teacherUserId),
        eq(schema.institutionUserRoles.roleKey, 'institution_owner'),
      ));
      await expect(permission.service.preview(permission.ctx, permission.assignment.id, permission.input))
        .rejects.toBeTruthy();

      const membership = await setup();
      await membership.admin.delete(schema.courseEnrollments).where(and(
        eq(schema.courseEnrollments.institutionId, membership.institutionId),
        eq(schema.courseEnrollments.courseId, membership.course.id),
        eq(schema.courseEnrollments.studentId, membership.student.studentId),
      ));
      await expect(membership.service.preview(membership.ctx, membership.assignment.id, membership.input))
        .rejects.toMatchObject({ response: { code: 'PETROS_ASSIGNMENT_COURSE_CHANGED' } });

      const source = await setup();
      await source.admin.update(schema.knowledgeItems).set({ sourceRevokedAt: new Date() })
        .where(eq(schema.knowledgeItems.id, source.source.id));
      await expect(source.service.preview(source.ctx, source.assignment.id, source.input)).rejects.toBeTruthy();

      const reviewer = await setup();
      await reviewer.admin.insert(schema.petrosReviewerQualifications).values({
        id: reviewer.qualificationId,
        version: 2,
        institutionId: reviewer.institutionId,
        reviewerUserId: reviewer.teacherUserId,
        reviewerStaffId: reviewer.teacherId,
        subjectKey: reviewer.subjectId,
        status: 'revoked',
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2030-01-01'),
        evidenceKind: 'institution_record',
        evidenceHash: 'e'.repeat(64),
        recordedByUserId: reviewer.teacherUserId,
      });
      await expect(reviewer.service.preview(reviewer.ctx, reviewer.assignment.id, reviewer.input))
        .rejects.toBeTruthy();
    }, 60_000);

    it('rejects publication after current S9 policy changes from the reviewed preview', async () => {
      const f = await setup();
      const preview = await f.service.preview(f.ctx, f.assignment.id, f.input);
      const config = defaultInstitutionPolicy();
      config.syllabus.approvedSourceIds = [randomUUID()];
      const draft = await f.institution(() => f.policies.createDraft(f.ctx, {
        scope: { level: 'institution', campusId: null, programmeId: null, gradeId: null, subjectId: null },
        config,
        reason: 'Synthetic policy change for current-authority rejection.',
        effectiveFrom: null,
        effectiveUntil: null,
      }));
      await f.institution(() => f.policies.publishPolicy(f.ctx, draft.id, {
        expectedVersion: draft.version,
        reason: 'Synthetic publication for current-authority rejection.',
        confirmDisclosureReviewed: true,
      }));
      if (process.env.PETROS_READINESS_PROPOSAL_TESTS === '1') {
        const [event]=await f.institution(()=>database.db.select().from(schema.petrosInstitutionalEvents)
          .where(eq(schema.petrosInstitutionalEvents.entityId,draft.id)));
        expect(event).toBeTruthy();
        await expect(f.institution(()=>database.db.update(schema.petrosInstitutionalEvents).set({payload:{rewrite:true}})
          .where(eq(schema.petrosInstitutionalEvents.id,event!.id)))).rejects.toMatchObject({code:'42501'});
        await expect(f.admin.update(schema.petrosInstitutionalEvents).set({payload:{rewrite:true}})
          .where(eq(schema.petrosInstitutionalEvents.id,event!.id))).rejects.toThrow('append-only');
      }
      await expect(f.service.commit(f.ctx, f.assignment.id, {
        schemaVersion: f.input.schemaVersion,
        commandId: randomUUID(),
        candidate: preview,
      })).rejects.toBeTruthy();
      expect(await f.admin.select().from(schema.petrosAssignmentLearningReleases)
        .where(eq(schema.petrosAssignmentLearningReleases.assignmentId, f.assignment.id))).toEqual([]);
    }, 30_000);
  },
);
