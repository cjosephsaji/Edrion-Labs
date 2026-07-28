import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';

@Injectable()
export class LearningEventsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(row: typeof schema.learningEvents.$inferInsert, tx?: Database): Promise<void> {
    const db = tx ?? this.db;
    await db.insert(schema.learningEvents).values(row);
  }
}
