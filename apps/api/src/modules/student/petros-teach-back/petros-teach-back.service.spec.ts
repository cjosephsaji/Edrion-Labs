import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PETROS_TEACH_BACK_ANALYSIS_VERSION,
  PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
  PETROS_TEACH_BACK_STATE_VERSION,
} from '@edrion/schemas';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosTeachBackService } from './petros-teach-back.service';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional',
  institutionId: '11111111-1111-4111-8111-111111111111',
  campusId: null,
  institutionUserId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  email: 'student@example.test',
  fullName: 'Test Student',
  lastAuthAt: new Date(),
  permissions: ['student.learn.use'],
};

const ids = {
  session: '44444444-4444-4444-8444-444444444444',
  learning: '55555555-5555-4555-8555-555555555555',
  media: '66666666-6666-4666-8666-666666666666',
  segment: '77777777-7777-4777-8777-777777777777',
  followUp: '88888888-8888-4888-8888-888888888888',
  command: '99999999-9999-4999-8999-999999999999',
  key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};
const now = new Date('2026-08-13T08:00:00.000Z');

function row(patch: Record<string, unknown> = {}) {
  return {
    id: ids.session,
    learningSessionId: ids.learning,
    institutionId: principal.institutionId,
    studentId: principal.studentId,
    stateVersion: PETROS_TEACH_BACK_STATE_VERSION,
    status: 'active',
    topic: 'electric current',
    scope: null,
    audienceLevel: 'younger_student',
    audienceLabel: 'a curious junior student',
    mode: 'text',
    language: 'en',
    coverageChecklist: [
      {
        key: 'core',
        label: 'What electric current means',
        status: 'unseen',
        evidence: [],
      },
      {
        key: 'cause',
        label: 'Why electric current works',
        status: 'unseen',
        evidence: [],
      },
      {
        key: 'example',
        label: 'A concrete example',
        status: 'unseen',
        evidence: [],
      },
      {
        key: 'boundary',
        label: 'A limit or exception',
        status: 'unseen',
        evidence: [],
      },
    ],
    currentGapType: 'none',
    currentGapFingerprint: null,
    probesOnCurrentGap: 0,
    movesUsed: 0,
    maxMoves: 8,
    timeBudgetSeconds: 720,
    elapsedSeconds: 0,
    activeSince: null,
    helpUseCount: 0,
    verdict: null,
    artifactBundleId: null,
    repeatedFromSessionId: null,
    closeReason: null,
    closedAt: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function harness(initial = row()) {
  let current = initial as ReturnType<typeof row>;
  const segments: Array<Record<string, any>> = [];
  const followUps: Array<Record<string, any>> = [];
  const events: Array<Record<string, any>> = [];
  const repo = {
    find: vi.fn(async (scope: { institutionId: string; studentId: string }, sessionId: string) =>
      scope.institutionId === current.institutionId &&
      scope.studentId === current.studentId &&
      sessionId === current.id
        ? current
        : undefined,
    ),
    findByLearningSession: vi.fn(async () => undefined),
    create: vi.fn(async (values: Record<string, unknown>) => {
      current = row({
        ...values,
        id: ids.session,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      return current;
    }),
    listSegments: vi.fn(async () => segments),
    listFollowUps: vi.fn(async () => followUps),
    findMedia: vi.fn(async () => ({
      id: ids.media,
      kind: 'voice_turn',
      state: 'needs_confirmation',
    })),
    beginCommand: vi.fn(async () => ({
      state: 'started' as const,
      row: { id: ids.command },
    })),
    finishCommand: vi.fn(async () => undefined),
    failCommand: vi.fn(async () => undefined),
    appendSegment: vi.fn(async (input: Record<string, any>) => {
      if (input.expectedVersion !== current.version) return null;
      current = {
        ...current,
        coverageChecklist: input.analysis.coverage,
        currentGapType: input.nextGap?.type ?? 'none',
        currentGapFingerprint: input.nextGap?.fingerprint ?? null,
        probesOnCurrentGap: input.nextGap?.probes ?? 0,
        movesUsed: Number(current.movesUsed) + 1,
        helpUseCount: Number(current.helpUseCount) + (input.capHelpApplied ? 1 : 0),
        version: Number(current.version) + 1,
        updatedAt: now,
      };
      if (input.responseToFollowUpId) {
        const existing = followUps.find((item) => item.id === input.responseToFollowUpId);
        if (existing) {
          existing.status = input.capHelpApplied ? 'helped' : 'answered';
          existing.resolvedAt = now;
        }
      }
      const segment = {
        id: input.segmentId,
        ordinal: current.movesUsed,
        source: input.source,
        text: input.text,
        corrected: false,
        transcriptionConfidenceBasisPoints: input.transcriptionConfidenceBasisPoints,
        responseToFollowUpId: input.responseToFollowUpId,
        analysis: input.analysis,
        createdAt: now,
        updatedAt: now,
      };
      segments.push(segment);
      let followUp;
      if (input.followUp) {
        followUp = {
          id: ids.followUp,
          segmentId: segment.id,
          status: 'open',
          content: input.followUp,
          createdAt: now,
          resolvedAt: null,
        };
        followUps.push(followUp);
      }
      return { session: current, segment, followUp };
    }),
    help: vi.fn(async (input: Record<string, any>) => {
      if (input.expectedVersion !== current.version) return null;
      current = {
        ...current,
        currentGapType: 'none',
        currentGapFingerprint: null,
        probesOnCurrentGap: 0,
        helpUseCount: Number(current.helpUseCount) + (input.action === 'skip' ? 0 : 1),
        version: Number(current.version) + 1,
      };
      const follow = followUps.find((item) => item.id === input.followUpId);
      if (follow) {
        follow.status = input.action === 'skip' ? 'skipped' : 'helped';
        follow.resolvedAt = now;
      }
      return current;
    }),
    updateLifecycle: vi.fn(
      async (
        _scope: unknown,
        _sessionId: string,
        expectedVersion: number,
        patch: Record<string, unknown>,
      ) => {
        if (expectedVersion !== current.version) return undefined;
        current = {
          ...current,
          ...patch,
          version: Number(current.version) + 1,
          updatedAt: now,
        };
        return current;
      },
    ),
    createArtifactBlock: vi.fn(async () => ({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })),
    closeLearningSession: vi.fn(async () => undefined),
    recordEvent: vi.fn(async (event: Record<string, unknown>) => {
      events.push(event);
      return event;
    }),
    dashboardRows: vi.fn(async () => ({
      sessions: [current],
      events,
      voiceEvents: [],
      artifactEvents: [],
    })),
  };
  const loop = { create: vi.fn(async () => ({ id: ids.learning })) };
  const gateway = {
    execute: vi.fn(async () => {
      throw new Error('no configured route');
    }),
  };
  const artifacts = {
    bundle: vi.fn(async () => ({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })),
  };
  const learnerModels = {
    ingest: vi.fn(async () => ({ accepted: true, duplicate: false })),
  };
  const audit = { logAudit: vi.fn(async () => undefined) };
  const service = new PetrosTeachBackService(
    repo as never,
    loop as never,
    gateway as never,
    artifacts as never,
    learnerModels as never,
    audit as never,
  );
  return {
    service,
    repo,
    loop,
    gateway,
    artifacts,
    learnerModels,
    events,
    segments,
    followUps,
    current: () => current,
  };
}

describe('Petros Teach-it-back service', () => {
  it('creates a first-class reversed session with finite budgets and a closed voice production gate', async () => {
    const h = harness();
    const result = await h.service.create(principal, {
      topic: 'electric current',
      mode: 'voice',
      idempotencyKey: ids.key,
    });
    expect(h.loop.create).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        sessionType: 'teach_it_back',
        sourceContext: expect.objectContaining({ door: 'teach_it_back' }),
        learnerContext: expect.objectContaining({
          voiceOptional: true,
          voiceProductionDeviceQaPassed: false,
        }),
      }),
    );
    expect(result.voice).toMatchObject({
      optional: true,
      productionDeviceQaPassed: false,
      textAlternativeAvailable: true,
    });
    expect(result.opening).toBe('Explain this to Petros as if teaching a junior.');
  });

  it('asks one segment-grounded question for a causal gap and records provider-neutral fallback telemetry', async () => {
    const h = harness();
    const text =
      'A battery connects to a lamp with wires. The lamp lights, current is measured in amperes, and the circuit must be complete.';
    const result = await h.service.submit(principal, ids.session, {
      text,
      source: 'text',
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(result.followUps).toHaveLength(1);
    expect(result.followUps[0]?.followUp.question.match(/\?/g)).toHaveLength(1);
    expect(text).toContain(result.followUps[0]?.followUp.groundedIn.excerpt);
    expect(h.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionKey: 'teach_back.explanation.analyse',
          validationPassed: false,
          errorCode: 'PETROS_TEACH_BACK_PROVIDER_NEUTRAL_FALLBACK',
        }),
        expect.objectContaining({
          functionKey: 'teach_back.follow_up.generate',
          validationPassed: false,
          errorCode: 'PETROS_TEACH_BACK_PROVIDER_NEUTRAL_FALLBACK',
        }),
      ]),
    );
  });

  it('does not manufacture a gap for a complete explanation', async () => {
    const h = harness();
    const text =
      'Electric current is the rate at which charge moves through a circuit. A battery creates a potential difference because chemical reactions separate charge, so an electric field is established around a complete conducting path and charges already in the wire begin to drift. For example, closing a lamp circuit lets the field transfer energy to the lamp. Unless the path is complete, steady current cannot continue.';
    const result = await h.service.submit(principal, ids.session, {
      text,
      source: 'text',
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(result.followUps).toEqual([]);
    expect(result.progress.currentGapType).toBe('none');
  });

  it('treats uncertain STT as transcription uncertainty, never a misconception', async () => {
    const h = harness(row({ mode: 'voice' }));
    const result = await h.service.submit(principal, ids.session, {
      text: 'The sell has chrome a zones.',
      source: 'voice',
      mediaId: ids.media,
      transcriptionConfidence: 0.42,
      uncertainTranscript: true,
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(h.gateway.execute).not.toHaveBeenCalled();
    expect(result.segments[0]?.analysis).toMatchObject({
      speechRecognitionUncertain: true,
      primaryGap: null,
      needsFollowUp: false,
    });
    expect(result.followUps).toEqual([]);
  });

  it('analyses a learner-confirmed correction even when the original STT confidence was low', async () => {
    const h = harness(row({ mode: 'voice' }));
    const result = await h.service.submit(principal, ids.session, {
      text: 'Electric current is the rate at which charge moves. A battery creates potential difference because chemical reactions separate charge, so a field transfers energy through a complete circuit. For example, a lamp lights when the circuit closes. Unless the path is complete, steady current stops.',
      source: 'voice',
      mediaId: ids.media,
      transcriptionConfidence: 0.42,
      uncertainTranscript: false,
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(result.segments[0]?.analysis.speechRecognitionUncertain).toBe(false);
    expect(result.segments[0]?.analysis.primaryGap).toBeNull();
  });

  it('delivers help and clears the stuck point after the two-probe cap', async () => {
    const description =
      'The explanation names the idea but does not yet connect the cause to the result.';
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          type: 'missing_causal_link',
          description: description.toLowerCase(),
        }),
      )
      .digest('hex');
    const h = harness(
      row({
        currentGapType: 'missing_causal_link',
        currentGapFingerprint: fingerprint,
        probesOnCurrentGap: 2,
      }),
    );
    h.followUps.push({
      id: ids.followUp,
      segmentId: ids.segment,
      status: 'open',
      content: {
        schemaVersion: PETROS_TEACH_BACK_FOLLOW_UP_VERSION,
        gapType: 'missing_causal_link',
        question: 'What makes the result happen?',
        groundedIn: { segmentId: ids.segment, excerpt: 'The lamp lights.' },
        probeNumber: 2,
        juniorTransition: 'I still lost the middle step.',
        helpAfterCap:
          'The battery creates an electric field that transfers energy through the complete circuit.',
        tone: 'playfully_persistent',
      },
      createdAt: now,
      resolvedAt: null,
    });
    const result = await h.service.submit(principal, ids.session, {
      text: 'A battery connects to a lamp. The lamp lights and current is measured in amperes.',
      source: 'text',
      responseToFollowUpId: ids.followUp,
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(result.progress).toMatchObject({
      probesOnCurrentGap: 0,
      currentGapType: 'none',
      helpUseCount: 1,
    });
    expect(result.followUps[0]?.status).toBe('helped');
    expect(h.repo.appendSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        capHelpApplied: true,
        nextGap: null,
        followUp: null,
      }),
    );
    expect(h.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'two_probe_cap_helped',
          payload: { policyViolation: false, helpDelivered: true },
        }),
      ]),
    );
  });

  it('records stale concurrency safely and owner-scopes reads', async () => {
    const h = harness(row({ version: 2 }));
    await expect(
      h.service.submit(principal, ids.session, {
        text: 'A segment.',
        source: 'text',
        expectedVersion: 1,
        idempotencyKey: ids.key,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(h.repo.beginCommand).toHaveBeenCalledWith(
      { institutionId: principal.institutionId, studentId: principal.studentId },
      ids.session,
      ids.key,
      'segment',
    );
    expect(h.repo.failCommand).toHaveBeenCalled();
    const other = {
      ...principal,
      studentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };
    await expect(h.service.read(other, ids.session)).rejects.toMatchObject({
      status: 404,
    });
    expect(h.repo.find).toHaveBeenLastCalledWith(
      { institutionId: other.institutionId, studentId: other.studentId },
      ids.session,
    );
  });

  it('replays a completed command before stale-version or consumed-media checks', async () => {
    const h = harness(row({ version: 2, mode: 'voice' }));
    const stored = await h.service.read(principal, ids.session);
    h.repo.beginCommand.mockResolvedValueOnce({
      state: 'completed',
      row: { id: ids.command },
      response: stored,
    } as never);
    h.repo.findMedia.mockResolvedValueOnce({
      id: ids.media,
      kind: 'voice_turn',
      state: 'confirmed',
    } as never);
    const replay = await h.service.submit(principal, ids.session, {
      text: 'The original confirmed turn.',
      source: 'voice',
      mediaId: ids.media,
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(replay).toEqual(stored);
    expect(h.repo.findMedia).not.toHaveBeenCalled();
    expect(h.gateway.execute).not.toHaveBeenCalled();
  });

  it('makes pause lifecycle replay-safe while preserving optimistic concurrency', async () => {
    const h = harness();
    const first = await h.service.pause(principal, ids.session, {
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    h.repo.beginCommand.mockResolvedValueOnce({
      state: 'completed',
      row: { id: ids.command },
      response: first,
    } as never);
    const replay = await h.service.pause(principal, ids.session, {
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(replay).toEqual(first);
    expect(h.repo.updateLifecycle).toHaveBeenCalledTimes(1);
  });

  it('closes with an evidence-linked nonnumeric verdict, conservative idempotent evidence, and an unsaved artifact proposal', async () => {
    const h = harness();
    const evidence = {
      segmentId: ids.segment,
      excerpt: 'Current is the rate at which charge moves.',
    };
    h.segments.push({
      id: ids.segment,
      ordinal: 1,
      source: 'text',
      text: `${evidence.excerpt} A complete circuit lets charge continue moving because the battery creates a potential difference.`,
      corrected: false,
      transcriptionConfidenceBasisPoints: null,
      responseToFollowUpId: null,
      analysis: {
        schemaVersion: PETROS_TEACH_BACK_ANALYSIS_VERSION,
        coverage: [
          {
            key: 'core',
            label: 'What current means',
            status: 'covered',
            evidence: [evidence],
          },
        ],
        claims: [{ claim: evidence.excerpt, status: 'supported', evidence }],
        examples: [],
        primaryGap: null,
        completeEnough: true,
        needsFollowUp: false,
        speechRecognitionUncertain: false,
        uncertaintyDisclosure: null,
      },
      createdAt: now,
      updatedAt: now,
    });
    const result = await h.service.close(principal, ids.session, {
      expectedVersion: 0,
      idempotencyKey: ids.key,
    });
    expect(result.status).toBe('closed');
    expect(result.verdict?.officialAssessmentChanged).toBe(false);
    expect(JSON.stringify(result.verdict)).not.toMatch(
      /\b(?:score|grade|marks?|rating)\b|\d+\s*%|\d+\s*\/\s*\d+/i,
    );
    expect(result.verdict?.clear[0]?.evidence).toEqual(evidence);
    expect(h.artifacts.bundle).toHaveBeenCalledTimes(1);
    expect(h.learnerModels.ingest).toHaveBeenCalledWith(
      {
        institutionId: principal.institutionId,
        studentId: principal.studentId,
      },
      expect.objectContaining({
        sourceEventId: `teach-back:${ids.session}:verdict`,
        evidenceKind: 'application',
        metadata: expect.objectContaining({
          officialAssessmentChanged: false,
          singleSessionWeighting: 'conservative_toward_neutral',
        }),
      }),
    );
    expect(h.repo.createArtifactBlock).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: result.verdict }),
    );
  });

  it('returns audited aggregate-only product, gap, artifact, STT, reliability, and policy diagnostics', async () => {
    const h = harness(row({ status: 'paused', movesUsed: 2 }));
    h.repo.dashboardRows.mockResolvedValueOnce({
      sessions: [h.current()],
      events: [
        {
          teachBackSessionId: ids.session,
          functionKey: 'teach_back.explanation.analyse',
          providerKey: 'provider-a',
          modelKey: 'model-a',
          durationMs: 120,
          errorCode: null,
          validationPassed: true,
          retryCount: 0,
          fallbackTier: 0,
          payload: {},
          estimatedCostMicros: 8,
          actualCostMicros: 7,
          type: 'analysis_completed',
          gapType: 'missing_causal_link',
          uncertaintyBasisPoints: 0,
        },
      ],
      voiceEvents: [
        {
          functionKey: 'speech.transcribe',
          providerKey: 'speech-a',
          modelKey: 'stt-a',
          durationMs: 240,
          errorCode: null,
          type: 'voice_turn_completed',
          retryCount: 1,
          fallbackTier: 1,
          estimatedCostMicros: 12,
          actualCostMicros: 11,
        },
      ],
      artifactEvents: [{ type: 'proposal.created' }, { type: 'artifact.saved' }],
    } as never);
    const result = await h.service.dashboard({}, {
      principalContext: {
        principal: {
          employeeId: 'employee-1',
          fullName: 'Operator',
          roleKeys: ['ai_admin'],
        },
      },
      request: {
        ip: '127.0.0.1',
        userAgent: 'test',
        requestId: 'request-1',
        correlationId: 'correlation-1',
        apiEndpoint: '/petros-teach-back/dashboard',
      },
    } as never);
    expect(result).toMatchObject({
      privacy: 'aggregate_only',
      learnerSpeechExposed: false,
      sessions: { abandonPoints: [{ movesUsed: 2, count: 1 }] },
      artifacts: { proposed: 1, saved: 1 },
      twoProbePolicy: { violations: 0, target: 0 },
      voiceReleaseGate: {
        optional: true,
        stage9PhysicalDeviceQaPassed: false,
        productionReady: false,
      },
    });
    expect(result.voiceFunctions).toEqual([
      expect.objectContaining({
        key: 'speech.transcribe',
        calls: 1,
        retries: 1,
        fallbacks: 1,
      }),
    ]);
    expect(result.topicGapBuckets).toEqual([
      expect.objectContaining({ gapType: 'missing_causal_link', count: 1 }),
    ]);
    expect(JSON.stringify(result.topicGapBuckets)).not.toContain('electric current');
    expect(h.events).not.toContainEqual(expect.objectContaining({ text: expect.anything() }));
  });
});
