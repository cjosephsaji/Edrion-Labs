import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, displayName } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService } from './debate-round.service';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';

@Injectable()
export class DebateSparService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
    private readonly features: FeatureControlsService,
  ) {}

  async createInvite(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    if (debate.mode !== 'spar_1v1') {
      throw new BadRequestException({ code: 'NOT_SPAR', message: 'Round is not 1v1 spar mode.' });
    }
    const flag = await this.features.resolveByKey('lab.debate.spar_1v1', {
      institutionId: principal.kind === 'institutional' ? principal.institutionId : undefined,
      campusId: principal.kind === 'institutional' ? principal.campusId ?? undefined : undefined,
      institutionUserId: principal.kind === 'institutional' ? principal.institutionUserId : undefined,
    });
    if (!flag.value) throw new ForbiddenException({ code: 'SPAR_OFF', message: '1v1 spar disabled.' });

    const token = randomBytes(24).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    await this.db
      .update(schema.debates)
      .set({ inviteTokenHash: hash, updatedAt: new Date() })
      .where(eq(schema.debates.id, debateId));
    return { inviteToken: token, debateId };
  }

  async joinByToken(principal: StudentPrincipal, token: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.inviteTokenHash, hash))
      .limit(1);
    if (!debate) throw new NotFoundException({ code: 'INVALID_INVITE', message: 'Invite not found.' });
    if (debate.mode !== 'spar_1v1') {
      throw new BadRequestException({ code: 'NOT_SPAR', message: 'Invalid invite.' });
    }

    const owner = ownerColumns(principal);
    const existing = await this.db
      .select()
      .from(schema.debateParticipants)
      .where(eq(schema.debateParticipants.debateId, debate.id));
    const already = existing.find(
      (p) =>
        (owner.studentId && p.studentId === owner.studentId) ||
        (owner.independentUserId && p.independentUserId === owner.independentUserId),
    );
    if (already) return { debateId: debate.id, participantId: already.id };

    const humanSeats = existing.filter((p) => p.participantKind === 'human');
    if (humanSeats.length >= 2) {
      throw new BadRequestException({ code: 'FULL', message: 'This spar already has two debaters.' });
    }

    const takenSeats = new Set(existing.map((p) => p.seatKey));
    const seatKey = takenSeats.has('prop_1') ? 'opp_1' : 'prop_1';
    const [participant] = await this.db
      .insert(schema.debateParticipants)
      .values({
        debateId: debate.id,
        role: 'human',
        ...owner,
        displayName: displayName(principal),
        side: seatKey.startsWith('prop') ? 'for' : 'against',
        seatKey,
        participantKind: 'human',
        joinedAt: new Date(),
      })
      .returning();

    if (humanSeats.length + 1 >= 2) {
      await this.db
        .update(schema.debates)
        .set({ status: 'consent_required', updatedAt: new Date() })
        .where(eq(schema.debates.id, debate.id));
    }

    return { debateId: debate.id, participantId: participant!.id };
  }
}
