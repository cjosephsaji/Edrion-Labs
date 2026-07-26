import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ApiEnv } from '@edrion/config';
import { AuthGuard } from './auth.guard';
import type { AuthService } from '../../modules/authentication/auth.service';
import type { SessionService } from '../../modules/authentication/session.service';

const COOKIE = 'edrion_session';

function reflector(isPublic = false): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

function ctx(headers: Record<string, string | undefined>, cookie?: string): { ctx: ExecutionContext; req: any } {
  const req: any = {
    headers: { cookie },
    header: (name: string) => headers[name.toLowerCase()],
  };
  return {
    req,
    ctx: {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

function principalCtx(employeeId = 'e1') {
  return { principal: { employeeId, permissions: { keys: new Set(), hasWildcard: false } } };
}

function build(env: Partial<ApiEnv>, isPublic = false) {
  const auth = {
    resolveByEmail: vi.fn().mockResolvedValue(principalCtx()),
    resolveById: vi.fn().mockResolvedValue(principalCtx()),
    resolveSupportSession: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = { verify: vi.fn() };
  const guard = new AuthGuard(
    auth as unknown as AuthService,
    sessions as unknown as SessionService,
    reflector(isPublic),
    { SESSION_COOKIE_NAME: COOKIE, ...env } as ApiEnv,
  );
  return { guard, auth, sessions };
}

describe('AuthGuard', () => {
  it('lets a public route through without auth', async () => {
    const { guard } = build({ AUTH_DEV_HEADER: false }, true);
    const { ctx: c } = ctx({}, undefined);
    await expect(guard.canActivate(c)).resolves.toBe(true);
  });

  it('rejects a request with no cookie and dev header disabled (401)', async () => {
    const { guard } = build({ AUTH_DEV_HEADER: false });
    const { ctx: c } = ctx({}, undefined);
    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves via the session cookie by default', async () => {
    const { guard, auth, sessions } = build({ AUTH_DEV_HEADER: false });
    sessions.verify.mockResolvedValue({ id: 's1', employeeId: 'e1', lastAuthAt: new Date() });
    const { ctx: c, req } = ctx({}, `${COOKIE}=the-token`);

    await expect(guard.canActivate(c)).resolves.toBe(true);
    expect(sessions.verify).toHaveBeenCalledWith('the-token');
    expect(auth.resolveById).toHaveBeenCalledWith('e1', expect.any(Date));
    expect(req.principalContext.authSessionId).toBe('s1');
  });

  it('uses the dev header only when AUTH_DEV_HEADER is enabled', async () => {
    const { guard, auth, sessions } = build({ AUTH_DEV_HEADER: true });
    const { ctx: c, req } = ctx({ 'x-employee-email': 'owner@edrion.dev' }, undefined);

    await expect(guard.canActivate(c)).resolves.toBe(true);
    expect(auth.resolveByEmail).toHaveBeenCalledWith('owner@edrion.dev');
    expect(sessions.verify).not.toHaveBeenCalled();
    expect(req.principalContext.authSessionId).toBeUndefined();
  });

  it('falls back to the cookie when dev header is enabled but no header is sent', async () => {
    const { guard, auth, sessions } = build({ AUTH_DEV_HEADER: true });
    sessions.verify.mockResolvedValue({ id: 's2', employeeId: 'e1', lastAuthAt: new Date() });
    const { ctx: c } = ctx({}, `${COOKIE}=tok2`);

    await expect(guard.canActivate(c)).resolves.toBe(true);
    expect(auth.resolveByEmail).not.toHaveBeenCalled();
    expect(sessions.verify).toHaveBeenCalledWith('tok2');
  });
});
