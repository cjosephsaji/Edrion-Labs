import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  isNull,
  lte,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import {
  defaultFsrsScheduler,
  localStudyDate,
  type Grade,
  type SchedulerCard,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns, ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { ExamBoostResolver } from './exam-boost.resolver';
import { ExamBoostService } from './exam-boost.service';
import { StreakService } from './streak.service';

const SESSION_BATCH = 20;
const BREAK_EVERY = 20;
const AGAIN_LOOP_CAP = 3;
const GRADE_TO_RESULT: Record<Grade, string> = {
  again: 'again',
  hard: 'hard',
  good: 'good',
  easy: 'easy',
};

@Injectable()
export class LibraryReviewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly boosts: ExamBoostResolver,
    private readonly examCap: ExamBoostService,
    private readonly streaks: StreakService,
  ) {}

  async queueSummary(principal: StudentPrincipal) {
    const dueCount = await this.countDue(principal);
    const prefs = await this.ensurePrefs(principal);
    const newAvailable = await this.newCardBudgetRemaining(principal, prefs);
    const streak = await this.streaks.getSummary(principal, prefs.timezone);
    const examBoosts = await this.boosts.listActiveBoosts(principal);
    return {
      due_count: dueCount,
      new_available: newAvailable,
      est_minutes: Math.ceil((dueCount * 18) / 60),
      exam_boosts: examBoosts.map((b) => ({
        deck_id: b.deckId,
        deck_name: b.deckName,
        exam_label: b.examLabel,
        exam_date: b.examDate.toISOString().slice(0, 10),
        days_out: b.daysOut,
      })),
      streak,
    };
  }

  async createSession(
    principal: StudentPrincipal,
    body: { source: string; deck_id?: string },
  ) {
    const queue = await this.buildQueue(principal, body.deck_id);
    const owner = ownerColumns(principal);
    const [session] = await this.db
      .insert(schema.reviewSessions)
      .values({
        ...owner,
        source: body.source,
        deckId: body.deck_id ?? null,
      })
      .returning();
    const now = new Date();
    const batch = queue.slice(0, SESSION_BATCH);
    const cards = await Promise.all(
      batch.map(async (card) => ({
        card: await this.cardPayload(card),
        preview: defaultFsrsScheduler.preview(this.toSchedulerCard(card), now),
      })),
    );
    return {
      session_id: session!.id,
      cards,
      remaining: queue.length,
    };
  }

  async grade(
    principal: StudentPrincipal,
    sessionId: string,
    body: { client_review_id: string; card_id: string; grade: Grade; elapsed_ms: number },
  ) {
    const owner = ownerColumns(principal);
    const existing = await this.db
      .select()
      .from(schema.flashcardReviews)
      .where(
        and(
          eq(schema.flashcardReviews.clientReviewId, body.client_review_id),
          owner.studentId
            ? eq(schema.flashcardReviews.studentId, owner.studentId)
            : eq(schema.flashcardReviews.independentUserId, owner.independentUserId!),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return this.replayGradeResponse(principal, sessionId, existing[0], body.card_id);
    }

    const [cardRow] = await this.db
      .select({
        card: schema.flashcards,
        deck: schema.flashcardDecks,
      })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(
        and(
          eq(schema.flashcards.id, body.card_id),
          ownerWhere(principal, schema.flashcardDecks.studentId, schema.flashcardDecks.independentUserId),
        ),
      )
      .limit(1);
    if (!cardRow) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Card not found' });

    const againCount = await this.sessionAgainCount(sessionId, body.card_id);
    if (body.grade === 'again' && againCount >= AGAIN_LOOP_CAP) {
      await this.db
        .update(schema.flashcards)
        .set({ suspendedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.flashcards.id, body.card_id));
      const remaining = await this.countDue(principal);
      return {
        next_card: await this.nextCard(principal, body.card_id),
        state_after: 'suspended',
        due_after: null,
        remaining,
        break_due: false,
        queue_cleared: remaining === 0,
        streak_credited: false,
        again_loop_capped: true,
      };
    }

    const reviewedAt = new Date();
    const schedulerCard = this.toSchedulerCard(cardRow.card);
    const applied = defaultFsrsScheduler.applyGrade(schedulerCard, body.grade, reviewedAt);
    const dueAfter = await this.examCap.applyCap(principal, cardRow.deck.id, applied, reviewedAt);
    const elapsed = Math.min(120_000, Math.max(0, body.elapsed_ms));

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.flashcardReviews).values({
        cardId: body.card_id,
        studentId: owner.studentId,
        independentUserId: owner.independentUserId,
        result: GRADE_TO_RESULT[body.grade],
        grade: body.grade,
        stateBefore: cardRow.card.srsState,
        stateAfter: applied.srsState,
        dueBefore: cardRow.card.fsrsDueAt,
        dueAfter,
        elapsedMs: elapsed,
        sessionId,
        clientReviewId: body.client_review_id,
        reviewedAt,
      });
      await tx
        .update(schema.flashcards)
        .set({
          srsState: applied.srsState,
          stability: applied.stability,
          difficulty: applied.difficulty,
          fsrsDueAt: dueAfter,
          lastReviewAt: reviewedAt,
          reps: applied.reps,
          lapses: applied.lapses,
          scheduler: 'fsrs',
          updatedAt: reviewedAt,
        })
        .where(eq(schema.flashcards.id, body.card_id));
      await tx
        .update(schema.reviewSessions)
        .set({ cardsReviewed: sql`${schema.reviewSessions.cardsReviewed} + 1` })
        .where(eq(schema.reviewSessions.id, sessionId));
    });

    const remaining = await this.countDue(principal);
    const prefs = await this.ensurePrefs(principal);
    const queueCleared = remaining === 0;
    let streakCredited = false;
    if (queueCleared) {
      streakCredited = await this.streaks.creditIfEligible(principal, prefs.timezone);
    }

    const [session] = await this.db
      .select({ cardsReviewed: schema.reviewSessions.cardsReviewed })
      .from(schema.reviewSessions)
      .where(eq(schema.reviewSessions.id, sessionId))
      .limit(1);
    const cardsReviewed = Number(session?.cardsReviewed ?? 0);
    const breakDue = cardsReviewed > 0 && cardsReviewed % BREAK_EVERY === 0 && remaining > 0;

    const next = await this.nextCard(principal, body.card_id);
    return {
      next_card: next,
      state_after: applied.srsState,
      due_after: dueAfter.toISOString(),
      remaining,
      break_due: breakDue,
      queue_cleared: queueCleared,
      streak_credited: streakCredited,
    };
  }

  async endSession(principal: StudentPrincipal, sessionId: string) {
    const owner = ownerWhere(
      principal,
      schema.reviewSessions.studentId,
      schema.reviewSessions.independentUserId,
    );
    const [session] = await this.db
      .select()
      .from(schema.reviewSessions)
      .where(and(eq(schema.reviewSessions.id, sessionId), owner))
      .limit(1);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND' });
    const endedAt = session.endedAt ?? new Date();
    if (!session.endedAt) {
      await this.db
        .update(schema.reviewSessions)
        .set({ endedAt })
        .where(eq(schema.reviewSessions.id, sessionId));
    }
    const minutes = Math.max(1, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60_000));
    const streak = await this.streaks.getSummary(principal, 'Asia/Kolkata');
    return {
      cards_reviewed: session.cardsReviewed,
      minutes,
      streak,
    };
  }

  async getPrefs(principal: StudentPrincipal) {
    return this.ensurePrefs(principal);
  }

  async patchPrefs(
    principal: StudentPrincipal,
    body: {
      daily_reminder_time?: string | null;
      new_cards_per_day?: number;
      timezone?: string;
      version?: number;
    },
  ) {
    const current = await this.ensurePrefs(principal);
    if (body.version != null && body.version !== current.version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT' });
    }
    const owner = ownerColumns(principal);
    const [updated] = await this.db
      .update(schema.userReviewPrefs)
      .set({
        dailyReminderTime: body.daily_reminder_time ?? current.daily_reminder_time,
        newCardsPerDay: body.new_cards_per_day ?? current.new_cards_per_day,
        timezone: body.timezone ?? current.timezone,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(
        owner.studentId
          ? eq(schema.userReviewPrefs.studentId, owner.studentId)
          : eq(schema.userReviewPrefs.independentUserId, owner.independentUserId!),
      )
      .returning();
    return this.prefsDto(updated!);
  }

  private async replayGradeResponse(
    principal: StudentPrincipal,
    _sessionId: string,
    review: typeof schema.flashcardReviews.$inferSelect,
    cardId: string,
  ) {
    const remaining = await this.countDue(principal);
    return {
      next_card: await this.nextCard(principal, cardId),
      state_after: review.stateAfter,
      due_after: review.dueAfter?.toISOString(),
      remaining,
      break_due: false,
      queue_cleared: remaining === 0,
      streak_credited: false,
    };
  }

  private async buildQueue(principal: StudentPrincipal, deckId?: string) {
    const now = new Date();
    const ownerDeck =
      principal.kind === 'institutional'
        ? eq(schema.flashcardDecks.studentId, principal.studentId)
        : eq(schema.flashcardDecks.independentUserId, principal.independentUserId);
    const dueRows = await this.db
      .select({ card: schema.flashcards, deckId: schema.flashcardDecks.id })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(
        and(
          ownerDeck,
          isNull(schema.flashcardDecks.archivedAt),
          isNull(schema.flashcards.suspendedAt),
          lte(schema.flashcards.fsrsDueAt, now),
          deckId ? eq(schema.flashcardDecks.id, deckId) : undefined,
        ),
      )
      .orderBy(asc(schema.flashcards.fsrsDueAt));

    const prefs = await this.ensurePrefs(principal);
    const budget = await this.newCardBudgetRemaining(principal, prefs);
    const newRows =
      budget > 0
        ? await this.db
            .select({ card: schema.flashcards })
            .from(schema.flashcards)
            .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
            .where(
              and(
                ownerDeck,
                isNull(schema.flashcardDecks.archivedAt),
                isNull(schema.flashcards.suspendedAt),
                eq(schema.flashcards.srsState, 'new'),
                deckId ? eq(schema.flashcardDecks.id, deckId) : undefined,
              ),
            )
            .orderBy(
              asc(schema.flashcards.createdAt),
              asc(schema.flashcards.deckId),
              asc(schema.flashcards.sequence),
            )
            .limit(budget)
        : [];

    const learning = dueRows.filter((r) => ['learning', 'relearning'].includes(r.card.srsState ?? ''));
    const review = dueRows.filter((r) => r.card.srsState === 'review' || !r.card.srsState);
    const interleaved = this.interleaveDecks(review.map((r) => r.card));
    const withNew = this.interleaveNew(interleaved, newRows.map((r) => r.card));
    return [...learning.map((r) => r.card), ...withNew];
  }

  private interleaveDecks(cards: (typeof schema.flashcards.$inferSelect)[]) {
    const byDeck = new Map<string, typeof cards>();
    for (const card of cards) {
      const list = byDeck.get(card.deckId) ?? [];
      list.push(card);
      byDeck.set(card.deckId, list);
    }
    const out: typeof cards = [];
    const decks = [...byDeck.keys()];
    let i = 0;
    while (out.length < cards.length) {
      const deck = decks[i % decks.length]!;
      const list = byDeck.get(deck)!;
      if (list.length) {
        const lastTwo = out.slice(-2).every((c) => c.deckId === deck);
        if (!lastTwo || list.length === 1) out.push(list.shift()!);
      }
      i += 1;
      if (i > cards.length * decks.length) break;
    }
    return out.length ? out : cards;
  }

  private interleaveNew(review: (typeof schema.flashcards.$inferSelect)[], fresh: typeof review) {
    if (!fresh.length) return review;
    const out: typeof review = [];
    let ri = 0;
    let ni = 0;
    while (ri < review.length || ni < fresh.length) {
      for (let k = 0; k < 8 && ri < review.length; k += 1) out.push(review[ri++]!);
      if (ni < fresh.length) out.push(fresh[ni++]!);
    }
    return out;
  }

  private async countDue(principal: StudentPrincipal) {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.flashcardDecks.studentId, principal.studentId)
        : eq(schema.flashcardDecks.independentUserId, principal.independentUserId);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(
        and(
          owner,
          lte(schema.flashcards.fsrsDueAt, new Date()),
          isNull(schema.flashcards.suspendedAt),
          isNull(schema.flashcardDecks.archivedAt),
        ),
      );
    return Number(row?.count ?? 0);
  }

  private async newCardBudgetRemaining(
    principal: StudentPrincipal,
    prefs: { new_cards_per_day: number; timezone: string },
  ) {
    const studyDate = localStudyDate(new Date(), prefs.timezone);
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.flashcardReviews.studentId, principal.studentId)
        : eq(schema.flashcardReviews.independentUserId, principal.independentUserId);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcardReviews)
      .where(
        and(
          owner,
          eq(schema.flashcardReviews.stateBefore, 'new'),
          sql`(${schema.flashcardReviews.reviewedAt} at time zone ${prefs.timezone})::date = ${studyDate}::date`,
        ),
      );
    const used = Number(row?.count ?? 0);
    return Math.max(0, prefs.new_cards_per_day - used);
  }

  private async sessionAgainCount(sessionId: string, cardId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcardReviews)
      .where(
        and(
          eq(schema.flashcardReviews.sessionId, sessionId),
          eq(schema.flashcardReviews.cardId, cardId),
          eq(schema.flashcardReviews.grade, 'again'),
        ),
      );
    return Number(row?.count ?? 0);
  }

  private async nextCard(principal: StudentPrincipal, afterCardId: string) {
    const queue = await this.buildQueue(principal);
    const idx = queue.findIndex((c) => c.id === afterCardId);
    const next = queue[idx + 1];
    if (!next) return null;
    const now = new Date();
    return {
      card: await this.cardPayload(next),
      preview: defaultFsrsScheduler.preview(this.toSchedulerCard(next), now),
    };
  }

  private async cardPayload(card: typeof schema.flashcards.$inferSelect) {
    const [deck] = await this.db
      .select({ title: schema.flashcardDecks.title })
      .from(schema.flashcardDecks)
      .where(eq(schema.flashcardDecks.id, card.deckId))
      .limit(1);
    return {
      id: card.id,
      deck_id: card.deckId,
      deck_name: deck?.title ?? 'Deck',
      prompt: card.prompt,
      answer: card.answer,
      source_page: card.sourcePage,
    };
  }

  private toSchedulerCard(card: typeof schema.flashcards.$inferSelect): SchedulerCard {
    return {
      srsState: (card.srsState as SchedulerCard['srsState']) ?? 'new',
      stability: card.stability ?? 0,
      difficulty: card.difficulty ?? 0,
      fsrsDueAt: card.fsrsDueAt ?? card.nextDueAt,
      lastReviewAt: card.lastReviewAt,
      reps: card.reps,
      lapses: card.lapses,
    };
  }

  private async ensurePrefs(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    const where = owner.studentId
      ? eq(schema.userReviewPrefs.studentId, owner.studentId)
      : eq(schema.userReviewPrefs.independentUserId, owner.independentUserId!);
    const [row] = await this.db.select().from(schema.userReviewPrefs).where(where).limit(1);
    if (row) return this.prefsDto(row);
    const [created] = await this.db
      .insert(schema.userReviewPrefs)
      .values({ ...owner })
      .returning();
    return this.prefsDto(created!);
  }

  private prefsDto(row: typeof schema.userReviewPrefs.$inferSelect) {
    return {
      daily_reminder_time: row.dailyReminderTime,
      new_cards_per_day: row.newCardsPerDay,
      timezone: row.timezone,
      version: row.version,
    };
  }
}
