import { createHash } from 'node:crypto';
import {
  PETROS_QUALITY_CORPUS_VERSION,
  PETROS_QUALITY_RUBRIC_VERSION,
  PETROS_QUALITY_RUNNER_VERSION,
  PETROS_QUALITY_SCHEMA_VERSION,
  type QualityMove,
  type QualityObservation,
  type QualityTranscript,
} from '../contracts';
import type { QualityCase } from '../fixtures/manifest';
import { PERSONA_POLICIES, seededRandom, sessionSeed } from '../personas';
import type { EvalPersona } from '../fixtures/topics';

export type FixtureMutation =
  | 'none'
  | 'personalization_ignored'
  | 'repetitive_moves'
  | 'factual_defect'
  | 'socratic_cap'
  | 'stuck_ladder'
  | 'provider_leak'
  | 'tenant_leak';

export type FixtureRunOptions = {
  runId: string;
  case: QualityCase;
  persona: EvalPersona;
  runSeed: number;
  mutation?: FixtureMutation;
  resumed?: boolean;
  codeVersion?: string;
};

type PlanResult = {
  type: string;
  phase: QualityMove['phase'];
  reason: string;
  factors: string[];
  expectedEvidence: string;
};

type FixtureState = {
  case: QualityCase;
  persona: EvalPersona;
  moveTypes: string[];
  observations: QualityObservation[];
  rand: () => number;
  mutation: FixtureMutation;
};

/** Explicit production-like seam used by both deterministic and live adapters. */
export interface QualityTeachingAdapter {
  plan(state: FixtureState): PlanResult[];
  render(plan: PlanResult, index: number, state: FixtureState): QualityMove;
  observe(move: QualityMove, state: FixtureState): QualityObservation[];
}

export class DeterministicPetrosAdapter implements QualityTeachingAdapter {
  plan(state: FixtureState): PlanResult[] {
    const { case: qualityCase, persona, mutation } = state;
    const profile = qualityCase.topic.profile;
    const policy = PERSONA_POLICIES[persona];
    const result: PlanResult[] = [];
    const add = (
      type: string,
      phase: QualityMove['phase'],
      reason: string,
      expectedEvidence: string,
      factors: string[] = [],
    ) =>
      result.push({
        type,
        phase,
        reason,
        expectedEvidence,
        factors: [
          `Topic profile: ${qualityCase.topic.title}`,
          `Goal: ${qualityCase.goal}`,
          ...factors,
        ],
      });

    if (qualityCase.entryMode === 'five_minute') {
      add('predict_then_reveal', 'opening', 'The five-minute promise begins with one cheap guess.', 'One confidence-tagged prediction.');
      add('layered_explanation', 'explaining', 'One targeted teaching move addresses the selected concept.', 'The learner restates the relationship.');
      add('recall_check', 'active', 'One retrieval check confirms what changed.', 'One confidence-tagged answer.');
      add('artifact_commit', 'closing', 'The finite session closes with one learner-curated card and no automatic expansion.', 'The learner explicitly accepts or declines the card.');
      return result;
    }
    if (qualityCase.entryMode === 'snap_question') {
      add('layered_explanation', 'opening', 'The confirmed stuck point gets the fastest useful setup step before any complete solution.', 'The learner names the givens, target, and relationship.');
      add('recall_check', 'active', 'A short check tests the setup rather than asking for the final answer.', 'One confidence-tagged setup choice.');
      add('synthesis', 'closing', 'The learner states the method they will try next.', 'A learner-authored next step.');
      return result;
    }
    if (qualityCase.entryMode === 'handwriting') {
      add('worked_example', 'explaining', 'Repair only the first confirmed logical break and preserve the learner’s earlier correct work.', 'The learner reattempts the broken line.');
      add('recall_check', 'active', 'A check separates the repaired step from later consequence errors.', 'One confidence-tagged line decision.');
      add('artifact_commit', 'closing', 'Petros proposes a student-owned repair card and waits for consent.', 'The learner reviews the card.');
      add('synthesis', 'closing', 'The learner explains why the repaired line is justified.', 'A learner-authored explanation.');
      return result;
    }
    if (qualityCase.entryMode === 'voice') {
      add('predict_then_reveal', 'opening', 'A concise spoken guess creates evidence without continuous recording.', 'One confidence-tagged spoken prediction.');
      add('layered_explanation', 'explaining', 'One short speakable explanation also remains complete in text.', 'The learner restates the idea.');
      add('recall_check', 'active', 'One short spoken check keeps the turn bounded.', 'One confidence-tagged transcript.');
      add('artifact_commit', 'closing', 'The learner explicitly chooses whether to keep the transcript-derived card.', 'The learner reviews the card.');
      return result;
    }

    if (profile.prerequisite_density === 'high' || persona === 'weak_prerequisites') {
      add(
        'prerequisite_check',
        'opening',
        'This topic depends on earlier ideas, so Petros checks the foundation first.',
        'A quick prerequisite response.',
        [`Prerequisite density: ${profile.prerequisite_density}`],
      );
    }
    if (qualityCase.goal !== 'doubt')
      add(
        'goal_frame',
        'opening',
        `The ${qualityCase.timeBudgetMinutes}-minute target makes the session finite.`,
        'The learner can name the target.',
      );
    add(
      'predict_then_reveal',
      'active',
      'A cheap commitment comes before new teaching.',
      'A prediction plus confidence.',
    );

    if (profile.misconception_richness === 'high') {
      add(
        'misconception_demolition',
        'active',
        'The published profile names a common wrong intuition worth testing.',
        'The learner commits before seeing the correction.',
        [`Misconception richness: ${profile.misconception_richness}`],
      );
    }
    if (profile.native_representation === 'visual_spatial') {
      add(
        'diagram',
        'explaining',
        'The topic profile marks visual structure as the natural representation.',
        'The learner can trace the structure.',
        ['Representation: visual'],
      );
    } else if (profile.native_representation === 'temporal_sequence') {
      add(
        'story',
        'explaining',
        'The topic is best understood as a causal sequence.',
        'The learner can order cause and consequence.',
        ['Representation: sequence'],
      );
    } else if (
      profile.knowledge_type.includes('procedural') ||
      profile.knowledge_type.includes('skill')
    ) {
      add(
        'worked_example',
        'explaining',
        'A worked decision sequence fits procedural or performance knowledge.',
        'A prediction at the next step.',
        ['Knowledge type: procedural/skill'],
      );
    } else if (profile.native_representation === 'comparative_table') {
      add(
        'contrast_case',
        'active',
        'A side-by-side distinction fits the topic profile.',
        'The learner identifies the controlling difference.',
        ['Representation: comparative'],
      );
    } else {
      add(
        'layered_explanation',
        'explaining',
        'A short first layer gives the central relationship without a wall of text.',
        'The learner restates the key relationship.',
      );
    }

    if (policy.questionBehavior === 'relevant_detour') {
      add(
        'composer_detour',
        'detour',
        'The learner asked a relevant side question, so PLAN acknowledges it and records a return path.',
        'The question is answered briefly and the original goal resumes.',
      );
      add(
        'return_to_goal',
        'active',
        'The explicit return plan resumes the original checkpoint.',
        'The learner continues the original target.',
      );
    }

    if (policy.recovery === 'persistent_struggle') {
      add('hint', 'detour', 'The first miss receives one hint.', 'A second attempt.');
      add(
        'missing_step',
        'detour',
        'The second miss reveals the specific missing step.',
        'A third attempt.',
      );
      if (mutation !== 'stuck_ladder') {
        add(
          'worked_solution',
          'detour',
          'The third miss receives a full worked solution.',
          'A reworded attempt.',
        );
        add(
          'reworded_success',
          'active',
          'The same target returns reworded so the stretch ends in earned success.',
          'A correct final response.',
        );
      }
    } else {
      add(
        'recall_check',
        'active',
        persona === 'unsure_but_correct'
          ? 'A correct but uncertain response is fragile, so the idea returns sooner.'
          : 'Recall provides durable evidence before closing.',
        'A confidence-tagged response.',
      );
    }

    if (qualityCase.goal !== 'doubt')
      add(
        'artifact_commit',
        'closing',
        'Petros proposes a student-owned residue and waits for consent.',
        'The learner reviews rather than auto-saves the proposal.',
      );
    add(
      'synthesis',
      'closing',
      'The learner closes by stating the idea in one sentence.',
      'A learner-authored synthesis.',
    );

    if (mutation === 'repetitive_moves') {
      return result.map((item, index) =>
        index > 1 && index < result.length - 2
          ? { ...item, type: 'layered_explanation', reason: 'Generic explanation.' }
          : item,
      );
    }
    if (mutation === 'personalization_ignored') {
      return result.map((item) => ({
        ...item,
        reason: 'Generic history-blind selection.',
        factors: [],
      }));
    }
    if (mutation === 'socratic_cap') {
      result.splice(
        3,
        0,
        {
          type: 'socratic_probe',
          phase: 'active',
          reason: 'Probe.',
          expectedEvidence: 'Response.',
          factors: [],
        },
        {
          type: 'socratic_probe',
          phase: 'active',
          reason: 'Probe.',
          expectedEvidence: 'Response.',
          factors: [],
        },
        {
          type: 'socratic_probe',
          phase: 'active',
          reason: 'Probe.',
          expectedEvidence: 'Response.',
          factors: [],
        },
      );
    }
    return result.slice(0, 14);
  }

  render(plan: PlanResult, index: number, state: FixtureState): QualityMove {
    const { case: qualityCase, mutation } = state;
    const anchor = qualityCase.criticalFacts[0] ?? qualityCase.topic.title;
    let content = contentFor(plan.type, qualityCase.topic.title, anchor, qualityCase.language);
    if (qualityCase.language === 'hinglish' && !/Pehle|rakho/i.test(content)) {
      content = `Pehle idea ko simple rakho: ${content}`;
    }
    if (mutation === 'factual_defect' && plan.phase === 'explaining')
      content = `Incorrect fixture claim: ${qualityCase.topic.answers.incorrect[0] ?? 'the anchor is false'}.`;
    if (mutation === 'provider_leak' && index === 1)
      content += ' Provider: fixture-model-internal.';
    const id = stableId(`${qualityCase.id}:${state.persona}:${index}:${plan.type}`, 'move');
    const startedAtMs = index * 900;
    return {
      id,
      blockId: stableId(`${id}:block`, 'block'),
      type: plan.type,
      phase: plan.phase,
      title: titleFor(plan.type),
      content,
      studentSafeReason: plan.reason,
      decisionFactors: plan.factors,
      expectedEvidence: plan.expectedEvidence,
      startedAtMs,
      firstContentAtMs: startedAtMs + 120 + (index % 3) * 40,
      completedAtMs: startedAtMs + 650,
      artifactProposed: plan.type === 'artifact_commit',
      studentConsentRequired: plan.type === 'artifact_commit',
      sourceAnchors: [anchor],
    };
  }

  observe(move: QualityMove, state: FixtureState): QualityObservation[] {
    const policy = PERSONA_POLICIES[state.persona];
    const observations: QualityObservation[] = [];
    const interactive = [
      'prerequisite_check',
      'predict_then_reveal',
      'misconception_demolition',
      'recall_check',
      'socratic_probe',
      'reworded_success',
    ];
    if (move.type === 'composer_detour') {
      observations.push(
        observation(
          move.id,
          'question',
          policy.responseTimeMs,
          'Asked a relevant detour question.',
        ),
      );
      return observations;
    }
    if (
      policy.skips &&
      ['goal_frame', 'layered_explanation', 'artifact_commit'].includes(move.type)
    ) {
      observations.push(
        observation(move.id, 'skip', policy.responseTimeMs, 'Skipped an optional block.'),
      );
      return observations;
    }
    if (interactive.includes(move.type)) {
      const probability =
        move.type === 'prerequisite_check' ? policy.prerequisiteAccuracy : policy.accuracy;
      const forcedSuccess = move.type === 'reworded_success';
      const correctness = forcedSuccess || state.rand() < probability ? 'correct' : 'incorrect';
      observations.push({
        ...observation(
          move.id,
          'answer',
          policy.responseTimeMs,
          `${correctness} answer with ${policy.confidence} confidence.`,
        ),
        correctness,
        confidence: policy.confidence,
      });
      observations.push({
        ...observation(move.id, 'confidence', 0, `Confidence: ${policy.confidence}.`),
        confidence: policy.confidence,
      });
    } else {
      observations.push(
        observation(move.id, 'complete', policy.responseTimeMs, 'Completed the block.'),
      );
    }
    return observations;
  }
}

export function runFixtureSession(options: FixtureRunOptions): QualityTranscript {
  const mutation = options.mutation ?? 'none';
  const seed = sessionSeed(options.runSeed + options.case.seed, options.case.id, options.persona);
  const state: FixtureState = {
    case: options.case,
    persona: options.persona,
    moveTypes: [],
    observations: [],
    rand: seededRandom(seed),
    mutation,
  };
  const adapter = new DeterministicPetrosAdapter();
  const plans = adapter.plan(state);
  const moves: QualityMove[] = [];
  for (let index = 0; index < plans.length; index += 1) {
    const move = adapter.render(plans[index]!, index, state);
    moves.push(move);
    state.moveTypes.push(move.type);
    state.observations.push(...adapter.observe(move, state));
  }
  const errors =
    mutation === 'tenant_leak'
      ? [
          {
            class: 'product' as const,
            code: 'tenant_isolation',
            message: 'Synthetic tenant boundary deliberately violated.',
          },
        ]
      : [];
  return {
    id: stableId(`${options.runId}:${options.case.id}:${options.persona}`, 'session'),
    runId: options.runId,
    caseId: options.case.id,
    topicKey: options.case.topic.key,
    topicTitle: options.case.topic.title,
    subject: options.case.subject,
    personaId: options.persona,
    goal: options.case.goal,
    seed,
    environment: 'evaluation',
    synthetic: true,
    versions: {
      corpus: PETROS_QUALITY_CORPUS_VERSION,
      rubric: PETROS_QUALITY_RUBRIC_VERSION,
      runner: PETROS_QUALITY_RUNNER_VERSION,
      prompt: mutation === 'none' ? 'stage4-plan-v1' : `stage4-plan-v1+mutation:${mutation}`,
      schema: PETROS_QUALITY_SCHEMA_VERSION,
      profile: 'topic-profile.v1',
      routing: 'fixture:no-provider',
      code: options.codeVersion ?? 'worktree',
    },
    moves,
    observations: state.observations,
    usage: [],
    errors,
    ended: errors.length ? 'failed' : 'goal_met',
    resumed: options.resumed ?? false,
    productionWrites: 0,
  };
}

function observation(
  moveId: string,
  type: QualityObservation['type'],
  responseTimeMs: number,
  summary: string,
): QualityObservation {
  return {
    id: stableId(`${moveId}:${type}:${summary}`, 'obs'),
    moveId,
    type,
    responseTimeMs,
    summary,
  };
}

function stableId(value: string, prefix: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function titleFor(type: string): string {
  return type
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function contentFor(
  type: string,
  topic: string,
  anchor: string,
  language: 'en' | 'hinglish',
): string {
  const lead = language === 'hinglish' ? 'Pehle idea ko simple rakho:' : 'Keep the idea precise:';
  switch (type) {
    case 'prerequisite_check':
      return `Before ${topic}, check the smallest required foundation.`;
    case 'goal_frame':
      return `By the end, you can explain and apply ${topic}.`;
    case 'predict_then_reveal':
      return `Commit first: what do you expect about ${topic}?`;
    case 'misconception_demolition':
      return `Test the tempting wrong intuition, then compare it with: ${anchor}`;
    case 'diagram':
      return `Editable structure for ${topic}. Nonvisual description: input, relationship, outcome. ${anchor}`;
    case 'story':
      return `${topic} as condition → choice → consequence. ${anchor}`;
    case 'worked_example':
      return `Identify the demand, choose the smallest fitting method, then check the result. ${anchor}`;
    case 'contrast_case':
      return `Compare two similar cases and identify the controlling difference. ${anchor}`;
    case 'layered_explanation':
      return `${lead} ${anchor}`;
    case 'composer_detour':
      return `Briefly resolve the relevant side question about ${topic}; keep an explicit return point.`;
    case 'return_to_goal':
      return `Return to the original ${topic} checkpoint.`;
    case 'hint':
      return `Hint: name the relationship before substituting details.`;
    case 'missing_step':
      return `Missing step: connect the given evidence to the controlling relationship.`;
    case 'worked_solution':
      return `Worked solution: demand → relationship → evidence → checked conclusion.`;
    case 'reworded_success':
      return `Try the same target with different surface wording.`;
    case 'recall_check':
      return `Without looking back, state the useful relationship in ${topic}.`;
    case 'artifact_commit':
      return `Proposed rule card: ${anchor}. Review or edit it; nothing is auto-saved.`;
    case 'synthesis':
      return `Complete: “The most useful thing I now understand about ${topic} is…”`;
    case 'socratic_probe':
      return `Which relationship would have to be true here?`;
    default:
      return `${topic}: ${anchor}`;
  }
}
