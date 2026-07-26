import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { z } from 'zod';
import { DATABASE } from '../../../common/tokens';
import { ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService } from './debate-round.service';
import { StudentStorageService } from '../storage/student-storage.service';

const shareSchema = z.object({ scope: z.enum(['link', 'private']).default('link') });

@Injectable()
export class DebateShareService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
    private readonly storage: StudentStorageService,
  ) {}

  async createShare(principal: StudentPrincipal, debateId: string, body: unknown) {
    const parsed = shareSchema.parse(body ?? {});
    const debate = await this.rounds.requireDebate(principal, debateId);
    const [run] = await this.db
      .select()
      .from(schema.debateAdjudicationRuns)
      .where(
        and(eq(schema.debateAdjudicationRuns.debateId, debateId), eq(schema.debateAdjudicationRuns.isPrimary, true)),
      )
      .limit(1);
    if (!run) throw new NotFoundException({ code: 'NO_REPORT', message: 'Report not ready.' });

    const token = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.db
      .update(schema.debateFeedbackReports)
      .set({
        shareToken: tokenHash,
        shareScope: parsed.scope,
      })
      .where(eq(schema.debateFeedbackReports.runId, run.id));

    return { token, scope: parsed.scope, debateId: debate.id };
  }

  async revokeShare(principal: StudentPrincipal, debateId: string) {
    await this.rounds.requireDebate(principal, debateId);
    const [run] = await this.db
      .select()
      .from(schema.debateAdjudicationRuns)
      .where(
        and(eq(schema.debateAdjudicationRuns.debateId, debateId), eq(schema.debateAdjudicationRuns.isPrimary, true)),
      )
      .limit(1);
    if (!run) return { ok: true };
    await this.db
      .update(schema.debateFeedbackReports)
      .set({ shareToken: null, shareScope: 'private' })
      .where(eq(schema.debateFeedbackReports.runId, run.id));
    return { ok: true };
  }

  async deleteRound(principal: StudentPrincipal, debateId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    const turns = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.debateId, debateId));
    for (const turn of turns) {
      if (turn.audioObjectId) {
        const [obj] = await this.db
          .select()
          .from(schema.storageObjects)
          .where(eq(schema.storageObjects.id, turn.audioObjectId))
          .limit(1);
        if (obj?.storageKey) {
          try {
            await this.storage.removeFile(obj.storageKey);
          } catch {
            /* best-effort */
          }
        }
      }
    }
    await this.db.delete(schema.debates).where(
      and(
        eq(schema.debates.id, debateId),
        ownerWhere(principal, schema.debates.studentId, schema.debates.independentUserId),
      ),
    );
    void debate;
    return { deleted: true };
  }
}
