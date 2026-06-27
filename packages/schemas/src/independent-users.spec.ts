import { describe, expect, it } from 'vitest';
import {
  independentUserStatusActionSchema,
  listIndependentUsersQuerySchema,
  updateIndependentUserSchema,
} from './independent-users';

describe('independent-users schemas', () => {
  it('defaults pagination on the list query', () => {
    const q = listIndependentUsersQuerySchema.parse({});
    expect(q.page).toBeGreaterThan(0);
    expect(q.pageSize).toBeGreaterThan(0);
  });

  it('requires a reason + version on a status action', () => {
    expect(independentUserStatusActionSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(independentUserStatusActionSchema.safeParse({ reason: 'abusive account', version: 2 }).success).toBe(true);
  });

  it('allows clearing the ai usage limit with null', () => {
    const r = updateIndependentUserSchema.safeParse({ aiUsageLimit: null, version: 1 });
    expect(r.success).toBe(true);
  });

  it('rejects a negative ai usage limit', () => {
    expect(updateIndependentUserSchema.safeParse({ aiUsageLimit: -5, version: 1 }).success).toBe(false);
  });
});
