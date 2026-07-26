import { describe, expect, it } from 'vitest';
import { and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { schema, type Database } from '@edrion/database';
import { programmeListFilterConds } from './programme-list-filters';

const dialect = new PgDialect();

/**
 * Minimal query-builder stub. Drizzle subquery builders only need select/from/where/innerJoin
 * to return a chainable object that serialises as a placeholder — enough to prove filter shape.
 */
function fakeDb(): Database {
  const makeBuilder = (): unknown => {
    const builder: Record<string, unknown> = {
      getSQL() {
        return { queryChunks: [] };
      },
      toSQL() {
        return { sql: '(select id from stub)', params: [] };
      },
    };
    for (const method of ['select', 'from', 'where', 'innerJoin', 'leftJoin', 'as', 'limit', 'orderBy']) {
      builder[method] = () => builder;
    }
    return builder;
  };
  return {
    select: () => makeBuilder(),
  } as unknown as Database;
}

function sqlOf(conds: ReturnType<typeof programmeListFilterConds>) {
  if (conds.length === 0) return { sql: '', params: [] as unknown[] };
  const where = and(...conds)!;
  return dialect.sqlToQuery(where);
}

const YEAR = '11111111-1111-1111-1111-111111111111';
const TERM = '22222222-2222-2222-2222-222222222222';

describe('programmeListFilterConds', () => {
  const db = fakeDb();

  it('year only via direct academicYearId column', () => {
    const t = schema.exams;
    const conds = programmeListFilterConds(db, { academicYearId: YEAR }, { academicYearId: t.academicYearId });
    expect(conds).toHaveLength(1);
    const q = sqlOf(conds);
    expect(q.sql).toContain('academic_year_id');
    expect(q.params).toContain(YEAR);
  });

  it('year only via term column subquery', () => {
    const t = schema.exams;
    const conds = programmeListFilterConds(db, { academicYearId: YEAR }, { termId: t.termId });
    expect(conds.length).toBeGreaterThanOrEqual(1);
  });

  it('year only via class column subquery', () => {
    const t = schema.assignments;
    const conds = programmeListFilterConds(db, { academicYearId: YEAR }, { classId: t.classId });
    expect(conds.length).toBeGreaterThanOrEqual(1);
  });

  it('term only uses bare eq when nullMeansWholeYear is false', () => {
    const t = schema.exams;
    const q = sqlOf(programmeListFilterConds(db, { termId: TERM }, { termId: t.termId }));
    expect(q.sql).toContain('term_id');
    expect(q.sql.toLowerCase()).not.toContain('is null');
    expect(q.params).toContain(TERM);
  });

  it('year+term with termIdNullMeansWholeYear includes IS NULL', () => {
    const t = schema.classes;
    const conds = programmeListFilterConds(
      db,
      { academicYearId: YEAR, termId: TERM },
      { academicYearId: t.academicYearId, termId: t.termId, termIdNullMeansWholeYear: true },
    );
    expect(conds.length).toBeGreaterThanOrEqual(2);
    const termCond = conds[conds.length - 1]!;
    const q = dialect.sqlToQuery(termCond);
    expect(q.sql.toLowerCase()).toContain('is null');
    expect(q.params).toContain(TERM);
  });

  it('term only with termIdNullMeansWholeYear and yearCol uses year-of-term path', () => {
    const t = schema.classes;
    const conds = programmeListFilterConds(
      db,
      { termId: TERM },
      { academicYearId: t.academicYearId, termId: t.termId, termIdNullMeansWholeYear: true },
    );
    expect(conds.length).toBeGreaterThanOrEqual(1);
    const q = dialect.sqlToQuery(conds[0]!);
    expect(q.sql.toLowerCase()).toContain('is null');
  });

  it('direct year + class year resolution returns a combined condition', () => {
    const t = schema.feeStructures;
    const conds = programmeListFilterConds(
      db,
      { academicYearId: YEAR },
      { academicYearId: t.academicYearId, classId: t.classId },
    );
    expect(conds).toHaveLength(1);
  });
});
