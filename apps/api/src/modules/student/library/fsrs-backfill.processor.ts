import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, schema, sql, type Database } from '@edrion/database';
import { mapSm2ToFsrs } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { FSRS_BACKFILL_BATCH_SIZE, LIBRARY_FSRS_BACKFILL_JOB } from './library.constants';

@Injectable()
export class FsrsBackfillProcessor implements OnModuleInit {
  private readonly logger = new Logger(FsrsBackfillProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
  ) {}

  onModuleInit() {
    this.workers.register(LIBRARY_FSRS_BACKFILL_JOB, () =>
      this.tracker.run(LIBRARY_FSRS_BACKFILL_JOB, 'ai', async () => {
        const processed = await this.runBatch();
        if (processed === FSRS_BACKFILL_BATCH_SIZE) {
          await this.jobs.enqueue('ai', LIBRARY_FSRS_BACKFILL_JOB, {}, { jobId: `library-fsrs:${Date.now()}` });
        }
        return { itemsProcessed: processed };
      }),
    );
  }

  async enqueueFullBackfill() {
    const [remaining] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcards)
      .where(eq(schema.flashcards.scheduler, 'sm2'));
    const count = Number(remaining?.count ?? 0);
    if (!count) return { queued: false, remaining: 0 };
    await this.jobs.enqueue('ai', LIBRARY_FSRS_BACKFILL_JOB, {}, { jobId: `library-fsrs:seed:${Date.now()}` });
    return { queued: true, remaining: count };
  }

  async runBatch(): Promise<number> {
    const cards = await this.db
      .select({
        id: schema.flashcards.id,
        reps: schema.flashcards.reps,
        intervalDays: schema.flashcards.intervalDays,
        ease: schema.flashcards.ease,
        nextDueAt: schema.flashcards.nextDueAt,
        updatedAt: schema.flashcards.updatedAt,
      })
      .from(schema.flashcards)
      .where(eq(schema.flashcards.scheduler, 'sm2'))
      .limit(FSRS_BACKFILL_BATCH_SIZE);

    if (!cards.length) return 0;

    const cardIds = cards.map((c) => c.id);
    const reviewRows = await this.db
      .select({
        cardId: schema.flashcardReviews.cardId,
        reviewedAt: schema.flashcardReviews.reviewedAt,
      })
      .from(schema.flashcardReviews)
      .where(inArray(schema.flashcardReviews.cardId, cardIds))
      .orderBy(desc(schema.flashcardReviews.reviewedAt));

    const lastReviewByCard = new Map<string, Date>();
    for (const row of reviewRows) {
      if (!lastReviewByCard.has(row.cardId)) {
        lastReviewByCard.set(row.cardId, row.reviewedAt);
      }
    }

    for (const card of cards) {
      const mapped = mapSm2ToFsrs({
        reps: card.reps,
        intervalDays: Number(card.intervalDays),
        ease: Number(card.ease),
        nextDueAt: card.nextDueAt,
        lastReviewAt: lastReviewByCard.get(card.id) ?? null,
        updatedAt: card.updatedAt,
      });

      await this.db
        .update(schema.flashcards)
        .set({
          srsState: mapped.srsState,
          stability: mapped.stability,
          difficulty: mapped.difficulty,
          fsrsDueAt: mapped.fsrsDueAt,
          lastReviewAt: mapped.lastReviewAt,
          scheduler: 'fsrs',
          updatedAt: new Date(),
        })
        .where(and(eq(schema.flashcards.id, card.id), eq(schema.flashcards.scheduler, 'sm2')));
    }

    this.logger.log(`Backfilled ${cards.length} flashcards to FSRS`);
    return cards.length;
  }
}
