import { describe, expect, it, vi } from 'vitest';
import { QUALITY_DIMENSIONS, type QualityRunReport } from './contracts';
import { assertQualityCorpusCoverage, QUALITY_CASES } from './fixtures/manifest';
import { PERSONAS, type EvalPersona } from './fixtures/topics';
import { runFixtureSession, type FixtureMutation } from './runner/fixture-driver';
import { evaluateTranscript } from './rubrics/structural';
import { validateJudgeScores } from './rubrics/judge';
import { buildQualityReport, compareQualityRuns } from './report';
import { qualityApiAuthHeaders } from './api-auth';
import { runLiveSession } from './runner/live-driver';
import { PERSONA_POLICIES } from './personas';

function evaluate(
  mutation: FixtureMutation,
  persona: EvalPersona = 'repeated_struggle',
  caseIndex = 0,
) {
  const qualityCase = QUALITY_CASES[caseIndex]!;
  const transcript = runFixtureSession({
    runId: `test-${mutation}`,
    case: qualityCase,
    persona,
    runSeed: 42,
    mutation,
  });
  return { transcript, evaluation: evaluateTranscript(transcript, qualityCase) };
}

describe('Stage 5 corpus and personas', () => {
  it('holds the versioned 30-case coverage contract', () => {
    expect(() => assertQualityCorpusCoverage()).not.toThrow();
    expect(QUALITY_CASES).toHaveLength(30);
    expect(new Set(QUALITY_CASES.map((item) => item.goal))).toEqual(
      new Set(['learn', 'revise', 'repair', 'doubt']),
    );
    expect(QUALITY_CASES.some((item) => item.language === 'hinglish')).toBe(true);
  });

  it('defines all eight deterministic interaction policies', () => {
    expect(PERSONAS).toEqual([
      'fast_confident',
      'slow_careful',
      'confidently_wrong',
      'disengaged_skipping',
      'weak_prerequisites',
      'relevant_detour',
      'unsure_but_correct',
      'repeated_struggle',
    ]);
  });

  it('replays the same case/persona/seed byte-for-byte', () => {
    const input = {
      runId: 'stable-run',
      case: QUALITY_CASES[1]!,
      persona: 'confidently_wrong' as const,
      runSeed: 77,
    };
    expect(runFixtureSession(input)).toEqual(runFixtureSession(input));
  });
});

describe('deterministic evidence-linked rubrics', () => {
  it('keeps fixture sessions isolated from production student data', () => {
    const { transcript, evaluation } = evaluate('none');
    expect(transcript).toMatchObject({
      synthetic: true,
      environment: 'evaluation',
      productionWrites: 0,
    });
    expect(evaluation.blockingFailures).toEqual([]);
    expect(
      evaluation.scores.every(
        (score) => score.evidence.length > 0 && score.evidence.every((ref) => ref.moveId),
      ),
    ).toBe(true);
  });

  it('links the complete struggle ladder to an earned success', () => {
    const { transcript, evaluation } = evaluate('none');
    const ladder = transcript.moves
      .filter((move) =>
        ['hint', 'missing_step', 'worked_solution', 'reworded_success'].includes(move.type),
      )
      .map((move) => move.type);
    expect(ladder).toEqual(['hint', 'missing_step', 'worked_solution', 'reworded_success']);
    expect(evaluation.scores.find((score) => score.dimension === 'stuck_recovery')?.score).toBe(5);
  });

  it.each([
    ['personalization_ignored', 'explainability'],
    ['repetitive_moves', 'repetition'],
    ['factual_defect', 'correctness'],
    ['socratic_cap', 'socratic_cap'],
    ['stuck_ladder', 'stuck_recovery'],
    ['provider_leak', 'safety_boundaries'],
    ['tenant_leak', 'tenant_isolation'],
  ] as const)('detects deliberate %s regressions', (mutation, expected) => {
    const { evaluation } = evaluate(mutation);
    const findings = [...evaluation.blockingFailures, ...evaluation.warnings].join('\n');
    expect(findings).toContain(expected);
  });

  it('handles relevant composer detours and returns to the goal', () => {
    const { transcript, evaluation } = evaluate('none', 'relevant_detour');
    expect(transcript.moves.map((move) => move.type)).toEqual(
      expect.arrayContaining(['composer_detour', 'return_to_goal']),
    );
    expect(evaluation.scores.find((score) => score.dimension === 'detour_return')?.score).toBe(5);
  });
});

describe('judge and comparison safety', () => {
  it('uses only supported Edrion API authentication mechanisms', () => {
    expect(qualityApiAuthHeaders({ employeeEmail: 'owner@edrion.dev' })).toEqual({
      'x-employee-email': 'owner@edrion.dev',
    });
    expect(
      qualityApiAuthHeaders({
        sessionCookie: 'signed/session',
        sessionCookieName: 'edrion_session',
      }),
    ).toEqual({ cookie: 'edrion_session=signed%2Fsession' });
    expect(() => qualityApiAuthHeaders({})).toThrow('QUALITY_API_AUTH_REQUIRED');
  });

  it('sends the selected deterministic persona policy to the isolated live endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'live-test',
          environment: 'evaluation',
          synthetic: true,
          productionWrites: 0,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await runLiveSession({
      apiBase: 'http://127.0.0.1:3007/v1',
      auth: { employeeEmail: 'owner@edrion.dev' },
      runId: 'live-policy-test',
      qualityCase: QUALITY_CASES[0]!,
      persona: 'repeated_struggle',
      seed: 42,
      limits: { maxCostMicros: 100_000, maxTokens: 100_000, maxDurationMs: 30_000 },
    });
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      personaId: 'repeated_struggle',
      personaPolicy: PERSONA_POLICIES.repeated_struggle,
    });
    fetchMock.mockRestore();
  });

  it('rejects unexplained or incomplete judge scores', () => {
    expect(() => validateJudgeScores([{ dimension: 'correctness', score: 5 }])).toThrow(
      'JUDGE_SCHEMA_INVALID',
    );
  });

  it('accepts a complete evidence-linked judge result', () => {
    const result = validateJudgeScores(
      QUALITY_DIMENSIONS.map((dimension) => ({
        dimension,
        score: 4,
        maxScore: 5,
        rationale: 'Clear rubric-anchored explanation.',
        uncertainty: 0.2,
        evaluator: 'gateway_judge',
        evidence: [{ moveId: 'move_1', note: 'Specific evidence.' }],
      })),
    );
    expect(result).toHaveLength(QUALITY_DIMENSIONS.length);
  });

  it('marks critical baseline regressions as blocking and low samples as noisy', () => {
    const session = (mutation: FixtureMutation) => {
      const qualityCase = QUALITY_CASES[0]!;
      const transcript = runFixtureSession({
        runId: mutation,
        case: qualityCase,
        persona: 'repeated_struggle',
        runSeed: 42,
        mutation,
      });
      const evaluated = evaluateTranscript(transcript, qualityCase);
      return {
        transcript,
        scores: evaluated.scores,
        totalScore:
          evaluated.scores.reduce((sum, score) => sum + score.score, 0) / evaluated.scores.length,
        blockingFailures: evaluated.blockingFailures,
        warnings: evaluated.warnings,
      };
    };
    const makeReport = (runId: string, mutation: FixtureMutation): QualityRunReport =>
      buildQualityReport({
        runId,
        label: runId,
        suite: 'test',
        seed: 42,
        mode: 'fixture',
        sessions: [session(mutation)],
        caseIds: [QUALITY_CASES[0]!.id],
        personaIds: ['repeated_struggle'],
        functionKeys: ['plan_render_observe'],
        limits: { maxCostMicros: 0, maxTokens: 0, maxDurationMs: 10_000, concurrency: 1 },
      });
    const comparison = compareQualityRuns(
      makeReport('baseline', 'none'),
      makeReport('candidate', 'factual_defect'),
    );
    expect(comparison.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'correctness', severity: 'blocking', noisy: true }),
      ]),
    );
  });
});
