import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { StudentStorageService } from '../storage/student-storage.service';

@Injectable()
export class DebateRetentionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: StudentStorageService,
  ) {}

  async sweepExpiredAudio() {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(schema.debates)
      .where(and(isNotNull(schema.debates.audioExpiredAt), lt(schema.debates.audioExpiredAt, now)))
      .limit(200);

    let purged = 0;
    for (const debate of rows) {
      const turns = await this.db
        .select()
        .from(schema.debateTurns)
        .where(eq(schema.debateTurns.debateId, debate.id));
      for (const turn of turns) {
        if (!turn.audioObjectId) continue;
        const [obj] = await this.db
          .select()
          .from(schema.storageObjects)
          .where(eq(schema.storageObjects.id, turn.audioObjectId))
          .limit(1);
        if (obj?.storageKey) {
          try {
            await this.storage.removeFile(obj.storageKey);
            purged++;
          } catch {
            /* continue */
          }
        }
        await this.db
          .update(schema.debateTurns)
          .set({ audioObjectId: null, captureState: 'expired' })
          .where(eq(schema.debateTurns.id, turn.id));
      }
    }
    return { purged, scanned: rows.length };
  }

  scheduleAudioExpiry(debateId: string, audioDays: number) {
    const audioExpiredAt = new Date(Date.now() + audioDays * 86_400_000);
    return this.db
      .update(schema.debates)
      .set({ audioExpiredAt, updatedAt: new Date() })
      .where(eq(schema.debates.id, debateId));
  }
}
