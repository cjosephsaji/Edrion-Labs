import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eq, runInInstitutionTenant, schema } from '@edrion/database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase } from './petros-phase2-test-database';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 database owner links', () => {
  it('rejects forged sharing rows and references to another learner or tenant', async () => {
    const fixture = await startPhase2TestDatabase();
    try {
      const authority = await phase2AuthorityFixture(fixture);
      const seedOwner = async (institutionId: string, studentId: string, sessionId: string) => {
        const artifactId = randomUUID();
        const revisionId = randomUUID();
        await authority.admin.insert(schema.petrosSavedArtifacts).values({
          id: artifactId,
          portableId: randomUUID(),
          institutionId,
          studentId,
          sessionId,
          kind: 'note',
          content: { kind: 'note', title: 'Synthetic', body: 'Synthetic only.', tags: [] },
          sources: [],
          productType: 'petros_note',
          productTargetId: randomUUID(),
          contentVersion: 'synthetic.v1',
          promptVersion: 'synthetic.v1',
          schemaVersion: 'petros.artifact.v1',
          revision: 1,
        });
        await authority.admin.insert(schema.petrosArtifactRevisions).values({
          id: revisionId,
          artifactId,
          institutionId,
          studentId,
          revision: 1,
          content: { kind: 'note', title: 'Synthetic', body: 'Synthetic only.', tags: [] },
          sources: [],
          reason: 'Synthetic owner-link test.',
        });
        return { artifactId, revisionId };
      };
      const seedStudentAndSession = async (institutionId: string) => {
        const studentId = randomUUID();
        const sessionId = randomUUID();
        await authority.admin.insert(schema.students).values({
          id: studentId,
          institutionId,
          admissionNo: randomUUID(),
          firstName: 'Synthetic',
          lastName: 'Other learner',
        });
        await authority.admin.insert(schema.petrosLearningSessions).values({
          id: sessionId,
          institutionId,
          studentId,
          clientRequestId: randomUUID(),
          stateVersion: 'petros.session-state.v3',
          sessionType: 'learn',
          topic: 'Synthetic owner-link test',
          currentGoal: 'Verify database ownership.',
          timeBudgetSeconds: 600,
          maxMoves: 4,
          checkpoints: [],
          currentCheckpointId: 'synthetic',
          promptVersion: 'synthetic',
          outputSchemaVersion: 'synthetic',
        });
        return { institutionId, studentId, sessionId, ...(await seedOwner(institutionId, studentId, sessionId)) };
      };

      const ownArtifact = await seedOwner(
        authority.institutionId,
        authority.student.studentId,
        authority.sessionId,
      );
      const submission = (parents: { sessionId: string; artifactId: string; revisionId: string }) => ({
        id: randomUUID(),
        commandId: randomUUID(),
        requestHash: 'a'.repeat(64),
        institutionId: authority.institutionId,
        courseId: authority.course.id,
        studentId: authority.student.studentId,
        sessionId: parents.sessionId,
        artifactId: parents.artifactId,
        revisionId: parents.revisionId,
        revision: 1,
        objectiveId: authority.candidate.objective.id,
        objectiveVersion: authority.candidate.objective.version,
        packId: authority.candidate.pack.id,
        packVersion: authority.candidate.pack.version,
        // Deliberately minimal JSON: this test targets DB ownership, not DTO acceptance.
        submission: { shareLearningProvenance: true } as never,
        candidateHash: 'b'.repeat(64),
      });

      // A staff-scoped transaction used to satisfy the permissive FOR ALL policy and
      // could thereby expose a learner artifact. Only the exact student may insert now.
      await expect(runInInstitutionTenant(fixture.db, authority.institutionId, () =>
        fixture.db.insert(schema.petrosQualitativeSubmissions).values(submission({
          sessionId: authority.sessionId,
          ...ownArtifact,
        })))).rejects.toThrow(/row-level security/i);
      expect(await runInInstitutionTenant(fixture.db, authority.institutionId, () =>
        fixture.db.select({ id: schema.petrosSavedArtifacts.id }).from(schema.petrosSavedArtifacts)
          .where(eq(schema.petrosSavedArtifacts.id, ownArtifact.artifactId)))).toEqual([]);

      const otherLearner = await seedStudentAndSession(authority.institutionId);

      const foreignInstitutionId = randomUUID();
      await authority.admin.insert(schema.institutions).values({
        id: foreignInstitutionId,
        publicId: randomUUID(),
        legalName: 'Synthetic foreign institution',
        displayName: 'Synthetic foreign institution',
        type: 'school',
        country: 'IN',
        primaryContact: { name: 'Synthetic', email: 'foreign@example.test' },
      });
      const foreignLearner = await seedStudentAndSession(foreignInstitutionId);
      const ownParents = { sessionId: authority.sessionId, ...ownArtifact };
      for (const foreign of [otherLearner, foreignLearner]) {
        for (const [column, constraint] of [
          ['sessionId', 'petros_submission_session_owner_fk'],
          ['artifactId', 'petros_submission_artifact_owner_fk'],
          ['revisionId', 'petros_submission_revision_owner_fk'],
        ] as const) {
          await expect(authority.owned(() => fixture.db.insert(schema.petrosQualitativeSubmissions)
            .values(submission({ ...ownParents, [column]: foreign[column] }))))
            .rejects.toThrow(constraint);
        }
        await expect(authority.owned(() => fixture.db.insert(schema.petrosLearningArtifactReceipts).values({
          institutionId: authority.institutionId, studentId: authority.student.studentId,
          artifactId: foreign.artifactId, revision: 1, commandId: randomUUID(),
          contentHash: 'a'.repeat(64), receipt: {} as never,
        }))).rejects.toThrow('petros_learning_receipt_artifact_owner_fk');
        await expect(authority.owned(() => fixture.db.insert(schema.petrosQualitativeEvents).values({
          id: randomUUID(), institutionId: authority.institutionId, studentId: authority.student.studentId,
          courseId: authority.course.id, artifactId: foreign.artifactId, revision: 1,
          kind: 'feedback_request', commandId: randomUUID(), requestHash: 'a'.repeat(64),
          targetId: randomUUID(), payload: {},
        }))).rejects.toThrow('petros_qualitative_event_artifact_owner_fk');
      }
      // Same-owner but wrong revision number cannot silently relabel the exact work.
      await expect(authority.owned(() => fixture.db.insert(schema.petrosQualitativeSubmissions)
        .values({ ...submission(ownParents), revision: 2 })))
        .rejects.toThrow('petros_submission_revision_owner_fk');
      // The legitimate owner can still explicitly share, and only then can staff read it.
      const shared = submission(ownParents);
      await authority.owned(() => fixture.db.insert(schema.petrosQualitativeSubmissions).values(shared));
      expect(await runInInstitutionTenant(fixture.db, authority.institutionId, () =>
        fixture.db.select({ id: schema.petrosSavedArtifacts.id }).from(schema.petrosSavedArtifacts)
          .where(eq(schema.petrosSavedArtifacts.id, ownArtifact.artifactId))))
        .toEqual([{ id: ownArtifact.artifactId }]);
      await expect(authority.institution(() => fixture.db.insert(schema.petrosQualitativeReviews).values({
        id: randomUUID(), commandId: randomUUID(), requestHash: 'a'.repeat(64),
        institutionId: authority.institutionId, studentId: otherLearner.studentId,
        courseId: authority.course.id, submissionId: shared.id,
        reviewerInstitutionUserId: authority.teacherUserId, receipt: {} as never, receiptHash: 'b'.repeat(64),
      }))).rejects.toThrow('petros_qualitative_review_submission_owner_fk');

      const constraints = await fixture.adminSql<{ conname: string }[]>`
        SELECT conname FROM pg_constraint WHERE conname IN (
          'petros_evidence_command_evaluation_owner_fk',
          'petros_evidence_command_event_owner_fk',
          'petros_submission_session_owner_fk',
          'petros_submission_artifact_owner_fk',
          'petros_submission_revision_owner_fk',
          'petros_qualitative_review_submission_owner_fk',
          'petros_review_receipt_artifact_owner_fk',
          'petros_review_receipt_outcome_owner_fk',
          'petros_pack_review_candidate_owner_fk',
          'petros_pack_review_qualification_owner_fk',
          'petros_assignment_recipient_release_tenant_fk',
          'petros_assignment_recipient_session_owner_fk'
        ) ORDER BY conname
      `;
      expect(constraints).toHaveLength(12);
    } finally {
      await fixture.close();
    }
  });
});
