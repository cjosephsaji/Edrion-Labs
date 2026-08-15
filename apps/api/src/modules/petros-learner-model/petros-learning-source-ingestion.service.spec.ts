import { describe, expect, it, vi } from "vitest";
import { schema } from "@edrion/database";
import { PetrosLearningSourceIngestionService } from "./petros-learning-source-ingestion.service";

const scope = {
  institutionId: "27284a40-1166-4b73-aafc-f9906f468f73",
  studentId: "88ab5c8e-c136-4b2d-9a08-46f7d5f74668",
};

describe("PetrosLearningSourceIngestionService", () => {
  it("publishes a completed exam answer once with exact durable linkage", async () => {
    const row = examRow();
    const learnerModels = idempotentLearnerModel();
    const service = makeService(
      new Map<unknown, unknown[]>([[schema.examAnswers, [row]]]),
      learnerModels,
    );

    const first = await service.ingestExamAttempt(scope, row.attempt.id);
    const second = await service.ingestExamAttempt(scope, row.attempt.id);

    expect(first).toMatchObject({ scanned: 1, accepted: 1, duplicates: 0 });
    expect(second).toMatchObject({ scanned: 1, accepted: 0, duplicates: 1 });
    expect(learnerModels.ingestMany).toHaveBeenNthCalledWith(
      1,
      scope,
      expect.arrayContaining([
        expect.objectContaining({
          source: "exam",
          sourceEventId: row.answer.id,
          sourceRecordId: row.attempt.id,
          conceptId: "integration-by-parts",
          topicId: "calculus",
          creditBasisPoints: 10_000,
        }),
      ]),
    );
  });

  it("publishes graded assignment and homework records from their authoritative rows", async () => {
    const now = new Date("2026-08-10T10:00:00.000Z");
    const assignmentRow = {
      assignment: {
        id: "assignment-1",
        subjectId: "math",
        maxPoints: 20,
      },
      submission: {
        id: "assignment-submission-1",
        pointsAwarded: 15,
        version: 2,
        updatedAt: now,
      },
    };
    const homeworkRow = {
      homework: { id: "homework-1", subjectId: "math" },
      submission: { id: "homework-submission-1", version: 1 },
      answer: { id: "homework-answer-1", teacherMarks: 2, updatedAt: now },
      question: { id: "homework-question-1", maxMarks: 4 },
    };
    const learnerModels = idempotentLearnerModel();
    const service = makeService(
      new Map<unknown, unknown[]>([
        [schema.assignmentSubmissions, [assignmentRow]],
        [schema.homeworkAnswers, [homeworkRow]],
      ]),
      learnerModels,
    );

    await service.ingestAssignmentSubmission(scope, "assignment-1");
    await service.ingestHomeworkSubmission(scope, "homework-submission-1");

    expect(learnerModels.ingestMany).toHaveBeenCalledWith(
      scope,
      expect.arrayContaining([
        expect.objectContaining({
          source: "assignment",
          sourceEventId: "assignment-submission-1",
          creditBasisPoints: 7_500,
        }),
      ]),
    );
    expect(learnerModels.ingestMany).toHaveBeenCalledWith(
      scope,
      expect.arrayContaining([
        expect.objectContaining({
          source: "homework",
          sourceEventId: "homework-answer-1",
          creditBasisPoints: 5_000,
        }),
      ]),
    );
  });

  it("syncs persisted library quiz and mock exam results and audits the operation", async () => {
    const now = new Date("2026-08-10T10:00:00.000Z");
    const libraryAttempt = {
      id: "library-attempt-1",
      artifactId: "artifact-1",
      finishedAt: now,
      patterns: {
        difficulty: 3,
        per_topic: {},
        source_knowledge_item_id: null,
        per_question: [
          {
            question_id: "quiz-question-1",
            topic: "calculus",
            type: "mcq",
            correct: true,
            chosen: "a",
            time_ms: 2_000,
          },
        ],
      },
    };
    const mockRow = {
      mock: { id: "mock-1", subjectLabel: "Math" },
      attempt: {
        id: "mock-attempt-1",
        finishedAt: now,
        scoringVersion: "score-v1",
      },
      answer: {
        id: "mock-answer-1",
        evaluation: {
          awardedMarks: 1,
          maxMarks: 2,
          errorCategory: "arithmetic_slip",
        },
        evaluationSchemaVersion: 1,
        timeSpentMs: 3_000,
        updatedAt: now,
      },
      question: {
        id: "mock-question-1",
        topic: "calculus",
        marks: 2,
        payload: { conceptId: "integration-by-parts", topicId: "calculus" },
      },
    };
    const learnerModels = idempotentLearnerModel();
    const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
    const service = makeService(
      new Map<unknown, unknown[]>([
        [schema.libraryQuizAttempts, [libraryAttempt]],
        [schema.mockExamAnswers, [mockRow]],
        [schema.examAnswers, []],
        [schema.assignmentSubmissions, []],
        [schema.assignmentAnswers, []],
        [schema.homeworkSubmissions, []],
      ]),
      learnerModels,
      audit,
    );

    const result = await service.syncAll(
      { ...scope, reason: "Acceptance source reconciliation" },
      actionContext(),
    );

    expect(result.totals).toMatchObject({ scanned: 2, accepted: 2, failed: 0 });
    expect(learnerModels.ingestMany).toHaveBeenCalledWith(
      scope,
      expect.arrayContaining([
        expect.objectContaining({ source: "library_quiz" }),
      ]),
    );
    expect(learnerModels.ingestMany).toHaveBeenCalledWith(
      scope,
      expect.arrayContaining([
        expect.objectContaining({
          source: "mock_exam",
          sourceEventId: "mock-answer-1",
          errorCategory: "arithmetic_slip",
        }),
      ]),
    );
    expect(audit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "petros.learner_model.sources_synced",
      }),
    );
  });

  it("never invalidates an assessment commit when learner delivery fails", async () => {
    const service = makeService(new Map<unknown, unknown[]>([[schema.examAnswers, [examRow()]]]), {
      ingestMany: vi.fn().mockRejectedValue(new Error("model unavailable")),
    });

    await expect(
      service.ingestExamAttempt(scope, "attempt-1"),
    ).resolves.toMatchObject({
      failed: 1,
      accepted: 0,
    });
  });
});

function makeService(
  rows: Map<unknown, unknown[]>,
  learnerModels: { ingestMany: ReturnType<typeof vi.fn> },
  audit = { logAudit: vi.fn().mockResolvedValue(undefined) },
) {
  const db = {
    select: vi.fn(() => {
      let table: unknown;
      const query = {
        from(next: unknown) {
          table = next;
          return query;
        },
        innerJoin() {
          return query;
        },
        where() {
          return Promise.resolve(rows.get(table) ?? []);
        },
      };
      return query;
    }),
  };
  return new PetrosLearningSourceIngestionService(
    db as never,
    audit as never,
    {
      assertScope: vi.fn(async () => undefined),
      ...learnerModels,
    } as never,
  );
}

function idempotentLearnerModel() {
  const seen = new Set<string>();
  return {
    ingestMany: vi.fn(
      async (_scope: unknown, evidence: Array<{ sourceEventId: string }>) =>
        evidence.map((item) => {
          const duplicate = seen.has(item.sourceEventId);
          seen.add(item.sourceEventId);
          return {
            accepted: true as const,
            duplicate,
            evidenceEventId: item.sourceEventId,
          };
        }),
    ),
  };
}

function examRow() {
  const now = new Date("2026-08-10T10:00:00.000Z");
  return {
    schedule: { id: "schedule-1", subjectId: "math" },
    attempt: { id: "attempt-1", finishedAt: now },
    answer: {
      id: "answer-1",
      teacherMarks: null,
      awardedMarks: 2,
      autoCorrect: true,
      updatedAt: now,
    },
    question: {
      id: "question-1",
      marks: 2,
      config: { conceptId: "integration-by-parts", topicId: "calculus" },
      version: 1,
    },
  };
}

function actionContext() {
  return {
    principalContext: {
      principal: {
        employeeId: "employee-1",
        fullName: "Owner",
        roleKeys: ["platform_owner"],
      },
    },
    request: {
      ip: "127.0.0.1",
      userAgent: "vitest",
      requestId: "request-1",
      correlationId: "correlation-1",
      apiEndpoint: "/v1/petros-learner-model/evidence/sync-sources",
    },
  } as never;
}
