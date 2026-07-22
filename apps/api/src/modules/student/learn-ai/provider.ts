import type { ZodType, ZodTypeDef } from 'zod';

export type LearnAiTier = 'nano' | 'small' | 'large' | 'vision';

export type LearnAiReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export type LearnAiVerbosity = 'low' | 'medium' | 'high';

export type LearnAiPurpose =
  | 'route'
  | 'intent'
  | 'session_plan'
  | 'block_gen'
  | 'evaluate'
  | 'vision'
  | 'quick'
  | 'ask'
  | 'evidence_tag'
  | 'library_gen'
  | 'visual'
  | 'visual_propose'
  | 'visual_generate'
  | 'visual_expand'
  | 'visual_alternative'
  | 'visual_memory'
  | 'visual_quiz'
  | 'mock_gen'
  | 'mock_eval'
  | 'debate'
  | 'ocr'
  | 'learn_plan'
  | 'learn_render'
  | 'learn_grade'
  | 'learn_profile'
  | 'learn_judge';

export interface LearnAiEmbeddingUsage {
  inputTokens: number;
  model: string;
  durationMs: number;
}

export interface LearnAiEmbeddingResult {
  vectors: number[][];
  usage: LearnAiEmbeddingUsage;
}

export interface LearnAiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  durationMs: number;
}

export interface LearnAiCompleteOpts<T> {
  purpose: LearnAiPurpose;
  tier: LearnAiTier;
  system: string;
  user: string;
  images?: { objectId: string; base64: string; mimeType: string }[];
  /** PDF / other files as base64 input_file blocks (OpenAI Responses API). */
  files?: { filename: string; base64: string; mimeType?: string }[];
  // ZodType<Output, Def, Input> with Input left open: ZodSchema<T> pins input === output,
  // which rejects any schema that normalizes its input (e.g. the visual graph schema,
  // which rewrites AI-emitted empty labels and depths) and silently infers T from the
  // raw input shape instead of the parsed result.
  schema: ZodType<T, ZodTypeDef, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  reasoningEffort?: LearnAiReasoningEffort;
  verbosity?: LearnAiVerbosity;
  /** When true, suppress raw model output in error logs (privacy-sensitive flows). */
  privacySensitive?: boolean;
}

export interface LearnAiStreamOpts<T> extends LearnAiCompleteOpts<T> {
  arrayKey?: string;
}

export interface LearnAiStreamTextOpts {
  purpose: LearnAiPurpose;
  tier: LearnAiTier;
  system: string;
  user: string;
  maxOutputTokens: number;
  reasoningEffort?: LearnAiReasoningEffort;
  verbosity?: LearnAiVerbosity;
}

export type LearnAiTextStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: LearnAiUsage };

export interface LearnAiProvider {
  readonly available: boolean;
  completeJson<T>(opts: LearnAiCompleteOpts<T>): Promise<{ result: T; usage: LearnAiUsage }>;
  streamJsonArray<T>(opts: LearnAiStreamOpts<T>): AsyncIterable<T>;
  streamText(opts: LearnAiStreamTextOpts): AsyncIterable<LearnAiTextStreamEvent>;
  embedTexts(texts: string[]): Promise<LearnAiEmbeddingResult>;
}

export class AiUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE' as const;
  constructor(message = 'Petros is unavailable right now.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiBudgetExceededError extends Error {
  readonly code = 'AI_BUDGET_EXCEEDED' as const;
  constructor(message = 'Petros needs a breather — try again in a bit.') {
    super(message);
    this.name = 'AiBudgetExceededError';
  }
}
