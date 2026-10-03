import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, eq, gte, lte, inArray, runInStudentTenant, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { KnowledgeDocumentService } from '../student/knowledge/knowledge-document.service';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';

export interface CurrentObjectiveEvidence {
  eventId: string;
  studentId: string;
  conceptId: string;
  outcome: 'correct' | 'partial' | 'wrong';
  occurredAt: Date;
  sourceVersion: string;
  policyVersion: string;
  evaluatorVersion: string;
  rubricVersion: string;
  objectiveId: string;
  objectiveVersion: number;
  packId: string;
  packVersion: number;
}

/**
 * Aggregation consumes only the canonical objective-event owner and rechecks current student,
 * document, policy, pack and qualified-review authority before an event can enter a class signal.
 * Query results and callers contain scalar metadata only; assessment prose never leaves the DB.
 */
@Injectable()
export class PetrosCohortEvidenceAuthority {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly auth?: StudentAuthService,
    @Optional() private readonly documents?: KnowledgeDocumentService,
    @Optional() private readonly packs?: PetrosTeachingPackService,
  ) {}

  async current(institutionId: string, classId: string, subjectId: string, since: Date,
    currentPolicy: (scope: { institutionId: string; studentId: string }, sessionId: string) => Promise<{ authorityHash: string; sourceFingerprint: string }>) {
    const exclusionCounts = { invalid: 0, skipped: 0, corrected: 0, staleAuthority: 0 };
    if (!this.auth || !this.documents || !this.packs) {
      return { events: [] as CurrentObjectiveEvidence[], exclusionCounts, authorityAvailable: false, truncated: false };
    }
    const roster = await this.db.selectDistinct({ studentId: schema.students.id, institutionUserId: schema.students.institutionUserId })
      .from(schema.students)
      .innerJoin(schema.courseEnrollments, and(eq(schema.courseEnrollments.studentId, schema.students.id),
        eq(schema.courseEnrollments.institutionId, institutionId)))
      .innerJoin(schema.courses, and(eq(schema.courses.id, schema.courseEnrollments.courseId),
        eq(schema.courses.institutionId, institutionId), eq(schema.courses.subjectId, subjectId)))
      .where(and(eq(schema.students.institutionId, institutionId), eq(schema.students.classId, classId),
        eq(schema.students.status, 'enrolled'), eq(schema.courses.status, 'active'))).limit(2001);
    if (roster.length > 2000) return { events: [] as CurrentObjectiveEvidence[], exclusionCounts, authorityAvailable: true, truncated: true };
    const principals = new Map<string, Awaited<ReturnType<StudentAuthService['resolveInstitutionalWorker']>>>();
    const rows: Array<{
      id: string; studentId: string; sessionId: string; occurredAt: Date; correctsEventId: string | null;
      classification: { projectionEligible?: boolean }; resultKind: string; judgmentStatus: string; outcome: string | null;
      sourceVersion: string; policyVersion: string; rubricVersion: string; objectiveId: string; objectiveVersion: number;
      packId: string; packVersion: number; concepts: string[] | null; evaluatorVersion: string | null; sourceContext: unknown;
    }> = [];
    let ownerReadFailed = false;
    for (const member of roster) {
      if (!member.institutionUserId) { exclusionCounts.staleAuthority += 1; continue; }
      try {
        const principal = await this.auth.resolveInstitutionalWorker(member.institutionUserId);
        if (principal.institutionId !== institutionId || principal.studentId !== member.studentId) throw new Error('owner mismatch');
        principals.set(member.studentId, principal);
        const currentStudentRows = await runInStudentTenant(this.db, principal, () => this.db.select({
          id: schema.petrosObjectiveEvidenceEvents.id,
          studentId: schema.petrosObjectiveEvidenceEvents.studentId,
          sessionId: schema.petrosObjectiveEvidenceEvents.sessionId,
          occurredAt: schema.petrosObjectiveEvidenceEvents.occurredAt,
          correctsEventId: schema.petrosObjectiveEvidenceEvents.correctsEventId,
          classification: schema.petrosObjectiveEvidenceEvents.classification,
          resultKind: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->'assessment'->'result'->>'kind'`,
          judgmentStatus: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->'assessment'->'result'->'judgment'->>'status'`,
          outcome: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->'assessment'->'result'->'judgment'->>'outcome'`,
          sourceVersion: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->>'sourceVersion'`,
          policyVersion: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->>'policyVersion'`,
          rubricVersion: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->'rubric'->>'version'`,
          objectiveId: schema.petrosObjectiveEvidenceEvents.objectiveId,
          objectiveVersion: schema.petrosObjectiveEvidenceEvents.objectiveVersion,
          packId: schema.petrosObjectiveEvidenceEvents.packId,
          packVersion: schema.petrosObjectiveEvidenceEvents.packVersion,
          concepts: sql<string[]>`${schema.petrosObjectiveEvidenceEvents.evidence}->'conceptIds'`,
          evaluatorVersion: sql<string>`${schema.petrosObjectiveEvidenceEvents.evidence}->'assessment'->'result'->'provenance'->>'evaluatorVersion'`,
          sourceContext: schema.petrosLearningSessions.sourceContext,
        }).from(schema.petrosObjectiveEvidenceEvents)
          .innerJoin(schema.petrosLearningSessions, and(eq(schema.petrosLearningSessions.id, schema.petrosObjectiveEvidenceEvents.sessionId),
            eq(schema.petrosLearningSessions.institutionId, schema.petrosObjectiveEvidenceEvents.institutionId),
            eq(schema.petrosLearningSessions.studentId, schema.petrosObjectiveEvidenceEvents.studentId)))
          .innerJoin(schema.petrosTeachingPackCandidates, and(eq(schema.petrosTeachingPackCandidates.institutionId, schema.petrosObjectiveEvidenceEvents.institutionId),
            eq(schema.petrosTeachingPackCandidates.packId, schema.petrosObjectiveEvidenceEvents.packId),
            eq(schema.petrosTeachingPackCandidates.packVersion, schema.petrosObjectiveEvidenceEvents.packVersion)))
          .innerJoin(schema.courses, and(eq(schema.courses.id, schema.petrosTeachingPackCandidates.courseId),
            eq(schema.courses.institutionId, schema.petrosObjectiveEvidenceEvents.institutionId)))
          .innerJoin(schema.courseEnrollments, and(eq(schema.courseEnrollments.courseId, schema.courses.id),
            eq(schema.courseEnrollments.studentId, schema.petrosObjectiveEvidenceEvents.studentId),
            eq(schema.courseEnrollments.institutionId, institutionId)))
          .where(and(eq(schema.petrosObjectiveEvidenceEvents.institutionId, institutionId),
            eq(schema.petrosObjectiveEvidenceEvents.studentId, member.studentId), eq(schema.courses.status, 'active'),
            eq(schema.courses.subjectId, subjectId), gte(schema.petrosObjectiveEvidenceEvents.occurredAt, since),lte(schema.petrosObjectiveEvidenceEvents.occurredAt,new Date())))
          .limit(2001));
        rows.push(...currentStudentRows);
      } catch {
        exclusionCounts.staleAuthority += 1;
        ownerReadFailed = true;
      }
      if (rows.length > 2000) return { events: [] as CurrentObjectiveEvidence[], exclusionCounts, authorityAvailable: true, truncated: true };
    }
    if (ownerReadFailed) return { events: [] as CurrentObjectiveEvidence[], exclusionCounts, authorityAvailable: false, truncated: false };
    const correctionIds = new Set<string>();
    for (const member of roster) {
      if (!member.institutionUserId) continue;
      const ownerRows = rows.filter((row) => row.studentId === member.studentId);
      if (!ownerRows.length) continue;
      try {
        const principal = principals.get(member.studentId);
        if (!principal) { exclusionCounts.staleAuthority += 1; continue; }
        const corrections = await runInStudentTenant(this.db, principal, () => this.db.select({ correctsEventId: schema.petrosObjectiveEvidenceEvents.correctsEventId })
          .from(schema.petrosObjectiveEvidenceEvents)
          .where(and(eq(schema.petrosObjectiveEvidenceEvents.institutionId, institutionId), eq(schema.petrosObjectiveEvidenceEvents.studentId, member.studentId),
            inArray(schema.petrosObjectiveEvidenceEvents.correctsEventId, ownerRows.map((row) => row.id)))).limit(2001));
        if (corrections.length > 2000) return { events: [] as CurrentObjectiveEvidence[], exclusionCounts, authorityAvailable: true, truncated: true };
        for (const correction of corrections) if (correction.correctsEventId) correctionIds.add(correction.correctsEventId);
      } catch {
        exclusionCounts.staleAuthority += 1;
        ownerReadFailed = true;
      }
    }
    if (ownerReadFailed) return { events: [] as CurrentObjectiveEvidence[], exclusionCounts, authorityAvailable: false, truncated: false };
    const superseded = new Set([...rows.map((row) => row.correctsEventId).filter((id): id is string => Boolean(id)), ...correctionIds]);
    const currentRows = rows.filter((row) => !superseded.has(row.id));
    exclusionCounts.corrected += rows.length - currentRows.length;
    const active = currentRows.filter((row) => row.classification.projectionEligible === true && row.resultKind === 'objective');
    exclusionCounts.invalid += currentRows.length - active.length;
    const events: CurrentObjectiveEvidence[] = [];
    for (const row of active) {
      if (row.judgmentStatus !== 'evaluated' || !['correct', 'partial', 'wrong'].includes(row.outcome ?? '')) {
        exclusionCounts.skipped += 1;
        continue;
      }
      const principal = principals.get(row.studentId);
      if (!principal || !Array.isArray(row.concepts)) {
        exclusionCounts.staleAuthority += 1;
        continue;
      }
      try {
        await runInStudentTenant(this.db, principal, async () => {
          await this.documents!.assertContext({ institutionId, studentId: row.studentId }, row.sourceContext as Record<string, unknown>);
          const policy = await currentPolicy({ institutionId, studentId: row.studentId }, row.sessionId);
          if (policy.authorityHash !== row.policyVersion || policy.sourceFingerprint !== row.sourceVersion) throw new Error('policy or source changed');
          const approved = await this.packs!.requireApprovedPackForResume(principal, row.sessionId, { packId: row.packId, packVersion: row.packVersion });
          if (approved.candidate.sourceVersion !== row.sourceVersion || approved.candidate.objective.id !== row.objectiveId ||
            approved.candidate.objective.version !== row.objectiveVersion || approved.candidate.rubric.version !== row.rubricVersion) throw new Error('pack changed');
        });
        for (const conceptId of row.concepts) events.push({
          eventId: row.id, studentId: row.studentId, conceptId, outcome: row.outcome as 'correct' | 'partial' | 'wrong', occurredAt: row.occurredAt,
          sourceVersion: row.sourceVersion, policyVersion: row.policyVersion, evaluatorVersion: row.evaluatorVersion ?? 'unknown',
          rubricVersion: row.rubricVersion, objectiveId: row.objectiveId, objectiveVersion: row.objectiveVersion,
          packId: row.packId, packVersion: row.packVersion,
        });
      } catch {
        exclusionCounts.staleAuthority += 1;
      }
    }
    return { events, exclusionCounts, authorityAvailable: true, truncated: false };
  }
}
