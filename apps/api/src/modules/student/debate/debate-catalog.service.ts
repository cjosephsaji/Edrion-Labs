import { Injectable, Inject } from '@nestjs/common';
import { desc, eq, ilike, and } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { DebateRoundService } from './debate-round.service';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class DebateCatalogService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
  ) {}

  async listFormats(principal: StudentPrincipal, buildableOnly = true) {
    await this.rounds.assertDebateEnabled(principal);
    const rows = await this.db.select().from(schema.debateFormats);
    return rows.filter((r) => (buildableOnly ? r.isBuildable : true));
  }

  async listMotions(
    principal: StudentPrincipal,
    opts: { q?: string; difficulty?: number; formatKey?: string; limit?: number },
  ) {
    await this.rounds.assertDebateEnabled(principal);
    const limit = Math.min(opts.limit ?? 30, 50);
    const conds = [eq(schema.debateMotions.isRetired, false)];
    if (opts.q) conds.push(ilike(schema.debateMotions.text, `%${opts.q}%`));
    if (opts.difficulty) conds.push(eq(schema.debateMotions.difficulty, opts.difficulty));

    const rows = await this.db
      .select()
      .from(schema.debateMotions)
      .where(and(...conds))
      .limit(limit)
      .orderBy(desc(schema.debateMotions.createdAt));

    if (opts.formatKey) {
      return rows.filter(
        (m) => m.formatHints.length === 0 || m.formatHints.includes(opts.formatKey!),
      );
    }
    return rows;
  }
}
