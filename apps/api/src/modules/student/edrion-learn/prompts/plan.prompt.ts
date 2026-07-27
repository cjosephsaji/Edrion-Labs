import type { LearnPolicyV1, SessionStateV1, TopicProfileV1 } from '@edrion/schemas';
import { moveLibraryConstraintLines } from '../move-library';

/**
 * Plan prompt (hyperspec 1 §4.2).
 *
 * ADVISORY ONLY. Every constraint below is also enforced server-side by
 * `MovePlannerService.enforcePlan()` against `move-library.ts`; the prompt exists
 * to raise the hit rate, never to be the enforcement point. Constraint text is
 * generated from the library so the two cannot drift apart.
 */
export const PLAN_PROMPT_VERSION = 'plan.v2';

export function buildPlanSystemPrompt(input?: { moveCap?: number }): string {
  const moveCap = input?.moveCap;
  return [
    'You are the Edrion Learn move planner. Output strict JSON matching PlanV1.',
    'Choose exactly one pedagogical move from the eight keys below. Never invent a move key.',
    'Write student-readable reasoning (max 60 words / 400 chars) — it is shown to the student in a "Why this?" popover, so it must be true.',
    '',
    'MOVES AND THEIR ENTRY CONDITIONS (hard — the server rewrites violations to direct_explanation):',
    ...moveLibraryConstraintLines().map((line) => `- ${line}`),
    '',
    'ADDITIONAL HARD RULES:',
    moveCap
      ? `- The session ends at ${moveCap} moves. The final two slots are the closing pair (synthesis then artifact_commit); reaching the cap closes the session with end_reason=move_cap.`
      : '- The final two slots of a session are the closing pair (synthesis then artifact_commit).',
    '- prereq_pulse may run at most once per session, and both answers wrong forces a remediation direct_explanation on the weakest prerequisite.',
    '- Set checkpoint_advance only for retrieval_check, prereq_pulse, synthesis or artifact_commit.',
    '- If no move is clearly legal, choose direct_explanation {depth:"base"}.',
    '',
    'SOFT BIASES:',
    '- answer_directness=never_direct_on_assignment biases toward retrieval_check and socratic_probe.',
    '- goal=revision biases toward retrieval_check and prereq_pulse.',
    '- emotional_context=setback or anxious biases toward direct_explanation and worked_example.',
    '- Choosing visual_spawn on a topic whose native_representation is not visual requires an explicit justification in reasoning.',
  ].join('\n');
}

export function buildPlanUserPrompt(input: {
  topicTitle: string;
  profile: TopicProfileV1;
  policy: LearnPolicyV1;
  stateDigest: Record<string, unknown>;
  hardRules: string[];
  preferRetrieval: boolean;
}): string {
  return JSON.stringify({
    topic: input.topicTitle,
    profile: {
      knowledge_type: input.profile.knowledge_type,
      native_representation: input.profile.native_representation,
      abstraction: input.profile.abstraction,
      prerequisite_density: input.profile.prerequisite_density,
      prerequisites: input.profile.prerequisites.map((p) => p.label),
      misconception_richness: input.profile.misconception_richness,
      math_load: input.profile.math_load,
    },
    policy: {
      curriculum_bounds: input.policy.curriculum_bounds,
      answer_directness: input.policy.answer_directness,
    },
    state: input.stateDigest,
    hard_rules: input.hardRules,
    prefer_retrieval: input.preferRetrieval,
  });
}

export function stateDigest(state: SessionStateV1): Record<string, unknown> {
  return {
    goal: state.goal,
    emotional_context: state.emotional_context,
    move_count: state.moves.length,
    checkpoints: state.checkpoints,
    elapsed_minutes: state.elapsed_minutes,
    time_budget_minutes: state.time_budget_minutes,
    recent_moves: state.moves.slice(-5).map((m) => ({
      move_type: m.move_type,
      checkpoint_advance: m.checkpoint_advance,
      outcome: m.outcome,
    })),
    probe_chains: state.probe_chains,
    free_questions_used: state.free_questions_used,
    pending_free_question: state.pending_free_question,
    mastery_snapshot: state.mastery_snapshot,
  };
}
