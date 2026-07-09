/** Client-side question types for exam/assignment authoring (mirrors @edrion/schemas). */
export type QuestionType =
  | 'mcq_single'
  | 'mcq_multi'
  | 'true_false'
  | 'short_answer'
  | 'long_answer'
  | 'fill_blank'
  | 'numeric';

export interface QuestionOption {
  key: string;
  label: string;
  imageObjectId?: string;
}

export interface QuestionRow {
  id: string;
  sequence: number;
  qtype: QuestionType;
  prompt: string;
  promptImageObjectId: string | null;
  options: QuestionOption[] | null;
  correctKey: string | null;
  markingNote: string | null;
  marks: number;
  version: number;
}

export interface QuestionDraft {
  qtype: QuestionType;
  prompt: string;
  promptImageObjectId?: string | null;
  options?: QuestionOption[];
  correctKey?: string | null;
  markingNote?: string | null;
  marks: number;
  sequence: number;
}

export const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'mcq_single', label: 'Multiple choice (single)' },
  { value: 'mcq_multi', label: 'Multiple choice (multi)' },
  { value: 'true_false', label: 'True / false' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'long_answer', label: 'Long answer' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'numeric', label: 'Numeric' },
];

export const OPTION_QTYPES = new Set<QuestionType>(['mcq_single', 'mcq_multi', 'true_false']);

export function defaultOptionsForType(qtype: QuestionType): QuestionOption[] {
  if (qtype === 'true_false') {
    return [
      { key: 'true', label: 'True' },
      { key: 'false', label: 'False' },
    ];
  }
  if (OPTION_QTYPES.has(qtype)) {
    return [
      { key: 'A', label: '' },
      { key: 'B', label: '' },
    ];
  }
  return [];
}

export function nextOptionKey(options: QuestionOption[]): string {
  const used = new Set(options.map((o) => o.key));
  for (let i = 0; i < 26; i++) {
    const k = String.fromCharCode(65 + i);
    if (!used.has(k)) return k;
  }
  return `O${options.length + 1}`;
}
