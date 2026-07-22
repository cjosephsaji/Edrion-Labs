import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';

@Injectable()
export class LearningEventsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(row: typeof schema.learningEvents.$inferInsert): Promise<void> {
    await this.db.insert(schema.learningEvents).values(row);
  }

  async insertInTransaction(
    tx: Database,
    row: typeof schema.learningEvents.$inferInsert,
  ): Promise<void> {
    await tx.insert(schema.learningEvents).values(row);
  }
}
