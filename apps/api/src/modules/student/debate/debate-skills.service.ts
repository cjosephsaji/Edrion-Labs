import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { ownerWhere } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService } from './debate-round.service';

@Injectable()
export class DebateSkillsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
  ) {}

  async getSkills(principal: StudentPrincipal, formatKey?: string) {
    await this.rounds.assertDebateEnabled(principal);
    const conds = [
      ownerWhere(principal, schema.debateSkillSnapshots.studentId, schema.debateSkillSnapshots.independentUserId),
    ];
    if (formatKey) conds.push(eq(schema.debateSkillSnapshots.formatKey, formatKey));
    const rows = await this.db
      .select()
      .from(schema.debateSkillSnapshots)
      .where(and(...conds))
      .orderBy(desc(schema.debateSkillSnapshots.asOf))
      .limit(12);

    const runs = await this.db
      .select()
      .from(schema.debates)
      .where(
        and(
          ownerWhere(principal, schema.debates.studentId, schema.debates.independentUserId),
          eq(schema.debates.status, 'report_ready'),
        ),
      )
      .orderBy(desc(schema.debates.endedAt))
      .limit(20);

    return { snapshots: rows, recentRounds: runs.length, formatKey: formatKey ?? null };
  }

  async upsertSnapshotFromRun(debateId: string) {
    const [debate] = await this.db.select().from(schema.debates).where(eq(schema.debates.id, debateId)).limit(1);
    if (!debate?.formatKey) return;
    const [run] = await this.db
      .select()
      .from(schema.debateAdjudicationRuns)
      .where(and(eq(schema.debateAdjudicationRuns.debateId, debateId), eq(schema.debateAdjudicationRuns.isPrimary, true)))
      .limit(1);
    if (!run) return;

    const analyses = await this.db
      .select()
      .from(schema.debateSpeechAnalyses)
      .where(eq(schema.debateSpeechAnalyses.runId, run.id));
    const axisEwma: Record<string, number> = {};
    for (const a of analyses) {
      const scores = a.anatomyAxisScores as Record<string, number>;
      for (const [k, v] of Object.entries(scores)) {
        axisEwma[k] = axisEwma[k] ? axisEwma[k]! * 0.7 + Number(v) * 0.3 : Number(v);
      }
    }

    const asOf = new Date().toISOString().slice(0, 10);
    await this.db.insert(schema.debateSkillSnapshots).values({
      institutionId: debate.institutionId,
      studentId: debate.studentId,
      independentUserId: debate.independentUserId,
      formatKey: debate.formatKey,
      asOf,
      roundsCounted: 1,
      axisEwma,
      manner: {},
    });
  }
}
