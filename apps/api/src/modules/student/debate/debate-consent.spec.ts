import { describe, expect, it } from 'vitest';
import { DebateRoundService } from './debate-round.service';

describe('debate consent integration', () => {
  it('hashes consent scopes deterministically', () => {
    const a = DebateRoundService.consentScopesHash({ recording: true, storage: true });
    const b = DebateRoundService.consentScopesHash({ recording: true, storage: true });
    const c = DebateRoundService.consentScopesHash({ recording: true, storage: false });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBeGreaterThan(16);
  });
});
