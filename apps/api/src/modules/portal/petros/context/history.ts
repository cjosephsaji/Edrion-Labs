import { Injectable, Logger } from '@nestjs/common';
import type { PetrosConversation, PetrosMessage } from '@edrion/database';
import { PetrosRepository } from '../petros.repository';
import { PetrosOpenAiService } from '../openai-client.service';

/**
 * Conversation history windowing + rolling summarization.
 *
 * `petros_conversations.summary` has existed since the table was created, and `buildInstructions`
 * has always read it — but NOTHING EVER WROTE IT. The model input was a flat `slice(-20)`, which is
 * the worst of both worlds: 20 full turns resent on every request (expensive) AND turn 21 silently
 * forgetting turn 1 (wrong). Populating it is therefore both a cost lever and a correctness fix.
 *
 * The window is anchored on a watermark (`summary_through`) rather than a fixed tail, so no message
 * can ever fall between the two: everything before the watermark is in `summary`, everything from
 * the watermark on is sent verbatim. The watermark only advances when the summarizer succeeds.
 */

/** Messages kept verbatim after a compaction. */
const HISTORY_WINDOW = 12;
/** Verbatim messages tolerated before compacting back down to the window. */
const SUMMARY_TRIGGER = 16;
/** Chars of dropped conversation fed to the summarizer in one go. */
const SEED_LIMIT = 12_000;

const SUMMARIZER_INSTRUCTIONS = `You maintain the running memory of a conversation between a school staff member and their work assistant.

Rewrite the previous summary and the new messages into ONE updated summary of everything the assistant must still remember. Keep:
- facts and figures established (counts, names, dates, amounts)
- identifiers (UUIDs) of records that were looked up or acted on
- decisions made, actions confirmed or rejected, documents produced
- anything the user asked for that is still outstanding

Drop pleasantries and superseded detail. Write terse notes, not prose. Never invent anything.`;

export interface HistoryWindow {
  /** The Responses API `input` array: the verbatim tail of the conversation. */
  input: unknown[];
  /** Prefix summary to place in the instructions, or null when nothing has been compacted yet. */
  summary: string | null;
}

@Injectable()
export class PetrosHistoryService {
  private readonly logger = new Logger(PetrosHistoryService.name);

  constructor(
    private readonly repo: PetrosRepository,
    private readonly openai: PetrosOpenAiService,
  ) {}

  /** The model input for a fresh turn: everything from the summary watermark onwards. */
  async buildInput(conversation: PetrosConversation): Promise<HistoryWindow> {
    const messages = await this.repo.messagesForConversation(conversation.id);
    const through = Math.min(conversation.summaryThrough ?? 0, messages.length);
    const input: unknown[] = [];
    for (const m of messages.slice(through)) {
      const text = textOf(m);
      if (!text) continue;
      input.push({ role: m.role === 'user' ? 'user' : 'assistant', content: text });
    }
    return { input, summary: conversation.summary ?? null };
  }

  /**
   * Compact the conversation if it has outgrown its window. Called AFTER the turn's final event is
   * emitted, so the nano round-trip never sits in front of the user's answer.
   *
   * Failure is not fatal: the watermark simply does not advance, the window stays long for one more
   * turn, and the next turn retries. Losing a summary must never lose a message.
   */
  async maybeSummarize(conversation: PetrosConversation): Promise<void> {
    try {
      const messages = await this.repo.messagesForConversation(conversation.id);
      const through = Math.min(conversation.summaryThrough ?? 0, messages.length);
      if (messages.length - through <= SUMMARY_TRIGGER) return;

      const newThrough = messages.length - HISTORY_WINDOW;
      const dropped = messages.slice(through, newThrough);
      if (!dropped.length) return;

      const seed = [
        conversation.summary ? `PREVIOUS SUMMARY:\n${conversation.summary}` : null,
        `NEW MESSAGES:\n${dropped.map((m) => `${m.role}: ${textOf(m)}`).filter(Boolean).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, SEED_LIMIT);

      const { text } = await this.openai.text('small', {
        instructions: SUMMARIZER_INSTRUCTIONS,
        input: seed,
        maxOutputTokens: 600,
      });
      if (!text.trim()) return;

      await this.repo.updateConversation(conversation.id, {
        summary: text.trim(),
        summaryThrough: newThrough,
      });
      this.logger.debug(
        `compacted conversation ${conversation.id}: ${dropped.length} messages → summary (watermark ${through}→${newThrough})`,
      );
    } catch (e) {
      this.logger.warn(`history compaction failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** The text blocks of a message, flattened. Tool activity and artifact refs are UI, not context. */
function textOf(message: PetrosMessage): string {
  return ((message.content ?? []) as { type: string; text?: string }[])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n');
}
