import { describe, expect, it } from 'vitest';
import { commitStructureSchema, createDepartmentSchema, academicsListQuerySchema } from './academics';

const id = '11111111-1111-4111-8111-111111111111';
const body = {
  name: 'Computer Mathematics',
  version: 0,
  termSystem: 'term',
  termsPerYear: 1,
  levels: [{ id, sequence: 1, name: 'Grade X', durationMonths: null }],
  slots: [
    {
      id,
      levelSequence: 1,
      sequenceInYear: 1,
      absoluteSequence: 1,
      name: 'Term 1',
      kind: 'term',
      durationMonths: null,
    },
  ],
};

describe('editable onboarding structure contract', () => {
  it('retains saved identities, root name, and optimistic version', () => {
    expect(commitStructureSchema.parse(body)).toMatchObject(body);
  });
  it('accepts new structures without saved row IDs', () => {
    expect(
      commitStructureSchema.safeParse({
        ...body,
        levels: [{ ...body.levels[0], id: undefined }],
        slots: [{ ...body.slots[0], id: undefined }],
      }).success,
    ).toBe(true);
  });
  it('rejects duplicate saved IDs and sequence positions', () => {
    expect(
      commitStructureSchema.safeParse({
        ...body,
        levels: [...body.levels, { ...body.levels[0], sequence: 2 }],
      }).success,
    ).toBe(false);
    expect(
      commitStructureSchema.safeParse({
        ...body,
        slots: [...body.slots, { ...body.slots[0], id: undefined }],
      }).success,
    ).toBe(false);
  });
  it('rejects terms referencing a missing grade', () => {
    expect(
      commitStructureSchema.safeParse({ ...body, slots: [{ ...body.slots[0], levelSequence: 2 }] })
        .success,
    ).toBe(false);
  });
});


describe('department versus course contracts', () => {
  it('accepts independent department and programme creation and matching list filters', () => {
    expect(createDepartmentSchema.parse({ name: 'Mathematics', unitKind: 'department' }).unitKind).toBe('department');
    expect(createDepartmentSchema.parse({ name: 'Computer Mathematics', unitKind: 'programme' }).unitKind).toBe('programme');
    expect(academicsListQuerySchema.parse({ unitKind: 'department' }).unitKind).toBe('department');
    expect(createDepartmentSchema.safeParse({ name: 'Invalid', unitKind: 'other' }).success).toBe(false);
  });
});
