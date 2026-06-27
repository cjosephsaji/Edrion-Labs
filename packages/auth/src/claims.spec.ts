import { describe, expect, it } from 'vitest';
import { isMfaSatisfied, parseSupabaseClaims } from './claims';

const NOW = new Date('2026-06-27T00:00:00Z');
const future = Math.floor(NOW.getTime() / 1000) + 3600;
const past = Math.floor(NOW.getTime() / 1000) - 3600;

describe('parseSupabaseClaims', () => {
  it('parses a well-formed aal2 token', () => {
    const c = parseSupabaseClaims(
      { sub: 'u1', email: 'a@b.dev', aal: 'aal2', session_id: 's1', exp: future, iat: past },
      NOW,
    );
    expect(c).toMatchObject({ sub: 'u1', email: 'a@b.dev', aal: 'aal2', session_id: 's1' });
  });

  it('rejects a missing sub', () => {
    expect(() => parseSupabaseClaims({ email: 'a@b.dev' }, NOW)).toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => parseSupabaseClaims('nope', NOW)).toThrow();
    expect(() => parseSupabaseClaims(null, NOW)).toThrow();
  });

  it('rejects an invalid aal', () => {
    expect(() => parseSupabaseClaims({ sub: 'u1', aal: 'aal3' }, NOW)).toThrow();
  });

  it('rejects an expired token', () => {
    expect(() => parseSupabaseClaims({ sub: 'u1', exp: past }, NOW)).toThrow();
  });

  it('drops fields of the wrong type rather than trusting them', () => {
    const c = parseSupabaseClaims({ sub: 'u1', email: 123, session_id: 5 }, NOW);
    expect(c.email).toBeUndefined();
    expect(c.session_id).toBeUndefined();
  });
});

describe('isMfaSatisfied', () => {
  it('allows a non-enrolled employee at aal1', () => {
    expect(isMfaSatisfied({ aal: 'aal1' }, false)).toBe(true);
    expect(isMfaSatisfied({ aal: undefined }, false)).toBe(true);
  });

  it('requires aal2 for an enrolled employee', () => {
    expect(isMfaSatisfied({ aal: 'aal2' }, true)).toBe(true);
    expect(isMfaSatisfied({ aal: 'aal1' }, true)).toBe(false);
    expect(isMfaSatisfied({ aal: undefined }, true)).toBe(false);
  });
});
