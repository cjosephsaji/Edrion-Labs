import { describe, expect, it } from 'vitest';
import {
  approveRunSchema,
  confirmRunSchema,
  createRunSchema,
  listRunsQuerySchema,
  rejectRunSchema,
} from './copilot';

describe('createRunSchema', () => {
  it('accepts a prompt and defaults context to {}', () => {
    const r = createRunSchema.safeParse({ prompt: 'summarise institution Acme' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.context).toEqual({});
  });

  it('rejects an empty prompt', () => {
    expect(createRunSchema.safeParse({ prompt: '   ' }).success).toBe(false);
  });

  it('rejects a prompt over 2000 chars', () => {
    expect(createRunSchema.safeParse({ prompt: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('passes through known context fields and coerces amountMinor as int', () => {
    const r = createRunSchema.safeParse({ prompt: 'x', context: { institutionId: 'i1', amountMinor: 100 } });
    expect(r.success).toBe(true);
    expect(createRunSchema.safeParse({ prompt: 'x', context: { amountMinor: 1.5 } }).success).toBe(false);
  });
});

describe('confirmRunSchema', () => {
  it('requires a reason of at least 5 chars', () => {
    expect(confirmRunSchema.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(confirmRunSchema.safeParse({ reason: 'confirmed for audit' }).success).toBe(true);
  });

  it('rejects an over-long confirmationText', () => {
    expect(
      confirmRunSchema.safeParse({ reason: 'valid reason', confirmationText: 'x'.repeat(201) }).success,
    ).toBe(false);
  });
});

describe('rejectRunSchema / approveRunSchema', () => {
  it('rejectRunSchema requires a reason', () => {
    expect(rejectRunSchema.safeParse({}).success).toBe(false);
  });

  it('approveRunSchema defaults approved to true', () => {
    const r = approveRunSchema.safeParse({ reason: 'second approver sign-off' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.approved).toBe(true);
  });
});

describe('listRunsQuerySchema', () => {
  it('coerces and defaults limit, validates employeeId as uuid', () => {
    const r = listRunsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
    expect(listRunsQuerySchema.safeParse({ employeeId: 'not-a-uuid' }).success).toBe(false);
  });
});
