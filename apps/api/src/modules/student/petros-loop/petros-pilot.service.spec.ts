import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PETROS_EVALUATION_SCHEMA_VERSION,
  petrosPilotActionSchema,
  type PetrosLearningSessionDocument,
} from '@edrion/schemas';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosLoopService } from './petros-loop.service';
import { initialPilotState } from './petros-pilot.policy';
import { stage4ProfileFixture } from './petros-stage4.fixture';

function harness() {
  const institutionId = randomUUID(),
    studentId = randomUUID();
  const principal = {
    kind: 'institutional',
    institutionId,
    studentId,
  } as InstitutionalStudentPrincipal;
  const state = {
    id: randomUUID(),
    institutionId,
    studentId,
    version: 0,
    status: 'active',
    topic: 'Inflation',
    sessionType: 'repair',
    topicProfileId: randomUUID(),
    topicProfileVersionId: randomUUID(),
    resolvedTopicProfile: stage4ProfileFixture('inflation', institutionId),
    learnerContext: { pilot: initialPilotState() },
    elapsedSeconds: 0,
    activeSince: new Date(),
    sourceContext: null,
  };
  const repo = {
    findSession: vi.fn(async (scope: { studentId: string }) =>
      scope.studentId === studentId ? state : undefined,
    ),
    commitPilot: vi.fn(async (_scope, _id, version, values) => {
      if (version !== state.version || state.status !== 'active')
        return undefined;
      Object.assign(state, values, { version: state.version + 1 });
      return state;
    }),
  };
  const gateway = {
    execute: vi.fn(async () => ({
      content: {
        schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
        correctness: 'partial',
        credit: 0.5,
        evidence: ['Missing the purchasing-power link'],
        errorClass: 'concept_gap',
        misconception: null,
        feedback: 'Explain what the same money buys.',
        safeNextHint: 'Hold your income fixed.',
      },
    })),
  };
  const service = new PetrosLoopService(
    repo as never,
    gateway as never,
    {} as never,
    {} as never,
    {} as never,
  );
  vi.spyOn(service, 'document').mockImplementation(
    async () =>
      ({
        id: state.id,
        version: state.version,
        pilot: structuredClone(state.learnerContext.pilot),
      }) as PetrosLearningSessionDocument,
  );
  const act = (values: Record<string, unknown>) =>
    petrosPilotActionSchema.parse({
      expectedVersion: state.version,
      idempotencyKey: randomUUID(),
      ...values,
    });
  return { state, service, repo, gateway, principal, act };
}

describe('Inflation pilot persistence and assessment', () => {
  it('evaluates choices on the server and deduplicates committed requests', async () => {
    const h = harness();
    const action = h.act({ action: 'answer', answer: 'no' });
    await h.service.pilotAction(h.principal, h.state.id, action);
    await h.service.pilotAction(h.principal, h.state.id, action);
    expect(h.repo.commitPilot).toHaveBeenCalledTimes(1);
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(h.state.learnerContext.pilot.scenes.basket!.outcome).toBe(
      'independent',
    );
  });
  it('uses the authored rubric for open explanations and records partial feedback', async () => {
    const h = harness();
    h.state.learnerContext.pilot.scene = 1;
    h.state.learnerContext.pilot.unlocked = 1;
    await h.service.pilotAction(
      h.principal,
      h.state.id,
      h.act({ action: 'answer', answer: 'Inflation means prices rise.' }),
    );
    expect(h.gateway.execute.mock.calls[0]).toBeDefined();
    expect(h.state.learnerContext.pilot.scenes.definition!.outcome).toBe(
      'unresolved',
    );
    expect(
      h.state.learnerContext.pilot.scenes.definition!.attempts[0]!.feedback,
    ).toContain('same money');
  });
  it('does not fabricate assessment when the provider fails', async () => {
    const h = harness();
    h.state.learnerContext.pilot.scene = 1;
    h.state.learnerContext.pilot.unlocked = 1;
    h.gateway.execute.mockRejectedValue(new Error('outage'));
    await expect(
      h.service.pilotAction(
        h.principal,
        h.state.id,
        h.act({ action: 'answer', answer: 'The same money buys less.' }),
      ),
    ).rejects.toThrow('checking is temporarily unavailable');
    expect(h.repo.commitPilot).not.toHaveBeenCalled();
    expect(
      h.state.learnerContext.pilot.scenes.definition!.attempts,
    ).toHaveLength(0);
  });
  it('rejects stale requests and paused sessions before calling the provider', async () => {
    const h = harness();
    await expect(
      h.service.pilotAction(h.principal, h.state.id, {
        ...h.act({ action: 'answer', answer: 'no' }),
        expectedVersion: 8,
      }),
    ).rejects.toThrow();
    h.state.status = 'paused';
    await expect(
      h.service.pilotAction(
        h.principal,
        h.state.id,
        h.act({ action: 'answer', answer: 'no' }),
      ),
    ).rejects.toThrow('Resume');
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(h.repo.commitPilot).not.toHaveBeenCalled();
  });
  it('rejects another student and a lost compare-and-swap', async () => {
    const h = harness();
    await expect(
      h.service.pilotAction(
        { ...h.principal, studentId: randomUUID() },
        h.state.id,
        h.act({ action: 'mode', mode: 'text' }),
      ),
    ).rejects.toThrow();
    h.repo.commitPilot.mockResolvedValue(undefined);
    await expect(
      h.service.pilotAction(
        h.principal,
        h.state.id,
        h.act({ action: 'mode', mode: 'text' }),
      ),
    ).rejects.toThrow();
  });
});
