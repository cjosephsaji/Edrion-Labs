import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { z } from 'zod';
import { createDebateSchema, debateFeedbackSchema, debateTurnSchema } from '@edrion/schemas';
import { DATABASE, LEARNING_EVENTS_WRITER, LEARN_AI_PROVIDER } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { displayName, ownerColumns, ownerWhere } from '../core/owner-scope';

const QUICK_CLASH_CAP = 12;

@Injectable()
export class LabDebateService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
    private readonly features: FeatureControlsService,
  ) {}

  motions() {
    return {
      samples: [
        { motion: 'Homework helps learning more than it hurts wellbeing.', tag: 'School life' },
        { motion: 'AI tutors belong in every classroom.', tag: 'Technology' },
        { motion: 'Exams measure thinking better than coursework.', tag: 'Assessment' },
      ],
    };
  }

  async create(principal: StudentPrincipal, body: unknown) {
    const parsed = createDebateSchema.parse(body);
    if (parsed.mode === 'friend') {
      const allowed = await this.friendModeEnabled(principal);
      if (!allowed) {
        throw new ForbiddenException({ code: 'FRIEND_MODE_OFF', message: 'Friend debate mode is not enabled.' });
      }
    }

    const side =
      parsed.side === 'surprise'
        ? Math.random() < 0.5
          ? 'for'
          : 'against'
        : parsed.side;
    const owner = ownerColumns(principal);
    const stage =
      parsed.mode === 'friend'
        ? 'lobby'
        : parsed.format === 'quick_clash'
          ? 'live'
          : 'opening';

    let inviteTokenHash: string | null = null;
    let inviteToken: string | undefined;
    if (parsed.mode === 'friend') {
      inviteToken = randomBytes(24).toString('base64url');
      inviteTokenHash = createHash('sha256').update(inviteToken).digest('hex');
    }

    const [debate] = await this.db
      .insert(schema.debates)
      .values({
        ...owner,
        motion: parsed.motion,
        side,
        format: parsed.format,
        mode: parsed.mode,
        inviteTokenHash,
        stage,
      })
      .returning();

    await this.db.insert(schema.debateParticipants).values({
      debateId: debate!.id,
      role: 'creator',
      studentId: owner.studentId,
      independentUserId: owner.independentUserId,
      displayName: displayName(principal),
      side,
      joinedAt: new Date(),
    });

    if (parsed.mode === 'solo') {
      await this.db.insert(schema.debateParticipants).values({
        debateId: debate!.id,
        role: 'petros',
        displayName: 'Petros',
        side: side === 'for' ? 'against' : 'for',
        joinedAt: new Date(),
      });
    }

    return this.toDto(debate!, inviteToken ? `https://edrion.app/lab/debate/join/${inviteToken}` : undefined);
  }

  async lobby(principal: StudentPrincipal, id: string) {
    const debate = await this.requireDebate(principal, id);
    const participants = await this.participants(debate.id);
    return { stage: debate.stage, participants, ready: participants.length >= 2 };
  }

  async join(principal: StudentPrincipal, token: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.inviteTokenHash, hash))
      .limit(1);
    if (!debate) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invite not found' });
    const owner = ownerColumns(principal);
    const creatorSide = debate.side;
    const friendSide = creatorSide === 'for' ? 'against' : 'for';
    await this.db.insert(schema.debateParticipants).values({
      debateId: debate.id,
      role: 'friend',
      studentId: owner.studentId,
      independentUserId: owner.independentUserId,
      displayName: displayName(principal),
      side: friendSide,
      joinedAt: new Date(),
    });
    await this.db
      .update(schema.debates)
      .set({ stage: debate.format === 'quick_clash' ? 'live' : 'opening', updatedAt: new Date() })
      .where(eq(schema.debates.id, debate.id));
    return { debateId: debate.id };
  }

  async get(principal: StudentPrincipal, id: string, after?: number) {
    const debate = await this.requireDebate(principal, id);
    const turns = await this.db
      .select()
      .from(schema.debateTurns)
      .where(
        after != null
          ? and(eq(schema.debateTurns.debateId, debate.id), gt(schema.debateTurns.sequence, after))
          : eq(schema.debateTurns.debateId, debate.id),
      )
      .orderBy(asc(schema.debateTurns.sequence));
    return this.toDto(debate, undefined, turns);
  }

  async submitTurn(principal: StudentPrincipal, id: string, body: unknown) {
    const parsed = debateTurnSchema.parse(body);
    const debate = await this.requireDebate(principal, id);
    if (debate.stage === 'feedback') {
      throw new ForbiddenException({ code: 'FINISHED', message: 'Debate is finished.' });
    }

    const turns = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.debateId, debate.id))
      .orderBy(desc(schema.debateTurns.sequence))
      .limit(1);
    const nextSeq = (turns[0]?.sequence ?? 0) + 1;
    const round = debate.format === 'quick_clash' ? 'live' : debate.stage;

    await this.db.insert(schema.debateTurns).values({
      debateId: debate.id,
      sequence: nextSeq,
      round,
      speakerRole: 'creator',
      text: parsed.text,
    });

    if (debate.mode === 'solo' && this.ai.available) {
      await this.budgets.spend(principal, 'debate', 1500);
      const turnOutSchema = z.object({ argument: z.string(), moderation: z.string().optional() });
      const { result, usage } = await this.ai.completeJson({
        purpose: 'debate',
        tier: 'large',
        system: 'Moderate fairly and argue the opposing side. No winner.',
        user: `Motion: ${debate.motion}\nStudent (${debate.side}): ${parsed.text}`,
        schema: turnOutSchema,
        schemaName: 'debate_turn',
        maxOutputTokens: 800,
      });
      await this.callLog.log(principal, 'debate', usage);
      await this.db.insert(schema.debateTurns).values({
        debateId: debate.id,
        sequence: nextSeq + 1,
        round,
        speakerRole: 'petros',
        text: result.argument,
      });
    }

    if (debate.format === 'quick_clash' && nextSeq >= QUICK_CLASH_CAP) {
      return this.finish(principal, id);
    }
    return this.get(principal, id);
  }

  async finish(principal: StudentPrincipal, id: string) {
    const debate = await this.requireDebate(principal, id);
    let feedback = {
      strongest: 'You stated your position clearly.',
      weakest: 'Try anchoring claims to concrete examples.',
      technique: 'Signpost your rebuttals so Petros can follow your thread.',
    };
    if (this.ai.available) {
      await this.budgets.spend(principal, 'debate', 2000);
      const turns = await this.db
        .select()
        .from(schema.debateTurns)
        .where(eq(schema.debateTurns.debateId, debate.id));
      const { result, usage } = await this.ai.completeJson({
        purpose: 'debate',
        tier: 'large',
        system: 'Give qualitative debate feedback. No winner or scores.',
        user: `Motion: ${debate.motion}\nTranscript:\n${turns.map((t) => `${t.speakerRole}: ${t.text}`).join('\n')}`,
        schema: debateFeedbackSchema,
        schemaName: 'debate_feedback',
        maxOutputTokens: 600,
      });
      await this.callLog.log(principal, 'debate', usage);
      feedback = result;
    }

    await this.db
      .update(schema.debates)
      .set({ stage: 'feedback', feedback, updatedAt: new Date() })
      .where(eq(schema.debates.id, debate.id));

    await this.ledger.log({
      eventType: 'debate.completed',
      payload: { debateId: debate.id, format: debate.format },
      principal,
    });
    return { feedback };
  }

  private async friendModeEnabled(principal: StudentPrincipal) {
    if (principal.kind === 'independent') return true;
    const res = await this.features.resolveByKey('student.lab.debate_friend', {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
    return res.value;
  }

  private async requireDebate(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.debates)
      .where(and(eq(schema.debates.id, id), ownerWhere(principal, schema.debates.studentId, schema.debates.independentUserId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Debate not found' });
    return row;
  }

  private participants(debateId: string) {
    return this.db.select().from(schema.debateParticipants).where(eq(schema.debateParticipants.debateId, debateId));
  }

  private async toDto(
    debate: typeof schema.debates.$inferSelect,
    inviteUrl?: string,
    turns?: (typeof schema.debateTurns.$inferSelect)[],
  ) {
    const participants = await this.participants(debate.id);
    const turnRows =
      turns ??
      (await this.db
        .select()
        .from(schema.debateTurns)
        .where(eq(schema.debateTurns.debateId, debate.id))
        .orderBy(asc(schema.debateTurns.sequence)));
    return {
      id: debate.id,
      motion: debate.motion,
      side: debate.side,
      format: debate.format,
      mode: debate.mode,
      stage: debate.stage,
      turnSeconds: debate.turnSeconds,
      inviteUrl,
      feedback: debate.feedback,
      participants: participants.map((p) => ({
        id: p.id,
        role: p.role,
        displayName: p.displayName,
        side: p.side,
      })),
      turns: turnRows.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        round: t.round,
        speakerRole: t.speakerRole,
        text: t.text,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }
}
