import { describe, expect, it, vi } from 'vitest';
import { IdempotencyService } from './idempotency.service';
import type { RedisService } from './redis/redis.service';
import type { Database } from '@edrion/database';

function redisMock(cached: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(cached),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

/** DB that claims the key (insert returns a row) and accepts the completion update. */
function dbClaiming() {
  return {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ key: 'k' }] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
  } as unknown as Database;
}

describe('IdempotencyService — Redis-fronted', () => {
  it('replays from the Redis cache without touching the database', async () => {
    const redis = redisMock(JSON.stringify({ id: 'inv_1', ok: true }));
    const db = { insert: vi.fn() } as unknown as Database;
    const svc = new IdempotencyService(db, redis as unknown as RedisService);

    const out = await svc.run('k1', 'billing', async () => ({ never: 'called' }));
    expect(out).toEqual({ result: { id: 'inv_1', ok: true }, replayed: true });
    expect((db as unknown as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled();
  });

  it('runs the operation on first use and caches the result in Redis', async () => {
    const redis = redisMock(null);
    const svc = new IdempotencyService(dbClaiming(), redis as unknown as RedisService);
    const fn = vi.fn().mockResolvedValue({ id: 'inv_2' });

    const out = await svc.run('k2', 'billing', fn);
    expect(out.replayed).toBe(false);
    expect(fn).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith('idem:res:k2', JSON.stringify({ id: 'inv_2' }), expect.any(Number));
  });

  it('runs without replay protection when no key is supplied', async () => {
    const redis = redisMock(null);
    const svc = new IdempotencyService({} as Database, redis as unknown as RedisService);
    const out = await svc.run(undefined, 'billing', async () => ({ id: 'x' }));
    expect(out).toEqual({ result: { id: 'x' }, replayed: false });
    expect(redis.get).not.toHaveBeenCalled();
  });
});
