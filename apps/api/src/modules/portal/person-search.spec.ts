import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { schema } from '@edrion/database';
import { personSearchCondition } from './person-search';
import { studentSearchCondition } from './student-search';

const dialect = new PgDialect();

function sqlOf(cond: ReturnType<typeof personSearchCondition>) {
  return dialect.sqlToQuery(cond);
}

describe('personSearchCondition', () => {
  it('builds valid SQL for staff partial and full name', () => {
    const t = schema.staff;
    const cond = personSearchCondition(
      { firstName: t.firstName, middleName: t.middleName, lastName: t.lastName },
      'Jane Doe',
      [t.email, t.employeeNo],
    );
    const q = sqlOf(cond);
    expect(q.sql).toContain('ilike');
    expect(q.sql).toContain('concat_ws');
    expect(q.sql).toContain(' or ');
  });

  it('builds valid SQL for parents', () => {
    const t = schema.parents;
    const cond = personSearchCondition({ firstName: t.firstName, lastName: t.lastName }, 'Jane', [t.email]);
    const q = sqlOf(cond);
    expect(q.sql).toContain('first_name');
    expect(q.sql).toContain('ilike');
  });

  it('studentSearchCondition matches personSearch wiring', () => {
    const t = schema.students;
    const cond = studentSearchCondition(t, 'Arjun');
    const where = and(eq(t.institutionId, '00000000-0000-0000-0000-000000000001'), cond)!;
    const q = dialect.sqlToQuery(where);
    expect(q.sql).toContain('ilike');
    expect(q.sql).not.toContain('undefined');
    // eslint-disable-next-line no-console
    console.log('student where SQL:', q.sql);
  });
});
