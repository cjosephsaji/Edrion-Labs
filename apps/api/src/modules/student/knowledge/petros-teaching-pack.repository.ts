import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, sql, type Database } from '@edrion/database';
import type {
  PetrosConceptPackCandidate,
  PetrosConceptPackReviewReceipt,
  PetrosReviewerAuthoritySnapshot,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';

@Injectable()
export class PetrosTeachingPackRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  lock(identity: string) {
    return this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity}, 0))`);
  }

  candidateCommand(institutionId: string, commandId: string) {
    const t = schema.petrosTeachingPackCandidates;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.commandId, commandId)))
      .limit(1).then((rows) => rows[0]);
  }

  candidateById(institutionId: string, candidateId: string) {
    const t = schema.petrosTeachingPackCandidates;
    const query = this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.id, candidateId))).limit(1);
    return query.then((rows) => rows[0]);
  }

  candidatesForCourse(institutionId: string, courseId: string) {
    const t = schema.petrosTeachingPackCandidates;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.courseId, courseId)))
      .orderBy(desc(t.createdAt)).limit(50);
  }

  qualificationsForReviewer(institutionId: string, reviewerUserId: string, subjectKey: string) {
    const t = schema.petrosReviewerQualifications;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId),
      eq(t.reviewerUserId, reviewerUserId), eq(t.subjectKey, subjectKey))).orderBy(desc(t.version)).limit(100);
  }

  candidateByRef(institutionId: string, packId: string, packVersion: number) {
    const t = schema.petrosTeachingPackCandidates;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.packId, packId),
      eq(t.packVersion, packVersion))).limit(1).then((rows) => rows[0]);
  }

  latestCandidate(institutionId: string, packId: string) {
    const t = schema.petrosTeachingPackCandidates;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId),
      eq(t.packId, packId))).orderBy(desc(t.packVersion)).limit(1).then((rows) => rows[0]);
  }

  candidatesForSource(institutionId: string, sourceItemId: string, sourceVersion: string) {
    const t = schema.petrosTeachingPackCandidates;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId),
      eq(t.sourceItemId, sourceItemId), eq(t.sourceVersion, sourceVersion)))
      .orderBy(desc(t.packVersion));
  }

  insertCandidate(input: {
    institutionId: string;
    courseId: string;
    sourceItemId: string;
    payloadHash: string;
    requestHash: string;
    commandId: string;
    createdByUserId: string;
    candidate: PetrosConceptPackCandidate;
  }) {
    const candidate = input.candidate;
    return this.db.insert(schema.petrosTeachingPackCandidates).values({
      institutionId: input.institutionId,
      courseId: input.courseId,
      sourceItemId: input.sourceItemId,
      sourceVersion: candidate.sourceVersion,
      curriculumRevision: candidate.curriculumRevision,
      packId: candidate.pack.id,
      packVersion: candidate.pack.version,
      compilerVersion: candidate.compilerVersion,
      schemaVersion: candidate.schemaVersion,
      payloadHash: input.payloadHash,
      payload: candidate,
      commandId: input.commandId,
      requestHash: input.requestHash,
      createdByUserId: input.createdByUserId,
    }).returning().then((rows) => rows[0]!);
  }

  latestQualification(institutionId: string, qualificationId: string) {
    const t = schema.petrosReviewerQualifications;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.id, qualificationId)))
      .orderBy(desc(t.version)).limit(1).then((rows) => rows[0]);
  }

  reviewerIdentity(institutionId: string, reviewerUserId: string) {
    const user = schema.institutionUsers;
    const staff = schema.staff;
    return this.db.select({
      userId: user.id,
      userStatus: user.status,
      staffId: staff.id,
      staffStatus: staff.status,
    }).from(user).innerJoin(staff, and(eq(staff.institutionUserId, user.id), eq(staff.institutionId, user.institutionId)))
      .where(and(eq(user.institutionId, institutionId), eq(user.id, reviewerUserId))).limit(1)
      .then((rows) => rows[0]);
  }

  reviewCommand(institutionId: string, commandId: string) {
    const t = schema.petrosTeachingPackReviews;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.commandId, commandId)))
      .limit(1).then((rows) => rows[0]);
  }

  latestReview(institutionId: string, candidateId: string) {
    const t = schema.petrosTeachingPackReviews;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.candidateId, candidateId)))
      .orderBy(desc(t.reviewVersion)).limit(1).then((rows) => rows[0]);
  }

  reviewById(institutionId: string, reviewId: string) {
    const t = schema.petrosTeachingPackReviews;
    const query = this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.id, reviewId))).limit(1);
    return query.then((rows) => rows[0]);
  }

  insertReview(input: {
    reviewId: string;
    institutionId: string;
    courseId: string;
    sourceItemId: string;
    sourceVersion: string;
    candidateId: string;
    reviewVersion: number;
    decision: 'approved' | 'rejected';
    payloadHash: string;
    reviewerUserId: string;
    authority: PetrosReviewerAuthoritySnapshot;
    receipt: PetrosConceptPackReviewReceipt;
    commandId: string;
    requestHash: string;
  }) {
    return this.db.insert(schema.petrosTeachingPackReviews).values({
      id: input.reviewId,
      institutionId: input.institutionId,
      courseId: input.courseId,
      sourceItemId: input.sourceItemId,
      sourceVersion: input.sourceVersion,
      candidateId: input.candidateId,
      reviewVersion: input.reviewVersion,
      decision: input.decision,
      payloadHash: input.payloadHash,
      reviewerUserId: input.reviewerUserId,
      qualificationId: input.authority.qualificationId,
      qualificationVersion: input.authority.qualificationVersion,
      authoritySnapshot: input.authority,
      receipt: input.receipt,
      commandId: input.commandId,
      requestHash: input.requestHash,
      reviewedAt: new Date(input.receipt.reviewedAt),
    }).returning().then((rows) => rows[0]!);
  }

  reviewRevocation(institutionId: string, reviewId: string) {
    const t = schema.petrosTeachingPackReviewRevocations;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.reviewId, reviewId)))
      .limit(1).then((rows) => rows[0]);
  }

  revocationCommand(institutionId: string, commandId: string) {
    const t = schema.petrosTeachingPackReviewRevocations;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.commandId, commandId)))
      .limit(1).then((rows) => rows[0]);
  }

  insertRevocation(input: {
    institutionId: string;
    courseId: string;
    sourceItemId: string;
    reviewId: string;
    commandId: string;
    requestHash: string;
    reason: string;
    revokedByUserId: string;
  }) {
    return this.db.insert(schema.petrosTeachingPackReviewRevocations).values(input)
      .returning().then((rows) => rows[0]!);
  }

  course(institutionId: string, courseId: string, lock: 'share' | 'exclusive' | false = false) {
    const t = schema.courses;
    const query = this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.id, courseId))).limit(1);
    return (lock ? query.for(lock === 'share' ? 'share' : 'no key update') : query).then((rows) => rows[0]);
  }

  courseModules(courseId: string) {
    const t = schema.courseSyllabusModules;
    return this.db.select().from(t).where(eq(t.courseId, courseId)).orderBy(t.weekNo);
  }

  source(institutionId: string, sourceItemId: string) {
    const t = schema.knowledgeItems;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.id, sourceItemId)))
      .for('share').limit(1).then((rows) => rows[0]);
  }

  material(institutionId: string, materialId: string) {
    const t = schema.classMaterials;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.id, materialId)))
      .for('share').limit(1).then((rows) => rows[0]);
  }

  sourceVersion(sourceItemId: string, fingerprint: string) {
    const t = schema.knowledgeItemVersions;
    return this.db.select().from(t).where(and(eq(t.itemId, sourceItemId), eq(t.fingerprint, fingerprint)))
      .for('share').limit(1).then((rows) => rows[0]);
  }

  session(institutionId: string, studentId: string, sessionId: string) {
    const t = schema.petrosLearningSessions;
    return this.db.select().from(t).where(and(eq(t.institutionId, institutionId), eq(t.studentId, studentId),
      eq(t.id, sessionId))).for('share').limit(1).then((rows) => rows[0]);
  }

  enrollment(institutionId: string, courseId: string, studentId: string) {
    const enrollment = schema.courseEnrollments;
    const student = schema.students;
    return this.db.select({ id: enrollment.id, studentStatus: student.status })
      .from(enrollment).innerJoin(student, and(eq(student.id, enrollment.studentId),
        eq(student.institutionId, enrollment.institutionId)))
      .where(and(eq(enrollment.institutionId, institutionId), eq(enrollment.courseId, courseId),
        eq(enrollment.studentId, studentId))).for('share').limit(1).then((rows) => rows[0]);
  }

  learningAssignments(institutionId: string, studentId: string, sessionId: string) {
    const t = schema.petrosAssignmentLearningRecipients;
    return this.db.select({binding:t.binding}).from(t).where(and(eq(t.institutionId,institutionId),
      eq(t.studentId,studentId),eq(t.sessionId,sessionId))).limit(2);
  }
}
