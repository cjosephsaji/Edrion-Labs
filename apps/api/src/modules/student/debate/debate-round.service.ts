import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import {
  createDebateRoundSchema,
  formatSpecSchema,
  type CreateDebateRoundInput,
  type FormatSpec,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { displayName } from '../core/owner-scope';

export const DEBATE_CONSENT_POLICY_VERSION = '2026-07-25';

@Injectable()
export class DebateRoundService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
  ) {}

  async assertDebateEnabled(principal: StudentPrincipal): Promise<void> {
    const res = await this.features.resolveByKey('lab.debate.enabled', {
      institutionId: principal.kind === 'institutional' ? principal.institutionId : undefined,
      campusId: principal.kind === 'institutional' ? principal.campusId ?? undefined : undefined,
      institutionUserId: principal.kind === 'institutional' ? principal.institutionUserId : undefined,
    });
    if (!res.value) {
      throw new ForbiddenException({ code: 'DEBATE_OFF', message: 'Debate lab is not enabled.' });
    }
  }

  async createRound(principal: StudentPrincipal, body: unknown) {
    await this.assertDebateEnabled(principal);
    const parsed = createDebateRoundSchema.parse(body) as CreateDebateRoundInput;
    const formatVersion = parsed.formatVersion ?? 1;
    const [format] = await this.db
      .select()
      .from(schema.debateFormats)
      .where(
        and(
          eq(schema.debateFormats.key, parsed.formatKey),
          eq(schema.debateFormats.version, formatVersion),
        ),
      )
      .limit(1);
    if (!format?.isBuildable) {
      throw new BadRequestException({ code: 'FORMAT_UNAVAILABLE', message: 'Format is not buildable.' });
    }
    const spec = formatSpecSchema.parse(format.spec) as FormatSpec;
    const owner = ownerColumns(principal);
    const side =
      parsed.side ??
      (Math.random() < 0.5 ? ('proposition' as const) : ('opposition' as const));
    const retentionPolicy = {
      audio_days: principal.kind === 'institutional' ? 90 : 90,
      transcript_days: null,
      allow_human_review: false,
    };

    const [debate] = await this.db
      .insert(schema.debates)
      .values({
        ...owner,
        motion: parsed.motionText,
        motionText: parsed.motionText,
        motionId: parsed.motionId ?? null,
        side: side === 'proposition' ? 'for' : 'against',
        format: parsed.formatKey,
        formatKey: parsed.formatKey,
        formatVersion,
        mode: parsed.mode,
        stage: 'setup',
        status: 'consent_required',
        prepSeconds: parsed.prepSeconds ?? spec.prep.seconds,
        scaffoldsEnabled: parsed.scaffoldsEnabled ?? parsed.mode === 'practice_vs_ai',
        aiOpponentDifficulty: parsed.aiOpponentDifficulty ?? 'novice',
        consentPolicyVersion: DEBATE_CONSENT_POLICY_VERSION,
        retentionPolicy,
        currentTurnIndex: 0,
      })
      .returning();

    const humanSeat =
      side === 'proposition'
        ? spec.speech_order[0]?.role_key ?? 'prop_1'
        : spec.speech_order[1]?.role_key ?? 'opp_1';

    const [humanParticipant] = await this.db
      .insert(schema.debateParticipants)
      .values({
        debateId: debate!.id,
        role: 'human',
        studentId: owner.studentId,
        independentUserId: owner.independentUserId,
        displayName: displayName(principal),
        side: side === 'proposition' ? 'for' : 'against',
        seatKey: humanSeat,
        participantKind: 'human',
        joinedAt: new Date(),
      })
      .returning();

    if (parsed.mode === 'practice_vs_ai') {
      const aiSeat = humanSeat.startsWith('prop') ? 'opp_1' : 'prop_1';
      await this.db.insert(schema.debateParticipants).values({
        debateId: debate!.id,
        role: 'ai_opponent',
        displayName: parsed.aiPersonaKey ?? 'steady',
        side: side === 'proposition' ? 'against' : 'for',
        seatKey: aiSeat,
        participantKind: 'ai',
        aiPersonaKey: parsed.aiPersonaKey ?? 'steady',
        joinedAt: new Date(),
      });
    }

    await this.seedTurns(debate!.id, spec);

    return {
      id: debate!.id,
      status: debate!.status,
      formatKey: parsed.formatKey,
      mode: parsed.mode,
      humanParticipantId: humanParticipant!.id,
    };
  }

  async getRound(principal: StudentPrincipal, id: string) {
    await this.assertDebateEnabled(principal);
    const debate = await this.requireDebate(principal, id);
    const turns = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.debateId, debate.id))
      .orderBy(asc(schema.debateTurns.turnIndex), asc(schema.debateTurns.sequence));
    const participants = await this.db
      .select()
      .from(schema.debateParticipants)
      .where(eq(schema.debateParticipants.debateId, debate.id));
    return { debate, turns, participants };
  }

  async requireDebate(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.debates)
      .where(
        and(
          eq(schema.debates.id, id),
          ownerWhere(principal, schema.debates.studentId, schema.debates.independentUserId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Debate round not found' });
    return row;
  }

  async requireTurn(debateId: string, turnId: string) {
    const [turn] = await this.db
      .select()
      .from(schema.debateTurns)
      .where(and(eq(schema.debateTurns.id, turnId), eq(schema.debateTurns.debateId, debateId)))
      .limit(1);
    if (!turn) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Turn not found' });
    return turn;
  }

  private async seedTurns(debateId: string, spec: FormatSpec) {
    for (const slot of spec.speech_order) {
      const role = spec.roles.find((r) => r.key === slot.role_key);
      await this.db.insert(schema.debateTurns).values({
        debateId,
        sequence: slot.index,
        turnIndex: slot.index,
        round: slot.kind,
        speakerRole: role?.short_name ?? slot.role_key,
        seatKey: slot.role_key,
        speechKind: slot.kind,
        plannedDurationMs: slot.duration_ms,
        text: '',
        captureState: 'pending',
        sttState: 'not_started',
      });
    }
  }

  static consentScopesHash(scopes: Record<string, boolean>): string {
    return createHash('sha256').update(JSON.stringify(scopes)).digest('hex');
  }
}
