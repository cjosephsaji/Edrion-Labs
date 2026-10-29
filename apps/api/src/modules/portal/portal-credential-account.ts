import type { InstitutionUser } from '@edrion/database';

/** Explicit credential linkage created on approval; sharing an email alone does not link passwords. */
export function portalCredentialGroupId(user: Pick<InstitutionUser, 'id' | 'metadata'>): string {
  const groupId = user.metadata?.portalCredentialGroupId;
  return typeof groupId === 'string' && groupId ? groupId : user.id;
}

/** Prefer the most recently used native sign-in; IdP-only accounts can also be reused. */
export function existingPortalCredentialAccount(
  users: InstitutionUser[],
): InstitutionUser | undefined {
  const eligible = users.filter(
    (user) =>
      user.status === 'active' && !user.disabledAt && Boolean(user.passwordHash || user.authUserId),
  );
  const lastUsed = (user: InstitutionUser) =>
    (user.lastLoginAt ?? user.lastAuthAt ?? user.activatedAt ?? user.createdAt)?.getTime() ?? 0;
  return eligible.sort(
    (a, b) =>
      Number(Boolean(b.passwordHash)) - Number(Boolean(a.passwordHash)) ||
      lastUsed(b) - lastUsed(a) ||
      a.id.localeCompare(b.id),
  )[0];
}
