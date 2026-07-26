import type { LearnEntryPoint } from '@edrion/schemas';

/** Frozen 30-topic fixture set for learn-evals (plan P1.7). */
export const EVAL_TOPICS: { key: string; entry: LearnEntryPoint }[] = [
  { key: 'integration-by-parts', entry: 'goal' },
  { key: 'photosynthesis', entry: 'library_document' },
  { key: 'french-revolution', entry: 'learning_path' },
  { key: 'python-loop', entry: 'review_queue' },
  { key: 'quadratic-equations', entry: 'goal' },
  { key: 'cell-division', entry: 'library_document' },
  { key: 'ww2-causes', entry: 'learning_path' },
  { key: 'arrays-js', entry: 'free_chat_handoff' },
  { key: 'trigonometry-intro', entry: 'goal' },
  { key: 'ecosystems', entry: 'library_document' },
  { key: 'indian-constitution', entry: 'learning_path' },
  { key: 'sql-joins', entry: 'review_queue' },
  { key: 'probability-basics', entry: 'goal' },
  { key: 'human-heart', entry: 'library_document' },
  { key: 'cold-war', entry: 'learning_path' },
  { key: 'recursion', entry: 'free_chat_handoff' },
  { key: 'linear-equations', entry: 'goal' },
  { key: 'acids-bases', entry: 'library_document' },
  { key: 'renaissance', entry: 'learning_path' },
  { key: 'css-flexbox', entry: 'review_queue' },
  { key: 'derivatives-intro', entry: 'goal' },
  { key: 'genetics-mendel', entry: 'library_document' },
  { key: 'mughal-empire', entry: 'learning_path' },
  { key: 'git-basics', entry: 'free_chat_handoff' },
  { key: 'matrices', entry: 'goal' },
  { key: 'thermodynamics', entry: 'library_document' },
  { key: 'democracy-models', entry: 'learning_path' },
  { key: 'api-rest', entry: 'review_queue' },
  { key: 'vectors', entry: 'goal' },
  { key: 'periodic-table', entry: 'library_document' },
];

export const EVAL_PERSONAS = [
  'strong_fast',
  'struggling',
  'average_curious',
  'probe_escaper',
  'time_poor',
  'revision_mode',
] as const;
