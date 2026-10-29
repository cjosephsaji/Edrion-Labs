import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, sql, type Database } from '@edrion/database';
import type {
  PetrosQualitativeReviewReceipt,
  PetrosQualitativeSubmissionReceipt,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class PetrosQualitativeReviewRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  sharedOwner(kind: 'event' | 'submission' | 'review', institutionId: string, id: string) {
    const t = kind === 'event' ? schema.petrosQualitativeEvents : kind === 'submission'
      ? schema.petrosQualitativeSubmissions : schema.petrosQualitativeReviews;
    return this.db.select({studentId:t.studentId,courseId:t.courseId}).from(t)
      .where(and(eq(t.id,id),eq(t.institutionId,institutionId))).limit(1).then(rows=>rows[0]);
  }

  lock(key: string) {
    return this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  lifecycleEvent(institutionId:string,id:string) {
    const t=schema.petrosQualitativeEvents;
    return this.db.select().from(t).where(and(eq(t.institutionId,institutionId),eq(t.id,id))).limit(1).then(rows=>rows[0]);
  }
  lifecycleTarget(institutionId:string,kind:string,targetId:string) {
    const t=schema.petrosQualitativeEvents;
    return this.db.select().from(t).where(and(eq(t.institutionId,institutionId),eq(t.kind,kind),eq(t.targetId,targetId))).limit(1).then(rows=>rows[0]);
  }
  lifecycleCommand(institutionId:string,studentId:string,commandId:string) {
    const t=schema.petrosQualitativeEvents;
    return this.db.select().from(t).where(and(eq(t.institutionId,institutionId),eq(t.studentId,studentId),eq(t.commandId,commandId))).limit(1).then(rows=>rows[0]);
  }
  insertLifecycle(values:typeof schema.petrosQualitativeEvents.$inferInsert) {
    return this.db.insert(schema.petrosQualitativeEvents).values(values);
  }
  reviewById(institutionId:string,id:string) {
    const t=schema.petrosQualitativeReviews;
    return this.db.select().from(t).where(and(eq(t.institutionId,institutionId),eq(t.id,id))).limit(1).then(rows=>rows[0]);
  }

  artifact(principal: Pick<InstitutionalStudentPrincipal,'institutionId'|'studentId'>, artifactId: string, lock=false) {
    const query = this.db.select().from(schema.petrosSavedArtifacts).where(and(
      eq(schema.petrosSavedArtifacts.id, artifactId),
      eq(schema.petrosSavedArtifacts.institutionId, principal.institutionId),
      eq(schema.petrosSavedArtifacts.studentId, principal.studentId),
      eq(schema.petrosSavedArtifacts.lifecycle, 'saved'),
    )).limit(1);
    return (lock ? query.for('share') : query).then((rows) => rows[0] ?? null);
  }

  revision(principal: Pick<InstitutionalStudentPrincipal, 'institutionId' | 'studentId'>,
    artifactId: string, revision: number) {
    return this.db.select().from(schema.petrosArtifactRevisions).where(and(
      eq(schema.petrosArtifactRevisions.artifactId, artifactId),
      eq(schema.petrosArtifactRevisions.institutionId, principal.institutionId),
      eq(schema.petrosArtifactRevisions.studentId, principal.studentId),
      eq(schema.petrosArtifactRevisions.revision, revision),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  submissionCommand(principal: Pick<InstitutionalStudentPrincipal, 'institutionId' | 'studentId'>,
    commandId: string) {
    return this.db.select().from(schema.petrosQualitativeSubmissions).where(and(
      eq(schema.petrosQualitativeSubmissions.institutionId, principal.institutionId),
      eq(schema.petrosQualitativeSubmissions.studentId, principal.studentId),
      eq(schema.petrosQualitativeSubmissions.commandId, commandId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  submissionForRevision(principal: Pick<InstitutionalStudentPrincipal, 'institutionId' | 'studentId'>,
    revisionId: string) {
    return this.db.select().from(schema.petrosQualitativeSubmissions).where(and(
      eq(schema.petrosQualitativeSubmissions.institutionId, principal.institutionId),
      eq(schema.petrosQualitativeSubmissions.studentId, principal.studentId),
      eq(schema.petrosQualitativeSubmissions.revisionId, revisionId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  insertSubmission(input: {
    receipt: PetrosQualitativeSubmissionReceipt;
    artifactId: string;
    revisionId: string;
    revision: number;
    candidateHash: string;
  }) {
    const receipt = input.receipt;
    return this.db.insert(schema.petrosQualitativeSubmissions).values({
      id: receipt.submissionId,
      commandId: receipt.commandId,
      requestHash: receipt.requestHash,
      institutionId: receipt.scope.institutionId,
      courseId: receipt.scope.courseId,
      studentId: receipt.scope.studentId,
      sessionId: receipt.sessionId,
      artifactId: input.artifactId,
      revisionId: input.revisionId,
      revision: input.revision,
      objectiveId: receipt.objective.id,
      objectiveVersion: receipt.objective.version,
      packId: receipt.pack.id,
      packVersion: receipt.pack.version,
      submission: receipt,
      candidateHash: input.candidateHash,
    }).returning().then((rows) => rows[0]);
  }

  submission(institutionId: string, submissionId: string) {
    return this.db.select().from(schema.petrosQualitativeSubmissions).where(and(
      eq(schema.petrosQualitativeSubmissions.id, submissionId),
      eq(schema.petrosQualitativeSubmissions.institutionId, institutionId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  reviewCommand(institutionId: string, commandId: string) {
    return this.db.select().from(schema.petrosQualitativeReviews).where(and(
      eq(schema.petrosQualitativeReviews.institutionId, institutionId),
      eq(schema.petrosQualitativeReviews.commandId, commandId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  reviewForSubmission(institutionId: string, submissionId: string) {
    return this.db.select().from(schema.petrosQualitativeReviews).where(and(
      eq(schema.petrosQualitativeReviews.institutionId, institutionId),
      eq(schema.petrosQualitativeReviews.submissionId, submissionId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  insertReview(input: {
    receipt: PetrosQualitativeReviewReceipt;
    submissionId: string;
    requestHash: string;
    receiptHash: string;
  }) {
    const receipt = input.receipt;
    return this.db.insert(schema.petrosQualitativeReviews).values({
      id: receipt.id,
      commandId: receipt.commandId,
      requestHash: input.requestHash,
      institutionId: receipt.scope.institutionId,
      courseId: receipt.scope.courseId,
      studentId: receipt.scope.studentId,
      submissionId: input.submissionId,
      reviewerInstitutionUserId: receipt.reviewer.institutionUserId,
      receipt,
      receiptHash: input.receiptHash,
    }).returning().then((rows) => rows[0]);
  }
}
