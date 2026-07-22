import type { LearnPolicyV1, SessionStateV1, TopicProfileV1 } from '@edrion/schemas';

export function buildPlanSystemPrompt(): string {
  return `You are the Edrion Learn move planner. Output strict JSON matching PlanV1.
Choose exactly one pedagogical move. Write student-readable reasoning (max 400 chars).
Rules:
- exposition before retrieval unless goal is revision
- prereq_pulse only in moves 1-2 and not for low prerequisite_density topics
- socratic_probe max 2 turns per chain, max 2 chains per session
- synthesis and artifact_commit only near session end (move 12+)
- never exceed 14 moves total
- answer_directness never_direct_on_assignment biases toward retrieval_check and socratic_probe
- goal revision biases toward retrieval_check and prereq_pulse`;
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
      prerequisite_density: input.profile.prerequisite_density,
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
