import { describe, expect, it, vi } from 'vitest';
import { verifyHs256 } from '../../common/jwt';
import { PortalSessionService, type IssuePortalSessionInput } from './portal-session.service';

function build() {
  let stored: Record<string, unknown>;
  const values = vi.fn((input: Record<string, unknown>) => {
    stored = { id: 'sid', ...input };
    return { returning: async () => [stored] };
  });
  const db = {
    insert: () => ({ values }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [stored] }) }) }),
  };
  const service = new PortalSessionService(
    db as never,
    {
      SESSION_COOKIE_SECRET: 'session-secret',
      SESSION_TTL_SECONDS: 3600,
    } as never,
  );
  return {
    service,
    values,
    revoke: () => {
      stored.revokedAt = new Date();
    },
  };
}

const input: IssuePortalSessionInput = {
  institutionId: 'school-a',
  institutionUserId: 'user-a',
  aal: 'aal1',
};

describe('institution session transfer', () => {
  it('preserves original expiry and authentication time while signing verified membership proofs', async () => {
    const { service, values } = build();
    const expiresAt = new Date(Date.now() + 600000);
    const lastAuthAt = new Date(Date.now() - 300000);
    const proof = {
      userId: 'user-a',
      credentialVersion: 'credential-v1',
      aal: 'aal1' as const,
      lastAuthAt: lastAuthAt.toISOString(),
    };
    const { token } = await service.issue({
      ...input,
      expiresAt,
      lastAuthAt,
      membershipProofs: [proof],
    });
    const claims = verifyHs256(token, 'session-secret');
    expect(claims.membershipProofs).toEqual([proof]);
    expect(claims.exp).toBeLessThanOrEqual(Math.floor(expiresAt.getTime() / 1000));
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ expiresAt, lastAuthAt }));
    expect(await service.verify(token)).toMatchObject({
      institutionUserId: 'user-a',
      institutionId: 'school-a',
    });
  });

  it('still requires the backing session to be live when membership proofs are present', async () => {
    const { service, revoke } = build();
    const { token } = await service.issue(input);
    revoke();
    await expect(service.verify(token)).rejects.toMatchObject({
      response: { code: 'SESSION_REVOKED' },
    });
  });
});
