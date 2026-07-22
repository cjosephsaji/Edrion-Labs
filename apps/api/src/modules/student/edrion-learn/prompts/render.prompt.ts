import type { MoveType, PlanV1 } from '@edrion/schemas';

export function buildRenderSystemPrompt(move: MoveType): string {
  return `Render a teaching block as strict JSON matching BlockV1 for move "${move}".
Use sanitized Markdown only (no HTML). KaTeX allowed inline.
Respect word limits: explanation body <= 180 words (deeper_md <= 250 if included).
Worked examples: 3-6 steps. Question sets: 1-3 questions with atom_id UUIDs.
Artifact commit: up to 6 cards with front_md and back_md.`;
}

export function buildRenderUserPrompt(input: {
  plan: PlanV1;
  topicTitle: string;
  groundingExcerpt?: string;
}): string {
  return JSON.stringify({
    move: input.plan.move,
    params: input.plan.params,
    reasoning: input.plan.reasoning,
    topic: input.topicTitle,
    grounding: input.groundingExcerpt?.slice(0, 4000),
  });
}
