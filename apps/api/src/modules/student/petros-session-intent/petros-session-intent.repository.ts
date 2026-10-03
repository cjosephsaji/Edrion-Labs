import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  or,
  schema,
  sql,
  getDatabase,
  type Database,
} from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import { KnowledgeDocumentService } from '../knowledge/knowledge-document.service';

@Injectable()
export class PetrosSessionIntentRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly documents: KnowledgeDocumentService,
  ) {}

  findIntentByKey(scope: PetrosOwnerScope, idempotencyKey: string) {
    return this.db
      .select()
      .from(schema.petrosSessionIntents)
      .where(
        and(
          eq(schema.petrosSessionIntents.institutionId, scope.institutionId),
          eq(schema.petrosSessionIntents.studentId, scope.studentId),
          eq(schema.petrosSessionIntents.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  findIntent(scope: PetrosOwnerScope, intentId: string, lock = false) {
    const query = this.db
      .select()
      .from(schema.petrosSessionIntents)
      .where(
        and(
          eq(schema.petrosSessionIntents.id, intentId),
          eq(schema.petrosSessionIntents.institutionId, scope.institutionId),
          eq(schema.petrosSessionIntents.studentId, scope.studentId),
        ),
      )
      .limit(1);
    // Serialize starts without blocking the failure-telemetry connection's FK key-share lock.
    return (lock ? query.for('no key update') : query).then((rows) => rows[0]);
  }

  studentClassId(scope: PetrosOwnerScope) {
    return this.db.select({ classId: schema.students.classId }).from(schema.students)
      .where(and(eq(schema.students.id, scope.studentId), eq(schema.students.institutionId, scope.institutionId)))
      .limit(1).then((rows) => rows[0]?.classId ?? null);
  }

  createIntent(values: typeof schema.petrosSessionIntents.$inferInsert) {
    return this.db
      .insert(schema.petrosSessionIntents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  markStarted(scope: PetrosOwnerScope, intentId: string, sessionId: string) {
    return this.db
      .update(schema.petrosSessionIntents)
      .set({ status: 'started', sessionId, startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosSessionIntents.id, intentId),
          eq(schema.petrosSessionIntents.institutionId, scope.institutionId),
          eq(schema.petrosSessionIntents.studentId, scope.studentId),
          eq(schema.petrosSessionIntents.status, 'resolved'),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  invalidate(scope: PetrosOwnerScope, intentId: string, status: 'expired' | 'invalidated') {
    return this.db
      .update(schema.petrosSessionIntents)
      .set({ status, invalidatedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosSessionIntents.id, intentId),
          eq(schema.petrosSessionIntents.institutionId, scope.institutionId),
          eq(schema.petrosSessionIntents.studentId, scope.studentId),
        ),
      );
  }

  recordEvent(values: typeof schema.petrosDoorEvents.$inferInsert) {
    return this.db
      .insert(schema.petrosDoorEvents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  /**
   * Rejected student requests roll their tenant transaction back. Failure telemetry is content-free
   * and must survive that rollback, so it uses the maintenance connection with explicit owner scope.
   */
  recordFailureEvent(values: typeof schema.petrosDoorEvents.$inferInsert) {
    return getDatabase()
      .insert(schema.petrosDoorEvents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .then((rows) => rows[0]);
  }

  async resultSource(scope: PetrosOwnerScope, sourceId: string) {
    const [row] = await this.db
      .select({
        id: schema.gradeEntries.id,
        subjectId: schema.gradeEntries.subjectId,
        subjectName: schema.subjects.name,
        assessmentName: schema.gradeEntries.assessmentName,
        examName: schema.exams.name,
        marksObtained: schema.gradeEntries.marksObtained,
        maxMarks: schema.gradeEntries.maxMarks,
        letterGrade: schema.gradeEntries.letterGrade,
        remarks: schema.gradeEntries.remarks,
        version: schema.gradeEntries.version,
        updatedAt: schema.gradeEntries.updatedAt,
      })
      .from(schema.gradeEntries)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.gradeEntries.subjectId))
      .leftJoin(schema.exams, eq(schema.exams.id, schema.gradeEntries.examId))
      .where(
        and(
          eq(schema.gradeEntries.institutionId, scope.institutionId),
          eq(schema.gradeEntries.studentId, scope.studentId),
          eq(schema.gradeEntries.published, true),
          or(eq(schema.gradeEntries.id, sourceId), eq(schema.gradeEntries.subjectId, sourceId)),
        ),
      )
      .orderBy(desc(schema.gradeEntries.updatedAt))
      .limit(1);
    return row;
  }

  async examSource(scope: PetrosOwnerScope, sourceId: string) {
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, scope.studentId),
          eq(schema.students.institutionId, scope.institutionId),
        ),
      )
      .limit(1);
    if (!student?.classId) return undefined;
    const [row] = await this.db
      .select({
        id: schema.examSchedules.id,
        examId: schema.exams.id,
        examName: schema.exams.name,
        examStatus: schema.exams.status,
        subjectId: schema.examSchedules.subjectId,
        subjectName: schema.subjects.name,
        examDate: schema.examSchedules.examDate,
        startTime: schema.examSchedules.startTime,
        syllabusNote: schema.examSchedules.syllabusNote,
        scheduleVersion: schema.examSchedules.version,
        examVersion: schema.exams.version,
        updatedAt: schema.examSchedules.updatedAt,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
      .where(
        and(
          eq(schema.examSchedules.id, sourceId),
          eq(schema.examSchedules.institutionId, scope.institutionId),
          eq(schema.examSchedules.classId, student.classId),
          eq(schema.examSchedules.published, true),
        ),
      )
      .limit(1);
    return row;
  }

  async assignmentSource(scope: PetrosOwnerScope, sourceId: string) {
    const [student, assignment] = await Promise.all([
      this.db.select({ classId: schema.students.classId }).from(schema.students)
        .where(and(eq(schema.students.id, scope.studentId), eq(schema.students.institutionId, scope.institutionId)))
        .limit(1).then((rows) => rows[0]),
      this.db.select().from(schema.assignments)
        .where(and(
          eq(schema.assignments.id, sourceId),
          eq(schema.assignments.institutionId, scope.institutionId),
          eq(schema.assignments.status, 'published'),
        ))
        .limit(1).then((rows) => rows[0]),
    ]);
    if (!student || !assignment) return undefined;
    const [assignee, enrollment, submission, subject] = await Promise.all([
      this.db.select({ id: schema.assignmentAssignees.id }).from(schema.assignmentAssignees)
        .where(and(eq(schema.assignmentAssignees.assignmentId, sourceId), eq(schema.assignmentAssignees.studentId, scope.studentId)))
        .limit(1).then((rows) => rows[0]),
      assignment.courseId
        ? this.db.select({ id: schema.courseEnrollments.id }).from(schema.courseEnrollments)
            .where(and(eq(schema.courseEnrollments.courseId, assignment.courseId), eq(schema.courseEnrollments.studentId, scope.studentId)))
            .limit(1).then((rows) => rows[0])
        : Promise.resolve(undefined),
      this.db.select().from(schema.assignmentSubmissions)
        .where(and(
          eq(schema.assignmentSubmissions.institutionId, scope.institutionId),
          eq(schema.assignmentSubmissions.assignmentId, sourceId),
          eq(schema.assignmentSubmissions.studentId, scope.studentId),
        ))
        .limit(1).then((rows) => rows[0]),
      assignment.subjectId
        ? this.db.select({ name: schema.subjects.name }).from(schema.subjects)
            .where(and(eq(schema.subjects.id, assignment.subjectId), eq(schema.subjects.institutionId, scope.institutionId)))
            .limit(1).then((rows) => rows[0])
        : Promise.resolve(undefined),
    ]);
    if (student.classId !== assignment.classId && !assignee && !enrollment) return undefined;
    return { assignment, submission, subjectName: subject?.name ?? null };
  }

  documentSource(scope: PetrosOwnerScope, sourceId: string, page?: number, fingerprint?: string) {
    return this.documents.resolve(scope, sourceId, page, fingerprint);
  }

  documentLocator(scope: PetrosOwnerScope, sourceId: string, locator: Parameters<KnowledgeDocumentService['locator']>[2]) {
    return this.documents.locator(scope, sourceId, locator);
  }

  searchDocument(scope: PetrosOwnerScope, sourceId: string, input: Parameters<KnowledgeDocumentService['search']>[2], signal?: AbortSignal) {
    return this.documents.search(scope, sourceId, input, signal);
  }

  compareDocuments(scope: PetrosOwnerScope, input: Parameters<KnowledgeDocumentService['compare']>[1], signal?: AbortSignal) {
    return this.documents.compare(scope, input, signal);
  }
  selectedDocumentScope(scope: PetrosOwnerScope, sourceId: string) {
    return this.documents.selectedScope(scope, sourceId);
  }

  findDocumentOutline(
    scope: PetrosOwnerScope,
    knowledgeItemId: string,
    documentVersion: number,
    sourceFingerprint: string,
  ) {
    return this.db.select().from(schema.petrosDocumentLessonOutlines).where(and(
      eq(schema.petrosDocumentLessonOutlines.institutionId, scope.institutionId),
      eq(schema.petrosDocumentLessonOutlines.studentId, scope.studentId),
      eq(schema.petrosDocumentLessonOutlines.knowledgeItemId, knowledgeItemId),
      eq(schema.petrosDocumentLessonOutlines.documentVersion, documentVersion),
      eq(schema.petrosDocumentLessonOutlines.sourceFingerprint, sourceFingerprint),
    )).limit(1).then((rows) => rows[0]);
  }

  saveDocumentOutline(values: typeof schema.petrosDocumentLessonOutlines.$inferInsert) {
    const table = schema.petrosDocumentLessonOutlines;
    return this.db.insert(table).values(values).onConflictDoUpdate({
      target: [
        table.institutionId,
        table.studentId,
        table.knowledgeItemId,
        table.documentVersion,
        table.sourceFingerprint,
      ],
      set: { outline: values.outline, updatedAt: new Date() },
    }).returning().then((rows) => rows[0]);
  }

  findDocumentLessonPlan(
    scope: PetrosOwnerScope,
    knowledgeItemId: string,
    documentVersion: number,
    sourceFingerprint: string,
  ) {
    return this.db.select({ lessonPlan: schema.petrosDocumentLessonOutlines.lessonPlan }).from(schema.petrosDocumentLessonOutlines).where(and(
      eq(schema.petrosDocumentLessonOutlines.institutionId, scope.institutionId),
      eq(schema.petrosDocumentLessonOutlines.studentId, scope.studentId),
      eq(schema.petrosDocumentLessonOutlines.knowledgeItemId, knowledgeItemId),
      eq(schema.petrosDocumentLessonOutlines.documentVersion, documentVersion),
      eq(schema.petrosDocumentLessonOutlines.sourceFingerprint, sourceFingerprint),
    )).limit(1).then((rows) => rows[0]?.lessonPlan ?? null);
  }

  saveDocumentLessonPlan(
    scope: PetrosOwnerScope,
    knowledgeItemId: string,
    documentVersion: number,
    sourceFingerprint: string,
    topicId: string,
    lessonPlan: Record<string, unknown>,
  ) {
    const table = schema.petrosDocumentLessonOutlines;
    return this.db.select({ id: table.id, lessonPlan: table.lessonPlan }).from(table).where(and(
      eq(table.institutionId, scope.institutionId),
      eq(table.studentId, scope.studentId),
      eq(table.knowledgeItemId, knowledgeItemId),
      eq(table.documentVersion, documentVersion),
      eq(table.sourceFingerprint, sourceFingerprint),
    )).limit(1).then(async (rows) => {
      const row = rows[0];
      if (!row) return undefined;
      const existing = row.lessonPlan && typeof row.lessonPlan === 'object' && !Array.isArray(row.lessonPlan)
        && !('schemaVersion' in row.lessonPlan)
        ? row.lessonPlan
        : {};
      return this.db.update(table).set({ lessonPlan: { ...existing, [topicId]: lessonPlan }, updatedAt: new Date() }).where(eq(table.id, row.id)).returning().then((updated) => updated[0]);
    });
  }

  /** Finds the nearest teacher-authored date for a document's published subject. */
  async documentSchedule(scope: PetrosOwnerScope, item: { origin: Record<string, unknown> }, now = new Date()) {
    const classMaterialId = typeof item.origin?.classMaterialId === 'string'
      ? item.origin.classMaterialId
      : null;
    if (!classMaterialId) return null;
    const [student, material] = await Promise.all([
      this.db.select({ classId: schema.students.classId }).from(schema.students).where(and(
        eq(schema.students.id, scope.studentId),
        eq(schema.students.institutionId, scope.institutionId),
      )).limit(1).then((rows) => rows[0]),
      this.db.select({ subjectId: schema.classMaterials.subjectId, subjectName: schema.subjects.name })
        .from(schema.classMaterials)
        .leftJoin(schema.subjects, eq(schema.subjects.id, schema.classMaterials.subjectId))
        .where(and(
          eq(schema.classMaterials.id, classMaterialId),
          eq(schema.classMaterials.institutionId, scope.institutionId),
        )).limit(1).then((rows) => rows[0]),
    ]);
    if (!student?.classId || !material?.subjectId) return null;
    const today = now.toISOString().slice(0, 10);
    const [exam, assignment] = await Promise.all([
      this.db.select({
        title: schema.exams.name,
        date: schema.examSchedules.examDate,
        startTime: schema.examSchedules.startTime,
      }).from(schema.examSchedules)
        .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
        .where(and(
          eq(schema.examSchedules.institutionId, scope.institutionId),
          eq(schema.examSchedules.classId, student.classId),
          eq(schema.examSchedules.subjectId, material.subjectId),
          eq(schema.examSchedules.published, true),
          gte(schema.examSchedules.examDate, today),
        )).orderBy(asc(schema.examSchedules.examDate)).limit(1).then((rows) => rows[0]),
      this.db.select({ title: schema.assignments.title, date: schema.assignments.dueDate })
        .from(schema.assignments)
        .where(and(
          eq(schema.assignments.institutionId, scope.institutionId),
          eq(schema.assignments.classId, student.classId),
          eq(schema.assignments.subjectId, material.subjectId),
          eq(schema.assignments.status, 'published'),
          gte(schema.assignments.dueDate, today),
        )).orderBy(asc(schema.assignments.dueDate)).limit(1).then((rows) => rows[0]),
    ]);
    const dates = [
      exam?.date ? { kind: 'exam' as const, title: exam.title, at: teacherDateIso(exam.date, exam.startTime) } : null,
      assignment?.date ? { kind: 'assignment' as const, title: assignment.title, at: teacherDateIso(assignment.date) } : null,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value));
    return dates.sort((a, b) => a.at.localeCompare(b.at))[0]
      ? { ...dates.sort((a, b) => a.at.localeCompare(b.at))[0]!, subjectName: material.subjectName ?? null }
      : null;
  }

  async pathSource(scope: PetrosOwnerScope, sourceId: string) {
    const [row] = await this.db
      .select({
        path: schema.learningPaths,
        item: schema.learningPathItems,
        topic: schema.learnTopics,
      })
      .from(schema.learningPathItems)
      .innerJoin(schema.learningPaths, eq(schema.learningPaths.id, schema.learningPathItems.pathId))
      .innerJoin(schema.learnTopics, eq(schema.learnTopics.id, schema.learningPathItems.topicId))
      .where(
        and(
          eq(schema.learningPathItems.id, sourceId),
          eq(schema.learningPaths.institutionId, scope.institutionId),
          eq(schema.learningPaths.studentId, scope.studentId),
          eq(schema.learningPaths.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    const previous = await this.db
      .select({ title: schema.learnTopics.title, status: schema.learningPathItems.status })
      .from(schema.learningPathItems)
      .innerJoin(schema.learnTopics, eq(schema.learnTopics.id, schema.learningPathItems.topicId))
      .where(
        and(
          eq(schema.learningPathItems.pathId, row.path.id),
          sql`${schema.learningPathItems.sequence} < ${row.item.sequence}`,
        ),
      )
      .orderBy(asc(schema.learningPathItems.sequence));
    return { ...row, previous };
  }

  async reflectionSource(scope: PetrosOwnerScope, sourceId: string) {
    const [row] = await this.db
      .select({
        recommendation: schema.petrosReflectionRecommendations,
        snapshot: schema.petrosReflectionSnapshots,
      })
      .from(schema.petrosReflectionRecommendations)
      .innerJoin(
        schema.petrosReflectionSnapshots,
        eq(
          schema.petrosReflectionSnapshots.id,
          schema.petrosReflectionRecommendations.snapshotId,
        ),
      )
      .where(
        and(
          eq(schema.petrosReflectionRecommendations.id, sourceId),
          eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
          eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
          or(
            eq(schema.petrosReflectionRecommendations.status, 'active'),
            eq(schema.petrosReflectionRecommendations.status, 'started'),
          ),
        ),
      )
      .limit(1);
    return row;
  }

  markReflectionRecommendationStarted(
    scope: PetrosOwnerScope,
    recommendationId: string,
    intentId: string,
  ) {
    return this.db
      .update(schema.petrosReflectionRecommendations)
      .set({ status: 'started', startedIntentId: intentId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosReflectionRecommendations.id, recommendationId),
          eq(schema.petrosReflectionRecommendations.institutionId, scope.institutionId),
          eq(schema.petrosReflectionRecommendations.studentId, scope.studentId),
          eq(schema.petrosReflectionRecommendations.status, 'active'),
        ),
      );
  }

  preferences(scope: PetrosOwnerScope) {
    return this.db
      .select()
      .from(schema.studentPreferences)
      .where(eq(schema.studentPreferences.studentId, scope.studentId))
      .limit(1)
      .then((rows) => rows[0]);
  }

  async assistantContext(scope: PetrosOwnerScope) {
    const [student] = await this.db
      .select({
        name: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.lastName})`,
        classId: schema.students.classId,
        className: schema.classes.name,
        termName: schema.academicTerms.name,
        academicYearName: schema.academicYears.name,
        programmeName: schema.departments.name,
      })
      .from(schema.students)
      .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .leftJoin(schema.academicTerms, eq(schema.academicTerms.id, schema.classes.termId))
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, schema.classes.academicYearId))
      .leftJoin(
        schema.departmentGradeLevels,
        eq(schema.departmentGradeLevels.id, schema.classes.programmeLevelId),
      )
      .leftJoin(schema.departments, eq(schema.departments.id, schema.departmentGradeLevels.departmentId))
      .where(
        and(
          eq(schema.students.id, scope.studentId),
          eq(schema.students.institutionId, scope.institutionId),
        ),
      )
      .limit(1);

    const classId = student?.classId ?? null;
    const [assignments, homework, results, attendance, exams, courses, planner, evidence, notices] =
      await Promise.all([
        this.db
          .select({
            title: schema.assignments.title,
            subject: schema.subjects.name,
            instructions: schema.assignments.instructions,
            dueDate: schema.assignments.dueDate,
            aiPolicy: schema.assignments.aiPolicy,
            status: schema.assignmentSubmissions.status,
            pointsAwarded: schema.assignmentSubmissions.pointsAwarded,
            maxPoints: schema.assignments.maxPoints,
            teacherFeedback: schema.assignmentSubmissions.feedback,
          })
          .from(schema.assignmentAssignees)
          .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentAssignees.assignmentId))
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.assignments.subjectId))
          .leftJoin(
            schema.assignmentSubmissions,
            and(
              eq(schema.assignmentSubmissions.assignmentId, schema.assignments.id),
              eq(schema.assignmentSubmissions.studentId, scope.studentId),
            ),
          )
          .where(
            and(
              eq(schema.assignmentAssignees.studentId, scope.studentId),
              eq(schema.assignments.institutionId, scope.institutionId),
              eq(schema.assignments.status, 'published'),
            ),
          )
          .orderBy(asc(schema.assignments.dueDate))
          .limit(12),
        this.db
          .select({
            title: schema.homework.title,
            subject: schema.subjects.name,
            instructions: schema.homework.instructions,
            dueAt: schema.homework.dueAt,
            aiPolicy: schema.homework.aiPolicy,
            status: schema.homeworkSubmissions.status,
            marks: schema.homeworkSubmissions.totalMarks,
            maxMarks: schema.homeworkSubmissions.totalMax,
            teacherNote: schema.homeworkSubmissions.teacherNote,
          })
          .from(schema.homeworkSubmissions)
          .innerJoin(schema.homework, eq(schema.homework.id, schema.homeworkSubmissions.homeworkId))
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.homework.subjectId))
          .where(
            and(
              eq(schema.homeworkSubmissions.studentId, scope.studentId),
              eq(schema.homework.institutionId, scope.institutionId),
              eq(schema.homework.status, 'assigned'),
            ),
          )
          .orderBy(asc(schema.homework.dueAt))
          .limit(12),
        this.db
          .select({
            assessment: schema.gradeEntries.assessmentName,
            subject: schema.subjects.name,
            marks: schema.gradeEntries.marksObtained,
            maxMarks: schema.gradeEntries.maxMarks,
            grade: schema.gradeEntries.letterGrade,
            remarks: schema.gradeEntries.remarks,
          })
          .from(schema.gradeEntries)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.gradeEntries.subjectId))
          .where(
            and(
              eq(schema.gradeEntries.studentId, scope.studentId),
              eq(schema.gradeEntries.institutionId, scope.institutionId),
              eq(schema.gradeEntries.published, true),
            ),
          )
          .orderBy(desc(schema.gradeEntries.updatedAt))
          .limit(10),
        this.db
          .select({
            subject: schema.subjects.name,
            attended: schema.attendanceRollups.attended,
            conducted: schema.attendanceRollups.conducted,
            percentage: schema.attendanceRollups.pct,
            zone: schema.attendanceRollups.zone,
          })
          .from(schema.attendanceRollups)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceRollups.subjectId))
          .where(
            and(
              eq(schema.attendanceRollups.studentId, scope.studentId),
              eq(schema.attendanceRollups.institutionId, scope.institutionId),
            ),
          )
          .limit(10),
        classId
          ? this.db
              .select({
                exam: schema.exams.name,
                subject: schema.subjects.name,
                date: schema.examSchedules.examDate,
                startTime: schema.examSchedules.startTime,
                syllabus: schema.examSchedules.syllabusNote,
                status: schema.exams.status,
              })
              .from(schema.examSchedules)
              .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
              .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
              .where(
                and(
                  eq(schema.examSchedules.classId, classId),
                  eq(schema.examSchedules.institutionId, scope.institutionId),
                  eq(schema.examSchedules.published, true),
                ),
              )
              .orderBy(asc(schema.examSchedules.examDate))
              .limit(12)
          : Promise.resolve([]),
        this.db
          .select({
            code: schema.courses.code,
            name: schema.courses.name,
            officeHours: schema.courses.officeHours,
          })
          .from(schema.courseEnrollments)
          .innerJoin(schema.courses, eq(schema.courses.id, schema.courseEnrollments.courseId))
          .where(
            and(
              eq(schema.courseEnrollments.studentId, scope.studentId),
              eq(schema.courseEnrollments.institutionId, scope.institutionId),
            ),
          )
          .limit(10),
        this.db
          .select({
            title: schema.userObligations.title,
            kind: schema.userObligations.kind,
            dueAt: schema.userObligations.dueAt,
            status: schema.userObligations.status,
          })
          .from(schema.userObligations)
          .where(
            and(
              eq(schema.userObligations.studentId, scope.studentId),
              eq(schema.userObligations.status, 'pending'),
            ),
          )
          .orderBy(asc(schema.userObligations.dueAt))
          .limit(10),
        this.db
          .select({
            concept: schema.petrosLearnerEvidenceEvents.conceptId,
            outcome: schema.petrosLearnerEvidenceEvents.outcome,
            errorCategory: schema.petrosLearnerEvidenceEvents.errorCategory,
            moveType: schema.petrosLearnerEvidenceEvents.moveType,
            occurredAt: schema.petrosLearnerEvidenceEvents.occurredAt,
          })
          .from(schema.petrosLearnerEvidenceEvents)
          .where(
            and(
              eq(schema.petrosLearnerEvidenceEvents.studentId, scope.studentId),
              eq(schema.petrosLearnerEvidenceEvents.institutionId, scope.institutionId),
            ),
          )
          .orderBy(desc(schema.petrosLearnerEvidenceEvents.occurredAt))
          .limit(12),
        classId
          ? this.db
              .select({
                title: schema.classStreamPosts.title,
                body: schema.classStreamPosts.body,
                kind: schema.classStreamPosts.kind,
                postedAt: schema.classStreamPosts.postedAt,
              })
              .from(schema.classStreamPosts)
              .where(
                and(
                  eq(schema.classStreamPosts.institutionId, scope.institutionId),
                  eq(schema.classStreamPosts.contextType, 'class'),
                  eq(schema.classStreamPosts.contextId, classId),
                ),
              )
              .orderBy(desc(schema.classStreamPosts.postedAt))
              .limit(8)
          : Promise.resolve([]),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      student: student
        ? {
            name: student.name,
            className: student.className,
            programmeName: student.programmeName,
            termName: student.termName,
            academicYearName: student.academicYearName,
          }
        : null,
      assignments,
      homework,
      results,
      attendance,
      exams,
      courses,
      planner,
      learnerEvidence: evidence,
      classNotices: notices,
    };
  }

  async listUploadedDocuments(scope: PetrosOwnerScope) {
    const rows = await this.db.select({ id: schema.knowledgeItems.id }).from(schema.knowledgeItems).where(and(
      eq(schema.knowledgeItems.institutionId, scope.institutionId), eq(schema.knowledgeItems.studentId, scope.studentId),
    )).orderBy(desc(schema.knowledgeItems.updatedAt));
    const visible = await Promise.all(rows.map(async (row) => {
      try {
        const { item } = await this.documents.resolve(scope, row.id);
        return {
          id: item.id, title: item.title, kind: item.kind, pageCount: item.pageCount,
          status: item.status, extractionReady: item.extractedTextReady, pagesDone: item.pagesDone,
          origin: item.origin, version: item.version, updatedAt: item.updatedAt,
        };
      } catch (error) {
        if (error instanceof NotFoundException || error instanceof ConflictException) return null;
        throw error;
      }
    }));
    return visible.filter((row): row is NonNullable<typeof row> => row !== null);
  }

  async currentPath(scope: PetrosOwnerScope) {
    const [path] = await this.db
      .select()
      .from(schema.learningPaths)
      .where(
        and(
          eq(schema.learningPaths.institutionId, scope.institutionId),
          eq(schema.learningPaths.studentId, scope.studentId),
          eq(schema.learningPaths.status, 'active'),
        ),
      )
      .orderBy(desc(schema.learningPaths.updatedAt))
      .limit(1);
    if (!path) return null;
    const items = await this.db
      .select({ item: schema.learningPathItems, topic: schema.learnTopics })
      .from(schema.learningPathItems)
      .innerJoin(schema.learnTopics, eq(schema.learnTopics.id, schema.learningPathItems.topicId))
      .where(eq(schema.learningPathItems.pathId, path.id))
      .orderBy(asc(schema.learningPathItems.sequence));
    return {
      id: path.id,
      title: path.title,
      subjectLabel: path.subjectLabel,
      metaLine: path.metaLine,
      version: path.version,
      items: items
        .filter((row) => row.item.status !== 'removed')
        .map((row) => ({
          id: row.item.id,
          topicId: row.topic.id,
          title: row.topic.title,
          subjectLabel: row.topic.subjectLabel,
          sequence: row.item.sequence,
          whyHere: row.item.whyHere,
          status: row.item.status,
          completedAt: row.item.completedAt?.toISOString() ?? null,
          version: row.item.version,
        })),
    };
  }

  async dashboard(input: {
    institutionId?: string;
    door?: string;
    sessionType?: string;
    from?: Date;
    to?: Date;
  }) {
    const conditions = [];
    if (input.institutionId)
      conditions.push(eq(schema.petrosDoorEvents.institutionId, input.institutionId));
    if (input.door) conditions.push(eq(schema.petrosDoorEvents.door, input.door));
    if (input.sessionType)
      conditions.push(eq(schema.petrosDoorEvents.sessionType, input.sessionType));
    if (input.from) conditions.push(gte(schema.petrosDoorEvents.createdAt, input.from));
    if (input.to) conditions.push(lte(schema.petrosDoorEvents.createdAt, input.to));
    const where = conditions.length ? and(...conditions) : undefined;
    const events = await this.db
      .select({
        door: schema.petrosDoorEvents.door,
        sessionType: schema.petrosDoorEvents.sessionType,
        type: schema.petrosDoorEvents.type,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.petrosDoorEvents)
      .where(where)
      .groupBy(
        schema.petrosDoorEvents.door,
        schema.petrosDoorEvents.sessionType,
        schema.petrosDoorEvents.type,
      );
    const failures = await this.db
      .select({
        reasonCode: schema.petrosDoorEvents.reasonCode,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.petrosDoorEvents)
      .where(and(eq(schema.petrosDoorEvents.type, 'failure'), ...(conditions.length ? conditions : [])))
      .groupBy(schema.petrosDoorEvents.reasonCode);
    const [latency] = await this.db
      .select({
        averageMs: sql<number>`coalesce(avg(extract(epoch from (${schema.petrosTeachingBlocks.createdAt} - ${schema.petrosLearningSessions.createdAt})) * 1000), 0)::float8`,
        maximumMs: sql<number>`coalesce(max(extract(epoch from (${schema.petrosTeachingBlocks.createdAt} - ${schema.petrosLearningSessions.createdAt})) * 1000), 0)::float8`,
      })
      .from(schema.petrosSessionIntents)
      .innerJoin(schema.petrosLearningSessions, eq(schema.petrosLearningSessions.id, schema.petrosSessionIntents.sessionId))
      .innerJoin(schema.petrosTeachingBlocks, and(eq(schema.petrosTeachingBlocks.sessionId, schema.petrosLearningSessions.id), eq(schema.petrosTeachingBlocks.sequence, 1)))
      .where(and(
        ...(input.institutionId ? [eq(schema.petrosSessionIntents.institutionId, input.institutionId)] : []),
        ...(input.door ? [eq(schema.petrosSessionIntents.door, input.door)] : []),
        ...(input.sessionType ? [eq(schema.petrosSessionIntents.sessionType, input.sessionType)] : []),
        ...(input.from ? [gte(schema.petrosSessionIntents.createdAt, input.from)] : []),
        ...(input.to ? [lte(schema.petrosSessionIntents.createdAt, input.to)] : []),
      ));
    const emotionalRegister = sql<string>`coalesce(${schema.petrosSessionIntents.resolvedIntent}->>'emotionalRegister','unknown')`;
    const factors = await this.db
      .select({
        door: schema.petrosSessionIntents.door,
        sessionType: schema.petrosSessionIntents.sessionType,
        emotionalRegister,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.petrosSessionIntents)
      .where(and(
        ...(input.institutionId ? [eq(schema.petrosSessionIntents.institutionId, input.institutionId)] : []),
        ...(input.door ? [eq(schema.petrosSessionIntents.door, input.door)] : []),
        ...(input.sessionType ? [eq(schema.petrosSessionIntents.sessionType, input.sessionType)] : []),
        ...(input.from ? [gte(schema.petrosSessionIntents.createdAt, input.from)] : []),
        ...(input.to ? [lte(schema.petrosSessionIntents.createdAt, input.to)] : []),
      ))
      .groupBy(schema.petrosSessionIntents.door, schema.petrosSessionIntents.sessionType, emotionalRegister);
    const initialMoves = await this.db
      .select({
        door: schema.petrosSessionIntents.door,
        sessionType: schema.petrosSessionIntents.sessionType,
        moveType: schema.petrosPlanningDecisions.selectedMoveType,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.petrosSessionIntents)
      .innerJoin(schema.petrosPlanningDecisions, and(eq(schema.petrosPlanningDecisions.sessionId, schema.petrosSessionIntents.sessionId), eq(schema.petrosPlanningDecisions.sequence, 1)))
      .where(and(
        ...(input.institutionId ? [eq(schema.petrosSessionIntents.institutionId, input.institutionId)] : []),
        ...(input.door ? [eq(schema.petrosSessionIntents.door, input.door)] : []),
        ...(input.sessionType ? [eq(schema.petrosSessionIntents.sessionType, input.sessionType)] : []),
        ...(input.from ? [gte(schema.petrosPlanningDecisions.createdAt, input.from)] : []),
        ...(input.to ? [lte(schema.petrosPlanningDecisions.createdAt, input.to)] : []),
      ))
      .groupBy(schema.petrosSessionIntents.door, schema.petrosSessionIntents.sessionType, schema.petrosPlanningDecisions.selectedMoveType);
    const [cost] = await this.db
      .select({
        totalMicros: sql<number>`coalesce(sum(${schema.petrosAiUsageEvents.estimatedCostMicros}),0)::float8`,
        attempts: sql<number>`count(*)::int`,
      })
      .from(schema.petrosAiUsageEvents)
      .innerJoin(
        schema.petrosSessionIntents,
        eq(schema.petrosSessionIntents.sessionId, schema.petrosAiUsageEvents.sessionId),
      )
      .where(
        and(
          ...(input.institutionId
            ? [eq(schema.petrosSessionIntents.institutionId, input.institutionId)]
            : []),
          ...(input.door ? [eq(schema.petrosSessionIntents.door, input.door)] : []),
          ...(input.sessionType
            ? [eq(schema.petrosSessionIntents.sessionType, input.sessionType)]
            : []),
          ...(input.from ? [gte(schema.petrosAiUsageEvents.createdAt, input.from)] : []),
          ...(input.to ? [lte(schema.petrosAiUsageEvents.createdAt, input.to)] : []),
        ),
      );
    return { events, failures, latency, cost, factors, initialMoves };
  }
}

function teacherDateIso(date: string, time?: string | null) {
  const normalizedTime = /^\d{2}:\d{2}(?::\d{2})?$/.test(time ?? '') ? time! : '00:00:00';
  const withSeconds = normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
  return new Date(`${date}T${withSeconds}.000Z`).toISOString();
}
