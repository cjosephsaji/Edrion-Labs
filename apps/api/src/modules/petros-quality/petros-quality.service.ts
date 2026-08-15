import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ActionContext } from '../../common/action-context';
import {
  PETROS_PLAN_FUNCTION_KEY,
  PETROS_PLAN_PROMPT_VERSION,
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_RENDER_FUNCTION_KEY,
  PETROS_SESSION_STATE_VERSION,
  petrosPlanDecisionSchema,
  petrosTeachingBlockContentSchema,
  type PetrosQualityLiveSessionInput,
  type PetrosSessionState,
  type PetrosQualityImportInput,
  type PetrosQualityJudgeInput,
  type PetrosQualityPromotionInput,
  type PetrosQualityRerunInput,
  type PetrosQualityRunQuery,
} from '@edrion/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { PetrosAiGatewayService } from '../petros-ai-routing/petros-ai-gateway.service';
import { PETROS_PLAN_SYSTEM_PROMPT, PETROS_RENDER_SYSTEM_PROMPT } from '../student/petros-loop/petros-loop.policy';
import { confidenceFlags, ladderTransition } from '../student/petros-loop/petros-observation.policy';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import { PetrosQualityRepository } from './petros-quality.repository';

const JUDGE_SYSTEM = `You are an independent Petros teaching-quality evaluator. Score only the supplied synthetic evaluation transcript.
Return one item for each requested rubric dimension with score 1..5, uncertainty 0..1, a concise rationale, and specific move/block evidence IDs.
Do not emit hidden chain-of-thought. Do not reward verbosity. Never reveal provider/model details or credentials. Distinguish product evidence from judge uncertainty.`;

@Injectable()
export class PetrosQualityService {
  constructor(private readonly repo: PetrosQualityRepository, private readonly gateway: PetrosAiGatewayService) {}

  list(query: PetrosQualityRunQuery) { return this.repo.list(query); }
  async detail(id: string) { const detail = await this.repo.detail(id); if (!detail) throw new NotFoundException({ code: 'PETROS_QUALITY_RUN_NOT_FOUND' }); return detail; }

  async import(input: PetrosQualityImportInput, ctx: ActionContext) {
    const report = input.report;
    assertReport(report);
    if (await this.repo.findByExternalId(String(report.runId))) throw new ConflictException({ code: 'PETROS_QUALITY_RUN_IMMUTABLE', message: 'That immutable run was already imported.' });
    const versions = record(report.versions);
    const totals = record(report.totals);
    const run = await this.repo.importReport({
      externalRunId: String(report.runId), label: String(report.label), status: String(report.status), mode: String(report.mode), source: 'evaluation', environment: 'evaluation',
      suite: String(report.suite), seed: Number(report.seed), gate: String(report.gate), corpusVersion: String(versions.corpus), rubricVersion: String(versions.rubric),
      promptVersion: String(versions.prompt), schemaVersion: String(versions.schema), profileVersion: String(versions.profile), routingVersion: String(versions.routing), codeVersion: String(versions.code),
      selection: record(report.selection), limits: record(report.limits), totals, dimensions: record(report.dimensions), blockingFailures: strings(report.blockingFailures), warnings: strings(report.warnings),
      comparison: report.comparison ? record(report.comparison) : null, report, costMicros: Number(totals.costMicros ?? 0), inputTokens: Number(totals.inputTokens ?? 0), outputTokens: Number(totals.outputTokens ?? 0), latencyMs: Number(totals.latencyMs ?? 0),
      startedAt: new Date(String(report.createdAt)), completedAt: new Date(String(report.completedAt)), createdBy: actor(ctx), updatedBy: actor(ctx),
    }, arrays(report.sessions).map(record), actor(ctx), input.reason);
    if (!run) throw new ConflictException({ code: 'PETROS_QUALITY_RUN_IMMUTABLE' });
    return this.detail(run.id);
  }

  async promote(id: string, input: PetrosQualityPromotionInput, ctx: ActionContext) {
    const run = await this.requireRun(id);
    if (run.gate === 'fail' || run.status !== 'completed') throw new ConflictException({ code: 'PETROS_BASELINE_PROMOTION_FORBIDDEN', message: 'Only completed, non-failing runs can become a baseline.' });
    return this.repo.promote(id, actor(ctx), input.reason);
  }

  async requestRerun(id: string, input: PetrosQualityRerunInput, ctx: ActionContext) {
    await this.requireRun(id);
    const audit = await this.repo.audit(id, 'rerun_requested', actor(ctx), input.reason, { failedOnly: input.failedOnly });
    return { accepted: true, runId: id, auditId: audit.id, execution: 'Use the versioned CLI or configured evaluation worker; no production learner job is created.' };
  }

  async judge(input: PetrosQualityJudgeInput) {
    const transcript = input.transcript;
    const result = await this.gateway.execute({
      context: { functionKey: input.functionKey, inputModality: 'text', estimatedTokens: Math.ceil(JSON.stringify(transcript).length / 4), currentCostMicros: 0, previousFailures: 0 },
      system: JUDGE_SYSTEM,
      input: [{ type: 'text', text: JSON.stringify({ rubricDimensions: QUALITY_DIMENSIONS, transcript }) }],
      responseSchema: judgeResponseSchema(), correlationId: randomUUID(),
      metadata: { source: 'evaluation', environment: 'evaluation', promptVersion: input.promptVersion, schemaVersion: input.schemaVersion },
      cacheTtlSeconds: 0,
    });
    if (!Array.isArray(result.content)) throw new ConflictException({ code: 'PETROS_QUALITY_JUDGE_SCHEMA_INVALID' });
    return {
      scores: result.content,
      usage: {
        source: 'evaluation', functionKey: result.functionKey, requestId: result.requestId,
        providerKey: result.providerKey, modelKey: result.modelKey,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        costMicros: result.estimatedCostMicros, latencyMs: result.responseTimeMs,
        retries: result.retryCount, fallbacks: result.fallbackTier,
        validationFailures: 0, cacheHit: result.cached,
      },
    };
  }

  async liveSession(input: PetrosQualityLiveSessionInput) {
    const qualityCase = record(input.case);
    const topicRecord = record(qualityCase.topic);
    const topic = String(topicRecord.title ?? qualityCase.topicTitle ?? qualityCase.id ?? 'Synthetic topic');
    const caseId = String(qualityCase.id ?? 'synthetic-case');
    const goal = String(qualityCase.goal ?? 'learn');
    const institutionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const studentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const sessionId = randomUUID();
    const persona = input.personaPolicy;
    const rand = seededRandom(input.seed);
    // Provider-backed teaching stays bounded to three PLAN/RENDER moves. OBSERVE is deterministic
    // production policy, so its complete recovery ladder adds evidence without another model call.
    const maximum = 3;
    const state: PetrosSessionState = {
      stateVersion: PETROS_SESSION_STATE_VERSION, sessionId, studentId, institutionId,
      sessionType: ['learn','revise','repair','doubt'].includes(goal) ? goal as PetrosSessionState['sessionType'] : 'learn',
      topic, currentGoal: String(qualityCase.goalText ?? `Understand and apply ${topic}.`),
      time: { budgetSeconds: Number(qualityCase.timeBudgetMinutes ?? 10) * 60, elapsedSeconds: 0, remainingSeconds: Number(qualityCase.timeBudgetMinutes ?? 10) * 60 },
      moves: { maximum, used: 0, remaining: maximum },
      checkpointPlan: Array.from({ length: maximum }, (_, index) => ({ id: `quality-${index + 1}`, label: `Evaluation checkpoint ${index + 1}`, status: index === 0 ? 'current' as const : 'pending' as const })),
      currentCheckpointId: 'quality-1', priorMoves: [], learnerContext: {}, topicContext: { evaluation: true },
      resolvedTopicProfile: stage4ProfileFixture(topic, institutionId), sourceContext: null,
      observations: { recent: [], summarizedOutcomes: { answered: 0, correct: 0, incorrect: 0, partial: 0, highValueMisconceptions: 0, fragileSuccesses: 0, openDetours: 0, activeStruggleLevel: 0, activeWrongAttemptCount: 0 } },
      promptVersion: PETROS_PLAN_PROMPT_VERSION, outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    };
    const moves: Array<Record<string, unknown>> = [];
    const observations: Array<Record<string, unknown>> = [];
    const usage: Array<Record<string, unknown>> = [];
    const started = Date.now();
    let totalTokens = 0;
    let totalCostMicros = 0;
    let detourAsked = false;
    let struggleCompleted = false;
    let ended: 'goal_met' | 'time_up' | 'max_moves' = 'max_moves';
    for (let index = 0; index < maximum; index += 1) {
      if (Date.now() - started > input.limits.maxDurationMs) { ended = 'time_up'; break; }
      state.moves = { maximum, used: index, remaining: maximum - index };
      state.time.elapsedSeconds = Math.floor((Date.now() - started) / 1000);
      state.time.remainingSeconds = Math.max(0, state.time.budgetSeconds - state.time.elapsedSeconds);
      const planResult = await this.gateway.execute({
        context: { functionKey: PETROS_PLAN_FUNCTION_KEY, topic, sessionType: state.sessionType, inputModality: 'text', estimatedTokens: Math.ceil(JSON.stringify(state).length / 4), currentCostMicros: totalCostMicros, previousFailures: state.observations.summarizedOutcomes.incorrect, institutionId },
        system: PETROS_PLAN_SYSTEM_PROMPT, input: [{ type: 'text', text: JSON.stringify(state) }],
        responseSchema: zodToJsonSchema(petrosPlanDecisionSchema, { $refStrategy: 'none' }) as Record<string, unknown>, sessionId, correlationId: `${input.runId}:${caseId}:${input.personaId}`,
        metadata: { source: 'evaluation', environment: 'evaluation', synthetic: true, caseId, personaId: input.personaId }, cacheTtlSeconds: 0,
      });
      const decision = petrosPlanDecisionSchema.parse(planResult.content);
      const renderResult = await this.gateway.execute({
        context: { functionKey: PETROS_RENDER_FUNCTION_KEY, topic, sessionType: state.sessionType, inputModality: 'text', estimatedTokens: Math.ceil(JSON.stringify({ decision, state }).length / 4), currentCostMicros: totalCostMicros + planResult.estimatedCostMicros, previousFailures: state.observations.summarizedOutcomes.incorrect, institutionId },
        system: PETROS_RENDER_SYSTEM_PROMPT, input: [{ type: 'text', text: JSON.stringify({ decision, state }) }],
        responseSchema: zodToJsonSchema(petrosTeachingBlockContentSchema, { $refStrategy: 'none' }) as Record<string, unknown>, sessionId, correlationId: `${input.runId}:${caseId}:${input.personaId}`,
        metadata: { source: 'evaluation', environment: 'evaluation', synthetic: true, caseId, personaId: input.personaId }, cacheTtlSeconds: 0,
      });
      const block = petrosTeachingBlockContentSchema.parse(renderResult.content);
      totalTokens += planResult.inputTokens + planResult.outputTokens + renderResult.inputTokens + renderResult.outputTokens;
      totalCostMicros += planResult.estimatedCostMicros + renderResult.estimatedCostMicros;
      if (totalTokens > input.limits.maxTokens) throw new ConflictException({ code: 'PETROS_QUALITY_TOKEN_CAP' });
      if (totalCostMicros > input.limits.maxCostMicros) throw new ConflictException({ code: 'PETROS_QUALITY_COST_CAP' });
      const moveId = `live_move_${index + 1}_${planResult.requestId.slice(0, 8)}`;
      const blockId = `live_block_${index + 1}_${renderResult.requestId.slice(0, 8)}`;
      const decisionId = randomUUID();
      moves.push({ id: moveId, blockId, type: decision.selectedMoveType, phase: phaseFor(decision.selectedMoveType), title: String('title' in block ? block.title : decision.selectedMoveType), content: JSON.stringify(block), studentSafeReason: decision.studentSafeReason, decisionFactors: decision.decisionFactors, expectedEvidence: decision.expectedEvidence, startedAtMs: Date.now() - started, firstContentAtMs: Date.now() - started, completedAtMs: Date.now() - started, artifactProposed: decision.selectedMoveType === 'artifact_commit', studentConsentRequired: decision.selectedMoveType === 'artifact_commit', sourceAnchors: [] });
      usage.push(...[planResult, renderResult].map((result) => ({ source: 'evaluation', functionKey: result.functionKey, requestId: result.requestId, providerKey: result.providerKey, modelKey: result.modelKey, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costMicros: result.estimatedCostMicros, latencyMs: result.responseTimeMs, retries: result.retryCount, fallbacks: result.fallbackTier, validationFailures: 0, cacheHit: result.cached })));
      let observedOutcome: Record<string, unknown> = { completed: true };
      const asksDetour = persona.questionBehavior === 'relevant_detour' && !detourAsked && index === 0;
      const skipsBlock = persona.skips && ['goal_frame', 'layered_explanation', 'artifact_commit'].includes(decision.selectedMoveType);
      const interactive = decision.guessFirst.status === 'required' || ['prerequisite_check','predict_then_reveal','misconception_demolition','recall_check','socratic_probe'].includes(decision.selectedMoveType);
      if (asksDetour) {
        detourAsked = true;
        const summary = `Asked a relevant detour question about ${topic}; return to the original goal afterward.`;
        observations.push({ id: `live_obs_${index + 1}_question`, moveId, type: 'question', responseTimeMs: persona.responseTimeMs, summary });
        addStateObservation(state, { type: 'question_asked', summary, blockId: renderResult.requestId, decisionId, targetId: decision.guessFirst.targetId });
        state.observations.summarizedOutcomes.openDetours = 1;
        observedOutcome = { completed: true, questionAsked: true };
      } else if (skipsBlock) {
        const summary = 'Synthetic persona skipped this optional block.';
        observations.push({ id: `live_obs_${index + 1}_skip`, moveId, type: 'skip', responseTimeMs: persona.responseTimeMs, summary });
        addStateObservation(state, { type: 'block_skipped', summary, blockId: renderResult.requestId, decisionId, targetId: decision.guessFirst.targetId });
        observedOutcome = { completed: false, skipped: true };
      } else if (interactive) {
        const probability = decision.selectedMoveType === 'prerequisite_check' ? persona.prerequisiteAccuracy : persona.accuracy;
        const correctness = persona.recovery === 'persistent_struggle' && !struggleCompleted
          ? 'incorrect' as const
          : rand() < probability ? 'correct' as const : 'incorrect' as const;
        recordSyntheticAnswer({ state, observations, moveId, blockId: renderResult.requestId, decisionId, targetId: decision.guessFirst.targetId, correctness, confidence: persona.confidence, responseTimeMs: persona.responseTimeMs, suffix: `${index + 1}` });
        observedOutcome = { completed: true, correctness, confidence: persona.confidence };
        if (persona.recovery === 'persistent_struggle' && !struggleCompleted) {
          appendSyntheticStruggleLadder({ state, moves, observations, topic, anchor: String(arrays(qualityCase.criticalFacts)[0] ?? topic), blockId: renderResult.requestId, decisionId, targetId: decision.guessFirst.targetId, responseTimeMs: persona.responseTimeMs, started });
          struggleCompleted = true;
        }
      } else {
        const summary = 'Synthetic live persona completed the generated block.';
        observations.push({ id: `live_obs_${index + 1}_complete`, moveId, type: 'complete', responseTimeMs: persona.responseTimeMs, summary });
        addStateObservation(state, { type: 'block_completed', summary, blockId: renderResult.requestId, decisionId, targetId: null });
      }
      if (detourAsked && index > 0) state.observations.summarizedOutcomes.openDetours = 0;
      state.priorMoves.push({ decisionId, sequence: index + 1, decision, renderedBlockReference: { id: renderResult.requestId, type: decision.selectedMoveType }, status: 'completed', observedOutcome });
      if (decision.termination.recommendation !== 'continue') { ended = 'goal_met'; break; }
    }
    return { id: `live_${sessionId}`, runId: input.runId, caseId, topicKey: String(topicRecord.key ?? caseId), topicTitle: topic, subject: String(qualityCase.subject ?? 'General'), personaId: input.personaId, goal, seed: input.seed, environment: 'evaluation', synthetic: true,
      versions: { corpus: 'petros-quality-corpus.v1', rubric: 'petros-quality-rubric.v1', runner: 'petros-quality-runner.v1', prompt: PETROS_PLAN_PROMPT_VERSION, schema: 'petros-quality-report.v1', profile: state.resolvedTopicProfile.profile.schemaVersion, routing: 'petros-ai-routing', code: 'api-live' },
      moves, observations, usage, errors: [], ended, resumed: false, productionWrites: 0 };
  }

  exportJson(id: string) { return this.detail(id).then((detail) => detail.report); }

  async exportCsv(id: string) {
    const detail = await this.detail(id);
    const scoresBySession = new Map<string, typeof detail.scores>();
    for (const score of detail.scores) scoresBySession.set(score.sessionId, [...(scoresBySession.get(score.sessionId) ?? []), score]);
    const header = ['run_id','session_id','case_id','topic','persona','goal','status','total_score','dimension','dimension_score','evaluator','uncertainty','rationale'];
    const rows = detail.sessions.flatMap((session) => (scoresBySession.get(session.id) ?? []).map((score) => [
      detail.externalRunId, session.externalSessionId, session.caseId, session.topicKey, session.personaId, session.goal, session.status,
      session.totalScoreBasisPoints / 100, score.dimension, score.scoreBasisPoints / 100, score.evaluator, score.uncertaintyBasisPoints / 10_000, score.rationale,
    ]));
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  }

  private async requireRun(id: string) { const run = await this.repo.find(id); if (!run) throw new NotFoundException({ code: 'PETROS_QUALITY_RUN_NOT_FOUND' }); return run; }
}

const QUALITY_DIMENSIONS = ['correctness','structural_variety','move_appropriateness','prerequisite_handling','guess_confidence','stuck_recovery','socratic_cap','pacing','explainability','detour_return','repetition','artifact_quality','safety_boundaries','language_register','operational_efficiency'];
function judgeResponseSchema() { return { type: 'array', minItems: QUALITY_DIMENSIONS.length, maxItems: QUALITY_DIMENSIONS.length, items: { type: 'object', additionalProperties: false, required: ['dimension','score','evidence','rationale','uncertainty'], properties: { dimension: { type: 'string', enum: QUALITY_DIMENSIONS }, score: { type: 'number', minimum: 1, maximum: 5 }, evidence: { type: 'array', minItems: 1, items: { type: 'object', required: ['moveId','note'], properties: { moveId: { type: 'string' }, blockId: { type: 'string' }, observationId: { type: 'string' }, note: { type: 'string' } } } }, rationale: { type: 'string', minLength: 8 }, uncertainty: { type: 'number', minimum: 0, maximum: 1 } } } }; }
function assertReport(report: Record<string, unknown>) { if (report.source !== 'evaluation' || !record(report.isolation).syntheticOnly || Number(record(report.isolation).productionWrites) !== 0) throw new ConflictException({ code: 'PETROS_QUALITY_ISOLATION_REQUIRED', message: 'Only isolated synthetic evaluation reports can be imported.' }); for (const key of ['runId','label','status','mode','suite','gate','versions','totals','sessions']) if (report[key] == null) throw new ConflictException({ code: 'PETROS_QUALITY_REPORT_INVALID', message: `Missing ${key}.` }); }
function actor(ctx: ActionContext) { return ctx.principalContext.principal.employeeId; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function arrays(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function strings(value: unknown): string[] { return arrays(value).map(String); }
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function addStateObservation(state: PetrosSessionState, input: {
  type: PetrosSessionState['observations']['recent'][number]['type'];
  summary: string;
  blockId: string | null;
  decisionId: string | null;
  targetId: string | null;
}) {
  state.observations.recent.push({ id: randomUUID(), ...input, occurredAt: new Date().toISOString() });
  if (state.observations.recent.length > 24) state.observations.recent.splice(0, state.observations.recent.length - 24);
}
function recordSyntheticAnswer(input: {
  state: PetrosSessionState;
  observations: Array<Record<string, unknown>>;
  moveId: string;
  blockId: string;
  decisionId: string;
  targetId: string | null;
  correctness: 'correct' | 'incorrect';
  confidence: 'sure' | 'think_so' | 'guessing';
  responseTimeMs: number;
  suffix: string;
}) {
  const summary = `${input.correctness} answer; confidence ${input.confidence}.`;
  input.observations.push({ id: `live_obs_${input.suffix}_answer`, moveId: input.moveId, type: 'answer', correctness: input.correctness, confidence: input.confidence, responseTimeMs: input.responseTimeMs, summary });
  input.observations.push({ id: `live_obs_${input.suffix}_confidence`, moveId: input.moveId, type: 'confidence', confidence: input.confidence, responseTimeMs: 0, summary: `Confidence: ${input.confidence}.` });
  addStateObservation(input.state, { type: 'answer_submitted', summary, blockId: input.blockId, decisionId: input.decisionId, targetId: input.targetId });
  addStateObservation(input.state, { type: 'confidence_selected', summary: `Confidence ${input.confidence}.`, blockId: input.blockId, decisionId: input.decisionId, targetId: input.targetId });
  const totals = input.state.observations.summarizedOutcomes;
  totals.answered += 1;
  totals[input.correctness] += 1;
  const flags = confidenceFlags(input.correctness, input.confidence);
  if (flags.highValueMisconception) totals.highValueMisconceptions += 1;
  if (flags.fragileSuccess) totals.fragileSuccesses += 1;
  totals.activeStruggleLevel = input.correctness === 'incorrect' ? Math.min(4, totals.activeStruggleLevel + 1) : 0;
}
function appendSyntheticStruggleLadder(input: {
  state: PetrosSessionState;
  moves: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  topic: string;
  anchor: string;
  blockId: string;
  decisionId: string;
  targetId: string | null;
  responseTimeMs: number;
  started: number;
}) {
  const question = {
    hint: `Start by naming the controlling relationship in ${input.topic}.`,
    missingStep: `The missing step is to connect the evidence to: ${input.anchor}.`,
    workedSolution: `Worked solution: identify the demand, apply ${input.anchor}, and check the result against the original target.`,
  };
  const incorrect = syntheticEvaluation('incorrect');
  const first = ladderTransition(0, 'active', incorrect, question);
  const hint = addRecoveryMove(input, 'hint', 'One bounded hint', first.supportText ?? question.hint, 'Use the hint and attempt the same target again.');
  recordSyntheticAnswer({ ...input, moveId: hint.id, correctness: 'incorrect', confidence: 'guessing', suffix: 'struggle_hint' });

  const second = ladderTransition(first.wrongAttemptCount, first.status, incorrect, question);
  const missing = addRecoveryMove(input, 'missing_step', 'Reveal the missing step', second.supportText ?? question.missingStep, 'Use the named missing step for a third attempt.');
  recordSyntheticAnswer({ ...input, moveId: missing.id, correctness: 'incorrect', confidence: 'guessing', suffix: 'struggle_missing_step' });

  const third = ladderTransition(second.wrongAttemptCount, second.status, incorrect, question);
  const solution = addRecoveryMove(input, 'worked_solution', 'Show the full worked solution', third.supportText ?? question.workedSolution, 'Study the solution before trying equivalent wording.');
  const completionSummary = 'The complete worked solution was shown after the third counted miss.';
  input.observations.push({ id: 'live_obs_struggle_solution_complete', moveId: solution.id, type: 'complete', responseTimeMs: input.responseTimeMs, summary: completionSummary });
  addStateObservation(input.state, { type: 'block_completed', summary: completionSummary, blockId: input.blockId, decisionId: input.decisionId, targetId: input.targetId });

  const recovered = ladderTransition(third.wrongAttemptCount, third.status, syntheticEvaluation('correct'), question);
  if (!third.needsRewordedQuestion || !recovered.recovery) throw new ConflictException({ code: 'PETROS_QUALITY_STRUGGLE_POLICY_INVALID' });
  const reworded = addRecoveryMove(input, 'reworded_success', 'Equivalent reworded success', `Same target, new wording: explain how ${input.anchor} controls ${input.topic}.`, 'Earn success on an equivalent reworded target.');
  recordSyntheticAnswer({ ...input, moveId: reworded.id, correctness: 'correct', confidence: 'guessing', suffix: 'struggle_reworded_success' });
}
function addRecoveryMove(input: {
  moves: Array<Record<string, unknown>>;
  topic: string;
  anchor: string;
  started: number;
}, type: 'hint' | 'missing_step' | 'worked_solution' | 'reworded_success', title: string, content: string, expectedEvidence: string) {
  const index = input.moves.length + 1;
  const id = `live_move_recovery_${index}_${type}`;
  input.moves.push({
    id,
    blockId: `live_block_recovery_${index}_${type}`,
    type,
    phase: type === 'reworded_success' ? 'active' : 'detour',
    title,
    content,
    studentSafeReason: `The deterministic Stage 3 recovery policy selected ${type.replace(/_/g, ' ')} for the synthetic learner's current counted miss.`,
    decisionFactors: ['Synthetic evaluation only', `Recovery target: ${input.topic}`, `Grounding anchor: ${input.anchor}`],
    expectedEvidence,
    startedAtMs: Date.now() - input.started,
    firstContentAtMs: Date.now() - input.started,
    completedAtMs: Date.now() - input.started,
    artifactProposed: false,
    studentConsentRequired: false,
    sourceAnchors: [input.anchor],
  });
  return { id };
}
function syntheticEvaluation(correctness: 'correct' | 'incorrect') {
  return {
    schemaVersion: 'petros.answer-evaluation.v1' as const,
    correctness,
    credit: correctness === 'correct' ? 1 : 0,
    evidence: ['Deterministic synthetic persona response.'],
    errorClass: correctness === 'correct' ? 'none' as const : 'concept_gap' as const,
    misconception: null,
    feedback: correctness === 'correct' ? 'The reworded target was answered correctly.' : 'The target remains unresolved.',
    safeNextHint: correctness === 'correct' ? null : 'Use the next bounded support step.',
  };
}
function phaseFor(move: string) { if (['hook','prerequisite_check','goal_frame'].includes(move)) return 'opening'; if (['synthesis','artifact_commit','forward_link'].includes(move)) return 'closing'; if (['layered_explanation','worked_example','analogy','story','derivation','diagram'].includes(move)) return 'explaining'; return 'active'; }
function csvCell(value: unknown) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
