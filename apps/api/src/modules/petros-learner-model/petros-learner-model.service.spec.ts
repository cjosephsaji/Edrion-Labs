import { describe, expect, it, vi } from 'vitest';
import {
  PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  type PetrosNormalizedLearningEvidence,
} from '@edrion/schemas';
import { PetrosLearnerModelService } from './petros-learner-model.service';
import { assessmentEvidenceFixture, criterionResultFixture } from '../../../../../packages/schemas/src/__fixtures__/petros-assessment';

const scope = {
  institutionId: '33333333-3333-4333-8333-333333333333',
  studentId: '22222222-2222-4222-8222-222222222222',
};

describe('PetrosLearnerModelService ingestion safety', () => {
  it('normalizes new objective evidence into the existing projection while retaining its typed assessment', async () => {
    const repo = repository();
    repo.insertEvidence.mockResolvedValue({ inserted: true, row: { id: 'new-event' } });
    const service = new PetrosLearnerModelService(repo as never, { logAudit: vi.fn() } as never);
    const input = assessmentEvidenceFixture();
    await expect(service.ingest(scope, input)).resolves.toMatchObject({ accepted: true });
    expect(repo.insertEvidence).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 'petros.learner-evidence.v1', outcome: 'correct', creditBasisPoints: 10000, assessment: input.assessment,
    }));
  });

  it.each(['criterion_profile', 'mixed', 'unavailable', 'review', 'hinted', 'exposed', 'repeated', 'external'])(
    'explicitly declines %s before any learner or projection write', async kind => {
      const repo = repository();
      const service = new PetrosLearnerModelService(repo as never, { logAudit: vi.fn() } as never);
      const input = assessmentEvidenceFixture(); const a = input.assessment;
      if (a.result.kind !== 'objective') throw new Error('fixture');
      const objective = a.result;
      const observed = { basis: 'system_observed' as const, actor: { kind: 'system' as const, id: 'petros' }, method: 'history', recordedAt: input.occurredAt };
      if (kind === 'criterion_profile') a.result = criterionResultFixture();
      if (kind === 'mixed') a.result = { kind: 'mixed', objective, criteria: criterionResultFixture() };
      if (kind === 'unavailable' && a.result.kind === 'objective') a.result.judgment = { status: 'not_evaluated', reason: 'evaluator_unavailable' };
      if (kind === 'review' && a.result.kind === 'objective') a.result.provenance.review = 'required';
      if (kind === 'hinted') a.conditions.petrosAssistance = [{ ...observed, value: { hintCount: 1, suppliedAnswer: false } }];
      if (kind === 'exposed') a.conditions.answerExposure = [{ ...observed, value: 'exposed' }];
      if (kind === 'repeated') a.conditions.attempt = [{ ...observed, value: 'repeat_equivalent' }];
      if (kind === 'external') a.conditions.externalAssistance = [{ ...observed, value: 'declared', basis: 'self_reported', actor: { kind: 'learner', id: 'synthetic' } }];
      await expect(service.ingest(scope, input)).resolves.toMatchObject({ accepted: false, reason:
        ['criterion_profile', 'mixed'].includes(kind) ? 'qualitative_assessment_disabled' : kind === 'unavailable' ? 'assessment_not_evaluated' : kind === 'review' ? 'assessment_review_required' : kind === 'repeated' ? 'repeated_assessment' : 'assisted_assessment' });
      expect(repo.insertEvidence).not.toHaveBeenCalled(); expect(repo.replaceDerived).not.toHaveBeenCalled();
    });

  it('is idempotent and recomputes only for a newly inserted source event', async () => {
    const row = { id: '11111111-1111-4111-8111-111111111111' };
    const repo = repository();
    repo.insertEvidence
      .mockResolvedValueOnce({ inserted: true, row })
      .mockResolvedValueOnce({ inserted: false, row });
    const service = new PetrosLearnerModelService(repo as never, { logAudit: vi.fn() } as never);
    const input = evidence();
    await expect(service.ingest(scope, input)).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
    });
    await expect(service.ingest(scope, input)).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
    });
    expect(repo.replaceDerived).toHaveBeenCalledTimes(1);
  });

  it('validates the whole batch before writing and rejects corrupt projection data during rebuild', async () => {
    const repo = repository();
    const service = new PetrosLearnerModelService(repo as never, { logAudit: vi.fn() } as never);
    const input = assessmentEvidenceFixture();
    await expect(service.ingestMany(scope, [input, { ...input, assessment: { script: 'unsafe' } } as never])).rejects.toThrow();
    expect(repo.insertEvidence).not.toHaveBeenCalled();
    const row = { ...evidence(), id: 'persisted', classificationStatus: 'ready', occurredAt: new Date(input.occurredAt),
      outcome: 'wrong', creditBasisPoints: 0, assessment: input.assessment };
    repo.listEvidence.mockResolvedValue([row] as never);
    repo.insertEvidence.mockResolvedValue({ inserted: true, row });
    await expect(service.ingest(scope, input)).rejects.toMatchObject({ response: { code: 'PETROS_ASSESSMENT_PROJECTION_MISMATCH' } });
    expect(repo.replaceDerived).not.toHaveBeenCalled();
  });

  it('rejects synthetic evaluation evidence before any student-scoped write', async () => {
    const repo = repository();
    const service = new PetrosLearnerModelService(repo as never, { logAudit: vi.fn() } as never);
    await expect(
      service.ingest(scope, evidence({ environment: 'evaluation', synthetic: true })),
    ).resolves.toEqual({
      accepted: false,
      reason: 'evaluation_isolation',
      sourceEventId: 'event-1',
    });
    expect(repo.insertEvidence).not.toHaveBeenCalled();
    expect(repo.replaceDerived).not.toHaveBeenCalled();
  });

  it('rejects a student and institution mismatch before reading or writing model data', async () => {
    const repo = repository();
    repo.learnerExists.mockResolvedValue(false);
    const service = new PetrosLearnerModelService(
      repo as never,
      { logAudit: vi.fn() } as never,
    );
    await expect(service.ingest(scope, evidence())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PETROS_LEARNER_NOT_FOUND' }),
    });
    expect(repo.insertEvidence).not.toHaveBeenCalled();
  });

  it('quarantines a classifier failure without rebuilding or corrupting summaries', async () => {
    const repo = repository();
    repo.quarantine.mockResolvedValue({ id: 'quarantine-1', status: 'pending' });
    const service = new PetrosLearnerModelService(repo as never, { logAudit: vi.fn() } as never);
    await expect(
      service.quarantineClassification({
        scope,
        sourceEventId: 'event-1',
        reasonCode: 'SCHEMA_INVALID',
        detail: 'Malformed classifier output',
        evaluatorVersion: 'classifier-v2',
      }),
    ).resolves.toMatchObject({ status: 'pending' });
    expect(repo.replaceDerived).not.toHaveBeenCalled();
  });

  it('runs a replayable rebuild, supports explicit algorithm rollback, and retries failed jobs', async () => {
    const repo = repository();
    const audit = { logAudit: vi.fn(async () => undefined) };
    const service = new PetrosLearnerModelService(repo as never, audit as never);
    let job = rebuildJob({ status: 'queued' });
    repo.findJob.mockImplementation(async () => job);
    repo.updateJob.mockImplementation(async (_id, patch) => {
      job = { ...job, ...patch };
      return job;
    });
    repo.listEvidence.mockResolvedValue([]);
    repo.summaries.mockResolvedValue(emptySummaries());

    const completed = await service.runJob(job.id, actionContext());
    expect(completed).toMatchObject({ status: 'completed', processedEvents: 0 });
    expect(completed?.beforeHash).toBe(completed?.afterHash);
    expect(repo.replaceDerived).toHaveBeenCalledWith(
      scope,
      PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
      expect.any(Object),
    );

    repo.createJob.mockResolvedValue(
      rebuildJob({ algorithmVersion: 'petros.learner-model.stage6.previous' }),
    );
    await service.requestRebuild(
      {
        ...scope,
        algorithmVersion: 'petros.learner-model.stage6.previous',
        reason: 'Approved version rollback verification',
        batchSize: 25,
      },
      actionContext(),
    );
    expect(repo.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ algorithmVersion: 'petros.learner-model.stage6.previous' }),
    );

    job = rebuildJob({ status: 'queued' });
    await expect(
      service.cancelJob(job.id, 'Cancel disposable queued rebuild', actionContext()),
    ).resolves.toMatchObject({ status: 'cancelled', cancellationRequested: true });

    job = rebuildJob({ status: 'failed', retryCount: 1 });
    const retried = await service.retryJob(
      job.id,
      'Retry after transient fixture failure',
      actionContext(),
    );
    expect(retried).toMatchObject({ status: 'completed', retryCount: 2 });
  });

  it('provides audited export and irreversible deletion hooks', async () => {
    const repo = repository();
    repo.export.mockResolvedValue({
      scope,
      evidence: [{ id: 'evidence-1' }],
      summaries: {},
      exportedAt: '2026-08-10T00:00:00.000Z',
    });
    repo.deleteLearnerModel.mockResolvedValue({ removedEvidenceEvents: 1 });
    const audit = { logAudit: vi.fn(async () => undefined) };
    const service = new PetrosLearnerModelService(repo as never, audit as never);

    await expect(service.export(scope, actionContext())).resolves.toMatchObject({
      evidence: [{ id: 'evidence-1' }],
    });
    await expect(
      service.delete(scope, 'Disposable fixture privacy deletion', actionContext()),
    ).resolves.toEqual({ removedEvidenceEvents: 1, recoverable: false });
    expect(audit.logAudit).toHaveBeenCalledTimes(2);
  });
});

function repository() {
  return {
    learnerExists: vi.fn(async () => true),
    insertEvidence: vi.fn(),
    listEvidence: vi.fn(async () => []),
    replaceDerived: vi.fn(async () => undefined),
    quarantine: vi.fn(),
    summaries: vi.fn(),
    findJob: vi.fn(),
    updateJob: vi.fn(),
    createJob: vi.fn(),
    export: vi.fn(),
    deleteLearnerModel: vi.fn(),
  };
}

function emptySummaries() {
  return {
    mastery: [],
    moveOutcomes: [],
    preference: undefined,
    errors: [],
    calibration: undefined,
    quarantine: [],
    jobs: [],
    planSnapshots: [],
  };
}

function rebuildJob(patch: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ...scope,
    kind: 'rebuild',
    status: 'queued',
    algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
    batchSize: 100,
    totalEvents: 0,
    processedEvents: 0,
    failedEvents: 0,
    retryCount: 0,
    reason: 'Deterministic fixture rebuild',
    requestedBy: 'employee-1',
    cancellationRequested: false,
    beforeHash: null,
    afterHash: null,
    errorCode: null,
    errorDetail: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...patch,
  };
}

function actionContext() {
  return {
    principalContext: {
      principal: {
        employeeId: 'employee-1',
        email: 'owner@edrion.dev',
        fullName: 'Owner',
        roleKeys: ['platform_owner'],
        permissions: {},
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: {
      ip: '127.0.0.1',
      userAgent: 'vitest',
      requestId: 'request-1',
      correlationId: 'correlation-1',
      apiEndpoint: '/test',
    },
  } as never;
}

function evidence(
  patch: Partial<PetrosNormalizedLearningEvidence> = {},
): PetrosNormalizedLearningEvidence {
  return {
    schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
    source: 'petros' as const,
    sourceEventId: 'event-1',
    sourceRecordId: 'answer-1',
    conceptId: 'integration-by-parts',
    topicId: 'calculus',
    prerequisiteConceptIds: [],
    evidenceKind: 'application' as const,
    outcome: 'correct' as const,
    creditBasisPoints: 10_000,
    moveType: 'worked_example' as const,
    profileDimension: 'representation:symbolic',
    preEvidenceBasisPoints: 5_000,
    postEvidenceBasisPoints: 10_000,
    responseTimeMs: 4_000,
    hintCount: 0,
    confidenceBefore: 'think_so' as const,
    confidenceAfter: 'sure' as const,
    errorCategory: 'none' as const,
    errorConfidenceBasisPoints: 9_000,
    evaluatorVersion: 'deterministic-v1',
    algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
    environment: 'production' as const,
    synthetic: false,
    occurredAt: '2026-08-10T00:00:00.000Z',
    metadata: {},
    ...patch,
  };
}
