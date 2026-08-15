import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { AuditWriter } from "@edrion/audit";
import {
  PETROS_CONFIDENCE_VALUES,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
  petrosLearnerSessionOverrideSchema,
  petrosLearnerSnapshotSchema,
  petrosNormalizedLearningEvidenceSchema,
  type PetrosLearnerModelDiagnosticQuery,
  type PetrosLearnerModelImportInput,
  type PetrosLearnerModelRebuildInput,
  type PetrosLearnerSnapshot,
  type PetrosNormalizedLearningEvidence,
} from "@edrion/schemas";
import { AUDIT_WRITER } from "../../common/tokens";
import { baseAudit, type ActionContext } from "../../common/action-context";
import {
  deriveLearnerModel,
  errorRemedy,
  type EvidenceRow,
} from "./petros-learner-model.engine";
import {
  PetrosLearnerModelRepository,
  type LearnerOwnerScope,
} from "./petros-learner-model.repository";

const DAY_MS = 86_400_000;
const STALE_AFTER_MS = 7 * DAY_MS;
const MIN_MOVE_EVIDENCE = 3;

@Injectable()
export class PetrosLearnerModelService {
  constructor(
    private readonly repo: PetrosLearnerModelRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async ingest(
    scope: LearnerOwnerScope,
    raw: PetrosNormalizedLearningEvidence,
  ) {
    const [result] = await this.ingestMany(scope, [raw]);
    return result!;
  }

  /** Inserts a source completion atomically from the model's perspective and recomputes once. */
  async ingestMany(
    scope: LearnerOwnerScope,
    raws: PetrosNormalizedLearningEvidence[],
  ) {
    await this.assertScope(scope);
    const results: Array<
      | {
          accepted: false;
          reason: "evaluation_isolation";
          sourceEventId: string;
        }
      | {
          accepted: true;
          duplicate: boolean;
          evidenceEventId: string;
        }
    > = [];
    let recomputeVersion: string | null = null;
    for (const raw of raws) {
      const input = petrosNormalizedLearningEvidenceSchema.parse(raw);
      // Evaluation and synthetic identities never acquire a production student FK or learner row.
      if (input.environment === "evaluation" || input.synthetic) {
        results.push({
          accepted: false,
          reason: "evaluation_isolation",
          sourceEventId: input.sourceEventId,
        });
        continue;
      }
      const result = await this.repo.insertEvidence({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        source: input.source,
        sourceEventId: input.sourceEventId,
        sourceRecordId: input.sourceRecordId,
        conceptId: input.conceptId,
        topicId: input.topicId,
        prerequisiteConceptIds: input.prerequisiteConceptIds,
        evidenceKind: input.evidenceKind,
        outcome: input.outcome,
        creditBasisPoints: input.creditBasisPoints,
        moveType: input.moveType,
        profileDimension: input.profileDimension,
        preEvidenceBasisPoints: input.preEvidenceBasisPoints,
        postEvidenceBasisPoints: input.postEvidenceBasisPoints,
        responseTimeMs: input.responseTimeMs,
        hintCount: input.hintCount,
        confidenceBefore: input.confidenceBefore,
        confidenceAfter: input.confidenceAfter,
        errorCategory: input.errorCategory,
        errorConfidenceBasisPoints: input.errorConfidenceBasisPoints,
        evaluatorVersion: input.evaluatorVersion,
        algorithmVersion: input.algorithmVersion,
        schemaVersion: input.schemaVersion,
        environment: input.environment,
        synthetic: input.synthetic,
        metadata: input.metadata,
        occurredAt: new Date(input.occurredAt),
      });
      if (result.inserted) recomputeVersion = input.algorithmVersion;
      results.push({
        accepted: true,
        duplicate: !result.inserted,
        evidenceEventId: result.row.id,
      });
    }
    if (recomputeVersion) await this.recompute(scope, recomputeVersion);
    return results;
  }

  async import(input: PetrosLearnerModelImportInput, ctx: ActionContext) {
    const scope = {
      institutionId: input.institutionId,
      studentId: input.studentId,
    };
    const results = await this.ingestMany(scope, input.evidence);
    await this.writeAudit(
      ctx,
      "petros.learner_model.import",
      input.studentId,
      input.reason,
      {
        institutionRef: ref(input.institutionId),
        accepted: results.filter((item) => item.accepted).length,
        duplicates: results.filter((item) => item.accepted && item.duplicate)
          .length,
        rejectedEvaluation: results.filter((item) => !item.accepted).length,
        sources: [...new Set(input.evidence.map((item) => item.source))],
      },
    );
    return { results };
  }

  async snapshot(input: {
    scope: LearnerOwnerScope;
    topic: string;
    prerequisiteConceptIds?: string[];
    sessionOverride?: unknown;
    now?: Date;
  }): Promise<PetrosLearnerSnapshot> {
    await this.assertScope(input.scope);
    const now = input.now ?? new Date();
    const topicId = canonicalId(input.topic);
    const summary = await this.repo.summaries(
      input.scope,
      PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
    );
    const relevantConcepts = new Set([
      topicId,
      ...(input.prerequisiteConceptIds ?? []),
    ]);
    const mastery = summary.mastery
      .filter(
        (item) =>
          item.topicId === topicId ||
          relevantConcepts.has(item.conceptId) ||
          item.prerequisiteConceptIds.some((id) => relevantConcepts.has(id)),
      )
      .sort((a, b) => b.lastTouchedAt.getTime() - a.lastTouchedAt.getTime())
      .slice(0, 8)
      .map((item) => {
        const ageDays = Math.max(
          0,
          (now.getTime() - item.lastTouchedAt.getTime()) / DAY_MS,
        );
        const decay = 0.5 ** (ageDays / 180);
        return {
          conceptId: item.conceptId,
          topicId: item.topicId,
          prerequisiteConceptIds: item.prerequisiteConceptIds,
          masteryBasisPoints: clamp(
            Math.round(5_000 + (item.masteryBasisPoints - 5_000) * decay),
          ),
          recallBasisPoints: item.recallBasisPoints,
          applicationBasisPoints: item.applicationBasisPoints,
          evidenceCount: item.evidenceCount,
          evidenceSources: item.evidenceSources,
          confidenceBasisPoints: item.confidenceBasisPoints,
          uncertaintyBasisPoints: item.uncertaintyBasisPoints,
          lastEvidenceAt: item.lastTouchedAt.toISOString(),
          evidenceAgeDays: round2(ageDays),
          nextReviewAt: item.nextReviewAt?.toISOString() ?? null,
        };
      });
    const moveOutcomes = summary.moveOutcomes
      .filter((item) => item.topicId === topicId || item.topicId === "*")
      .filter((item) => item.sampleSize >= MIN_MOVE_EVIDENCE)
      .sort(
        (a, b) =>
          b.confidenceBasisPoints - a.confidenceBasisPoints ||
          b.effectivenessBasisPoints - a.effectivenessBasisPoints,
      )
      .slice(0, 8)
      .map((item) => ({
        moveType: item.moveType as never,
        topicId: item.topicId === "*" ? null : item.topicId,
        profileDimension:
          item.profileDimension === "*" ? null : item.profileDimension,
        successes: item.successes,
        failures: item.failures,
        skips: item.skips,
        evidenceCount: item.sampleSize,
        meanPreBasisPoints: item.meanPreBasisPoints,
        meanPostBasisPoints: item.meanPostBasisPoints,
        meanResponseTimeMs: item.meanResponseTimeMs,
        hintUses: item.hintUses,
        confidenceChangeBasisPoints: item.confidenceChangeBasisPoints,
        confidenceBasisPoints: item.confidenceBasisPoints,
        uncertaintyBasisPoints: item.uncertaintyBasisPoints,
        weightAdjustmentBasisPoints: Math.max(
          -3_000,
          Math.min(
            3_000,
            Math.round(
              (item.effectivenessBasisPoints * item.confidenceBasisPoints) /
                10_000,
            ),
          ),
        ),
        lastEvidenceAt: item.lastEvidenceAt.toISOString(),
        evidenceAgeDays: round2(
          Math.max(0, (now.getTime() - item.lastEvidenceAt.getTime()) / DAY_MS),
        ),
      }));
    const relevantErrors = summary.errors
      .filter((item) => item.topicId === topicId || item.topicId === "*")
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.lastEvidenceAt.getTime() - a.lastEvidenceAt.getTime(),
      )
      .slice(0, 6)
      .map((item) => ({
        category: item.category as never,
        count: item.count,
        contexts: item.contexts,
        confidenceBasisPoints: item.confidenceBasisPoints,
        lastEvidenceAt: item.lastEvidenceAt.toISOString(),
        evidenceAgeDays: round2(
          Math.max(0, (now.getTime() - item.lastEvidenceAt.getTime()) / DAY_MS),
        ),
        remedy: errorRemedy(item.category),
      }));
    const preference = summary.preference;
    const sessionOverride = petrosLearnerSessionOverrideSchema.safeParse(
      input.sessionOverride,
    );
    const calibration = summary.calibration;
    const buckets =
      calibration?.buckets ??
      PETROS_CONFIDENCE_VALUES.flatMap((confidence) =>
        (["correct", "partial", "wrong"] as const).map((outcome) => ({
          confidence,
          outcome,
          count: 0,
        })),
      );
    const evidenceCount = mastery.reduce(
      (sum, item) => sum + item.evidenceCount,
      0,
    );
    const causalFactors = causalFactorsFor({
      mastery,
      moveOutcomes,
      relevantErrors,
      preference,
      calibration,
    });
    const rebuiltTimes = [
      ...summary.mastery.map((item) => item.rebuiltAt),
      ...summary.moveOutcomes.map((item) => item.rebuiltAt),
      ...(preference ? [preference.rebuiltAt] : []),
      ...(calibration ? [calibration.rebuiltAt] : []),
    ];
    const newestRebuild = rebuiltTimes.sort(
      (a, b) => b.getTime() - a.getTime(),
    )[0];
    return petrosLearnerSnapshotSchema.parse({
      schemaVersion: PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
      algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
      generatedAt: now.toISOString(),
      topicId,
      neutral:
        evidenceCount === 0 &&
        moveOutcomes.length === 0 &&
        relevantErrors.length === 0,
      stale: Boolean(
        newestRebuild &&
        now.getTime() - newestRebuild.getTime() > STALE_AFTER_MS,
      ),
      mastery,
      moveOutcomes,
      preference: preference
        ? {
            pace: preference.pace,
            depth: preference.depth,
            observed: {
              skips: preference.skipCount,
              expands: preference.expandCount,
              reads: preference.readCount,
              responses: preference.responseCount,
              meanResponseTimeMs: preference.meanResponseTimeMs,
            },
            evidenceCount: preference.evidenceCount,
            confidenceBasisPoints: preference.confidenceBasisPoints,
            minimumEvidenceMet: preference.minimumEvidenceMet,
          }
        : neutralPreference(),
      sessionOverride: sessionOverride.success ? sessionOverride.data : null,
      errors: relevantErrors,
      calibration: {
        buckets,
        scoreBasisPoints: calibration?.scoreBasisPoints ?? 5_000,
        uncertaintyBasisPoints: calibration?.uncertaintyBasisPoints ?? 10_000,
        evidenceCount: calibration?.evidenceCount ?? 0,
        fragileConfidence: Boolean(
          calibration &&
          calibration.evidenceCount >= 3 &&
          (buckets.find(
            (item) => item.confidence === "sure" && item.outcome === "wrong",
          )?.count ?? 0) > 0,
        ),
      },
      causalFactors,
      evidenceEventIds: [
        ...new Set(
          [
            ...mastery.map(
              (item) =>
                summary.mastery.find(
                  (stored) => stored.conceptId === item.conceptId,
                )?.lastUpdateEventId,
            ),
            ...summary.errors.flatMap((item) =>
              item.evidenceEventIds.slice(-3),
            ),
          ].filter((id): id is string => Boolean(id)),
        ),
      ].slice(0, 24),
    });
  }

  async recordPlanSnapshot(input: {
    sessionId: string;
    decisionId: string;
    scope: LearnerOwnerScope;
    snapshot: PetrosLearnerSnapshot;
  }) {
    return this.repo.recordPlanSnapshot({
      sessionId: input.sessionId,
      decisionId: input.decisionId,
      ...input.scope,
      topicId: input.snapshot.topicId,
      snapshot: input.snapshot,
      causalFactors: input.snapshot.causalFactors,
      algorithmVersion: input.snapshot.algorithmVersion,
      schemaVersion: input.snapshot.schemaVersion,
    });
  }

  async diagnostic(
    query: PetrosLearnerModelDiagnosticQuery,
    ctx: ActionContext,
  ) {
    const scope = {
      institutionId: query.institutionId,
      studentId: query.studentId,
    };
    const [evidence, summaries, snapshot] = await Promise.all([
      this.repo.listEvidence(scope),
      this.repo.summaries(scope, PETROS_LEARNER_MODEL_ALGORITHM_VERSION),
      this.snapshot({ scope, topic: query.topicId ?? "*" }),
    ]);
    await this.writeAudit(
      ctx,
      "petros.learner_model.view",
      query.studentId,
      "Authorized diagnostic read",
      {
        institutionRef: ref(query.institutionId),
        studentRef: ref(query.studentId),
        topicId: query.topicId ?? null,
        evidenceCount: evidence.length,
      },
    );
    return {
      institutionRef: ref(query.institutionId),
      studentRef: ref(query.studentId),
      algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
      retention: {
        rawEvidence:
          "Account/institution policy; append-oriented until an authorized deletion request.",
        derivedSummaries: "Rebuildable and deleted with the learner evidence.",
        transfer:
          "No automatic institution transfer. Export/relink requires approved identity and policy authorization.",
      },
      mastery: summaries.mastery,
      moveOutcomes: summaries.moveOutcomes,
      preference: summaries.preference ?? null,
      errors: summaries.errors,
      calibration: summaries.calibration ?? null,
      evidence: evidence.slice(-100).map((item) => ({
        id: item.id,
        source: item.source,
        sourceEventId: item.sourceEventId,
        sourceRecordId: item.sourceRecordId,
        conceptId: item.conceptId,
        topicId: item.topicId,
        kind: item.evidenceKind,
        outcome: item.outcome,
        creditBasisPoints: item.creditBasisPoints,
        errorCategory: item.errorCategory,
        occurredAt: item.occurredAt.toISOString(),
        algorithmVersion: item.algorithmVersion,
      })),
      quarantine: summaries.quarantine,
      jobs: summaries.jobs,
      planSnapshots: summaries.planSnapshots,
      boundedSnapshot: snapshot,
      stale: snapshot.stale,
      lastUpdateAt: evidence.at(-1)?.ingestedAt.toISOString() ?? null,
    };
  }

  async requestRebuild(
    input: PetrosLearnerModelRebuildInput,
    ctx: ActionContext,
  ) {
    await this.assertScope({
      institutionId: input.institutionId,
      studentId: input.studentId,
    });
    const job = await this.repo.createJob({
      institutionId: input.institutionId,
      studentId: input.studentId,
      status: "queued",
      algorithmVersion:
        input.algorithmVersion ?? PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
      batchSize: input.batchSize ?? 100,
      reason: input.reason,
      requestedBy: actor(ctx),
    });
    await this.writeAudit(
      ctx,
      "petros.learner_model.rebuild_requested",
      job.id,
      input.reason,
      {
        institutionRef: ref(input.institutionId),
        studentRef: ref(input.studentId),
        algorithmVersion: job.algorithmVersion,
        batchSize: job.batchSize,
      },
    );
    return job;
  }

  async runJob(jobId: string, ctx: ActionContext) {
    const job = await this.requireJob(jobId);
    if (!["queued", "failed"].includes(job.status))
      throw new ConflictException({ code: "PETROS_LEARNER_JOB_NOT_RUNNABLE" });
    const scope = {
      institutionId: job.institutionId,
      studentId: job.studentId,
    };
    const events = await this.repo.listEvidence(scope);
    const before = await this.repo.summaries(scope, job.algorithmVersion);
    await this.repo.updateJob(job.id, {
      status: "running",
      totalEvents: events.length,
      processedEvents: 0,
      failedEvents: 0,
      startedAt: new Date(),
      completedAt: null,
      beforeHash: stableHash(serializableSummaries(before)),
      errorCode: null,
      errorDetail: null,
    });
    try {
      for (let offset = 0; offset < events.length; offset += job.batchSize) {
        const latest = await this.requireJob(job.id);
        if (latest.cancellationRequested) {
          const cancelled = await this.repo.updateJob(job.id, {
            status: "cancelled",
            processedEvents: offset,
            completedAt: new Date(),
          });
          return cancelled;
        }
        await this.repo.updateJob(job.id, {
          processedEvents: Math.min(events.length, offset + job.batchSize),
        });
      }
      await this.recompute(scope, job.algorithmVersion);
      const after = await this.repo.summaries(scope, job.algorithmVersion);
      const completed = await this.repo.updateJob(job.id, {
        status: "completed",
        processedEvents: events.length,
        afterHash: stableHash(serializableSummaries(after)),
        completedAt: new Date(),
      });
      await this.writeAudit(
        ctx,
        "petros.learner_model.rebuilt",
        job.id,
        job.reason,
        {
          processedEvents: events.length,
          reproducible: completed?.beforeHash === completed?.afterHash,
          beforeHash: completed?.beforeHash,
          afterHash: completed?.afterHash,
        },
      );
      return completed;
    } catch (error) {
      await this.repo.updateJob(job.id, {
        status: "failed",
        errorCode: "PETROS_LEARNER_REBUILD_FAILED",
        errorDetail:
          error instanceof Error
            ? error.message.slice(0, 1_000)
            : "Unknown rebuild failure",
        completedAt: new Date(),
      });
      throw error;
    }
  }

  async retryJob(jobId: string, reason: string, ctx: ActionContext) {
    const job = await this.requireJob(jobId);
    if (!["failed", "cancelled"].includes(job.status))
      throw new ConflictException({ code: "PETROS_LEARNER_JOB_NOT_RETRYABLE" });
    await this.repo.updateJob(job.id, {
      status: "queued",
      retryCount: job.retryCount + 1,
      cancellationRequested: false,
      reason,
      completedAt: null,
    });
    await this.writeAudit(
      ctx,
      "petros.learner_model.retry_requested",
      job.id,
      reason,
      {
        retryCount: job.retryCount + 1,
      },
    );
    return this.runJob(job.id, ctx);
  }

  async cancelJob(jobId: string, reason: string, ctx: ActionContext) {
    const job = await this.requireJob(jobId);
    if (!["queued", "running"].includes(job.status))
      throw new ConflictException({
        code: "PETROS_LEARNER_JOB_NOT_CANCELLABLE",
      });
    const updated = await this.repo.updateJob(job.id, {
      cancellationRequested: true,
      ...(job.status === "queued"
        ? { status: "cancelled", completedAt: new Date() }
        : {}),
    });
    await this.writeAudit(
      ctx,
      "petros.learner_model.cancel_requested",
      job.id,
      reason,
      {
        previousStatus: job.status,
      },
    );
    return updated;
  }

  async export(scope: LearnerOwnerScope, ctx: ActionContext) {
    await this.assertScope(scope);
    const result = await this.repo.export(scope);
    await this.writeAudit(
      ctx,
      "petros.learner_model.exported",
      scope.studentId,
      "Authorized learner data export",
      {
        institutionRef: ref(scope.institutionId),
        evidenceCount: result.evidence.length,
      },
    );
    return result;
  }

  async delete(scope: LearnerOwnerScope, reason: string, ctx: ActionContext) {
    await this.assertScope(scope);
    const result = await this.repo.deleteLearnerModel(scope);
    await this.writeAudit(
      ctx,
      "petros.learner_model.deleted",
      scope.studentId,
      reason,
      {
        institutionRef: ref(scope.institutionId),
        ...result,
      },
    );
    return { ...result, recoverable: false };
  }

  async quarantineClassification(input: {
    scope: LearnerOwnerScope;
    sourceEventId: string;
    evidenceEventId?: string;
    reasonCode: string;
    detail: string;
    evaluatorVersion?: string;
  }) {
    await this.assertScope(input.scope);
    return this.repo.quarantine({
      ...input.scope,
      sourceEventId: input.sourceEventId,
      evidenceEventId: input.evidenceEventId,
      reasonCode: input.reasonCode,
      failureDetail: input.detail,
      evaluatorVersion: input.evaluatorVersion,
      status: "pending",
      nextRetryAt: new Date(Date.now() + 15 * 60_000),
    });
  }

  async assertScope(scope: LearnerOwnerScope) {
    if (!(await this.repo.learnerExists(scope))) {
      throw new NotFoundException({
        code: "PETROS_LEARNER_NOT_FOUND",
        message: "Learner model not found.",
      });
    }
  }

  private async recompute(scope: LearnerOwnerScope, algorithmVersion: string) {
    const rows = await this.repo.listEvidence(scope);
    const events = rows
      .filter((row) => row.classificationStatus === "ready")
      .map((row) => ({
        parsed: petrosNormalizedLearningEvidenceSchema.parse({
          schemaVersion: row.schemaVersion,
          source: row.source,
          sourceEventId: row.sourceEventId,
          sourceRecordId: row.sourceRecordId,
          conceptId: row.conceptId,
          topicId: row.topicId,
          prerequisiteConceptIds: row.prerequisiteConceptIds,
          evidenceKind: row.evidenceKind,
          outcome: row.outcome,
          creditBasisPoints: row.creditBasisPoints,
          moveType: row.moveType,
          profileDimension: row.profileDimension,
          preEvidenceBasisPoints: row.preEvidenceBasisPoints,
          postEvidenceBasisPoints: row.postEvidenceBasisPoints,
          responseTimeMs: row.responseTimeMs,
          hintCount: row.hintCount,
          confidenceBefore: row.confidenceBefore,
          confidenceAfter: row.confidenceAfter,
          errorCategory: row.errorCategory,
          errorConfidenceBasisPoints: row.errorConfidenceBasisPoints,
          evaluatorVersion: row.evaluatorVersion,
          algorithmVersion,
          environment: row.environment,
          synthetic: row.synthetic,
          occurredAt: row.occurredAt.toISOString(),
          metadata: row.metadata,
        }),
        id: row.id,
      }))
      .map(({ parsed, id }) => ({ ...parsed, id })) as EvidenceRow[];
    await this.repo.replaceDerived(
      scope,
      algorithmVersion,
      deriveLearnerModel(events),
    );
  }

  private async requireJob(id: string) {
    const job = await this.repo.findJob(id);
    if (!job)
      throw new NotFoundException({ code: "PETROS_LEARNER_JOB_NOT_FOUND" });
    return job;
  }

  private writeAudit(
    ctx: ActionContext,
    action: string,
    entityId: string,
    reason: string,
    newState: Record<string, unknown>,
  ) {
    return this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: "petros",
      entityType: "petros_learner_model",
      entityId,
      reason,
      newState,
    } as Parameters<AuditWriter["logAudit"]>[0]);
  }
}

function neutralPreference() {
  return {
    pace: "neutral" as const,
    depth: "neutral" as const,
    observed: {
      skips: 0,
      expands: 0,
      reads: 0,
      responses: 0,
      meanResponseTimeMs: 0,
    },
    evidenceCount: 0,
    confidenceBasisPoints: 0,
    minimumEvidenceMet: false,
  };
}

function causalFactorsFor(input: {
  mastery: Array<{
    conceptId: string;
    masteryBasisPoints: number;
    evidenceCount: number;
    evidenceAgeDays: number | null;
  }>;
  moveOutcomes: Array<{
    moveType: string;
    evidenceCount: number;
    weightAdjustmentBasisPoints: number;
  }>;
  relevantErrors: Array<{ category: string; count: number }>;
  preference?: {
    pace: string;
    depth: string;
    evidenceCount: number;
    minimumEvidenceMet: boolean;
  };
  calibration?: { evidenceCount: number; scoreBasisPoints: number };
}) {
  const factors: string[] = [];
  const strongest = [...input.moveOutcomes].sort(
    (a, b) => b.weightAdjustmentBasisPoints - a.weightAdjustmentBasisPoints,
  )[0];
  if (strongest && strongest.weightAdjustmentBasisPoints > 0)
    factors.push(
      `${strongest.moveType.replace(/_/g, " ")} outcomes are stronger across ${strongest.evidenceCount} comparable moves.`,
    );
  const weakestMastery = [...input.mastery]
    .filter((item) => item.evidenceCount >= 2)
    .sort((a, b) => a.masteryBasisPoints - b.masteryBasisPoints)[0];
  if (weakestMastery && weakestMastery.masteryBasisPoints < 5_500)
    factors.push(
      `Recent evidence for ${weakestMastery.conceptId.replace(/[-_]/g, " ")} is below the secure range across ${weakestMastery.evidenceCount} attempts.`,
    );
  const dominantError = input.relevantErrors[0];
  if (dominantError && dominantError.count >= 2)
    factors.push(
      `${dominantError.category.replace(/_/g, " ")} errors dominate ${dominantError.count} recent comparable attempts.`,
    );
  if (input.preference?.minimumEvidenceMet)
    factors.push(
      `${input.preference.depth} depth and ${input.preference.pace} pace are supported by ${input.preference.evidenceCount} observed actions.`,
    );
  if (
    input.calibration &&
    input.calibration.evidenceCount >= 3 &&
    input.calibration.scoreBasisPoints < 7_000
  )
    factors.push(
      `Confidence is still fragile across ${input.calibration.evidenceCount} checked answers, so an earlier recheck is useful.`,
    );
  return factors.slice(0, 8);
}

function canonicalId(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 180) || "unknown-topic"
  );
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function serializableSummaries(
  value: Awaited<ReturnType<PetrosLearnerModelRepository["summaries"]>>,
) {
  return {
    mastery: value.mastery.map(stripOperational),
    moveOutcomes: value.moveOutcomes.map(stripOperational),
    preference: value.preference ? stripOperational(value.preference) : null,
    errors: value.errors.map(stripOperational),
    calibration: value.calibration ? stripOperational(value.calibration) : null,
  };
}

function stripOperational(value: Record<string, unknown>) {
  const { id: _id, rebuiltAt: _rebuiltAt, ...stable } = value;
  return stable;
}

function actor(ctx: ActionContext) {
  return ctx.principalContext.principal.employeeId ?? "platform-employee";
}

function ref(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function clamp(value: number) {
  return Math.max(0, Math.min(10_000, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
