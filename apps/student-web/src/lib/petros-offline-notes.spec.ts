import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashQueuedPayload, listQueuedNotes, ownerQueueKey, sanitizeCachedJourney } from './petros-offline-notes';

afterEach(() => vi.unstubAllGlobals());

describe('private note queue identity', () => {
  it('reports unavailable durable storage rather than claiming queued work was recovered', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(listQueuedNotes({ institutionId: 'institution-a', studentId: 'student-a' }))
      .rejects.toThrow('Durable browser storage is unavailable.');
  });

  it('surfaces migration blocking and storage-open failures', async () => {
    for (const failure of ['onblocked', 'onerror'] as const) {
      const request = { error: new Error('Storage migration failed.'), onblocked: null, onerror: null } as unknown as IDBOpenDBRequest;
      vi.stubGlobal('indexedDB', { open: () => {
        queueMicrotask(() => {
          const notify = request[failure] as ((event: Event) => unknown) | null;
          notify?.(new Event(failure));
        });
        return request;
      } });
      await expect(listQueuedNotes({ institutionId: 'institution-a', studentId: 'student-a' }))
        .rejects.toThrow(failure === 'onblocked' ? 'Browser storage update is blocked by another open tab.' : 'Storage migration failed.');
    }
  });

  it('hashes payloads using the server canonical JSON ordering', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const payload = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      blockId: '22222222-2222-4222-8222-222222222222',
      text: 'Keep this note private until checked.',
    };
    const canonical = `{"blockId":"${payload.blockId}","sessionId":"${payload.sessionId}","text":"${payload.text}"}`;
    const expected = createHash('sha256').update(canonical).digest('hex');
    expect(await hashQueuedPayload(payload)).toBe(expected);
    expect(await hashQueuedPayload({ ...payload })).toBe(expected);
  });

  it('scopes queue identity to both institution and student', () => {
    expect(ownerQueueKey({ institutionId: 'institution-a', studentId: 'student-a' })).toBe('institution-a:student-a');
    expect(ownerQueueKey({ institutionId: 'institution-a', studentId: 'student-b' })).not.toBe('institution-a:student-a');
    expect(ownerQueueKey({ institutionId: 'institution-b', studentId: 'student-a' })).not.toBe('institution-a:student-a');
  });

  it('caches only version pins, excluding source text, policy blobs, workspace draft, and narration', () => {
    const safe = sanitizeCachedJourney({
      id: 'journey-id', version: 2, source: { sourceVersion: 'source-v2', title: 'Sensitive document title' },
      policyVersion: 'policy-v1', policy: { private: true }, objective: { statement: 'Private objective' },
      returnPoint: { sessionId: 'session-id', blockId: 'block-id', unresolvedRequest: 'Private question', workspace: null },
      workspace: { blockId: 'block-id', checkpointId: 'checkpoint-id', programRevision: 5, experimentVersion: 6, draftVersion: 7,
        branchId: 'branch-a', draft: { text: 'private draft' }, narration: { text: 'private narration' }, capabilityRefs: ['private'] },
    });
    expect(JSON.stringify(safe)).not.toContain('Private');
    expect(JSON.stringify(safe)).not.toContain('private');
    expect(safe.workspace).toEqual({ blockId: 'block-id', checkpointId: 'checkpoint-id', programRevision: 5,
      experimentVersion: 6, draftVersion: 7, branchId: 'branch-a' });
  });
});
