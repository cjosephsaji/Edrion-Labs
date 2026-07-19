import type { QuestionType } from './questions';
import { QUESTION_TYPES } from './questions';

export const QUESTION_GROUPS = ['objective', 'written', 'media', 'code'] as const;
export type QuestionGroup = (typeof QUESTION_GROUPS)[number];

export const QUESTION_GRADING = ['auto', 'manual', 'hybrid'] as const;
export type QuestionGrading = (typeof QUESTION_GRADING)[number];

/** Contract-level metadata for each portal question type (UI icons live in app registries). */
export interface QuestionTypeMeta {
  type: QuestionType;
  label: string;
  group: QuestionGroup;
  grading: QuestionGrading;
  /** One-line authoring hint. */
  hint: string;
}

export const QUESTION_TYPE_META: Record<QuestionType, QuestionTypeMeta> = {
  mcq_single: {
    type: 'mcq_single',
    label: 'Multiple choice (single)',
    group: 'objective',
    grading: 'auto',
    hint: 'One correct option',
  },
  mcq_multi: {
    type: 'mcq_multi',
    label: 'Multiple choice (multi)',
    group: 'objective',
    grading: 'auto',
    hint: 'Select all that apply',
  },
  true_false: {
    type: 'true_false',
    label: 'True / false',
    group: 'objective',
    grading: 'auto',
    hint: 'Binary choice',
  },
  numeric: {
    type: 'numeric',
    label: 'Numeric',
    group: 'objective',
    grading: 'auto',
    hint: 'Number with optional tolerance',
  },
  fill_blank: {
    type: 'fill_blank',
    label: 'Fill in the blank',
    group: 'objective',
    grading: 'auto',
    hint: 'Exact or multi-blank text',
  },
  matching: {
    type: 'matching',
    label: 'Matching',
    group: 'objective',
    grading: 'auto',
    hint: 'Match left items to right',
  },
  short_answer: {
    type: 'short_answer',
    label: 'Short answer',
    group: 'written',
    grading: 'manual',
    hint: 'Brief free text',
  },
  long_answer: {
    type: 'long_answer',
    label: 'Long answer',
    group: 'written',
    grading: 'manual',
    hint: 'Extended written response',
  },
  file_upload: {
    type: 'file_upload',
    label: 'File upload',
    group: 'media',
    grading: 'manual',
    hint: 'Student uploads a file',
  },
  code: {
    type: 'code',
    label: 'Code',
    group: 'code',
    grading: 'hybrid',
    hint: 'Source code with syntax highlighting',
  },
};

export const QUESTION_TYPE_OPTIONS = QUESTION_TYPES.map((type) => ({
  value: type,
  label: QUESTION_TYPE_META[type].label,
  group: QUESTION_TYPE_META[type].group,
}));

export function questionTypesByGroup(group: QuestionGroup): QuestionTypeMeta[] {
  return QUESTION_TYPES.map((t) => QUESTION_TYPE_META[t]).filter((m) => m.group === group);
}

/** Normalize lab-style aliases onto portal question types. */
export function normalizePortalQuestionType(raw: string): QuestionType | null {
  const key = raw.trim().toLowerCase().replace(/-/g, '_');
  const aliases: Record<string, QuestionType> = {
    numerical: 'numeric',
    match_following: 'matching',
    match: 'matching',
    mcq: 'mcq_single',
    file: 'file_upload',
    coding: 'code',
  };
  if ((QUESTION_TYPES as readonly string[]).includes(key)) return key as QuestionType;
  return aliases[key] ?? null;
}
