import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpService } from './otp.service';
import type { InstitutionRegistrationRequest } from '@edrion/database';

const SECRET = 'unit-test-secret-1234567890';
const EMAIL = 'head@greenwood.edu';
const REQUEST = { id: 'req-1', displayName: 'Greenwood', legalName: 'Greenwood' } as InstitutionRegistrationRequest;

function hashOf(code: string): string {
  return createHash('sha256').update(`${code}:${SECRET}`).digest('hex');
}

/** Minimal chainable Drizzle stand-in: select returns configured rows; insert/update are captured. */
function makeDb() {
  const state = { selectRows: [] as Record<string, unknown>[], inserted: [] as Record<string, unknown>[], updated: [] as Record<string, unknown>[] };
  const thenable = (getRows: () => unknown[]) => {
    const p: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit']) p[m] = () => p;
    p.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(getRows()).then(res, rej);
    return p;
  };
  const db = {
    select: vi.fn(() => thenable(() => state.selectRows)),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        state.inserted.push(v);
        return Promise.resolve([{ id: `otp-${state.inserted.length}`, ...v }]);
      },
    })),
    update: vi.fn(() => {
      const p = thenable(() => []);
      (p as Record<string, unknown>).set = (v: Record<string, unknown>) => {
        state.updated.push(v);
        return p;
      };
      return p;
    }),
  };
  return { db, state };
}

function makeService() {
  const { db, state } = makeDb();
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const env = { SESSION_COOKIE_SECRET: SECRET } as never;
  const service = new OtpService(db as never, audit as never, env);
  return { service, state, audit };
}

const ctx = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'r1', correlationId: 'c1' };

describe('OtpService.issue', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
  });

  it('stores only the salted hash, never the plaintext code', async () => {
    const { code } = await h.service.issue(REQUEST, EMAIL, ctx);
    expect(code).toMatch(/^\d{6}$/);
    const stored = h.state.inserted[0]!;
    expect(stored.codeHash).toBe(hashOf(code));
    expect(stored.codeHash).not.toContain(code);
    expect((stored.codeHash as string).length).toBe(64);
  });

  it('audits generation', async () => {
    await h.service.issue(REQUEST, EMAIL, ctx);
    expect(h.audit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'registration.otp_generated', actorType: 'applicant' }),
    );
  });

  it('rejects a resend inside the cooldown window', async () => {
    h.state.selectRows = [{ id: 'otp-prev', createdAt: new Date(), purpose: 'email_verification' }];
    await expect(h.service.issue(REQUEST, EMAIL, ctx)).rejects.toMatchObject({
      response: { code: 'OTP_COOLDOWN' },
    });
  });

  it('rejects once the send cap is reached', async () => {
    h.state.selectRows = Array.from({ length: 5 }, (_, i) => ({
      id: `otp-${i}`,
      createdAt: new Date(Date.now() - 3600_000),
    }));
    await expect(h.service.issue(REQUEST, EMAIL, ctx)).rejects.toMatchObject({
      response: { code: 'OTP_SEND_LIMIT' },
    });
  });
});

describe('OtpService.verify', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
  });

  const liveOtp = (overrides: Record<string, unknown> = {}) => ({
    id: 'otp-1',
    codeHash: hashOf('123456'),
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    maxAttempts: 5,
    ...overrides,
  });

  it('accepts the correct code and consumes it', async () => {
    h.state.selectRows = [liveOtp()];
    await expect(h.service.verify(REQUEST, '123456', EMAIL, ctx)).resolves.toBeUndefined();
    expect(h.state.updated.at(-1)).toHaveProperty('consumedAt');
    expect(h.audit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'registration.otp_verified' }),
    );
  });

  it('rejects a wrong code and increments attempts', async () => {
    h.state.selectRows = [liveOtp()];
    await expect(h.service.verify(REQUEST, '000000', EMAIL, ctx)).rejects.toMatchObject({
      response: { code: 'OTP_INVALID' },
    });
    expect(h.state.updated.at(-1)).toMatchObject({ attempts: 1 });
  });

  it('rejects an expired code', async () => {
    h.state.selectRows = [liveOtp({ expiresAt: new Date(Date.now() - 1000) })];
    await expect(h.service.verify(REQUEST, '123456', EMAIL, ctx)).rejects.toMatchObject({
      response: { code: 'OTP_EXPIRED' },
    });
  });

  it('locks after the attempt cap', async () => {
    h.state.selectRows = [liveOtp({ attempts: 5 })];
    await expect(h.service.verify(REQUEST, '123456', EMAIL, ctx)).rejects.toMatchObject({
      response: { code: 'OTP_LOCKED' },
    });
  });

  it('errors when no code was requested', async () => {
    h.state.selectRows = [];
    await expect(h.service.verify(REQUEST, '123456', EMAIL, ctx)).rejects.toMatchObject({
      response: { code: 'OTP_NOT_FOUND' },
    });
  });
});
