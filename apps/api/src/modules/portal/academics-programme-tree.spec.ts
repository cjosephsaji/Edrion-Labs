import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { schema, type SQL } from '@edrion/database';
import { AcademicsRepository } from './academics.repository';

describe('programme tree excludes staff departments', () => {
  it.each([
    { campuses: null, departmentId: undefined },
    { campuses: ['campus-a'], departmentId: undefined },
    { campuses: null, departmentId: 'staff-department' },
  ])(
    'enforces programme roots alongside scope and explicit filters: %j',
    async ({ campuses, departmentId }) => {
      const dialect = new PgDialect();
      let params: unknown[] = [];
      const db = {
        select: vi.fn(() => ({
          from: (table: unknown) => {
            expect(table).toBe(schema.departments);
            return {
              where: (condition: SQL) => {
                params = dialect.sqlToQuery(condition).params;
                return { orderBy: async () => [] };
              },
            };
          },
        })),
      };
      expect(
        await new AcademicsRepository(db as never).getProgrammeStructure(
          'institution',
          campuses,
          departmentId,
        ),
      ).toEqual([]);
      expect(params).toContain('institution');
      expect(params).toContain('programme');
      if (campuses) expect(params).toContain('campus-a');
      if (departmentId) expect(params).toContain('staff-department');
      expect(db.select).toHaveBeenCalledTimes(1);
    },
  );
});
