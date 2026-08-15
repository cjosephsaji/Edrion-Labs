import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { deriveSessionRecap } from './petros-reflection.engine';
import { PetrosReflectionService } from './petros-reflection.service';

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional',
  institutionId: INSTITUTION_ID,
  campusId: null,
  institutionUserId: '55555555-5555-4555-8555-555555555555',
  studentId: STUDENT_ID,
  email: 'learner@example.test',
  fullName: 'Learner',
  lastAuthAt: null,
  permissions: ['student.learn.use'],
};

function harness(overrides: Record<string, unknown> = {}) {
  const repo: any = {
    recordEvent: vi.fn().mockResolvedValue({ id: 'event' }),
    completeRecommendationsFromEvidence: vi.fn().mockResolvedValue([]),
    updateRecommendation: vi.fn().mockResolvedValue({ id: ITEM_ID, snapshotId: SNAPSHOT_ID, status: 'dismissed' }),
    updateCalibration: vi.fn().mockResolvedValue({ id: ITEM_ID, snapshotId: SNAPSHOT_ID, status: 'quieted', quietUntil: new Date('2026-09-12T00:00:00.000Z') }),
    updateRecap: vi.fn().mockResolvedValue({ id: ITEM_ID, snapshotId: SNAPSHOT_ID, status: 'corrected', correctedText: 'The diagram was not useful.' }),
    updateAlarm: vi.fn().mockResolvedValue({ id: ITEM_ID, snapshotId: SNAPSHOT_ID, status: 'snoozed', snoozedUntil: new Date('2026-08-27T00:00:00.000Z') }),
    ...overrides,
  };
  const gateway: any = { execute: vi.fn() };
  const intents: any = { resolve: vi.fn() };
  const audit: any = { logAudit: vi.fn() };
  return { service: new PetrosReflectionService(repo, gateway, intents, audit), repo, gateway, intents, audit };
}

describe('Petros Stage 11 reflection service boundaries', () => {
  it('scopes learner-controlled recommendation, calibration, recap, and alarm lifecycle writes to both owners', async () => {
    const { service, repo } = harness();
    const key = crypto.randomUUID();
    await service.recommendationLifecycle(principal, ITEM_ID, { action: 'dismiss', idempotencyKey: key });
    await service.calibrationLifecycle(principal, ITEM_ID, { action: 'quiet', quietDays: 30, idempotencyKey: crypto.randomUUID() });
    await service.recapFeedback(principal, ITEM_ID, { action: 'correct', correction: 'The diagram was not useful.', idempotencyKey: crypto.randomUUID() });
    await service.alarmLifecycle(principal, ITEM_ID, { action: 'snooze', snoozeDays: 14, reason: null, idempotencyKey: crypto.randomUUID() });

    const owner = { institutionId: INSTITUTION_ID, studentId: STUDENT_ID };
    expect(repo.updateRecommendation).toHaveBeenCalledWith(owner, ITEM_ID, 'dismissed');
    expect(repo.updateCalibration).toHaveBeenCalledWith(owner, ITEM_ID, expect.objectContaining({ status: 'quieted' }));
    expect(repo.updateRecap).toHaveBeenCalledWith(owner, ITEM_ID, 'corrected', 'The diagram was not useful.');
    expect(repo.updateAlarm).toHaveBeenCalledWith(owner, ITEM_ID, expect.objectContaining({ status: 'snoozed' }));
    expect(repo.recordEvent.mock.calls.every(([event]: any[]) =>
      event.institutionId === INSTITUTION_ID && event.studentId === STUDENT_ID
    )).toBe(true);
  });

  it('uses deterministic fallback on provider failure and records invalid structured output as a validation failure', async () => {
    const { service, gateway } = harness();
    const recap = deriveSessionRecap({
      sessionId: ITEM_ID,
      topic: 'Vectors',
      closedAt: new Date('2026-08-13T10:00:00.000Z'),
      moves: [{ id: '66666666-6666-4666-8666-666666666666', type: 'diagram', reason: 'spatial', createdAt: new Date('2026-08-13T09:58:00.000Z') }],
      observations: [{ id: '77777777-7777-4777-8777-777777777777', type: 'answer_submitted', confidence: 'think_so', correctness: 'correct', errorClass: 'none', fragileSuccess: false, recovery: true, occurredAt: new Date('2026-08-13T09:59:00.000Z') }],
    });
    gateway.execute.mockRejectedValueOnce(new Error('provider unavailable'));
    const unavailable = await (service as any).enhanceRecap({ institutionId: INSTITUTION_ID, studentId: STUDENT_ID }, recap);
    expect(unavailable).toMatchObject({ validationPassed: true, errorCode: 'REFLECTION_AI_UNAVAILABLE', value: { generation: { source: 'deterministic_fallback', validationPassed: true } } });

    gateway.execute.mockResolvedValueOnce({ content: { invented: true } });
    const invalid = await (service as any).enhanceRecap({ institutionId: INSTITUTION_ID, studentId: STUDENT_ID }, recap);
    expect(invalid).toMatchObject({ validationPassed: false, errorCode: 'REFLECTION_STRUCTURED_VALIDATION_FAILED', value: { generation: { source: 'deterministic_fallback', validationPassed: false } } });
    expect(gateway.execute).toHaveBeenLastCalledWith(expect.objectContaining({
      context: expect.objectContaining({ functionKey: 'reflection.session_recap.generate', inputModality: 'text' }),
      metadata: expect.objectContaining({ rawStudentAnswerIncluded: false }),
    }));
  });

  it('reuses an existing source hash instead of persisting a duplicate derivation', async () => {
    const sourceBundle = {
      topics: [], mastery: [], evidence: [], sessions: [],
      sourceThroughAt: null, graphUpdatedAt: null,
    };
    const existing = { id: SNAPSHOT_ID };
    const { service, repo } = harness({
      sourceBundle: vi.fn().mockResolvedValue(sourceBundle),
      findSnapshotBySource: vi.fn().mockResolvedValue(existing),
      persist: vi.fn(),
    });
    (service as any).surface = vi.fn().mockResolvedValue({ snapshotId: SNAPSHOT_ID });
    const result = await service.rebuild(principal, { idempotencyKey: crypto.randomUUID() });
    expect(result).toEqual({ snapshotId: SNAPSHOT_ID });
    expect(repo.persist).not.toHaveBeenCalled();
    expect(repo.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'rebuild_reused' }));
  });

  it('exports only the owner-scoped derived view and deletes it without deleting source learner evidence', async () => {
    const transfer = 'Derived insights are rebuilt after an authorized transfer.';
    const { service, repo } = harness({
      export: vi.fn().mockResolvedValue({ transfer, data: { snapshot: { id: SNAPSHOT_ID } } }),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    await expect(service.export(principal)).resolves.toMatchObject({ transfer });
    await expect(service.delete(principal)).resolves.toEqual({
      deleted: true,
      sourceLearnerEvidenceDeleted: false,
    });
    const owner = { institutionId: INSTITUTION_ID, studentId: STUDENT_ID };
    expect(repo.export).toHaveBeenCalledWith(owner);
    expect(repo.delete).toHaveBeenCalledWith(owner);
  });

  it('keeps operations aggregate-only, audited, and release-gated false even when source rows contain private copy', async () => {
    const secret = 'PRIVATE LEARNER CORRECTION';
    const { service, audit } = harness({
      dashboard: vi.fn().mockResolvedValue({
        events: [],
        snapshots: [{ status: 'completed', completedAt: new Date('2026-08-13T10:00:00.000Z'), sourceThroughAt: new Date('2026-08-13T09:59:00.000Z'), algorithmVersion: 'petros.reflection.stage11.v1', schemaVersion: 'petros.reflection.surface.v1', missingSyllabusLinks: 0 }],
        states: [{ state: 'shaky', count: 1 }],
        calibration: [],
        recaps: [{ status: 'corrected', correctedText: secret, validationPassed: true }],
        alarms: [{ status: 'false_positive', falsePositive: true, resolutionReason: secret, content: { confidenceBasisPoints: 6700 } }],
      }),
    });
    const result = await service.dashboard({}, {
      principalContext: { principal: { employeeId: 'operator', fullName: 'QA operator', roleKeys: ['super_admin'] } } as any,
      request: {} as any,
    });
    expect(result).toMatchObject({
      privacy: 'aggregate_only',
      individualComparison: false,
      contentExposed: false,
      releaseGate: {
        stage9PhysicalMicrophoneDeviceQaPassed: false,
        stage10HumanRepeatUsePassed: false,
        stage11HumanReflectionAcceptancePassed: false,
        productionReady: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'petros.reflection.dashboard.view',
      newState: expect.objectContaining({ contentInspected: false }),
    }));
  });
});
