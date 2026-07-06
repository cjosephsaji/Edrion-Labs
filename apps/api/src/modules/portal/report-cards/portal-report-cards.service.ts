import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, sql, type Database } from '@edrion/database';
import type { CreateReportCardInput, ReportCardsListQuery, UpsertReportCardEntriesInput } from '@edrion/schemas';
import { gradePointFromPct, STUDENT_NEVER_SHARED, STUDENT_SHARED_WITH_INSTITUTION } from '@edrion/shared-types';
import { DATABASE, LEARNING_EVENTS_WRITER } from '../../../common/tokens';

import type { LearningEventsWriter } from '../../student/ledger/learning-events.writer';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalReportCardsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  list(ctx: PortalActionContext, q: ReportCardsListQuery) {
    const conds = [eq(schema.reportCards.institutionId, ctx.principal.institutionId)];
    if (q.studentId) conds.push(eq(schema.reportCards.studentId, q.studentId));
    if (q.status) conds.push(eq(schema.reportCards.status, q.status));
    return this.db.select().from(schema.reportCards).where(and(...conds));
  }

  async create(ctx: PortalActionContext, input: CreateReportCardInput) {
    if (input.classId) {
      const students = await this.db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(eq(schema.students.classId, input.classId));
      const rows = [];
      for (const s of students) {
        const [row] = await this.db
          .insert(schema.reportCards)
          .values({
            institutionId: ctx.principal.institutionId,
            studentId: s.id,
            termId: input.termId ?? null,
            termLabel: input.termLabel,
            kind: input.kind,
            academicYearId: input.academicYearId ?? null,
            status: 'draft',
          })
          .returning();
        rows.push(row);
      }
      return { created: rows.length, items: rows };
    }
    if (!input.studentId) throw new NotFoundException({ code: 'INVALID', message: 'studentId or classId required' });
    const [row] = await this.db
      .insert(schema.reportCards)
      .values({
        institutionId: ctx.principal.institutionId,
        studentId: input.studentId,
        termId: input.termId ?? null,
        termLabel: input.termLabel,
        kind: input.kind,
        academicYearId: input.academicYearId ?? null,
        status: 'draft',
      })
      .returning();
    return row;
  }

  async getEntries(_ctx: PortalActionContext, id: string) {
    const [card] = await this.db.select().from(schema.reportCards).where(eq(schema.reportCards.id, id)).limit(1);
    if (!card) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report card not found' });
    return this.db
      .select()
      .from(schema.reportCardEntries)
      .where(eq(schema.reportCardEntries.reportCardId, id))
      .orderBy(schema.reportCardEntries.sequence);
  }

  async upsertEntries(_ctx: PortalActionContext, id: string, input: UpsertReportCardEntriesInput) {
    const [card] = await this.db.select().from(schema.reportCards).where(eq(schema.reportCards.id, id)).limit(1);
    if (!card) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report card not found' });
    if (card.status === 'published') throw new ConflictException({ code: 'IMMUTABLE', message: 'Published report cards cannot be edited' });
    await this.db.delete(schema.reportCardEntries).where(eq(schema.reportCardEntries.reportCardId, id));
    for (const e of input.entries) {
      await this.db.insert(schema.reportCardEntries).values({ reportCardId: id, ...e });
    }
    return this.db.select().from(schema.reportCardEntries).where(eq(schema.reportCardEntries.reportCardId, id));
  }

  async submitReview(ctx: PortalActionContext, id: string) {
    await this.db
      .update(schema.reportCards)
      .set({ status: 'in_review', submittedForReviewBy: ctx.principal.institutionUserId })
      .where(eq(schema.reportCards.id, id));
    return { status: 'in_review' };
  }

  async publish(ctx: PortalActionContext, id: string) {
    const entries = await this.db.select().from(schema.reportCardEntries).where(eq(schema.reportCardEntries.reportCardId, id));
    if (!entries.length) throw new ConflictException({ code: 'NO_ENTRIES', message: 'Structured report cards need at least one entry' });
    let gpa: string | null = null;
    const withCredits = entries.filter((e) => e.credits);
    if (withCredits.length) {
      let num = 0;
      let den = 0;
      for (const e of withCredits) {
        const pct = (e.marks / e.maxMarks) * 100;
        const gp = gradePointFromPct(pct);
        num += gp * (e.credits ?? 0);
        den += e.credits ?? 0;
      }
      if (den > 0) gpa = (Math.round((num / den) * 100) / 100).toFixed(2);
    }
    await this.db
      .update(schema.reportCards)
      .set({ status: 'published', publishedAt: new Date(), publishedBy: ctx.principal.institutionUserId, gpa })
      .where(eq(schema.reportCards.id, id));
    await this.ledger.log({
      eventType: 'report_card.published',
      payload: { reportCardId: id },
      contextType: 'report_card',
      contextId: id,
      actorKind: 'staff',
      actorId: ctx.principal.institutionUserId,
    });
    return { published: true };
  }

  async supersede(_ctx: PortalActionContext, id: string) {
    const [orig] = await this.db.select().from(schema.reportCards).where(eq(schema.reportCards.id, id)).limit(1);
    if (!orig) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report card not found' });
    const [draft] = await this.db
      .insert(schema.reportCards)
      .values({
        institutionId: orig.institutionId,
        campusId: orig.campusId,
        studentId: orig.studentId,
        academicYearId: orig.academicYearId,
        termId: orig.termId,
        termLabel: orig.termLabel,
        kind: orig.kind,
        status: 'draft',
        supersedesReportCardId: id,
      })
      .returning();
    return draft;
  }
}

@Injectable()
export class PortalLearningSummaryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getSummary(studentId: string) {
    const [topics] = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(schema.learningEvents)
      .where(and(eq(schema.learningEvents.studentId, studentId), eq(schema.learningEvents.eventType, 'session.completed')));

    return {
      topicsCompleted: { value: Number(topics?.c ?? 0), from: 'Learning events · session.completed' },
      weeklyGoalProgress: { value: 0, from: 'Learning events · weekly goal' },
      evidenceTags: [] as string[],
      sharedWith: [...STUDENT_SHARED_WITH_INSTITUTION],
      neverShared: [...STUDENT_NEVER_SHARED],
    };
  }
}
