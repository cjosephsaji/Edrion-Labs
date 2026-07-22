import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { mapSm2ToFsrs } from '@edrion/schemas';
import * as schema from './schema/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
dotenv.config({ path: join(root, '..', '..', '.env') });

const BATCH = 500;

async function run() {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL / DATABASE_URL not set');

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  let total = 0;
  for (;;) {
    const cards = await db
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
      .limit(BATCH);

    if (!cards.length) break;

    const cardIds = cards.map((c) => c.id);
    const reviewRows = await db
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

      await db
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

    total += cards.length;
    // eslint-disable-next-line no-console
    console.log(`→ Backfilled ${total} cards…`);
    if (cards.length < BATCH) break;
  }

  const [remaining] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.flashcards)
    .where(eq(schema.flashcards.scheduler, 'sm2'));

  // eslint-disable-next-line no-console
  console.log(`Done. ${total} cards migrated; ${Number(remaining?.count ?? 0)} still on sm2.`);
  await client.end();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
