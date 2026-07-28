import type { MoveType, PlanV1 } from '@edrion/schemas';
import { MOVE_LIBRARY, type LearnBlockType } from '../move-library';

export const RENDER_PROMPT_VERSION = 'render.v2';

const BLOCK_TYPE_FIELDS: Record<LearnBlockType, string> = {
  explanation:
    '{block_type:"explanation", title?, body_md (≤180 words), deeper_md? (≤250 words), anchor?}',
  worked_example:
    '{block_type:"worked_example", title?, problem_md, steps:[{step_md, predict_prompt?}] length 3–6}',
  question_set:
    '{block_type:"question_set", purpose:"retrieval"|"prereq", questions:[{id, type:"mcq_single"|"short_text"|"numeric", prompt_md, options?:[{id,label_md}] 2–5, correct_option_id?, atom_id (uuid or null), difficulty:"easy"|"medium"|"hard", why_md, hints?:[string] 1–3}] length 1–3}',
  canvas_embed:
    '{block_type:"canvas_embed", graph_json_ref (string), canvas_id (uuid), caption?}',
  synthesis: '{block_type:"synthesis", prompt_md}',
  artifact_commit:
    '{block_type:"artifact_commit", cards:[{front_md, back_md, source_block_id (uuid)}] ≤6, include_canvas:boolean}',
  probe: '{block_type:"probe", question_md, chain_id (uuid), turn:1|2}',
  system_notice:
    '{block_type:"system_notice", kind:"break"|"budget"|"degraded"|"policy", body_md, actions:[{key,label}]}',
};

/**
 * Render prompt (hyperspec 1 §4.3). Feeds the authoritative move→block_type
 * mapping from move-library so the model cannot invent invalid block_type values
 * (three of eight move names are NOT valid block types).
 */
export function buildRenderSystemPrompt(move: MoveType): string {
  const entry = MOVE_LIBRARY[move] ?? MOVE_LIBRARY.direct_explanation;
  const blockType = entry.block_type;
  const mappingLines = Object.values(MOVE_LIBRARY).map(
    (m) => `  ${m.move} → block_type "${m.block_type}"`,
  );
  return [
    'You are the Edrion Learn block renderer. Output ONE strict JSON object matching BlockV1.',
    'Sanitized Markdown only (no HTML). KaTeX allowed inline as $...$ / $$...$$.',
    '',
    'AUTHORITATIVE MOVE → BLOCK_TYPE MAPPING (never invent a block_type; three move names are NOT block types):',
    ...mappingLines,
    '',
    `You are rendering move "${move}". You MUST emit block_type "${blockType}".`,
    `Required shape: ${BLOCK_TYPE_FIELDS[blockType]}`,
    '',
    'HARD RULES:',
    '- Never set block_type to a move name (e.g. never "direct_explanation", "retrieval_check", "visual_spawn", "socratic_probe", "prereq_pulse").',
    '- Required UUID fields (chain_id, source_block_id, canvas_id, atom_id) must be valid UUID strings when present.',
    '- Required enums: purpose, difficulty, type, kind — use only the values listed above.',
    '- atom_id must reference a concept atom id from known_atom_ids when possible; use null if none fit.',
    '- Respect word limits: explanation body_md ≤180 words; deeper_md ≤250 words.',
    '- Do NOT repeat titles or body structure from recent_blocks in the user payload; advance the lesson.',
  ].join('\n');
}

export type RenderRecentBlockDigest = {
  move: string | null;
  title?: string;
  body_excerpt?: string;
};

export function buildRenderUserPrompt(input: {
  plan: PlanV1;
  topicTitle: string;
  groundingExcerpt?: string;
  atomIds?: string[];
  recentBlocks?: RenderRecentBlockDigest[];
}): string {
  return JSON.stringify({
    move: input.plan.move,
    required_block_type: (MOVE_LIBRARY[input.plan.move] ?? MOVE_LIBRARY.direct_explanation).block_type,
    params: input.plan.params,
    reasoning: input.plan.reasoning,
    topic: input.topicTitle,
    known_atom_ids: input.atomIds ?? [],
    grounding: input.groundingExcerpt?.slice(0, 4000),
    recent_blocks: input.recentBlocks ?? [],
  });
}
