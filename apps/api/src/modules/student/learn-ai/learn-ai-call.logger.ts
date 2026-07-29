import { Inject, Injectable, Logger } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import type { LearnAiPurpose, LearnAiUsage } from './provider';

@Injectable()
export class LearnAiCallLogger {
  private readonly logger = new Logger(LearnAiCallLogger.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async log(
    principal: StudentPrincipal,
    purpose: LearnAiPurpose,
    usage: LearnAiUsage,
    opts?: {
      cached?: boolean;
      error?: string;
      sessionId?: string;
      blockId?: string;
      blockSeq?: number;
      promptVersion?: string;
      retry?: boolean;
      speculative?: boolean;
      degraded?: boolean;
      outcome?: string;
      firstTokenMs?: number;
    },
  ): Promise<void> {
    // Never throws. Most call sites `await` this from inside a catch block, so a failing
    // insert here would escape the handler that was meant to contain the original error.
    try {
      await this.insert(principal, purpose, usage, opts);
    } catch (e) {
      this.logger.warn(
        `failed to record learn_ai_calls row (purpose=${purpose}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async insert(
    principal: StudentPrincipal,
    purpose: LearnAiPurpose,
    usage: LearnAiUsage,
    opts?: {
      cached?: boolean;
      error?: string;
      sessionId?: string;
      blockId?: string;
      blockSeq?: number;
      promptVersion?: string;
      retry?: boolean;
      speculative?: boolean;
      degraded?: boolean;
      outcome?: string;
      firstTokenMs?: number;
    },
  ): Promise<void> {
    await this.db.insert(schema.learnAiCalls).values({
      studentId: principal.kind === 'institutional' ? principal.studentId : null,
      independentUserId: principal.kind === 'independent' ? principal.independentUserId : null,
      sessionId: opts?.sessionId ?? null,
      blockId: opts?.blockId ?? null,
      blockSeq: opts?.blockSeq ?? null,
      purpose,
      model: usage.model,
      promptVersion: opts?.promptVersion ?? null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cached: opts?.cached ? 1 : 0,
      durationMs: usage.durationMs,
      firstTokenMs: opts?.firstTokenMs ?? null,
      retry: opts?.retry ?? false,
      speculative: opts?.speculative ?? false,
      degraded: opts?.degraded ?? false,
      outcome: opts?.outcome ?? null,
      error: opts?.error ?? null,
    });
  }
}
