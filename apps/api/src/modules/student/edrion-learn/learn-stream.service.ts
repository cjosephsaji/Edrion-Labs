import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { EdrionLearnRepository } from './edrion-learn.repository';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class LearnStreamService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repo: EdrionLearnRepository,
  ) {}

  async listEvents(principal: StudentPrincipal, sessionId: string, afterSeq = 0) {
    const session = await this.repo.getOrchestratorSession(principal, sessionId);
    if (!session) return null;

    const rows = await this.db
      .select()
      .from(schema.learnSessionEvents)
      .where(
        and(eq(schema.learnSessionEvents.sessionId, sessionId), gt(schema.learnSessionEvents.seq, afterSeq)),
      )
      .orderBy(asc(schema.learnSessionEvents.seq));

    return rows.map((r) => ({
      seq: Number(r.seq),
      event_type: r.eventType,
      payload: r.payload,
      created_at: r.createdAt.toISOString(),
    }));
  }
}
