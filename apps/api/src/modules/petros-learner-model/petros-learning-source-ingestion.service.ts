import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuditWriter } from "@edrion/audit";
import { and, eq, isNotNull, schema, type Database } from "@edrion/database";
import type {
  PetrosErrorCategory,
  PetrosLearnerModelSourceSyncInput,
  PetrosNormalizedLearningEvidence,
} from "@edrion/schemas";
import { AUDIT_WRITER, DATABASE } from "../../common/tokens";
import { baseAudit, type ActionContext } from "../../common/action-context";
import { PetrosLearnerModelService } from "./petros-learner-model.service";
import type { LearnerOwnerScope } from "./petros-learner-model.repository";
import {
  normalizeAssignmentAnswer,
  normalizeExamAnswer,
  normalizeHomeworkAnswer,
  normalizeLibraryQuizAnswer,
  normalizeMockExamAnswer,
} from "./petros-learning-source-normalizers";

type SourceAnswer = Parameters<typeof normalizeExamAnswer>[0];

type DeliverySummary = {
  scanned: number;
  accepted: number;
  duplicates: number;
  quarantined: number;
  failed: number;
};

const EMPTY_DELIVERY: DeliverySummary = {
  scanned: 0,
  accepted: 0,
  duplicates: 0,
  quarantined: 0,
  failed: 0,
};

@Injectable()
export class PetrosLearningSourceIngestionService {
  private readonly logger = new Logger(
    PetrosLearningSourceIngestionService.name,
  );

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly learnerModels: PetrosLearnerModelService,
  ) {}

  /** Called after an exam attempt commit. Learner-model failure never rolls back the exam. */
  ingestExamAttempt(scope: LearnerOwnerScope, attemptId: string) {
    return this.safely("exam-attempt", scope, async () => {
      const rows = await this.examRows(scope, { attemptId });
      return this.deliver(
        scope,
        rows.flatMap((row) => {
          const source = this.examSourceAnswer(row);
          return source ? [normalizeExamAnswer(source)] : [];
        }),
      );
    });
  }

  /** Called after a teacher grades a previously non-objective exam answer. */
  ingestExamAnswer(scope: LearnerOwnerScope, answerId: string) {
    return this.safely("exam-answer", scope, async () => {
      const rows = await this.examRows(scope, { answerId });
      return this.deliver(
        scope,
        rows.flatMap((row) => {
          const source = this.examSourceAnswer(row);
          return source ? [normalizeExamAnswer(source)] : [];
        }),
      );
    });
  }

  /** Handles file/overall assignment grading after the source upsert has committed. */
  ingestAssignmentSubmission(scope: LearnerOwnerScope, assignmentId: string) {
    return this.safely("assignment-submission", scope, async () => {
      const rows = await this.db
        .select({
          assignment: schema.assignments,
          submission: schema.assignmentSubmissions,
        })
        .from(schema.assignmentSubmissions)
        .innerJoin(
          schema.assignments,
          eq(schema.assignments.id, schema.assignmentSubmissions.assignmentId),
        )
        .where(
          and(
            eq(schema.assignmentSubmissions.assignmentId, assignmentId),
            eq(schema.assignmentSubmissions.studentId, scope.studentId),
            eq(schema.assignmentSubmissions.institutionId, scope.institutionId),
            eq(schema.assignmentSubmissions.status, "graded"),
            isNotNull(schema.assignmentSubmissions.pointsAwarded),
          ),
        );
      return this.deliver(
        scope,
        rows.map(({ assignment, submission }) =>
          normalizeAssignmentAnswer({
            id: submission.id,
            parentAttemptId: submission.id,
            conceptId: `assignment:${assignment.id}`,
            topicId: subjectTopic(
              assignment.subjectId,
              `assignment:${assignment.id}`,
            ),
            awardedMarks: submission.pointsAwarded,
            maxMarks: assignment.maxPoints,
            occurredAt: submission.updatedAt.toISOString(),
            sourceVersion: submission.version,
          }),
        ),
      );
    });
  }

  /** Handles quiz-mode assignment answers after objective or teacher grading. */
  ingestAssignmentAnswer(scope: LearnerOwnerScope, answerId: string) {
    return this.safely("assignment-answer", scope, async () => {
      const rows = await this.assignmentAnswerRows(scope, answerId);
      return this.deliver(
        scope,
        rows.flatMap(({ assignment, attempt, answer, question }) => {
          const awardedMarks = answer.teacherMarks ?? answer.awardedMarks;
          if (awardedMarks == null) return [];
          return [
            normalizeAssignmentAnswer({
              id: answer.id,
              parentAttemptId: attempt.id,
              conceptId: questionConcept(
                question.config,
                "assignment-question",
                question.id,
              ),
              topicId: questionTopic(
                question.config,
                subjectTopic(
                  assignment.subjectId,
                  `assignment:${assignment.id}`,
                ),
              ),
              correct: answer.autoCorrect,
              awardedMarks,
              maxMarks: question.marks,
              occurredAt: answer.updatedAt.toISOString(),
              sourceVersion: question.version,
            }),
          ];
        }),
      );
    });
  }

  /** Called after the teacher returns a graded homework submission. */
  ingestHomeworkSubmission(scope: LearnerOwnerScope, submissionId: string) {
    return this.safely("homework-submission", scope, async () => {
      const rows = await this.db
        .select({
          homework: schema.homework,
          submission: schema.homeworkSubmissions,
          answer: schema.homeworkAnswers,
          question: schema.homeworkQuestions,
        })
        .from(schema.homeworkAnswers)
        .innerJoin(
          schema.homeworkSubmissions,
          eq(
            schema.homeworkSubmissions.id,
            schema.homeworkAnswers.submissionId,
          ),
        )
        .innerJoin(
          schema.homeworkQuestions,
          eq(schema.homeworkQuestions.id, schema.homeworkAnswers.questionId),
        )
        .innerJoin(
          schema.homework,
          eq(schema.homework.id, schema.homeworkSubmissions.homeworkId),
        )
        .where(
          and(
            eq(schema.homeworkSubmissions.id, submissionId),
            eq(schema.homeworkSubmissions.studentId, scope.studentId),
            eq(schema.homework.institutionId, scope.institutionId),
            isNotNull(schema.homeworkAnswers.teacherMarks),
          ),
        );
      return this.deliver(
        scope,
        rows.map(({ homework, submission, answer, question }) =>
          normalizeHomeworkAnswer({
            id: answer.id,
            parentAttemptId: submission.id,
            conceptId: `homework-question:${question.id}`,
            topicId: subjectTopic(
              homework.subjectId,
              `homework:${homework.id}`,
            ),
            awardedMarks: answer.teacherMarks,
            maxMarks:
              question.maxMarks ?? Math.max(answer.teacherMarks ?? 0, 1),
            occurredAt: answer.updatedAt.toISOString(),
            sourceVersion: submission.version,
          }),
        ),
      );
    });
  }

  /**
   * Audited, idempotent reconciliation for legacy and active durable assessment stores.
   * Useful after deployments and for sources whose UI is temporarily unavailable.
   */
  async syncAll(input: PetrosLearnerModelSourceSyncInput, ctx: ActionContext) {
    const scope = {
      institutionId: input.institutionId,
      studentId: input.studentId,
    };
    await this.learnerModels.assertScope(scope);
    const parts = await Promise.all([
      this.syncLibraryQuizzes(scope),
      this.syncMockExams(scope),
      this.syncExams(scope),
      this.syncAssignments(scope),
      this.syncHomework(scope),
    ]);
    const totals = parts.reduce(mergeDelivery, { ...EMPTY_DELIVERY });
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: "petros.learner_model.sources_synced",
      module: "petros",
      entityType: "petros_learner_model",
      entityId: input.studentId,
      reason: input.reason,
      newState: {
        ...totals,
        sources: [
          "library_quiz",
          "mock_exam",
          "exam",
          "assignment",
          "homework",
        ],
      },
    } as Parameters<AuditWriter["logAudit"]>[0]);
    return { scope, sources: parts, totals };
  }

  private async syncLibraryQuizzes(scope: LearnerOwnerScope) {
    return this.safely("library-quiz-sync", scope, async () => {
      const attempts = await this.db
        .select()
        .from(schema.libraryQuizAttempts)
        .where(
          and(
            eq(schema.libraryQuizAttempts.institutionId, scope.institutionId),
            eq(schema.libraryQuizAttempts.studentId, scope.studentId),
          ),
        );
      const evidence = attempts.flatMap((attempt) =>
        attempt.patterns.per_question.map((question) =>
          normalizeLibraryQuizAnswer({
            id: `${attempt.id}:${question.question_id}`,
            parentAttemptId: attempt.id,
            conceptId: `library-question:${question.question_id}`,
            topicId: question.topic,
            correct: question.correct,
            responseTimeMs: question.time_ms,
            occurredAt: attempt.finishedAt.toISOString(),
            difficulty: attempt.patterns.difficulty,
          }),
        ),
      );
      return this.deliver(scope, evidence);
    });
  }

  private async syncMockExams(scope: LearnerOwnerScope) {
    return this.safely("mock-exam-sync", scope, async () => {
      const rows = await this.db
        .select({
          mock: {
            id: schema.mockExams.id,
            subjectLabel: schema.mockExams.subjectLabel,
          },
          attempt: {
            id: schema.mockExamAttempts.id,
            finishedAt: schema.mockExamAttempts.finishedAt,
            scoringVersion: schema.mockExamAttempts.scoringVersion,
          },
          answer: {
            id: schema.mockExamAnswers.id,
            evaluation: schema.mockExamAnswers.evaluation,
            evaluationSchemaVersion: schema.mockExamAnswers.evaluationSchemaVersion,
            timeSpentMs: schema.mockExamAnswers.timeSpentMs,
            updatedAt: schema.mockExamAnswers.updatedAt,
          },
          question: {
            id: schema.mockExamQuestions.id,
            topic: schema.mockExamQuestions.topic,
            marks: schema.mockExamQuestions.marks,
            payload: schema.mockExamQuestions.payload,
          },
        })
        .from(schema.mockExamAnswers)
        .innerJoin(
          schema.mockExamAttempts,
          eq(schema.mockExamAttempts.id, schema.mockExamAnswers.attemptId),
        )
        .innerJoin(
          schema.mockExamQuestions,
          eq(schema.mockExamQuestions.id, schema.mockExamAnswers.questionId),
        )
        .innerJoin(
          schema.mockExams,
          eq(schema.mockExams.id, schema.mockExamAttempts.mockExamId),
        )
        .where(
          and(
            eq(schema.mockExams.institutionId, scope.institutionId),
            eq(schema.mockExams.studentId, scope.studentId),
            isNotNull(schema.mockExamAttempts.finishedAt),
            isNotNull(schema.mockExamAnswers.evaluation),
          ),
        );
      const evidence = rows.flatMap(({ mock, attempt, answer, question }) => {
        const evaluation = record(answer.evaluation);
        const awardedMarks = finite(evaluation.awardedMarks);
        const maxMarks = finite(evaluation.maxMarks) ?? question.marks;
        if (awardedMarks == null) return [];
        return [
          normalizeMockExamAnswer({
            id: answer.id,
            parentAttemptId: attempt.id,
            conceptId: questionConcept(
              question.payload,
              "mock-question",
              question.id,
            ),
            topicId: questionTopic(
              question.payload,
              question.topic || mock.subjectLabel,
            ),
            awardedMarks,
            maxMarks,
            responseTimeMs: answer.timeSpentMs,
            occurredAt: (attempt.finishedAt ?? answer.updatedAt).toISOString(),
            errorCategory: errorCategory(evaluation.errorCategory),
            evaluatorVersion: attempt.scoringVersion,
            sourceVersion: answer.evaluationSchemaVersion,
          }),
        ];
      });
      return this.deliver(scope, evidence);
    });
  }

  private async syncExams(scope: LearnerOwnerScope) {
    return this.safely("exam-sync", scope, async () => {
      const rows = await this.examRows(scope, {});
      return this.deliver(
        scope,
        rows.flatMap((row) => {
          const source = this.examSourceAnswer(row);
          return source ? [normalizeExamAnswer(source)] : [];
        }),
      );
    });
  }

  private async syncAssignments(scope: LearnerOwnerScope) {
    return this.safely("assignment-sync", scope, async () => {
      const submissions = await this.db
        .select({ assignmentId: schema.assignmentSubmissions.assignmentId })
        .from(schema.assignmentSubmissions)
        .where(
          and(
            eq(schema.assignmentSubmissions.institutionId, scope.institutionId),
            eq(schema.assignmentSubmissions.studentId, scope.studentId),
            eq(schema.assignmentSubmissions.status, "graded"),
            isNotNull(schema.assignmentSubmissions.pointsAwarded),
          ),
        );
      const fileResults = await Promise.all(
        submissions.map((row) =>
          this.ingestAssignmentSubmission(scope, row.assignmentId),
        ),
      );
      const answers = await this.db
        .select({ id: schema.assignmentAnswers.id })
        .from(schema.assignmentAnswers)
        .innerJoin(
          schema.assignmentAttempts,
          eq(schema.assignmentAttempts.id, schema.assignmentAnswers.attemptId),
        )
        .innerJoin(
          schema.assignments,
          eq(schema.assignments.id, schema.assignmentAttempts.assignmentId),
        )
        .where(
          and(
            eq(schema.assignments.institutionId, scope.institutionId),
            eq(schema.assignmentAttempts.studentId, scope.studentId),
            isNotNull(schema.assignmentAttempts.finishedAt),
          ),
        );
      const answerResults = await Promise.all(
        answers.map((row) => this.ingestAssignmentAnswer(scope, row.id)),
      );
      return [...fileResults, ...answerResults].reduce(mergeDelivery, {
        ...EMPTY_DELIVERY,
      });
    });
  }

  private async syncHomework(scope: LearnerOwnerScope) {
    return this.safely("homework-sync", scope, async () => {
      const rows = await this.db
        .select({ id: schema.homeworkSubmissions.id })
        .from(schema.homeworkSubmissions)
        .innerJoin(
          schema.homework,
          eq(schema.homework.id, schema.homeworkSubmissions.homeworkId),
        )
        .where(
          and(
            eq(schema.homework.institutionId, scope.institutionId),
            eq(schema.homeworkSubmissions.studentId, scope.studentId),
            isNotNull(schema.homeworkSubmissions.returnedAt),
          ),
        );
      const results = await Promise.all(
        rows.map((row) => this.ingestHomeworkSubmission(scope, row.id)),
      );
      return results.reduce(mergeDelivery, { ...EMPTY_DELIVERY });
    });
  }

  private async examRows(
    scope: LearnerOwnerScope,
    filter: { attemptId?: string; answerId?: string },
  ) {
    const conditions = [
      eq(schema.exams.institutionId, scope.institutionId),
      eq(schema.examAttempts.studentId, scope.studentId),
      isNotNull(schema.examAttempts.finishedAt),
    ];
    if (filter.attemptId)
      conditions.push(eq(schema.examAttempts.id, filter.attemptId));
    if (filter.answerId)
      conditions.push(eq(schema.examAnswers.id, filter.answerId));
    return this.db
      .select({
        schedule: schema.examSchedules,
        attempt: schema.examAttempts,
        answer: schema.examAnswers,
        question: schema.examPaperQuestions,
      })
      .from(schema.examAnswers)
      .innerJoin(
        schema.examAttempts,
        eq(schema.examAttempts.id, schema.examAnswers.attemptId),
      )
      .innerJoin(
        schema.examPaperQuestions,
        eq(schema.examPaperQuestions.id, schema.examAnswers.questionId),
      )
      .innerJoin(
        schema.examSchedules,
        eq(schema.examSchedules.id, schema.examAttempts.examScheduleId),
      )
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .where(and(...conditions));
  }

  private examSourceAnswer(row: {
    schedule: typeof schema.examSchedules.$inferSelect;
    attempt: typeof schema.examAttempts.$inferSelect;
    answer: typeof schema.examAnswers.$inferSelect;
    question: typeof schema.examPaperQuestions.$inferSelect;
  }): SourceAnswer | null {
    const marks = row.answer.teacherMarks ?? row.answer.awardedMarks;
    if (marks == null) return null;
    return {
      id: row.answer.id,
      parentAttemptId: row.attempt.id,
      conceptId: questionConcept(
        row.question.config,
        "exam-question",
        row.question.id,
      ),
      topicId: questionTopic(
        row.question.config,
        subjectTopic(
          row.schedule.subjectId,
          `exam-schedule:${row.schedule.id}`,
        ),
      ),
      correct: row.answer.autoCorrect,
      awardedMarks: marks,
      maxMarks: row.question.marks,
      occurredAt: (
        row.attempt.finishedAt ?? row.answer.updatedAt
      ).toISOString(),
      sourceVersion: row.question.version,
    };
  }

  private assignmentAnswerRows(scope: LearnerOwnerScope, answerId: string) {
    return this.db
      .select({
        assignment: schema.assignments,
        attempt: schema.assignmentAttempts,
        answer: schema.assignmentAnswers,
        question: schema.assignmentQuestions,
      })
      .from(schema.assignmentAnswers)
      .innerJoin(
        schema.assignmentAttempts,
        eq(schema.assignmentAttempts.id, schema.assignmentAnswers.attemptId),
      )
      .innerJoin(
        schema.assignmentQuestions,
        eq(schema.assignmentQuestions.id, schema.assignmentAnswers.questionId),
      )
      .innerJoin(
        schema.assignments,
        eq(schema.assignments.id, schema.assignmentAttempts.assignmentId),
      )
      .where(
        and(
          eq(schema.assignmentAnswers.id, answerId),
          eq(schema.assignments.institutionId, scope.institutionId),
          eq(schema.assignmentAttempts.studentId, scope.studentId),
          isNotNull(schema.assignmentAttempts.finishedAt),
        ),
      );
  }

  private async deliver(
    scope: LearnerOwnerScope,
    evidence: PetrosNormalizedLearningEvidence[],
  ) {
    const eligible = evidence.filter(
      (item) =>
        item.creditBasisPoints >= 0 && item.postEvidenceBasisPoints != null,
    );
    if (!eligible.length) return { ...EMPTY_DELIVERY };
    const results = await this.learnerModels.ingestMany(scope, eligible);
    return {
      scanned: eligible.length,
      accepted: results.filter((item) => item.accepted && !item.duplicate)
        .length,
      duplicates: results.filter((item) => item.accepted && item.duplicate)
        .length,
      quarantined: 0,
      failed: 0,
    };
  }

  private async safely(
    label: string,
    scope: LearnerOwnerScope,
    action: () => Promise<DeliverySummary>,
  ): Promise<DeliverySummary> {
    try {
      return await action();
    } catch (error) {
      this.logger.warn(
        `Learner evidence delivery failed after ${label} commit for ${scope.studentId}: ${errorMessage(error)}`,
      );
      return { ...EMPTY_DELIVERY, failed: 1 };
    }
  }
}

function subjectTopic(subjectId: string | null, fallback: string) {
  return subjectId ? `subject:${subjectId}` : fallback;
}

function questionConcept(config: unknown, prefix: string, questionId: string) {
  const value = record(config).conceptId;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : `${prefix}:${questionId}`;
}

function questionTopic(config: unknown, fallback: string) {
  const value = record(config).topicId;
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorCategory(value: unknown): PetrosErrorCategory | undefined {
  const allowed: PetrosErrorCategory[] = [
    "none",
    "concept_gap",
    "prerequisite_gap",
    "procedural_method",
    "arithmetic_slip",
    "misreading",
    "time_pressure",
    "notation",
    "other",
    "unclassified",
  ];
  return typeof value === "string" &&
    allowed.includes(value as PetrosErrorCategory)
    ? (value as PetrosErrorCategory)
    : undefined;
}

function mergeDelivery(
  total: DeliverySummary,
  next: DeliverySummary,
): DeliverySummary {
  return {
    scanned: total.scanned + next.scanned,
    accepted: total.accepted + next.accepted,
    duplicates: total.duplicates + next.duplicates,
    quarantined: total.quarantined + next.quarantined,
    failed: total.failed + next.failed,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
