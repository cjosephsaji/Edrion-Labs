import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportAccessService } from './support-access.service';
import type { ActionContext } from '../../common/action-context';

const INSTITUTION_ID = '11111111-1111-1111-1111-111111111111';
const EMPLOYEE_ID = '22222222-2222-2222-2222-222222222222';

function makeCtx(employeeId = EMPLOYEE_ID): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId,
        email: 'priya@edrion.dev',
        fullName: 'Priya Menon',
        roleKeys: ['customer_support_administrator'],
        permissions: { keys: new Set<string>(), hasWildcard: false },
        mfaEnrolled: true,
        lastAuthAt: new Date(),
      },
    },
    request: {
      requestId: 'req-1',
      correlationId: 'corr-1',
      ip: '127.0.0.1',
      userAgent: 'vitest',
      apiEndpoint: 'POST /support-access/start',
    },
  } as ActionContext;
}

function makeService() {
  const repo = {
    findInstitution: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findLapsed: vi.fn(),
    list: vi.fn(),
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new SupportAccessService(repo as never, audit as never);
  return { service, repo, audit };
}

const ACTIVE_INSTITUTION = { id: INSTITUTION_ID, displayName: 'Riverside Public School', status: 'active' };

describe('SupportAccessService.start', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
    h.repo.findInstitution.mockResolvedValue(ACTIVE_INSTITUTION);
    h.repo.insert.mockImplementation(async (values: Record<string, unknown>) => ({
      id: 'sess-1',
      ...values,
    }));
  });

  it('creates an active session and writes the full lifecycle audit trail', async () => {
    const session = await h.service.start(
      { institutionId: INSTITUTION_ID, accessLevel: 'support', reason: 'Investigate billing', durationMinutes: 60 },
      makeCtx(),
    );

    expect(session.status).toBe('active');
    expect(session.institutionName).toBe('Riverside Public School');
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const actions = h.audit.logAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual([
      'support_access.requested',
      'support_access.approved',
      'support_access.start',
    ]);
    // Every lifecycle event is stamped with the session id for correlation.
    for (const call of h.audit.logAudit.mock.calls) {
      expect(call[0].supportSessionId).toBe('sess-1');
      expect(call[0].institutionId).toBe(INSTITUTION_ID);
    }
  });

  it('rejects an unknown institution', async () => {
    h.repo.findInstitution.mockResolvedValue(undefined);
    await expect(
      h.service.start({ institutionId: INSTITUTION_ID, accessLevel: 'support', reason: 'x reason', durationMinutes: 60 }, makeCtx()),
    ).rejects.toThrow();
    expect(h.repo.insert).not.toHaveBeenCalled();
  });

  it('refuses to enter an archived institution', async () => {
    h.repo.findInstitution.mockResolvedValue({ ...ACTIVE_INSTITUTION, status: 'archived' });
    await expect(
      h.service.start({ institutionId: INSTITUTION_ID, accessLevel: 'support', reason: 'x reason', durationMinutes: 60 }, makeCtx()),
    ).rejects.toThrow();
  });
});

describe('SupportAccessService.extend', () => {
  it('pushes expiry forward and audits the extension', async () => {
    const h = makeService();
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    h.repo.findById.mockResolvedValue({
      id: 'sess-1', institutionId: INSTITUTION_ID, institutionName: 'Riverside', employeeId: EMPLOYEE_ID,
      status: 'active', expiresAt, durationMinutes: 60, caseRef: null,
    });
    h.repo.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      id: 'sess-1', institutionId: INSTITUTION_ID, employeeId: EMPLOYEE_ID, status: 'active', ...patch,
    }));

    const updated = await h.service.extend('sess-1', { addMinutes: 30, reason: 'Need more time' }, makeCtx());
    expect(updated.expiresAt.getTime()).toBe(expiresAt.getTime() + 30 * 60_000);
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('support_access.extended');
  });

  it('refuses to extend another employee’s session', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue({
      id: 'sess-1', institutionId: INSTITUTION_ID, employeeId: 'someone-else',
      status: 'active', expiresAt: new Date(Date.now() + 60_000), durationMinutes: 60, caseRef: null,
    });
    await expect(
      h.service.extend('sess-1', { addMinutes: 30, reason: 'Need more time' }, makeCtx()),
    ).rejects.toThrow();
    expect(h.repo.update).not.toHaveBeenCalled();
  });
});

describe('SupportAccessService.end', () => {
  it('ends an owned session and is idempotent once ended', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue({
      id: 'sess-1', institutionId: INSTITUTION_ID, institutionName: 'Riverside', employeeId: EMPLOYEE_ID,
      status: 'active', expiresAt: new Date(Date.now() + 60_000), durationMinutes: 60, caseRef: null,
    });
    h.repo.update.mockResolvedValue({ id: 'sess-1', status: 'ended', employeeId: EMPLOYEE_ID, institutionId: INSTITUTION_ID });
    await h.service.end('sess-1', {}, makeCtx());
    expect(h.audit.logAudit.mock.calls.at(-1)?.[0].action).toBe('support_access.ended');

    // already ended → no-op
    h.repo.findById.mockResolvedValue({ id: 'sess-1', status: 'ended', employeeId: EMPLOYEE_ID, institutionId: INSTITUTION_ID });
    h.repo.update.mockClear();
    await h.service.end('sess-1', {}, makeCtx());
    expect(h.repo.update).not.toHaveBeenCalled();
  });
});

describe('SupportAccessService.sweepExpired', () => {
  it('marks lapsed sessions expired and audits each as a system actor', async () => {
    const h = makeService();
    h.repo.findLapsed.mockResolvedValue([
      { id: 'a', institutionId: INSTITUTION_ID, status: 'active', caseRef: null },
      { id: 'b', institutionId: INSTITUTION_ID, status: 'approved', caseRef: null },
    ]);
    const now = new Date();
    const count = await h.service.sweepExpired(now);
    expect(count).toBe(2);
    expect(h.repo.update).toHaveBeenCalledTimes(2);
    expect(h.repo.update).toHaveBeenCalledWith('a', { status: 'expired', endedAt: now });
    const actions = h.audit.logAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual(['support_access.expired', 'support_access.expired']);
    expect(h.audit.logAudit.mock.calls[0]?.[0].actorType).toBe('system');
  });
});
