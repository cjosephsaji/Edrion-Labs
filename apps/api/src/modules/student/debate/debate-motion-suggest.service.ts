import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Database } from '@edrion/database';
import { DATABASE, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { DebateRoundService } from './debate-round.service';
import type { StudentPrincipal } from '../student.types';
import { ownerColumns } from '../core/owner-scope';
import { DEBATE_PREP_ASSIST_SYSTEM } from './debate-judge.prompts';

const suggestBodySchema = z.object({
  themes: z.array(z.string()).min(1).max(5),
  difficulty: z.number().int().min(1).max(5),
  formatKey: z.string(),
});

const motionListSchema = z.object({
  motions: z.array(
    z.object({
      text: z.string().min(10).max(500),
      info_slide: z.string().max(800).optional(),
    }),
  ),
});

@Injectable()
export class DebateMotionSuggestService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly rounds: DebateRoundService,
  ) {}

  async suggest(principal: StudentPrincipal, body: unknown) {
    await this.rounds.assertDebateEnabled(principal);
    const parsed = suggestBodySchema.parse(body);
    const seed = `${parsed.formatKey}:${parsed.difficulty}:${parsed.themes.join(',')}`;
    const expires = new Date(Date.now() + 3600_000);
    const [cached] = await this.db
      .select()
      .from(schema.debateMotionSuggestions)
      .where(
        and(
          eq(schema.debateMotionSuggestions.formatKey, parsed.formatKey),
          eq(schema.debateMotionSuggestions.difficulty, parsed.difficulty),
          eq(schema.debateMotionSuggestions.seed, seed),
          gt(schema.debateMotionSuggestions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (cached) return { motions: cached.motions, cached: true };

    let motions: { text: string; info_slide?: string }[] = [];
    if (this.ai.available) {
      const { result } = await this.ai.completeJson({
        purpose: 'debate',
        tier: 'small',
        system: 'Suggest exactly three debate motions suitable for school debaters. Indian English.',
        user: JSON.stringify(parsed),
        schema: motionListSchema,
        schemaName: 'debate_motion_suggest',
        maxOutputTokens: 1200,
      });
      motions = result.motions;
    } else {
      const bank = await this.db
        .select()
        .from(schema.debateMotions)
        .where(eq(schema.debateMotions.isRetired, false))
        .limit(3);
      motions = bank.map((m) => ({ text: m.text }));
    }

    await this.db.insert(schema.debateMotionSuggestions).values({
      themes: parsed.themes,
      difficulty: parsed.difficulty,
      formatKey: parsed.formatKey,
      seed,
      motions,
      expiresAt: expires,
    });
    return { motions, cached: false };
  }

  async prepAssist(principal: StudentPrincipal, debateId: string, body: unknown) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    const prompt = z.object({ prompt: z.string().min(3).max(500) }).parse(body);
    let ideas: string[] = ['Clarify the mechanism', 'Add a comparative weighing line'];
    if (this.ai.available) {
      const { result } = await this.ai.completeJson({
        purpose: 'debate',
        tier: 'nano',
        system: DEBATE_PREP_ASSIST_SYSTEM,
        user: `Motion: ${debate.motionText ?? debate.motion}\nStudent ask: ${prompt.prompt}`,
        schema: z.object({ ideas: z.array(z.string().max(200)).max(6) }),
        schemaName: 'debate_prep_assist',
        maxOutputTokens: 600,
        privacySensitive: true,
      });
      ideas = result.ideas;
    }
    const owner = ownerColumns(principal);
    const [notes] = await this.db
      .select()
      .from(schema.debatePrepNotes)
      .where(
        and(
          eq(schema.debatePrepNotes.debateId, debateId),
          owner.studentId
            ? eq(schema.debatePrepNotes.studentId, owner.studentId)
            : eq(schema.debatePrepNotes.independentUserId, owner.independentUserId!),
        ),
      )
      .limit(1);
    if (notes) {
      const events = [...((notes.aiAssistEvents as unknown[]) ?? []), { at: new Date().toISOString(), prompt: prompt.prompt, ideas }];
      await this.db
        .update(schema.debatePrepNotes)
        .set({ aiAssistUsed: true, aiAssistEvents: events, updatedAt: new Date() })
        .where(eq(schema.debatePrepNotes.id, notes.id));
    }
    return { ideas, aiAssistUsed: true };
  }
}
