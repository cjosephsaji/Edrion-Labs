import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

const PREP_TODAY_CAP = 3;

@Injectable()
export class ExamPrepTodayService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async syncTodayBlocks(
    principal: StudentPrincipal,
    blocks: { id: string; title: string; blockDate: string }[],
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const due = blocks.filter((b) => b.blockDate <= today).slice(0, PREP_TODAY_CAP);
    const owner = ownerColumns(principal);

    for (const block of due) {
      const idempotencyKey = `exam_prep:${block.id}`;
      const [existing] = await this.db
        .select()
        .from(schema.userObligations)
        .where(
          and(
            eq(schema.userObligations.idempotencyKey, idempotencyKey),
            owner.studentId
              ? eq(schema.userObligations.studentId, owner.studentId)
              : eq(schema.userObligations.independentUserId, owner.independentUserId!),
          ),
        )
        .limit(1);
      if (existing) continue;

      await this.db.insert(schema.userObligations).values({
        ...owner,
        source: 'exam_prep',
        kind: 'study_block',
        title: block.title,
        dueAt: new Date(`${block.blockDate}T18:00:00.000Z`),
        allDay: false,
        status: 'pending',
        deepLink: '/lab/mock-exams',
        idempotencyKey,
      });

      await this.db
        .update(schema.prepPlanBlocks)
        .set({ obligationSynced: true })
        .where(eq(schema.prepPlanBlocks.id, block.id));
    }
  }
}
