import { describe, expect, it, vi } from 'vitest';
import { FederationService } from './federation.service';

const institutionId = '11111111-1111-4111-8111-111111111111';
const providerId = '22222222-2222-4222-8222-222222222222';

function throwingDependency(name: string) {
  return new Proxy({}, {
    get() {
      throw new Error(`${name} dependency was accessed past the fail-closed gate`);
    },
  });
}

function service(credentials = false) {
  return new FederationService(
    throwingDependency('database') as never,
    {
      API_BASE_URL: 'http://127.0.0.1:3007',
      SESSION_COOKIE_SECRET: 'synthetic-test-secret',
      CLEVER_CLIENT_ID: credentials ? 'synthetic' : undefined,
      CLEVER_CLIENT_SECRET: credentials ? 'synthetic' : undefined,
      CLASSLINK_CLIENT_ID: credentials ? 'synthetic' : undefined,
      CLASSLINK_CLIENT_SECRET: credentials ? 'synthetic' : undefined,
    } as never,
    throwingDependency('mapping') as never,
    throwingDependency('audit') as never,
  );
}

describe('Phase 1 federation fail-closed boundaries', () => {
  it.each([false, true])('V11-05 disables every external roster transport before credentials or dependencies (credentials=%s)', async (credentials) => {
    const federation = service(credentials);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const operations = [
      () => federation.syncClever(institutionId),
      () => federation.syncClasslink(institutionId),
      () => federation.syncOnerosterRest(institutionId, 'https://synthetic.invalid/ims/oneroster', 'secret-token'),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXTERNAL_ROSTER_SYNC_DISABLED' }),
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('V11-05 disables OIDC and SAML start/callback before provider, network, or session effects', async () => {
    const federation = service(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const operations = [
      () => federation.startOidcLogin(institutionId, providerId, '/home'),
      () => federation.completeOidcCallback('code', 'state'),
      () => federation.startSamlLogin(institutionId, providerId, '/home'),
      () => federation.completeSamlAcs('response', 'relay'),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FEDERATION_AUTHENTICATION_DISABLED' }),
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
