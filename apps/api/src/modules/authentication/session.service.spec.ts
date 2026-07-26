import { describe, expect, it } from 'vitest';
import type { ApiEnv } from '@edrion/config';
import { SessionService } from './session.service';
import { signHs256 } from '../../common/jwt';

const SECRET = 'session-secret-at-least-16-chars';
const env = {
  SESSION_COOKIE_NAME: 'edrion_session',
  SESSION_COOKIE_SECRET: SECRET,
  SESSION_TTL_SECONDS: 3600,
  NODE_ENV: 'test',
} as ApiEnv;

/** Fake DB whose select chain resolves to a single configured row. */
function dbReturning(row: unknown) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(row ? [row] : []),
  };
  return { select: () => chain } as never;
}

function token(payload: Record<string, unknown>) {
  return signHs256(payload, SECRET, 3600);
}

const future = () => new Date(Date.now() + 3_600_000);
const past = () => new Date(Date.now() - 3_600_000);

describe('SessionService.verify', () => {
  it('returns a live, matching session', async () => {
    const row = { id: 's1', employeeId: 'e1', revokedAt: null, expiresAt: future(), lastAuthAt: new Date() };
    const svc = new SessionService(dbReturning(row), env);
    await expect(svc.verify(token({ sid: 's1', eid: 'e1' }))).resolves.toMatchObject({ id: 's1' });
  });

  it('rejects a cookie signed with the wrong secret', async () => {
    const svc = new SessionService(dbReturning(null), env);
    const bad = signHs256({ sid: 's1', eid: 'e1' }, 'a-different-secret-16-chars', 3600);
    await expect(svc.verify(bad)).rejects.toMatchObject({ response: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects when the session row is missing', async () => {
    const svc = new SessionService(dbReturning(null), env);
    await expect(svc.verify(token({ sid: 's1', eid: 'e1' }))).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('rejects a revoked session', async () => {
    const row = { id: 's1', employeeId: 'e1', revokedAt: new Date(), expiresAt: future(), lastAuthAt: new Date() };
    const svc = new SessionService(dbReturning(row), env);
    await expect(svc.verify(token({ sid: 's1', eid: 'e1' }))).rejects.toMatchObject({
      response: { code: 'SESSION_REVOKED' },
    });
  });

  it('rejects an expired session', async () => {
    const row = { id: 's1', employeeId: 'e1', revokedAt: null, expiresAt: past(), lastAuthAt: new Date() };
    const svc = new SessionService(dbReturning(row), env);
    await expect(svc.verify(token({ sid: 's1', eid: 'e1' }))).rejects.toMatchObject({
      response: { code: 'SESSION_EXPIRED' },
    });
  });

  it('rejects an employee-id mismatch between cookie and row', async () => {
    const row = { id: 's1', employeeId: 'e2', revokedAt: null, expiresAt: future(), lastAuthAt: new Date() };
    const svc = new SessionService(dbReturning(row), env);
    await expect(svc.verify(token({ sid: 's1', eid: 'e1' }))).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });
});
