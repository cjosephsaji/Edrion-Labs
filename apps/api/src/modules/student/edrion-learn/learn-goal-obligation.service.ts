import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { obligationSchema, type Obligation } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class LearnGoalObligationService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async loadStudyBlocks(principal: StudentPrincipal): Promise<Obligation[]> {
    const owner =
      principal.kind === 'institutional'
        ? eq(schema.learningPaths.studentId, principal.studentId)
        : eq(schema.learningPaths.independentUserId, principal.independentUserId);

    const [path] = await this.db
      .select()
      .from(schema.learningPaths)
      .where(and(owner, eq(schema.learningPaths.status, 'active')))
      .limit(1);

    if (!path) return [];

    const [item] = await this.db
      .select()
      .from(schema.learningPathItems)
      .where(and(eq(schema.learningPathItems.pathId, path.id), eq(schema.learningPathItems.status, 'upcoming')))
      .orderBy(asc(schema.learningPathItems.sequence))
      .limit(1);

    if (!item) return [];

    const localDate = new Date().toISOString().slice(0, 10);
    const row = obligationSchema.parse({
      id: `self:learn-goal:${path.id}:${item.id}:${localDate}`,
      origin: 'self',
      kind: 'study_block',
      title: path.title,
      subtitle: 'Continue your learning path',
      due_at: `${localDate}T20:00:00.000Z`,
      all_day: false,
      status: 'pending',
      action: { label: 'Study', deep_link: '/learn' },
      source_module: 'learn',
      updated_at: path.updatedAt.toISOString(),
    });
    return [row];
  }
}
