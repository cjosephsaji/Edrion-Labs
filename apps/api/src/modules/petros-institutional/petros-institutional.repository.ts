import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type {
  PetrosInstitutionalDashboardQuery,
  PetrosParentDigestPreferenceInput,
} from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class PetrosInstitutionalRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listPolicies(institutionId: string) {
    return this.db.select().from(schema.petrosInstitutionPolicyVersions)
      .where(eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId))
      .orderBy(desc(schema.petrosInstitutionPolicyVersions.createdAt));
  }

  findPolicy(institutionId: string, id: string) {
    return this.db.select().from(schema.petrosInstitutionPolicyVersions)
      .where(and(eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId), eq(schema.petrosInstitutionPolicyVersions.id, id)))
      .limit(1).then((rows) => rows[0]);
  }

  createPolicy(values: typeof schema.petrosInstitutionPolicyVersions.$inferInsert) {
    return this.db.insert(schema.petrosInstitutionPolicyVersions).values(values).returning().then((rows) => rows[0]);
  }

  updateDraft(
    institutionId: string,
    id: string,
    expectedVersion: number,
    values: Pick<typeof schema.petrosInstitutionPolicyVersions.$inferInsert, 'campusId' | 'programmeId' | 'gradeId' | 'subjectId' | 'scopeLevel' | 'config' | 'reason' | 'effectiveFrom' | 'effectiveUntil'>,
  ) {
    return this.db.update(schema.petrosInstitutionPolicyVersions).set({ ...values, updatedAt: new Date() })
      .where(and(
        eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId),
        eq(schema.petrosInstitutionPolicyVersions.id, id),
        eq(schema.petrosInstitutionPolicyVersions.version, expectedVersion),
        eq(schema.petrosInstitutionPolicyVersions.status, 'draft'),
      )).returning().then((rows) => rows[0]);
  }

  async policyScopeEntitiesExist(institutionId: string, scope: { campusId?: string | null; programmeId?: string | null; gradeId?: string | null; subjectId?: string | null }) {
    const [campus, programme, grade, subject] = await Promise.all([
      scope.campusId ? this.db.select({ id: schema.campuses.id }).from(schema.campuses).where(and(eq(schema.campuses.institutionId, institutionId), eq(schema.campuses.id, scope.campusId))).limit(1) : Promise.resolve([{ id: null }]),
      scope.programmeId ? this.db.select({ id: schema.departmentGradeLevels.id }).from(schema.departmentGradeLevels).where(and(eq(schema.departmentGradeLevels.institutionId, institutionId), eq(schema.departmentGradeLevels.id, scope.programmeId))).limit(1) : Promise.resolve([{ id: null }]),
      scope.gradeId ? this.db.select({ id: schema.gradeLevels.id }).from(schema.gradeLevels).where(and(eq(schema.gradeLevels.institutionId, institutionId), eq(schema.gradeLevels.id, scope.gradeId))).limit(1) : Promise.resolve([{ id: null }]),
      scope.subjectId ? this.db.select({ id: schema.subjects.id }).from(schema.subjects).where(and(eq(schema.subjects.institutionId, institutionId), eq(schema.subjects.id, scope.subjectId))).limit(1) : Promise.resolve([{ id: null }]),
    ]);
    return {
      campus: !scope.campusId || Boolean(campus[0]),
      programme: !scope.programmeId || Boolean(programme[0]),
      grade: !scope.gradeId || Boolean(grade[0]),
      subject: !scope.subjectId || Boolean(subject[0]),
    };
  }

  async publishPolicy(institutionId: string, id: string, expectedVersion: number, scheduled: boolean) {
    return this.db.transaction(async (tx) => {
      const [target] = await tx.select().from(schema.petrosInstitutionPolicyVersions)
        .where(and(
          eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId),
          eq(schema.petrosInstitutionPolicyVersions.id, id),
          eq(schema.petrosInstitutionPolicyVersions.version, expectedVersion),
          eq(schema.petrosInstitutionPolicyVersions.status, 'draft'),
        )).for('update').limit(1);
      if (!target) return undefined;
      const sameScope = [
        eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId),
        eq(schema.petrosInstitutionPolicyVersions.scopeLevel, target.scopeLevel),
        nullableEq(schema.petrosInstitutionPolicyVersions.campusId, target.campusId),
        nullableEq(schema.petrosInstitutionPolicyVersions.programmeId, target.programmeId),
        nullableEq(schema.petrosInstitutionPolicyVersions.gradeId, target.gradeId),
        nullableEq(schema.petrosInstitutionPolicyVersions.subjectId, target.subjectId),
        inArray(schema.petrosInstitutionPolicyVersions.status, ['published', 'scheduled']),
      ];
      if (!scheduled) {
        await tx.update(schema.petrosInstitutionPolicyVersions)
          .set({ status: 'superseded', effectiveUntil: target.effectiveFrom ?? new Date(), updatedAt: new Date() })
          .where(and(...sameScope));
      }
      const [published] = await tx.update(schema.petrosInstitutionPolicyVersions)
        .set({ status: scheduled ? 'scheduled' : 'published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.petrosInstitutionPolicyVersions.id, target.id)).returning();
      return published;
    });
  }

  async rollbackPolicy(institutionId: string, targetId: string, rollbackId: string, authorId: string, reason: string) {
    return this.db.transaction(async (tx) => {
      const [target] = await tx.select().from(schema.petrosInstitutionPolicyVersions)
        .where(and(eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId), eq(schema.petrosInstitutionPolicyVersions.id, targetId)))
        .limit(1);
      if (!target) return undefined;
      const sameScope = [
        eq(schema.petrosInstitutionPolicyVersions.institutionId, institutionId),
        eq(schema.petrosInstitutionPolicyVersions.scopeLevel, target.scopeLevel),
        nullableEq(schema.petrosInstitutionPolicyVersions.campusId, target.campusId),
        nullableEq(schema.petrosInstitutionPolicyVersions.programmeId, target.programmeId),
        nullableEq(schema.petrosInstitutionPolicyVersions.gradeId, target.gradeId),
        nullableEq(schema.petrosInstitutionPolicyVersions.subjectId, target.subjectId),
      ];
      const all = await tx.select({ version: schema.petrosInstitutionPolicyVersions.version }).from(schema.petrosInstitutionPolicyVersions)
        .where(and(...sameScope));
      const version = Math.max(0, ...all.map((row) => row.version)) + 1;
      await tx.update(schema.petrosInstitutionPolicyVersions)
        .set({ status: 'rolled_back', rolledBackAt: new Date(), updatedAt: new Date() })
        .where(and(...sameScope, inArray(schema.petrosInstitutionPolicyVersions.status, ['published', 'scheduled'])));
      const [restored] = await tx.insert(schema.petrosInstitutionPolicyVersions).values({
        ...target,
        id: rollbackId,
        version,
        status: 'published',
        authorId,
        reason,
        supersedesId: target.id,
        effectiveFrom: new Date(),
        effectiveUntil: null,
        publishedAt: new Date(),
        rolledBackAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return restored;
    });
  }

  findSessionSnapshot(institutionId: string, studentId: string, sessionId: string) {
    return this.db.select().from(schema.petrosPolicySessionSnapshots)
      .where(and(
        eq(schema.petrosPolicySessionSnapshots.institutionId, institutionId),
        eq(schema.petrosPolicySessionSnapshots.studentId, studentId),
        eq(schema.petrosPolicySessionSnapshots.sessionId, sessionId),
      )).limit(1).then((rows) => rows[0]);
  }

  ownsSession(institutionId: string, studentId: string, sessionId: string) {
    return this.db.select({ id: schema.petrosLearningSessions.id }).from(schema.petrosLearningSessions)
      .where(and(
        eq(schema.petrosLearningSessions.id, sessionId),
        eq(schema.petrosLearningSessions.institutionId, institutionId),
        eq(schema.petrosLearningSessions.studentId, studentId),
      )).limit(1).then((rows) => Boolean(rows[0]));
  }

  handoffEligible(institutionId: string, studentId: string, sessionId: string, minimumFailedRepairs: number) {
    return this.db.select({ id: schema.petrosStruggleStretches.id }).from(schema.petrosStruggleStretches)
      .where(and(
        eq(schema.petrosStruggleStretches.institutionId, institutionId),
        eq(schema.petrosStruggleStretches.studentId, studentId),
        eq(schema.petrosStruggleStretches.sessionId, sessionId),
        gte(schema.petrosStruggleStretches.wrongAttemptCount, minimumFailedRepairs),
      )).limit(1).then((rows) => Boolean(rows[0]));
  }

  async createSessionSnapshot(values: typeof schema.petrosPolicySessionSnapshots.$inferInsert, locale: string, disclosureHash: string) {
    return this.db.transaction(async (tx) => {
      const [snapshot] = await tx.insert(schema.petrosPolicySessionSnapshots).values(values).onConflictDoNothing().returning();
      const row = snapshot ?? (await tx.select().from(schema.petrosPolicySessionSnapshots)
        .where(and(
          eq(schema.petrosPolicySessionSnapshots.institutionId, values.institutionId),
          eq(schema.petrosPolicySessionSnapshots.studentId, values.studentId),
          eq(schema.petrosPolicySessionSnapshots.sessionId, values.sessionId),
        )).limit(1))[0];
      if (row) await tx.insert(schema.petrosPolicyDisclosureReceipts).values({
        institutionId: values.institutionId,
        studentId: values.studentId,
        snapshotId: row.id,
        disclosureHash,
        locale,
      }).onConflictDoNothing();
      return row;
    });
  }

  acknowledgeDisclosure(institutionId: string, studentId: string, snapshotId: string) {
    return this.db.update(schema.petrosPolicyDisclosureReceipts).set({ acknowledgedAt: new Date() })
      .where(and(
        eq(schema.petrosPolicyDisclosureReceipts.institutionId, institutionId),
        eq(schema.petrosPolicyDisclosureReceipts.studentId, studentId),
        eq(schema.petrosPolicyDisclosureReceipts.snapshotId, snapshotId),
      )).returning().then((rows) => rows[0]);
  }

  upsertHomeworkMatch(values: typeof schema.petrosHomeworkPolicyMatches.$inferInsert) {
    return this.db.insert(schema.petrosHomeworkPolicyMatches).values(values).onConflictDoUpdate({
      target: [schema.petrosHomeworkPolicyMatches.sessionId, schema.petrosHomeworkPolicyMatches.assignmentId],
      set: {
        snapshotId: values.snapshotId,
        relationBasisPoints: values.relationBasisPoints,
        related: values.related,
        active: values.active,
        reasonCode: values.reasonCode,
        evaluatedAt: new Date(),
      },
    }).returning().then((rows) => rows[0]);
  }

  correctHomeworkMatch(institutionId: string, studentId: string, sessionId: string, assignmentId: string, correctionReason: string) {
    return this.db.update(schema.petrosHomeworkPolicyMatches).set({
      studentCorrected: true,
      correctionReason,
      active: false,
      reasonCode: 'STUDENT_FALSE_MATCH_CORRECTION',
      evaluatedAt: new Date(),
    }).where(and(
      eq(schema.petrosHomeworkPolicyMatches.institutionId, institutionId),
      eq(schema.petrosHomeworkPolicyMatches.studentId, studentId),
      eq(schema.petrosHomeworkPolicyMatches.sessionId, sessionId),
      eq(schema.petrosHomeworkPolicyMatches.assignmentId, assignmentId),
    )).returning().then((rows) => rows[0]);
  }

  async applyHomeworkCorrectionToSession(institutionId: string, studentId: string, sessionId: string, message: string) {
    const [session] = await this.db.select({ sourceContext: schema.petrosLearningSessions.sourceContext })
      .from(schema.petrosLearningSessions).where(and(
        eq(schema.petrosLearningSessions.id, sessionId),
        eq(schema.petrosLearningSessions.institutionId, institutionId),
        eq(schema.petrosLearningSessions.studentId, studentId),
      )).limit(1);
    if (!session) return undefined;
    const source = session.sourceContext && typeof session.sourceContext === 'object' ? session.sourceContext : {};
    const institutional = source.institutionalDecision && typeof source.institutionalDecision === 'object'
      ? source.institutionalDecision as Record<string, unknown>
      : {};
    return this.db.update(schema.petrosLearningSessions).set({
      sourceContext: {
        ...source,
        institutionalDecision: {
          ...institutional,
          homework: {
            assignmentId: null,
            related: false,
            active: false,
            mode: 'normal',
            allowedMoves: ['question', 'hint', 'setup', 'prerequisite_repair', 'critique', 'process_feedback', 'worked_solution'],
            finalAnswerAllowed: true,
            studentMessage: message,
            correctionAllowed: true,
            reasonCode: 'STUDENT_FALSE_MATCH_CORRECTION',
          },
        },
      },
      updatedAt: new Date(),
    }).where(and(
      eq(schema.petrosLearningSessions.id, sessionId),
      eq(schema.petrosLearningSessions.institutionId, institutionId),
      eq(schema.petrosLearningSessions.studentId, studentId),
    )).returning().then((rows) => rows[0]);
  }

  teacherFor(institutionId: string, classId: string, subjectId: string) {
    return this.db.select({ teacherId: schema.classSubjectTeachers.teacherId, classTeacherId: schema.classes.classTeacherId })
      .from(schema.classes)
      .leftJoin(schema.classSubjectTeachers, and(
        eq(schema.classSubjectTeachers.institutionId, institutionId),
        eq(schema.classSubjectTeachers.classId, classId),
        eq(schema.classSubjectTeachers.subjectId, subjectId),
      ))
      .where(and(eq(schema.classes.institutionId, institutionId), eq(schema.classes.id, classId)))
      .limit(1).then((rows) => rows[0]?.teacherId ?? rows[0]?.classTeacherId ?? null);
  }

  staffForUser(institutionId: string, institutionUserId: string) {
    return this.db.select({ id: schema.staff.id }).from(schema.staff)
      .where(and(eq(schema.staff.institutionId, institutionId), eq(schema.staff.institutionUserId, institutionUserId)))
      .limit(1).then((rows) => rows[0]?.id ?? null);
  }

  studentPolicyFixture(institutionId: string, studentId: string) {
    return this.db.select({
      campusId: schema.students.campusId,
      classId: schema.students.classId,
      gradeId: schema.classes.gradeLevelId,
      programmeId: schema.classes.programmeLevelId,
    }).from(schema.students)
      .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .where(and(eq(schema.students.institutionId, institutionId), eq(schema.students.id, studentId)))
      .limit(1).then((rows) => rows[0]);
  }

  classPolicyFixture(institutionId: string, classId: string) {
    return this.db.select({
      campusId: schema.classes.campusId,
      gradeId: schema.classes.gradeLevelId,
      programmeId: schema.classes.programmeLevelId,
    }).from(schema.classes)
      .where(and(eq(schema.classes.institutionId, institutionId), eq(schema.classes.id, classId)))
      .limit(1).then((rows) => rows[0]);
  }

  createHandoff(values: typeof schema.petrosTeacherHandoffs.$inferInsert) {
    return this.db.insert(schema.petrosTeacherHandoffs).values(values).onConflictDoNothing().returning().then((rows) => rows[0]);
  }

  findStudentHandoff(institutionId: string, studentId: string, id: string) {
    return this.db.select().from(schema.petrosTeacherHandoffs).where(and(
      eq(schema.petrosTeacherHandoffs.institutionId, institutionId),
      eq(schema.petrosTeacherHandoffs.studentId, studentId),
      eq(schema.petrosTeacherHandoffs.id, id),
    )).limit(1).then((rows) => rows[0]);
  }

  listStudentHandoffs(institutionId: string, studentId: string) {
    return this.db.select().from(schema.petrosTeacherHandoffs).where(and(
      eq(schema.petrosTeacherHandoffs.institutionId, institutionId),
      eq(schema.petrosTeacherHandoffs.studentId, studentId),
    )).orderBy(desc(schema.petrosTeacherHandoffs.createdAt));
  }

  listTeacherHandoffs(institutionId: string, teacherId: string) {
    return this.db.select().from(schema.petrosTeacherHandoffs).where(and(
      eq(schema.petrosTeacherHandoffs.institutionId, institutionId),
      eq(schema.petrosTeacherHandoffs.teacherId, teacherId),
      inArray(schema.petrosTeacherHandoffs.status, ['delivered', 'read']),
    )).orderBy(desc(schema.petrosTeacherHandoffs.createdAt));
  }

  queuedHandoffs() {
    return this.db.select({ handoff: schema.petrosTeacherHandoffs, snapshot: schema.petrosPolicySessionSnapshots })
      .from(schema.petrosTeacherHandoffs)
      .innerJoin(schema.petrosPolicySessionSnapshots, eq(schema.petrosPolicySessionSnapshots.id, schema.petrosTeacherHandoffs.policySnapshotId))
      .where(eq(schema.petrosTeacherHandoffs.status, 'queued'));
  }

  updateStudentHandoff(institutionId: string, studentId: string, id: string, patch: Partial<typeof schema.petrosTeacherHandoffs.$inferInsert>) {
    return this.db.update(schema.petrosTeacherHandoffs).set({ ...patch, updatedAt: new Date() }).where(and(
      eq(schema.petrosTeacherHandoffs.institutionId, institutionId),
      eq(schema.petrosTeacherHandoffs.studentId, studentId),
      eq(schema.petrosTeacherHandoffs.id, id),
    )).returning().then((rows) => rows[0]);
  }

  markHandoffRead(institutionId: string, teacherId: string, id: string) {
    return this.db.update(schema.petrosTeacherHandoffs).set({ status: 'read', readAt: new Date(), updatedAt: new Date() }).where(and(
      eq(schema.petrosTeacherHandoffs.institutionId, institutionId),
      eq(schema.petrosTeacherHandoffs.teacherId, teacherId),
      eq(schema.petrosTeacherHandoffs.id, id),
    )).returning().then((rows) => rows[0]);
  }

  classEvidence(institutionId: string, classId: string, subjectId: string, since: Date) {
    return this.db.select({
      studentId: schema.petrosLearnerEvidenceEvents.studentId,
      conceptId: schema.petrosLearnerEvidenceEvents.conceptId,
      outcome: schema.petrosLearnerEvidenceEvents.outcome,
      occurredAt: schema.petrosLearnerEvidenceEvents.occurredAt,
    }).from(schema.petrosLearnerEvidenceEvents)
      .innerJoin(schema.students, eq(schema.students.id, schema.petrosLearnerEvidenceEvents.studentId))
      .where(and(
        eq(schema.petrosLearnerEvidenceEvents.institutionId, institutionId),
        eq(schema.students.classId, classId),
        eq(sql<string>`${schema.petrosLearnerEvidenceEvents.metadata}->>'subjectId'`, subjectId),
        eq(schema.petrosLearnerEvidenceEvents.synthetic, false),
        gte(schema.petrosLearnerEvidenceEvents.occurredAt, since),
      ));
  }

  upsertClassSignal(values: typeof schema.petrosClassStruggleSignals.$inferInsert) {
    return this.db.insert(schema.petrosClassStruggleSignals).values(values).onConflictDoNothing().returning().then((rows) => rows[0]);
  }

  listTeacherSignals(institutionId: string, teacherId: string) {
    return this.db.select({ signal: schema.petrosClassStruggleSignals }).from(schema.petrosClassStruggleSignals)
      .innerJoin(schema.classSubjectTeachers, and(
        eq(schema.classSubjectTeachers.institutionId, institutionId),
        eq(schema.classSubjectTeachers.classId, schema.petrosClassStruggleSignals.classId),
        eq(schema.classSubjectTeachers.subjectId, schema.petrosClassStruggleSignals.subjectId),
        eq(schema.classSubjectTeachers.teacherId, teacherId),
      ))
      .where(eq(schema.petrosClassStruggleSignals.institutionId, institutionId))
      .orderBy(desc(schema.petrosClassStruggleSignals.freshestAt)).then((rows) => rows.map((row) => row.signal));
  }

  preference(institutionId: string, guardianUserId: string, studentId: string) {
    return this.db.select().from(schema.petrosParentDigestPreferences).where(and(
      eq(schema.petrosParentDigestPreferences.institutionId, institutionId),
      eq(schema.petrosParentDigestPreferences.guardianUserId, guardianUserId),
      eq(schema.petrosParentDigestPreferences.studentId, studentId),
    )).limit(1).then((rows) => rows[0]);
  }

  upsertPreference(institutionId: string, guardianUserId: string, input: PetrosParentDigestPreferenceInput) {
    return this.db.insert(schema.petrosParentDigestPreferences).values({
      institutionId,
      guardianUserId,
      studentId: input.studentId,
      optedOut: input.optedOut,
      language: input.language,
      deliveryChannels: input.deliveryChannels,
    }).onConflictDoUpdate({
      target: [schema.petrosParentDigestPreferences.institutionId, schema.petrosParentDigestPreferences.guardianUserId, schema.petrosParentDigestPreferences.studentId],
      set: { optedOut: input.optedOut, language: input.language, deliveryChannels: input.deliveryChannels, updatedAt: new Date() },
    }).returning().then((rows) => rows[0]);
  }

  digestEvidence(institutionId: string, studentId: string, from: Date, to: Date) {
    return this.db.select({
      conceptId: schema.petrosLearnerEvidenceEvents.conceptId,
      outcome: schema.petrosLearnerEvidenceEvents.outcome,
      errorCategory: schema.petrosLearnerEvidenceEvents.errorCategory,
      occurredAt: schema.petrosLearnerEvidenceEvents.occurredAt,
    }).from(schema.petrosLearnerEvidenceEvents).where(and(
      eq(schema.petrosLearnerEvidenceEvents.institutionId, institutionId),
      eq(schema.petrosLearnerEvidenceEvents.studentId, studentId),
      eq(schema.petrosLearnerEvidenceEvents.synthetic, false),
      gte(schema.petrosLearnerEvidenceEvents.occurredAt, from),
      lte(schema.petrosLearnerEvidenceEvents.occurredAt, to),
    ));
  }

  createDigest(values: typeof schema.petrosParentDigests.$inferInsert) {
    return this.db.insert(schema.petrosParentDigests).values(values).onConflictDoNothing().returning().then((rows) => rows[0]);
  }

  queuedDigests() {
    return this.db.select().from(schema.petrosParentDigests)
      .where(or(
        eq(schema.petrosParentDigests.status, 'queued'),
        and(eq(schema.petrosParentDigests.status, 'failed'), lte(schema.petrosParentDigests.nextRetryAt, new Date())),
      ));
  }

  findDigest(institutionId: string, guardianUserId: string, id: string) {
    return this.db.select().from(schema.petrosParentDigests).where(and(
      eq(schema.petrosParentDigests.institutionId, institutionId),
      eq(schema.petrosParentDigests.guardianUserId, guardianUserId),
      eq(schema.petrosParentDigests.id, id),
    )).limit(1).then((rows) => rows[0]);
  }

  updateDigest(institutionId: string, guardianUserId: string, id: string, patch: Partial<typeof schema.petrosParentDigests.$inferInsert>) {
    return this.db.update(schema.petrosParentDigests).set({ ...patch, updatedAt: new Date() }).where(and(
      eq(schema.petrosParentDigests.institutionId, institutionId),
      eq(schema.petrosParentDigests.guardianUserId, guardianUserId),
      eq(schema.petrosParentDigests.id, id),
    )).returning().then((rows) => rows[0]);
  }

  listDigests(institutionId: string, guardianUserId: string, studentId?: string) {
    return this.db.select().from(schema.petrosParentDigests).where(and(
      eq(schema.petrosParentDigests.institutionId, institutionId),
      eq(schema.petrosParentDigests.guardianUserId, guardianUserId),
      studentId ? eq(schema.petrosParentDigests.studentId, studentId) : undefined,
    )).orderBy(desc(schema.petrosParentDigests.periodEnd));
  }

  recordEvent(values: typeof schema.petrosInstitutionalEvents.$inferInsert) {
    return this.db.insert(schema.petrosInstitutionalEvents).values(values).onConflictDoNothing().returning().then((rows) => rows[0]);
  }

  async dashboard(query: PetrosInstitutionalDashboardQuery) {
    const conditions = [
      query.institutionId ? eq(schema.petrosInstitutionalEvents.institutionId, query.institutionId) : undefined,
      query.from ? gte(schema.petrosInstitutionalEvents.createdAt, new Date(query.from)) : undefined,
      query.to ? lte(schema.petrosInstitutionalEvents.createdAt, new Date(query.to)) : undefined,
    ];
    const [events, policies, snapshots, handoffs, signals, digests] = await Promise.all([
      this.db.select().from(schema.petrosInstitutionalEvents).where(and(...conditions)).limit(10_000),
      this.db.select().from(schema.petrosInstitutionPolicyVersions).where(query.institutionId ? eq(schema.petrosInstitutionPolicyVersions.institutionId, query.institutionId) : undefined),
      this.db.select().from(schema.petrosPolicySessionSnapshots).where(query.institutionId ? eq(schema.petrosPolicySessionSnapshots.institutionId, query.institutionId) : undefined),
      this.db.select({ status: schema.petrosTeacherHandoffs.status }).from(schema.petrosTeacherHandoffs).where(query.institutionId ? eq(schema.petrosTeacherHandoffs.institutionId, query.institutionId) : undefined),
      this.db.select({ suppressed: schema.petrosClassStruggleSignals.suppressed }).from(schema.petrosClassStruggleSignals).where(query.institutionId ? eq(schema.petrosClassStruggleSignals.institutionId, query.institutionId) : undefined),
      this.db.select({ status: schema.petrosParentDigests.status, attemptCount: schema.petrosParentDigests.attemptCount }).from(schema.petrosParentDigests).where(query.institutionId ? eq(schema.petrosParentDigests.institutionId, query.institutionId) : undefined),
    ]);
    return { events, policies, snapshots, handoffs, signals, digests };
  }

  exportStudent(institutionId: string, studentId: string) {
    return Promise.all([
      this.db.select().from(schema.petrosPolicySessionSnapshots).where(and(eq(schema.petrosPolicySessionSnapshots.institutionId, institutionId), eq(schema.petrosPolicySessionSnapshots.studentId, studentId))),
      this.db.select({ receipt: schema.petrosPolicyDisclosureReceipts }).from(schema.petrosPolicyDisclosureReceipts)
        .innerJoin(schema.petrosPolicySessionSnapshots, eq(schema.petrosPolicySessionSnapshots.id, schema.petrosPolicyDisclosureReceipts.snapshotId))
        .where(and(eq(schema.petrosPolicySessionSnapshots.institutionId, institutionId), eq(schema.petrosPolicySessionSnapshots.studentId, studentId))),
      this.db.select().from(schema.petrosTeacherHandoffs).where(and(eq(schema.petrosTeacherHandoffs.institutionId, institutionId), eq(schema.petrosTeacherHandoffs.studentId, studentId))),
      this.db.select().from(schema.petrosHomeworkPolicyMatches).where(and(eq(schema.petrosHomeworkPolicyMatches.institutionId, institutionId), eq(schema.petrosHomeworkPolicyMatches.studentId, studentId))),
      this.db.select().from(schema.petrosParentDigestPreferences).where(and(eq(schema.petrosParentDigestPreferences.institutionId, institutionId), eq(schema.petrosParentDigestPreferences.studentId, studentId))),
      this.db.select().from(schema.petrosParentDigests).where(and(eq(schema.petrosParentDigests.institutionId, institutionId), eq(schema.petrosParentDigests.studentId, studentId))),
      this.db.select().from(schema.petrosInstitutionalEvents).where(and(eq(schema.petrosInstitutionalEvents.institutionId, institutionId), eq(schema.petrosInstitutionalEvents.studentId, studentId))),
    ]).then(([snapshots, receipts, handoffs, homework, digestPreferences, digests, events]) => ({ snapshots, receipts: receipts.map((row) => row.receipt), handoffs, homework, digestPreferences, digests, events }));
  }

  async deleteStudentDerived(institutionId: string, studentId: string) {
    await this.db.delete(schema.petrosParentDigests).where(and(eq(schema.petrosParentDigests.institutionId, institutionId), eq(schema.petrosParentDigests.studentId, studentId)));
    await this.db.delete(schema.petrosParentDigestPreferences).where(and(eq(schema.petrosParentDigestPreferences.institutionId, institutionId), eq(schema.petrosParentDigestPreferences.studentId, studentId)));
    await this.db.delete(schema.petrosTeacherHandoffs).where(and(eq(schema.petrosTeacherHandoffs.institutionId, institutionId), eq(schema.petrosTeacherHandoffs.studentId, studentId)));
    await this.db.delete(schema.petrosInstitutionalEvents).where(and(eq(schema.petrosInstitutionalEvents.institutionId, institutionId), eq(schema.petrosInstitutionalEvents.studentId, studentId)));
    await this.db.delete(schema.petrosPolicySessionSnapshots).where(and(eq(schema.petrosPolicySessionSnapshots.institutionId, institutionId), eq(schema.petrosPolicySessionSnapshots.studentId, studentId)));
  }
}

function nullableEq(column: any, value: string | null) {
  return value === null ? isNull(column) : eq(column, value);
}
