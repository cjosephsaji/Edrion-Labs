import { describe, expect, it, vi } from 'vitest';
import { PetrosTopicProfilesRepository } from './petros-topic-profiles.repository';

describe('PetrosTopicProfilesRepository', () => {
  it('reads the winning identity after a concurrent create wins the unique constraint', async () => {
    const existing = { id: 'profile-winner', topicKey: 'photosynthesis' };
    const insertBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    insertBuilder.values = vi.fn(() => insertBuilder);
    insertBuilder.onConflictDoNothing = vi.fn(() => insertBuilder);
    insertBuilder.returning = vi.fn(async () => []);

    const selectBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    selectBuilder.from = vi.fn(() => selectBuilder);
    selectBuilder.where = vi.fn(() => selectBuilder);
    selectBuilder.limit = vi.fn(async () => [existing]);

    const db = {
      insert: vi.fn(() => insertBuilder),
      select: vi.fn(() => selectBuilder),
    };
    const repository = new PetrosTopicProfilesRepository(db as never);

    const result = await repository.createProfile({
      topicKey: 'photosynthesis',
      canonicalTitle: 'Photosynthesis',
      subjectKey: 'biology',
      subjectLabel: 'Biology',
      gradeBand: 'secondary',
      curriculumKey: 'generic',
      curriculumLabel: 'General curriculum',
      status: 'draft',
      cacheKey: 'profile-cache-key',
      invalidationInputs: {},
    });

    expect(insertBuilder.onConflictDoNothing).toHaveBeenCalledWith();
    expect(selectBuilder.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ profile: existing, created: false });
  });

  it('rejects a cache-key collision when no row has the requested identity', async () => {
    const insertBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    insertBuilder.values = vi.fn(() => insertBuilder);
    insertBuilder.onConflictDoNothing = vi.fn(() => insertBuilder);
    insertBuilder.returning = vi.fn(async () => []);

    const selectBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    selectBuilder.from = vi.fn(() => selectBuilder);
    selectBuilder.where = vi.fn(() => selectBuilder);
    selectBuilder.limit = vi.fn(async () => []);

    const repository = new PetrosTopicProfilesRepository({
      insert: vi.fn(() => insertBuilder),
      select: vi.fn(() => selectBuilder),
    } as never);

    await expect(
      repository.createProfile({
        topicKey: 'different-topic',
        canonicalTitle: 'Different topic',
        subjectKey: 'biology',
        subjectLabel: 'Biology',
        gradeBand: 'secondary',
        curriculumKey: 'generic',
        curriculumLabel: 'General curriculum',
        status: 'draft',
        cacheKey: 'already-used-cache-key',
        invalidationInputs: {},
      }),
    ).rejects.toThrow('PETROS_TOPIC_PROFILE_CACHE_KEY_CONFLICT');
  });
});
