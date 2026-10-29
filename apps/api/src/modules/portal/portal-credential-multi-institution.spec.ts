import { describe, expect, it, vi } from 'vitest';
import { PortalCredentialService } from './portal-credential.service';

function build(
  users: Array<{ id: string; institutionId: string; fullName: string; email: string }>,
) {
  const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
  const db = { update: vi.fn(() => ({ set })) };
  const audit = { logAudit: vi.fn() };
  const auth = {
    loadAllActiveByEmail: vi.fn(async () => users),
    institutionNames: vi.fn(
      async () => new Map(users.map((u) => [u.institutionId, `School ${u.id}`])),
    ),
  };
  const emails = { sendPasswordReset: vi.fn() };
  const service = new PortalCredentialService(
    db as never,
    audit as never,
    { SESSION_COOKIE_SECRET: 'secret', PORTAL_WEB_URL: 'https://portal.example.com' } as never,
    auth as never,
    {} as never,
    emails as never,
  );
  return { service, emails, set };
}

describe('password recovery for a shared institution email', () => {
  it('sends independently scoped reset links labelled with the institution', async () => {
    const users = ['a', 'b'].map((id) => ({
      id,
      institutionId: `institution-${id}`,
      fullName: 'Alex',
      email: 'admin@example.com',
    }));
    const { service, emails, set } = build(users);
    await service.forgotPassword({ email: users[0]!.email }, {} as never);
    expect(emails.sendPasswordReset).toHaveBeenCalledTimes(2);
    const calls = emails.sendPasswordReset.mock.calls as unknown as string[][];
    expect(calls[0]![3]).toBe('School a');
    expect(calls[1]![3]).toBe('School b');
    expect(calls[0]![2]).not.toBe(calls[1]![2]);
    expect(set.mock.calls[0]).not.toEqual(set.mock.calls[1]);
  });

  it('does not disclose or email inactive or unknown memberships', async () => {
    const { service, emails, set } = build([]);
    await expect(
      service.forgotPassword({ email: 'unknown@example.com' }, {} as never),
    ).resolves.toBeUndefined();
    expect(emails.sendPasswordReset).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});
