import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { ExamPrepTodayService } from './exam-prep-today.service';

@Injectable()
export class ExamPrepExamDayService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly todaySync: ExamPrepTodayService,
  ) {}

  async examDayCard(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    const [enrollment] = await this.db
      .select()
      .from(schema.prepEnrollments)
      .where(
        owner.studentId
          ? eq(schema.prepEnrollments.studentId, owner.studentId)
          : eq(schema.prepEnrollments.independentUserId, owner.independentUserId!),
      )
      .orderBy(desc(schema.prepEnrollments.enrolledAt))
      .limit(1);
    if (!enrollment) throw new BadRequestException({ code: 'NOT_ENROLLED', message: 'Enroll in prep first.' });
    const today = new Date().toISOString().slice(0, 10);
    const [card] = await this.db
      .select()
      .from(schema.prepExamDayCards)
      .where(eq(schema.prepExamDayCards.enrollmentId, enrollment.id))
      .orderBy(desc(schema.prepExamDayCards.examDate))
      .limit(1);
    if (!card) {
      const [created] = await this.db
        .insert(schema.prepExamDayCards)
        .values({
          enrollmentId: enrollment.id,
          examDate: today,
          checklist: [
            { id: 'id', label: 'Photo ID ready', done: false },
            { id: 'materials', label: 'Approved materials packed', done: false },
            { id: 'route', label: 'Travel plan confirmed', done: false },
          ],
        })
        .returning();
      return created;
    }
    return card;
  }

  async updateExamDayChecklist(
    principal: StudentPrincipal,
    body: { checklist: Array<{ id: string; label: string; done: boolean }> },
  ) {
    const owner = ownerColumns(principal);
    const [enrollment] = await this.db
      .select()
      .from(schema.prepEnrollments)
      .where(
        owner.studentId
          ? eq(schema.prepEnrollments.studentId, owner.studentId)
          : eq(schema.prepEnrollments.independentUserId, owner.independentUserId!),
      )
      .orderBy(desc(schema.prepEnrollments.enrolledAt))
      .limit(1);
    if (!enrollment) throw new BadRequestException({ code: 'NOT_ENROLLED', message: 'Enroll first.' });
    const today = new Date().toISOString().slice(0, 10);
    const [card] = await this.db
      .select()
      .from(schema.prepExamDayCards)
      .where(eq(schema.prepExamDayCards.enrollmentId, enrollment.id))
      .orderBy(desc(schema.prepExamDayCards.examDate))
      .limit(1);
    if (!card) throw new BadRequestException({ code: 'NO_CARD', message: 'No exam-day card.' });
    const [updated] = await this.db
      .update(schema.prepExamDayCards)
      .set({ checklist: body.checklist })
      .where(eq(schema.prepExamDayCards.id, card.id))
      .returning();
    return updated;
  }
}

@Injectable()
export class ExamPrepMockSeasonService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly todaySync: ExamPrepTodayService,
  ) {}

  async scheduleMockSeason(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    const [enrollment] = await this.db
      .select()
      .from(schema.prepEnrollments)
      .where(
        owner.studentId
          ? eq(schema.prepEnrollments.studentId, owner.studentId)
          : eq(schema.prepEnrollments.independentUserId, owner.independentUserId!),
      )
      .limit(1);
    if (!enrollment) throw new BadRequestException({ code: 'NOT_ENROLLED', message: 'Enroll first.' });
    const weekStart = new Date().toISOString().slice(0, 10);
    const [plan] = await this.db
      .insert(schema.prepPlans)
      .values({ enrollmentId: enrollment.id, weekStart, ...owner, generatorVersion: 'mock-season-1' })
      .returning();
    const blocks = [];
    for (let i = 0; i < 4; i += 1) {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i * 7);
      const blockDate = d.toISOString().slice(0, 10);
      const [block] = await this.db
        .insert(schema.prepPlanBlocks)
        .values({
          planId: plan!.id,
          blockDate,
          kind: 'mock_exam',
          title: `Mock ${i + 1}`,
          payload: { adaptive: true, delivery_profile_key: 'sat_mock' },
          sortOrder: i,
        })
        .returning();
      blocks.push(block!);
    }
    await this.todaySync.syncTodayBlocks(
      principal,
      blocks.slice(0, 3).map((b) => ({ id: b.id, title: b.title, blockDate: b.blockDate })),
    );
    return { plan, blocks };
  }
}
