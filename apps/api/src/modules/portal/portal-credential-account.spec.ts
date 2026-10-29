import { describe, expect, it } from 'vitest';
import type { InstitutionUser } from '@edrion/database';
import {
  existingPortalCredentialAccount,
  portalCredentialGroupId,
} from './portal-credential-account';

const user = (id: string, overrides: Partial<InstitutionUser> = {}) =>
  ({
    id,
    status: 'active',
    passwordHash: 'hash',
    disabledAt: null,
    metadata: {},
    ...overrides,
  }) as InstitutionUser;

describe('existing institution credential selection', () => {
  it('uses the most recently used native account when legacy memberships have different passwords', () => {
    const older = user('a', { passwordHash: 'old', lastLoginAt: new Date('2026-01-01') });
    const current = user('b', { passwordHash: 'current', lastLoginAt: new Date('2026-09-01') });
    expect(existingPortalCredentialAccount([older, current])).toBe(current);
  });
  it('excludes invitations, disabled memberships and active rows without sign-in credentials', () => {
    expect(
      existingPortalCredentialAccount([
        user('a', { status: 'invited' as InstitutionUser['status'] }),
        user('b', { disabledAt: new Date() }),
        user('c', { passwordHash: null }),
      ]),
    ).toBeUndefined();
  });
  it('carries forward explicit credential linkage and keeps unrelated email matches separate', () => {
    expect(portalCredentialGroupId(user('a'))).toBe('a');
    expect(portalCredentialGroupId(user('b', { metadata: { portalCredentialGroupId: 'a' } }))).toBe(
      'a',
    );
    expect(portalCredentialGroupId(user('c', { metadata: { portalCredentialGroupId: 123 } }))).toBe(
      'c',
    );
  });
});
