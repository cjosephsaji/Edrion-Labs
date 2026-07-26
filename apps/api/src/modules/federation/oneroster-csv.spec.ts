import { describe, expect, it } from 'vitest';
import { parseOnerosterUsersCsv } from './oneroster-csv';

describe('parseOnerosterUsersCsv', () => {
  it('parses a minimal users file', () => {
    const csv = `sourcedId,givenName,familyName,email,role
u1,Jamie,Lee,jamie@school.edu,student
t1,Alex,Kim,alex@school.edu,teacher`;
    const rows = parseOnerosterUsersCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sourcedId: 'u1', email: 'jamie@school.edu', role: 'student' });
  });

  it('returns empty when header missing sourcedId', () => {
    expect(parseOnerosterUsersCsv('email\na@b.c')).toEqual([]);
  });
});
