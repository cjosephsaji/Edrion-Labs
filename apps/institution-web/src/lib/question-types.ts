/** Client-side question types for exam/assignment authoring (mirrors @edrion/schemas). */
import {
  CODE_LANGUAGES,
  QUESTION_TYPE_META,
  QUESTION_TYPES,
  type CodeLanguage,
  type QuestionType as SchemaQuestionType,
} from '@edrion/schemas';

export type QuestionType = SchemaQuestionType;

export interface QuestionOption {
  key: string;
  label: string;
  imageObjectId?: string;
}

export interface QuestionConfig {
  matching?: {
    left: Array<{ key: string; label: string }>;
    right: Array<{ key: string; label: string }>;
    answerKey?: Record<string, string>;
  };
  numeric?: { tolerance?: number };
  fillBlank?: {
    blanks?: Array<{ key: string; answers: string[] }>;
  };
  fileUpload?: {
    acceptMime?: string[];
    maxBytes?: number;
    maxFiles?: number;
  };
  code?: {
    languages: CodeLanguage[];
    starterCode?: string;
    referenceSolution?: string;
    testCases?: Array<{ stdin: string; expectedStdout: string }>;
    allowRun?: boolean;
  };
  [key: string]: unknown;
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
  config?: QuestionConfig | null;
}

export interface QuestionDraft {
  /** Server id when editing an existing question. */
  id?: string;
  /** Stable client key for draft rows before save. */
  clientKey?: string;
  version?: number;
  qtype: QuestionType;
  prompt: string;
  promptImageObjectId?: string | null;
  options?: QuestionOption[];
  correctKey?: string | null;
  markingNote?: string | null;
  marks: number;
  sequence: number;
  config?: QuestionConfig | null;
}

export const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string; group: string }[] =
  QUESTION_TYPES.map((type) => ({
    value: type,
    label: QUESTION_TYPE_META[type].label,
    group: QUESTION_TYPE_META[type].group,
  }));

export const OPTION_QTYPES = new Set<QuestionType>(['mcq_single', 'mcq_multi', 'true_false']);

export const CODE_LANGUAGE_OPTIONS = CODE_LANGUAGES.map((value) => ({
  value,
  label: value === 'cpp' ? 'C++' : value === 'csharp' ? 'C#' : value.charAt(0).toUpperCase() + value.slice(1),
}));

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

export function defaultConfigForType(qtype: QuestionType): QuestionConfig | null {
  if (qtype === 'matching') {
    return {
      matching: {
        left: [
          { key: 'L1', label: '' },
          { key: 'L2', label: '' },
        ],
        right: [
          { key: 'R1', label: '' },
          { key: 'R2', label: '' },
        ],
        answerKey: {},
      },
    };
  }
  if (qtype === 'numeric') return { numeric: { tolerance: 0.01 } };
  if (qtype === 'file_upload') {
    return { fileUpload: { maxFiles: 1, maxBytes: 10 * 1024 * 1024 } };
  }
  if (qtype === 'code') {
    return {
      code: {
        languages: ['python'],
        starterCode: '# Write your solution\n',
        testCases: [],
        allowRun: false,
      },
    };
  }
  return null;
}

export function nextOptionKey(options: QuestionOption[]): string {
  const used = new Set(options.map((o) => o.key));
  for (let i = 0; i < 26; i++) {
    const k = String.fromCharCode(65 + i);
    if (!used.has(k)) return k;
  }
  return `O${options.length + 1}`;
}

export function newClientKey(): string {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyQuestionDraft(sequence: number, qtype: QuestionType = 'mcq_single'): QuestionDraft {
  return {
    clientKey: newClientKey(),
    qtype,
    prompt: '',
    options: defaultOptionsForType(qtype),
    config: defaultConfigForType(qtype),
    marks: 1,
    sequence,
  };
}

export function questionTypeLabel(qtype: QuestionType): string {
  return QUESTION_TYPE_META[qtype]?.label ?? qtype;
}

export function summarizeQuestion(draft: QuestionDraft): string {
  const prompt = draft.prompt.trim();
  if (prompt) return prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt;
  return questionTypeLabel(draft.qtype);
}
