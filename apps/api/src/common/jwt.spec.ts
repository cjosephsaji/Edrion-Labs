import { describe, expect, it } from 'vitest';
import { JwtError, signHs256, verifyHs256 } from './jwt';

const SECRET = 'unit-test-secret-at-least-16-chars';

describe('HS256 JWT codec', () => {
  it('round-trips a payload', () => {
    const token = signHs256({ sub: 'u1', aal: 'aal2' }, SECRET, 3600);
    const payload = verifyHs256(token, SECRET);
    expect(payload).toMatchObject({ sub: 'u1', aal: 'aal2' });
    expect(payload.iat).toBeTypeOf('number');
    expect(payload.exp).toBeTypeOf('number');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signHs256({ sub: 'u1' }, SECRET, 3600);
    expect(() => verifyHs256(token, 'other-secret-also-16-chars-xx')).toThrow(JwtError);
  });

  it('rejects a tampered payload', () => {
    const token = signHs256({ sub: 'u1' }, SECRET, 3600);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin' }), 'utf8').toString('base64url');
    expect(() => verifyHs256(`${h}.${forged}.${s}`, SECRET)).toThrow(JwtError);
  });

  it('rejects an alg:none / algorithm-confusion token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'admin' }), 'utf8').toString('base64url');
    expect(() => verifyHs256(`${header}.${body}.`, SECRET)).toThrow(/algorithm/i);
  });

  it('rejects an expired token (beyond clock skew)', () => {
    const past = new Date(Date.now() - 3_600_000);
    const token = signHs256({ sub: 'u1' }, SECRET, 60, past);
    expect(() => verifyHs256(token, SECRET)).toThrow(/expired/i);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyHs256('not.a.jwt.at.all', SECRET)).toThrow(JwtError);
    expect(() => verifyHs256('only-one-part', SECRET)).toThrow(JwtError);
  });
});
