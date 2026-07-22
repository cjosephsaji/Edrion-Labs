/** Frozen topic fixtures for learn-evals (30 topics target; core subset here). */
export const TOPIC_FIXTURES = [
  { key: 'topic:integration-by-parts', title: 'Integration by parts', knowledge_type: 'procedural' },
  { key: 'topic:photosynthesis', title: 'Photosynthesis', knowledge_type: 'conceptual' },
  { key: 'topic:french-revolution', title: 'French Revolution causes', knowledge_type: 'conceptual' },
  { key: 'topic:python-for-loops', title: 'Python for loops', knowledge_type: 'procedural' },
] as const;

export const PERSONAS = [
  'strong_fast',
  'struggling',
  'average_curious',
  'probe_escaper',
  'time_poor',
  'revision_mode',
] as const;

export type EvalPersona = (typeof PERSONAS)[number];
