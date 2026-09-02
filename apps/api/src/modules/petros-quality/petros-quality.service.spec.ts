import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../common/action-context';
import { PetrosQualityService } from './petros-quality.service';
import type { PetrosQualityRepository } from './petros-quality.repository';
import type { PetrosAiGatewayService } from '../petros-ai-routing/petros-ai-gateway.service';
import { deterministicPlan, deterministicRender } from '../student/petros-loop/petros-loop.policy';

const context = { principalContext: { principal: { employeeId: '11111111-1111-4111-8111-111111111111' } } } as unknown as ActionContext;

function service(overrides: Record<string, unknown> = {}) {
  const repo = {
    findByExternalId: vi.fn().mockResolvedValue(undefined), importReport: vi.fn().mockResolvedValue({ id: 'run-db' }), detail: vi.fn().mockResolvedValue({ id: 'run-db', report: {} }),
    find: vi.fn().mockResolvedValue({ id: 'run-db', gate: 'pass', status: 'completed' }), promote: vi.fn().mockResolvedValue({ id: 'baseline' }), audit: vi.fn().mockResolvedValue({ id: 'audit' }), list: vi.fn(),
    ...overrides,
  };
  const gateway = { execute: vi.fn() };
  return { instance: new PetrosQualityService(repo as unknown as PetrosQualityRepository, gateway as unknown as PetrosAiGatewayService), repo, gateway };
}

function report() {
  return { runId: 'quality-run', label: 'Smoke', status: 'completed', mode: 'fixture', source: 'evaluation', suite: 'smoke', seed: 42, gate: 'pass', createdAt: '2026-08-09T00:00:00.000Z', completedAt: '2026-08-09T00:01:00.000Z',
    versions: { corpus: 'c1', rubric: 'r1', prompt: 'p1', schema: 's1', profile: 'pr1', routing: 'fixture', code: 'abc' }, selection: {}, limits: {}, totals: { costMicros: 0 }, dimensions: {}, blockingFailures: [], warnings: [], comparison: null, sessions: [], isolation: { syntheticOnly: true, productionWrites: 0 } };
}

function liveInput(personaId = 'repeated_struggle') {
  return {
    source: 'evaluation' as const,
    environment: 'evaluation' as const,
    synthetic: true as const,
    runId: 'stage5-live-unit',
    case: { id: 'integration-case', topic: { key: 'integration', title: 'integration by parts' }, subject: 'Mathematics', goal: 'learn', goalText: 'Apply integration by parts.', timeBudgetMinutes: 8, criticalFacts: ['the integration-by-parts relationship'] },
    personaId,
    personaPolicy: {
      id: personaId,
      description: 'Synthetic evaluation persona.',
      accuracy: personaId === 'repeated_struggle' ? 0.05 : 0.72,
      confidence: personaId === 'repeated_struggle' ? 'guessing' as const : 'think_so' as const,
      responseTimeMs: 8_000,
      skips: false,
      prerequisiteAccuracy: 0.25,
      questionBehavior: personaId === 'relevant_detour' ? 'relevant_detour' as const : 'none' as const,
      recovery: personaId === 'repeated_struggle' ? 'persistent_struggle' as const : 'normal' as const,
    },
    seed: 42,
    limits: { maxCostMicros: 100_000, maxTokens: 100_000, maxDurationMs: 60_000 },
  };
}

function productionLikeGateway(costMicros = 10) {
  let sequence = 0;
  const planStates: Array<Record<string, unknown>> = [];
  const execute = vi.fn(async (request: { context: { functionKey: string }; input: Array<{ text?: string }> }) => {
    sequence += 1;
    const body = JSON.parse(request.input[0]?.text ?? '{}') as Record<string, unknown>;
    const planning = request.context.functionKey === 'teaching.next_action.select';
    if (planning) planStates.push(body);
    const content = planning
      ? deterministicPlan(body as never)
      : deterministicRender(body.decision as never, body.state as never);
    return {
      kind: 'json' as const,
      content,
      requestId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
      providerKey: 'fixture-live-provider',
      modelKey: 'fixture-live-model',
      fallbackTier: 0,
      cached: false,
      functionKey: request.context.functionKey,
      promptVersion: 'prompt-v1',
      schemaVersion: 'schema-v1',
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 0,
      estimatedCostMicros: costMicros,
      responseTimeMs: 20,
      retryCount: 0,
    };
  });
  return { execute, planStates };
}

describe('PetrosQualityService', () => {
  it('imports only isolated evaluation reports and writes an audit-backed immutable run', async () => {
    const { instance, repo } = service();
    await instance.import({ report: report(), reason: 'Stage 5 smoke import' }, context);
    expect(repo.importReport).toHaveBeenCalledWith(expect.objectContaining({ source: 'evaluation', environment: 'evaluation' }), [], context.principalContext.principal.employeeId, 'Stage 5 smoke import');
  });

  it('rejects synthetic reports that claim production writes', async () => {
    const { instance } = service();
    await expect(instance.import({ report: { ...report(), isolation: { syntheticOnly: true, productionWrites: 1 } }, reason: 'Unsafe import' }, context)).rejects.toBeInstanceOf(ConflictException);
  });

  it('never silently overwrites an existing run', async () => {
    const { instance } = service({ findByExternalId: vi.fn().mockResolvedValue({ id: 'existing' }) });
    await expect(instance.import({ report: report(), reason: 'Duplicate import' }, context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_QUALITY_RUN_IMMUTABLE' }) });
  });

  it('blocks promotion of a failing candidate', async () => {
    const { instance } = service({ find: vi.fn().mockResolvedValue({ id: 'run-db', gate: 'fail', status: 'failed' }) });
    await expect(instance.promote('run-db', { reason: 'Reviewed failure cannot pass', confirmation: 'PROMOTE BASELINE' }, context)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_BASELINE_PROMOTION_FORBIDDEN' }) });
  });

  it('records safe rerun intent without creating a learner job', async () => {
    const { instance, repo } = service();
    await expect(instance.requestRerun('run-db', { reason: 'Retry evaluator failures', failedOnly: true }, context)).resolves.toMatchObject({ accepted: true, execution: expect.stringContaining('no production learner job') });
    expect(repo.audit).toHaveBeenCalledWith('run-db', 'rerun_requested', expect.any(String), 'Retry evaluator failures', { failedOnly: true });
  });

  it('feeds persona observations back into PLAN and completes the production struggle ladder', async () => {
    const { instance, gateway } = service();
    const live = productionLikeGateway();
    gateway.execute.mockImplementation(live.execute);

    const transcript = await instance.liveSession(liveInput());
    const ladder = transcript.moves
      .filter((move) => ['hint', 'missing_step', 'worked_solution', 'reworded_success'].includes(String(move.type)))
      .map((move) => move.type);
    expect(ladder).toEqual(['hint', 'missing_step', 'worked_solution', 'reworded_success']);
    expect(transcript.observations).toContainEqual(expect.objectContaining({ moveId: 'live_move_recovery_6_reworded_success', correctness: 'correct' }));
    expect(live.planStates.at(-1)).toMatchObject({
      topicContext: { evaluation: true },
      observations: {
        summarizedOutcomes: { answered: 4, correct: 1, incorrect: 3, activeStruggleLevel: 0 },
        recent: expect.arrayContaining([expect.objectContaining({ type: 'answer_submitted', summary: expect.stringContaining('correct answer') })]),
      },
    });
    expect((live.planStates.at(-1)?.topicContext as Record<string, unknown>).personaId).toBeUndefined();
    expect(transcript.usage).toHaveLength(6);
    expect(transcript.productionWrites).toBe(0);
  });

  it('makes a relevant detour causally visible to the next PLAN call', async () => {
    const { instance, gateway } = service();
    const live = productionLikeGateway();
    gateway.execute.mockImplementation(live.execute);

    const transcript = await instance.liveSession(liveInput('relevant_detour'));
    expect(transcript.observations).toContainEqual(expect.objectContaining({ type: 'question', summary: expect.stringContaining('relevant detour') }));
    expect(live.planStates[1]).toMatchObject({ observations: { recent: expect.arrayContaining([expect.objectContaining({ type: 'question_asked' })]) } });
  });

  it('enforces the per-session live evaluation cost cap', async () => {
    const { instance, gateway } = service();
    const live = productionLikeGateway(100);
    gateway.execute.mockImplementation(live.execute);
    const input = liveInput();
    input.limits.maxCostMicros = 150;
    await expect(instance.liveSession(input)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_QUALITY_COST_CAP' }) });
  });
});
