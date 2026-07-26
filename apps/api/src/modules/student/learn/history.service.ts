import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, lt, sql } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { LearnRepository } from '../learn/learn.repository';
import type { StudentPrincipal } from '../student.types';
import { ownerWhere } from '../core/owner-scope';

export type HistoryKind = 'session' | 'quick' | 'practice' | 'mock' | 'debate';

export interface HistoryEntry {
  day: string;
  kind: HistoryKind;
  title: string;
  meta: string;
  reopen: { route: string };
  cursor: string;
}

@Injectable()
export class HistoryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly learn: LearnRepository,
  ) {}

  async list(principal: StudentPrincipal, type?: string, q?: string, cursor?: string) {
    const entries: HistoryEntry[] = [];
    const limit = 40;

    if (!type || type === 'session' || type === 'all') {
      const sessions = await this.learn.listSessions(principal, ['completed', 'paused'], limit);
      for (const s of sessions) {
        entries.push({
          day: s.startedAt.toISOString().slice(0, 10),
          kind: 'session',
          title: 'Learn session',
          meta: s.status,
          reopen: { route: `/learn/session/${s.id}` },
          cursor: s.startedAt.toISOString(),
        });
      }
    }

    if (!type || type === 'quick' || type === 'all') {
      const quick = await this.learn.listQuickAnswers(principal, limit);
      for (const row of quick) {
        entries.push({
          day: row.createdAt.toISOString().slice(0, 10),
          kind: 'quick',
          title: row.question.slice(0, 80),
          meta: 'Quick answer',
          reopen: { route: `/learn/quick/${row.id}` },
          cursor: row.createdAt.toISOString(),
        });
      }
    }

    if (!type || type === 'mock' || type === 'all') {
      const attempts = await this.db
        .select({
          attempt: schema.mockExamAttempts,
          exam: schema.mockExams,
        })
        .from(schema.mockExamAttempts)
        .innerJoin(schema.mockExams, eq(schema.mockExamAttempts.mockExamId, schema.mockExams.id))
        .where(
          and(
            ownerWhere(principal, schema.mockExams.studentId, schema.mockExams.independentUserId),
            sql`${schema.mockExamAttempts.finishedAt} IS NOT NULL`,
            q ? ilike(schema.mockExams.title, `%${q}%`) : undefined,
            cursor ? lt(schema.mockExamAttempts.finishedAt, new Date(cursor)) : undefined,
          ),
        )
        .orderBy(desc(schema.mockExamAttempts.finishedAt))
        .limit(limit);

      for (const { attempt, exam } of attempts) {
        const results = attempt.results as { correct?: number; total?: number; byTopic?: { note?: string }[] } | null;
        const correct = results?.correct ?? 0;
        const total = results?.total ?? 0;
        const note = results?.byTopic?.find((t) => t.note)?.note;
        entries.push({
          day: (attempt.finishedAt ?? attempt.startedAt).toISOString().slice(0, 10),
          kind: 'mock',
          title: exam.title,
          meta: note ? `${correct}/${total} · ${note}` : `${correct}/${total}`,
          reopen: { route: `/lab/mock-exams/${exam.id}/results` },
          cursor: (attempt.finishedAt ?? attempt.startedAt).toISOString(),
        });
      }
    }

    if (!type || type === 'debate' || type === 'all') {
      const debates = await this.db
        .select()
        .from(schema.debates)
        .where(
          and(
            ownerWhere(principal, schema.debates.studentId, schema.debates.independentUserId),
            eq(schema.debates.stage, 'feedback'),
            q ? ilike(schema.debates.motion, `%${q}%`) : undefined,
          ),
        )
        .orderBy(desc(schema.debates.updatedAt))
        .limit(limit);

      for (const d of debates) {
        const feedback = d.feedback as { strongest?: string } | null;
        entries.push({
          day: d.updatedAt.toISOString().slice(0, 10),
          kind: 'debate',
          title: d.motion,
          meta: `${d.format.replace('_', ' ')}${feedback?.strongest ? ` · ${feedback.strongest.slice(0, 60)}` : ''}`,
          reopen: { route: `/lab/debate/${d.id}` },
          cursor: d.updatedAt.toISOString(),
        });
      }
    }

    entries.sort((a, b) => (a.cursor < b.cursor ? 1 : -1));
    const page = entries.slice(0, limit);
    const nextCursor = page.length === limit ? page[page.length - 1]?.cursor : undefined;
    return { groups: this.groupByDay(page), nextCursor };
  }

  private groupByDay(entries: HistoryEntry[]) {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      const list = map.get(e.day) ?? [];
      list.push(e);
      map.set(e.day, list);
    }
    return [...map.entries()].map(([day, items]) => ({ day, items }));
  }
}
