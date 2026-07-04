import { z } from 'zod';
import { paginationQuerySchema } from './common';

/**
 * Petros (AI assistant) contracts — conversations, typed message blocks, streaming turn
 * requests, and topicality decline categories. Shared by the API and the portal client.
 */

// ── Message blocks ─────────────────────────────────────────────────────────────

export const petrosBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool_activity'),
    toolName: z.string(),
    status: z.enum(['running', 'done', 'failed', 'blocked']),
    summary: z.string(),
  }),
  z.object({ type: z.literal('artifact_ref'), artifactId: z.string().uuid() }),
  z.object({
    type: z.literal('question'),
    question: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string() })).min(1).max(6),
    answeredOptionId: z.string().nullish(),
  }),
  z.object({ type: z.literal('confirmation_ref'), runId: z.string().uuid() }),
  z.object({ type: z.literal('attachment_ref'), attachmentId: z.string().uuid() }),
]);
export type PetrosBlock = z.infer<typeof petrosBlockSchema>;

export type PetrosMessageStatus =
  | 'streaming'
  | 'complete'
  | 'error'
  | 'awaiting_input'
  | 'awaiting_confirmation';

// ── Requests ───────────────────────────────────────────────────────────────────

export const petrosCreateConversationSchema = z.object({
  /** Optional first user message; when present the client immediately opens a turn stream. */
  title: z.string().trim().max(200).optional(),
});
export type PetrosCreateConversationInput = z.infer<typeof petrosCreateConversationSchema>;

export const petrosListConversationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'archived']).default('active'),
  search: z.string().trim().max(160).optional(),
});
export type PetrosListConversationsQuery = z.infer<typeof petrosListConversationsQuerySchema>;

export const petrosTurnSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
});
export type PetrosTurnInput = z.infer<typeof petrosTurnSchema>;

export const petrosAnswerSchema = z.object({
  optionId: z.string().trim().min(1).max(80),
});
export type PetrosAnswerInput = z.infer<typeof petrosAnswerSchema>;

export const petrosUpdateConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  status: z.enum(['active', 'archived']).optional(),
  version: z.number().int().nonnegative(),
});
export type PetrosUpdateConversationInput = z.infer<typeof petrosUpdateConversationSchema>;

// ── Streaming events (SSE frames over a fetch-streamed POST) ───────────────────

export type PetrosStreamEvent =
  | { type: 'message_start'; messageId: string; conversationId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_started'; toolName: string; humanStatus: string }
  | { type: 'tool_finished'; toolName: string; ok: boolean; summary?: string }
  | {
      type: 'question';
      pendingTurnId: string;
      question: string;
      options: { id: string; label: string }[];
    }
  | {
      type: 'confirmation_required';
      runId: string;
      pendingTurnId: string;
      card: Record<string, unknown>;
    }
  | { type: 'artifact'; artifactId: string; kind: string; title: string }
  | {
      type: 'message_complete';
      messageId: string;
      usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
      title?: string | null;
    }
  | { type: 'error'; code: string; message: string };

// ── Topicality (Phase 6) ───────────────────────────────────────────────────────

export const PETROS_DECLINE_CATEGORIES = [
  'personal_shopping',
  'entertainment_media',
  'social_personal',
  'unrelated_professional',
  'politics_controversy',
  'harmful_or_unsafe',
  'academic_dishonesty',
  'other_offtopic',
] as const;
export type PetrosDeclineCategory = (typeof PETROS_DECLINE_CATEGORIES)[number];

/** Structured output of the nano topicality pre-screen. */
export const petrosTopicalityResultSchema = z.object({
  on_topic: z.boolean(),
  category: z.enum(PETROS_DECLINE_CATEGORIES).nullable(),
  confidence: z.number().min(0).max(1),
});
export type PetrosTopicalityResult = z.infer<typeof petrosTopicalityResultSchema>;

// ── Capabilities (role-aware empty-state suggestions) ──────────────────────────

export interface PetrosCapabilities {
  canUploadFiles: boolean;
  canGenerateDocuments: boolean;
  canGenerateAssessments: boolean;
  suggestions: string[];
  toolNames: string[];
}
