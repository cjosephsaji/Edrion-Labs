import type { ZodSchema } from 'zod';

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
  | 'mock_gen'
  | 'mock_eval'
  | 'debate'
  | 'ocr';

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
  schema: ZodSchema<T>;
  schemaName: string;
  maxOutputTokens: number;
  reasoningEffort?: LearnAiReasoningEffort;
  verbosity?: LearnAiVerbosity;
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
