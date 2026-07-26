import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import type { SttWord } from './stt/stt-provider';
import { DATABASE } from '../../../common/tokens';

@Injectable()
export class DebateTranscriptService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createCanonical(input: {
    debate: typeof schema.debates.$inferSelect;
    turn: typeof schema.debateTurns.$inferSelect;
    provider: string;
    providerModel: string;
    language: string;
    text: string;
    words: SttWord[];
    durationMs: number;
    meanConfidence: number;
    metrics: Record<string, unknown>;
  }) {
    const [row] = await this.db
      .insert(schema.debateTranscripts)
      .values({
        debateId: input.debate.id,
        turnId: input.turn.id,
        institutionId: input.debate.institutionId,
        studentId: input.debate.studentId,
        independentUserId: input.debate.independentUserId,
        provider: input.provider,
        providerModel: input.providerModel,
        language: input.language,
        text: input.text.replace(/\s+/g, ' ').trim(),
        words: input.words,
        durationMs: input.durationMs,
        meanConfidence: String(input.meanConfidence),
        metrics: input.metrics,
        displayText: input.text,
        displayVersion: 1,
      })
      .returning();
    return row!;
  }

  computeMetrics(words: SttWord[], fillers: Record<string, number>) {
    if (words.length === 0) {
      return { wpm: 0, filler_count: 0, fillers, longest_pause_ms: 0, pause_count: 0 };
    }
    const durationMs = Math.max(1, words[words.length - 1]!.e_ms - words[0]!.s_ms);
    const wpm = Math.round((words.length / durationMs) * 60_000);
    let longestPause = 0;
    let pauseCount = 0;
    for (let i = 1; i < words.length; i++) {
      const gap = words[i]!.s_ms - words[i - 1]!.e_ms;
      if (gap > 700) {
        pauseCount++;
        longestPause = Math.max(longestPause, gap);
      }
    }
    const fillerCount = Object.values(fillers).reduce((a, b) => a + b, 0);
    return {
      wpm,
      filler_count: fillerCount,
      fillers,
      longest_pause_ms: longestPause,
      pause_count: pauseCount,
    };
  }
}
