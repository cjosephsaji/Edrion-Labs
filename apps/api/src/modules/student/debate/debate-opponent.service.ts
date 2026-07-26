import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Database } from '@edrion/database';
import { DATABASE, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { DebateTranscriptService } from './debate-transcript.service';
import { DebateOrchestrationService } from './debate-orchestration.service';

const opponentScriptSchema = z.object({
  plan: z.object({
    targets: z.array(z.string()).max(6),
    mechanism: z.string().max(400),
  }),
  script: z.string().min(80).max(6000),
});

@Injectable()
export class DebateOpponentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly transcripts: DebateTranscriptService,
    private readonly orchestration: DebateOrchestrationService,
  ) {}

  async generateForTurn(debateId: string, turnId: string) {
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.id, debateId))
      .limit(1);
    if (!debate) throw new Error('Debate missing');

    const [turn] = await this.db
      .select()
      .from(schema.debateTurns)
      .where(and(eq(schema.debateTurns.id, turnId), eq(schema.debateTurns.debateId, debateId)))
      .limit(1);
    if (!turn) throw new Error('Turn missing');

    const prior = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.debateId, debateId))
      .orderBy(asc(schema.debateTurns.turnIndex));

    const contextParts: string[] = [];
    for (const t of prior) {
      if (t.turnIndex >= turn.turnIndex) break;
      const [tr] = await this.db
        .select()
        .from(schema.debateTranscripts)
        .where(eq(schema.debateTranscripts.turnId, t.id))
        .limit(1);
      contextParts.push(`Turn ${t.turnIndex}: ${tr?.text ?? t.text ?? ''}`);
    }

    const motion = debate.motionText ?? debate.motion;
    const persona = debate.aiOpponentDifficulty ?? 'novice';
    let plan: Record<string, unknown> = { targets: [], mechanism: 'Respond on the motion.' };
    let script =
      `On the motion that ${motion}, the opposition must show the status quo is preferable. ` +
      `We contest the central claim from the previous speech and offer a comparative weighing against their mechanism.`;

    if (this.ai.available) {
      const { result } = await this.ai.completeJson({
        purpose: 'debate',
        tier: 'small',
        system:
          'You are a debate opponent. Write spoken-word prose only — no stage directions. Indian English, clear rhetoric.',
        user: `Motion: ${motion}\nDifficulty: ${persona}\nRole: ${turn.seatKey} (${turn.speechKind})\nPrior speeches:\n${contextParts.join('\n')}`,
        schema: opponentScriptSchema,
        schemaName: 'debate_opponent_script',
        maxOutputTokens: 1800,
        privacySensitive: true,
      });
      plan = result.plan as Record<string, unknown>;
      script = result.script;
    }

    const digest = createHash('sha256').update(script).digest('hex');
    await this.db.insert(schema.debateAiOpponentScripts).values({
      debateId,
      turnId,
      personaKey: debate.aiOpponentDifficulty ?? 'steady',
      difficulty: debate.aiOpponentDifficulty ?? 'novice',
      inputDigest: digest,
      script,
      plan,
    });

    const words = script.split(/\s+/).filter(Boolean).map((w, i) => ({
      w,
      s_ms: i * 320,
      e_ms: (i + 1) * 320,
      c: 0.95,
    }));

    await this.transcripts.createCanonical({
      debate,
      turn,
      provider: 'ai_opponent',
      providerModel: 'debate-opponent-v1',
      language: 'en-IN',
      text: script,
      words,
      durationMs: words.length ? words[words.length - 1]!.e_ms : 0,
      meanConfidence: 1,
      metrics: this.transcripts.computeMetrics(words, {}),
    });

    await this.db
      .update(schema.debateTurns)
      .set({
        text: script,
        captureState: 'ai_synthetic',
        sttState: 'done',
        actualDurationMs: words.length ? words[words.length - 1]!.e_ms : 0,
        endedAt: new Date(),
      })
      .where(eq(schema.debateTurns.id, turnId));

    await this.orchestration.onOpponentCompleted(debateId, turnId);
    return { turnId, scriptLength: script.length };
  }
}
