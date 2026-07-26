import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService } from './debate-round.service';

@Injectable()
export class DebateLifecycleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
  ) {}

  async startPrep(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    if (debate.status !== 'prep' && debate.status !== 'consent_required') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Cannot start prep.' });
    }
    await this.db
      .update(schema.debates)
      .set({
        status: 'prep',
        stage: 'prep',
        startedAt: debate.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.debates.id, debateId));
    return { status: 'prep' as const };
  }

  async advanceToSpeaking(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    if (debate.status !== 'prep') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Prep must finish first.' });
    }
    await this.db
      .update(schema.debates)
      .set({
        status: 'speaking',
        stage: 'speaking',
        currentTurnIndex: 0,
        updatedAt: new Date(),
      })
      .where(eq(schema.debates.id, debateId));
    return { status: 'speaking' as const, currentTurnIndex: 0 };
  }
}
