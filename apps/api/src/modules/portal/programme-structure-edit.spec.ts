import { describe, expect, it, vi } from 'vitest';
import { schema, type Database } from '@edrion/database';
import { ProgrammeStructureRepository } from './programme-structure.repository';
import { AcademicsRepository } from './academics.repository';
import { ProgrammeStructureService } from './programme-structure.service';
import type { PortalActionContext } from './portal-action-context';
import type { CommitStructureInput } from '@edrion/schemas';

const department = { id: 'course', version: 4, structureLocked: false, unitKind: 'programme' };
const level = {
  id: '11111111-1111-4111-8111-111111111111',
  gradeLevelId: 'grade-row',
  sequence: 1,
};
const slot = {
  id: '22222222-2222-4222-8222-222222222222',
  programmeLevelId: '11111111-1111-4111-8111-111111111111',
  sequenceInYear: 1,
  absoluteSequence: 1,
};
const input: CommitStructureInput = {
  name: 'Computer Mathematics',
  version: 4,
  termSystem: 'term',
  termsPerYear: 1,
  levels: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
      name: 'Grade X',
      durationMonths: null,
    },
  ],
  slots: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      levelSequence: 1,
      sequenceInYear: 1,
      absoluteSequence: 1,
      name: 'Autumn',
      kind: 'term',
      durationMonths: null,
      isTerminal: false,
    },
  ],
};

function fixture(counts = new Map<unknown, number>()) {
  const writes: { operation: string; table: unknown; values?: Record<string, unknown> }[] = [];
  const rows = new Map<unknown, unknown[]>([
    [schema.departments, [department]],
    [schema.academicYears, [{ id: 'year', version: 0 }]],
    [schema.gradeLevels, [{ id: 'grade-row' }]],
    [schema.departmentGradeLevels, [level]],
    [schema.programmeTermSlots, [slot]],
    [
      schema.programmeSubjects,
      [
        {
          id: 'placement',
          slotId: '22222222-2222-4222-8222-222222222222',
          programmeLevelId: '11111111-1111-4111-8111-111111111111',
          semesterSequence: 1,
        },
      ],
    ],
  ]);
  const tx = {
    select(selection?: unknown) {
      let table: unknown;
      const query = {
        from(value: unknown) {
          table = value;
          return query;
        },
        where() {
          return query;
        },
        for() {
          return query;
        },
        innerJoin() {
          return query;
        },
        then(resolve: (rows: unknown[]) => unknown) {
          return Promise.resolve(
            selection && 'value' in (selection as object)
              ? [{ value: counts.get(table) ?? 0 }]
              : (rows.get(table) ?? []),
          ).then(resolve);
        },
      };
      return query;
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          writes.push({ operation: 'update', table, values });
          return { where: async () => [] };
        },
      };
    },
    delete(table: unknown) {
      writes.push({ operation: 'delete', table });
      return { where: async () => [] };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          writes.push({ operation: 'insert', table, values });
          return {
            returning: async () => [{ id: 'new-id' }],
            then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
          };
        },
      };
    },
  };
  const db = {
    transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
  } as unknown as Database;
  const repo = new ProgrammeStructureRepository(db);
  vi.spyOn(repo, 'getStructure').mockResolvedValue({
    department,
    levels: [],
    totals: { levels: 1, slots: 1 },
  } as never);
  return { repo, writes, db };
}

describe('saved onboarding structures', () => {
  it('updates retained grade and term rows without deleting or recreating curriculum links', async () => {
    const { repo, writes } = fixture();
    await repo.commitStructure('institution', 'course', null, input, 'admin');
    expect(
      writes.filter((write) => write.operation === 'delete' || write.operation === 'insert'),
    ).toEqual([]);
    expect(writes.find((write) => write.table === schema.gradeLevels)?.values).toMatchObject({
      name: 'Grade X',
    });
    expect(
      writes.some(
        (write) => write.table === schema.programmeTermSlots && write.values?.name === 'Autumn',
      ),
    ).toBe(true);
    expect(
      writes.some(
        (write) => write.table === schema.academicTerms && write.values?.name === 'Autumn',
      ),
    ).toBe(true);
    expect(
      writes.filter((write) => write.table === schema.programmeSubjects).at(-1)?.values
        ?.semesterSequence,
    ).toBe(1);
  });

  it('rejects a stale preview before writing any data', async () => {
    const { repo, writes } = fixture();
    await expect(
      repo.commitStructure('institution', 'course', null, { ...input, version: 3 }, 'admin'),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
    expect(writes).toEqual([]);
  });

  it('rejects row IDs from another structure', async () => {
    const { repo } = fixture();
    await expect(
      repo.commitStructure(
        'institution',
        'course',
        null,
        { ...input, levels: [{ ...input.levels[0]!, id: 'foreign-grade' }] },
        'admin',
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_STRUCTURE_REFERENCE' } });
  });

  it('blocks removing a term containing curriculum', async () => {
    const { repo, writes } = fixture(new Map([[schema.programmeSubjects, 1]]));
    await expect(
      repo.commitStructure('institution', 'course', null, { ...input, slots: [] }, 'admin'),
    ).rejects.toMatchObject({ response: { code: 'STRUCTURE_IN_USE' } });
    expect(writes.some((write) => write.operation === 'delete')).toBe(false);
  });

  it('blocks removing a grade with student placement history', async () => {
    const { repo, writes } = fixture(new Map([[schema.studentEnrollments, 1]]));
    await expect(
      repo.commitStructure(
        'institution',
        'course',
        null,
        { ...input, levels: [], slots: [] },
        'admin',
      ),
    ).rejects.toMatchObject({ response: { code: 'STRUCTURE_IN_USE' } });
    expect(writes.some((write) => write.operation === 'delete')).toBe(false);
  });

  it('does not turn an organisational staff department into a course structure', async () => {
    const repo = { findDepartment: vi.fn().mockResolvedValue({ ...department, unitKind: 'department' }), commitStructure: vi.fn() };
    const service = new ProgrammeStructureService(repo as never, { logAudit: vi.fn() } as never);
    await expect(service.commit({ principal: { institutionId: 'institution' } } as PortalActionContext, 'course', input)).rejects.toMatchObject({ response: { code: 'INVALID_PROGRAMME' } });
    expect(repo.commitStructure).not.toHaveBeenCalled();
  });

  it('blocks regeneration for enrolled students before touching the repository, even if the lock was not set', async () => {
    const repo = {
      findDepartment: vi.fn().mockResolvedValue(department),
      hasEnrolledStudents: vi.fn().mockResolvedValue(true),
      commitStructure: vi.fn(),
    };
    const service = new ProgrammeStructureService(repo as never, { logAudit: vi.fn() } as never);
    await expect(
      service.commit(
        { principal: { institutionId: 'institution' } } as PortalActionContext,
        'course',
        input,
      ),
    ).rejects.toMatchObject({ response: { code: 'STRUCTURE_LOCKED' } });
    expect(repo.commitStructure).not.toHaveBeenCalled();
  });
});

describe('onboarding record removal', () => {
  it('cleans up course grades and generated terms while keeping reusable subject records', async () => {
    const { db, writes } = fixture();
    await expect(new AcademicsRepository(db).deleteDepartment('course', 4)).resolves.toBe(true);
    expect(
      writes.filter((write) => write.operation === 'delete').map((write) => write.table),
    ).toEqual([schema.academicTerms, schema.departments, schema.gradeLevels]);
    expect(writes.some((write) => write.table === schema.subjects)).toBe(false);
  });
  it('rejects deleting a course with student history before removing anything', async () => {
    const { db, writes } = fixture(new Map([[schema.studentEnrollments, 1]]));
    await expect(new AcademicsRepository(db).deleteDepartment('course', 4)).rejects.toMatchObject({
      response: { code: 'STRUCTURE_IN_USE' },
    });
    expect(writes).toEqual([]);
  });
  it('allows deleting an academic year whose only dependents are generated terms', async () => {
    const { db, writes } = fixture();
    await expect(new AcademicsRepository(db).deleteAcademicYear('year', 0)).resolves.toBe(true);
    expect(
      writes.filter((write) => write.operation === 'delete').map((write) => write.table),
    ).toEqual([schema.academicTerms, schema.academicYears]);
  });
  it('blocks deleting an academic year containing classes', async () => {
    const { db, writes } = fixture(new Map([[schema.classes, 1]]));
    await expect(new AcademicsRepository(db).deleteAcademicYear('year', 0)).rejects.toMatchObject({
      response: { code: 'RECORD_IN_USE' },
    });
    expect(writes).toEqual([]);
  });
});
