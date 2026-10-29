import { describe, expect, it, vi } from 'vitest';
import { PortalAuthService } from './portal-auth.service';

function build() {
  const rows = [
    { id: 'a', status: 'active', disabledAt: null },
    { id: 'b', status: 'active', disabledAt: null },
    { id: 'c', status: 'invited', disabledAt: null },
    { id: 'd', status: 'disabled', disabledAt: null },
    { id: 'e', status: 'active', disabledAt: new Date() },
  ];
  const where = vi.fn(async () => rows);
  const db = { select: () => ({ from: () => ({ where }) }) };
  return { service: new PortalAuthService(db as never, {} as never), where };
}

describe('portal membership discovery', () => {
  it('returns all activated memberships for the normalized email, excluding invitations and disabled users', async () => {
    const { service, where } = build();
    expect((await service.loadAllActiveByEmail(' ADMIN@EXAMPLE.COM ')).map((u) => u.id)).toEqual([
      'a',
      'b',
    ]);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('refuses to choose an arbitrary membership on the legacy development header path', async () => {
    const { service } = build();
    expect(await service.loadActiveByEmail('admin@example.com')).toBeUndefined();
    await expect(service.resolveByEmail('admin@example.com')).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('returns all active memberships for an IdP identity', async () => {
    const { service } = build();
    expect((await service.loadAllActiveByAuthUserId('auth-id')).map((u) => u.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
