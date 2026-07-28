import type { TopicProfileV1 } from '@edrion/schemas';

/**
 * Topic profiler prompt (hyperspec 1 §2.1 / §2.2).
 * Versioned like plan/render so prompt rollouts invalidate cached profiles.
 */
export const PROFILE_PROMPT_VERSION = 'profile.v1';

/** Rough char budget ≈ 4k tokens (≈4 chars/token) for atom summaries. */
export const PROFILE_ATOM_CHAR_BUDGET = 16_000;

export function buildProfileSystemPrompt(): string {
  return [
    'You are the Edrion Learn topic profiler. Output strict JSON matching TopicProfileV1.',
    'Infer pedagogy attributes from the topic title, concept atoms, and any syllabus/material context.',
    '',
    'FIELD GUIDANCE:',
    '- knowledge_type: 1–2 of conceptual|procedural|factual|skill. Prefer conceptual for theory; procedural/skill for how-to; factual for lists/dates.',
    '- abstraction: concrete (examples/objects), mixed, or abstract (symbols/proofs).',
    '- native_representation: the BEST primary form to teach this — visual_spatial, symbolic, verbal, temporal_sequence, or comparative_table.',
    '- prerequisite_density: low|medium|high based on how many prior atoms a learner needs.',
    '- prerequisites: ≤5 {atom_id, label}. Use atom_id from the provided atoms when a prereq matches; otherwise atom_id=null with a short label.',
    '- misconception_richness + known_misconceptions (≤3): common student errors for this topic.',
    '- math_load / memorization_load: none|light|heavy.',
    '- real_world_anchors: ≤3 short concrete hooks a tutor can use.',
    '',
    'Never invent atom_id UUIDs that are not in the input. Prefer null over a fabricated id.',
  ].join('\n');
}

export function buildProfileUserPrompt(input: {
  title: string;
  topicKey: string;
  atoms: Array<{ id: string; title: string; contentSummary: string }>;
  syllabusContext?: string | null;
  materialOutline?: string | null;
  materialFirstChunk?: string | null;
}): string {
  return JSON.stringify({
    title: input.title,
    topic_key: input.topicKey,
    concept_atoms: input.atoms,
    syllabus_context: input.syllabusContext ?? null,
    material_outline: input.materialOutline ?? null,
    material_first_chunk: input.materialFirstChunk ?? null,
  });
}

/** Cap atom content to the §2.1 ≤4k-token budget. */
export function budgetAtomSummaries(
  atoms: Array<{ id: string; title: string; content: string | null }>,
): Array<{ id: string; title: string; contentSummary: string }> {
  const out: Array<{ id: string; title: string; contentSummary: string }> = [];
  let used = 0;
  for (const atom of atoms) {
    const title = atom.title.slice(0, 200);
    const raw = (atom.content ?? '').replace(/\s+/g, ' ').trim();
    const remaining = PROFILE_ATOM_CHAR_BUDGET - used - title.length - 8;
    if (remaining <= 0) break;
    const contentSummary = raw.slice(0, Math.max(0, remaining));
    used += title.length + contentSummary.length;
    out.push({ id: atom.id, title, contentSummary });
  }
  return out;
}

export type { TopicProfileV1 };
