import { describe, expect, it } from 'vitest';
import {
  addSupportMessageSchema,
  assignSupportCaseSchema,
  changeSupportCaseStatusSchema,
  createSupportCaseSchema,
} from './support-cases';

describe('support-cases schemas', () => {
  it('defaults category + priority on create', () => {
    const c = createSupportCaseSchema.parse({ subject: 'Cannot log in' });
    expect(c.category).toBe('general');
    expect(c.priority).toBe('normal');
  });

  it('rejects too-short subjects', () => {
    expect(createSupportCaseSchema.safeParse({ subject: 'no' }).success).toBe(false);
  });

  it('requires a non-empty message body', () => {
    expect(addSupportMessageSchema.safeParse({ body: '' }).success).toBe(false);
    expect(addSupportMessageSchema.parse({ body: 'hello' }).internal).toBe(false);
  });

  it('validates status transitions need a reason', () => {
    expect(changeSupportCaseStatusSchema.safeParse({ status: 'resolved' }).success).toBe(false);
    expect(changeSupportCaseStatusSchema.safeParse({ status: 'resolved', reason: 'fixed it' }).success).toBe(true);
  });

  it('allows unassigning a case (null assignee)', () => {
    expect(assignSupportCaseSchema.safeParse({ assignedEmployeeId: null, reason: 'rebalance' }).success).toBe(true);
  });
});
