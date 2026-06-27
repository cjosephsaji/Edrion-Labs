import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, RECENT_AUTH_KEY } from '../decorators';

const ENV = { RECENT_AUTH_WINDOW_SECONDS: 900 } as never;
const NON_SENSITIVE = 'institutions.view';
const SENSITIVE = 'institutions.suspend'; // sensitive: true in the catalogue

function reflector(required?: string[], explicitRecent?: boolean): Reflector {
  return {
    getAllAndOverride: (key: unknown) => (key === PERMISSIONS_KEY ? required : key === RECENT_AUTH_KEY ? explicitRecent : undefined),
  } as unknown as Reflector;
}

function principal(keys: string[], lastAuthAt: Date | null) {
  return {
    employeeId: 'e1',
    email: 'owner@edrion.dev',
    fullName: 'Owner',
    roleKeys: [],
    permissions: { keys: new Set(keys), hasWildcard: keys.includes('*') },
    mfaEnrolled: true,
    lastAuthAt,
  };
}

function ctx(principalValue: ReturnType<typeof principal> | null): ExecutionContext {
  const request = { principalContext: principalValue ? { principal: principalValue } : undefined };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guard(required?: string[], explicitRecent?: boolean): PermissionsGuard {
  return new PermissionsGuard(reflector(required, explicitRecent), ENV);
}

function expectForbidden(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('expected ForbiddenException');
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    expect((e as ForbiddenException).getResponse()).toMatchObject({ code });
  }
}

const fresh = () => new Date();
const stale = () => new Date(Date.now() - 3600 * 1000); // 1h ago > 900s window

describe('PermissionsGuard — permission boundary', () => {
  it('allows a handler with no required permissions (even unauthenticated)', () => {
    expect(guard(undefined).canActivate(ctx(null))).toBe(true);
    expect(guard([]).canActivate(ctx(null))).toBe(true);
  });

  it('rejects when there is no resolved principal but a permission is required', () => {
    expectForbidden(() => guard([NON_SENSITIVE]).canActivate(ctx(null)), 'FORBIDDEN');
  });

  it('rejects when the principal is missing a required permission', () => {
    expectForbidden(
      () => guard([NON_SENSITIVE]).canActivate(ctx(principal([], fresh()))),
      'FORBIDDEN',
    );
  });

  it('allows when the principal holds a non-sensitive required permission', () => {
    expect(guard([NON_SENSITIVE]).canActivate(ctx(principal([NON_SENSITIVE], null)))).toBe(true);
  });

  it('honours the wildcard permission', () => {
    expect(guard([SENSITIVE]).canActivate(ctx(principal(['*'], fresh())))).toBe(true);
  });
});

describe('PermissionsGuard — recent auth on sensitive permissions', () => {
  it('allows a sensitive action with recent auth', () => {
    expect(guard([SENSITIVE]).canActivate(ctx(principal([SENSITIVE], fresh())))).toBe(true);
  });

  it('rejects a sensitive action with stale auth', () => {
    expectForbidden(
      () => guard([SENSITIVE]).canActivate(ctx(principal([SENSITIVE], stale()))),
      'RECENT_AUTH_REQUIRED',
    );
  });

  it('rejects a sensitive action when the principal has never re-authed', () => {
    expectForbidden(
      () => guard([SENSITIVE]).canActivate(ctx(principal([SENSITIVE], null))),
      'RECENT_AUTH_REQUIRED',
    );
  });

  it('enforces recent auth when a handler opts in explicitly on a non-sensitive permission', () => {
    expectForbidden(
      () => guard([NON_SENSITIVE], true).canActivate(ctx(principal([NON_SENSITIVE], stale()))),
      'RECENT_AUTH_REQUIRED',
    );
    expect(
      guard([NON_SENSITIVE], true).canActivate(ctx(principal([NON_SENSITIVE], fresh()))),
    ).toBe(true);
  });
});
