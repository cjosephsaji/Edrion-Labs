import { describe, expect, it } from 'vitest';
import { isSensitiveKey, REDACTED, redactSecrets } from './redact';

describe('redactSecrets — key-based masking', () => {
  it('masks values of credential-named keys at any depth', () => {
    const out = redactSecrets({
      prompt: 'rotate the key',
      auth: { password: 'hunter2', apiKey: 'abc123', nested: { client_secret: 'zzz' } },
      list: [{ token: 't-1' }, { ok: 'visible' }],
    });
    expect(out.auth.password).toBe(REDACTED);
    expect(out.auth.apiKey).toBe(REDACTED);
    expect(out.auth.nested.client_secret).toBe(REDACTED);
    expect(out.list[0]!.token).toBe(REDACTED);
    expect(out.list[1]!.ok).toBe('visible');
    expect(out.prompt).toBe('rotate the key');
  });

  it('does not mutate the original input', () => {
    const input = { password: 'secret' };
    const out = redactSecrets(input);
    expect(input.password).toBe('secret');
    expect(out.password).toBe(REDACTED);
  });

  // The alternation holds some very short terms. Matched as raw substrings they were ravenous:
  // className contains "ssn" (cla-SSN-ame) and notPublished contains "otp" (n-OTP-ublished), so the
  // AI was being handed [REDACTED] where a class name should have been, and had to guess.
  it.each([
    'className',
    'classNames',
    'businessName',
    'notPublished',
    'crossNumber',
    'firstName',
    'status',
    'gradeLevelName',
  ])('leaves the benign key %s alone', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
    expect(redactSecrets({ [key]: 'Grade 9 – A' })[key]).toBe('Grade 9 – A');
  });

  // …and anchoring must not cost coverage. Every one of these is still a credential.
  it.each([
    'password',
    'passwords',
    'passwordHash',
    'passphrase',
    'user_password',
    'secret',
    'clientSecret',
    'client_secret',
    'token',
    'tokens',
    'accessToken',
    'refresh_token',
    'apiKey',
    'api_key',
    'x-api-key',
    'APIKey',
    'accessKey',
    'privateKey',
    'Authorization',
    'cookie',
    'credential',
    'credentials',
    'sessionId',
    'session_secret',
    'otp',
    'otpCode',
    'mfaCode',
    'cvv',
    'ssn',
    'SSN',
  ])('still masks the credential key %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
    expect(redactSecrets({ [key]: 'live-value' })[key]).toBe(REDACTED);
  });
});

describe('redactSecrets — value-shape masking inside free text', () => {
  it('scrubs Bearer tokens, JWTs and sk-/AWS keys from strings', () => {
    expect(redactSecrets('use Authorization: Bearer abc.def-123 please')).toBe(
      `use Authorization: ${REDACTED} please`,
    );
    expect(
      redactSecrets('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature_here done'),
    ).toBe(`token ${REDACTED} done`);
    expect(redactSecrets('the key is sk-ABCDEFGHIJKLMNOP1234')).toBe(`the key is ${REDACTED}`);
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe(REDACTED);
  });

  it('scrubs inline credential assignments but keeps the field name', () => {
    expect(redactSecrets('connect with password=hunter2 and go')).toBe(
      `connect with password=${REDACTED} and go`,
    );
    expect(redactSecrets('api_key: "live-xyz"')).toBe(`api_key: ${REDACTED}`);
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'Suspend institution Acme for non-payment; affected users 0.';
    expect(redactSecrets(prose)).toBe(prose);
  });
});

describe('redactSecrets — robustness', () => {
  it('passes through primitives', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(true)).toBe(true);
  });

  it('handles circular references without throwing', () => {
    const a: Record<string, unknown> = { name: 'x' };
    a.self = a;
    const out = redactSecrets(a) as Record<string, unknown>;
    expect(out.name).toBe('x');
    expect(out.self).toBe('[CIRCULAR]');
  });
});
