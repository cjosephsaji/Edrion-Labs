import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import { DATABASE } from './tokens';
import { RedisService } from './redis/redis.service';

export interface IdempotentResult<T> {
  result: T;
  replayed: boolean;
}

/** TTL for the Redis replay cache. The DB row is durable; Redis only accelerates hot replays. */
const REDIS_RESULT_TTL_SECONDS = 24 * 60 * 60;
const redisResultKey = (key: string) => `idem:res:${key}`;

/**
 * Replay protection for financial mutations, Redis-fronted with the table as the durable source
 * of truth. The first request for a given Idempotency-Key claims the key (DB) and runs the
 * operation; a retry returns the stored response instead of double-charging. A still-in-flight
 * duplicate is rejected. Completed results are cached in Redis so the common retry path is served
 * without touching Postgres; if Redis is down everything still works off the table.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly redis: RedisService,
  ) {}

  async run<T extends Record<string, unknown>>(
    key: string | undefined,
    scope: string,
    fn: () => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    if (!key) {
      // No key supplied — run without replay protection (callers requiring it validate upstream).
      return { result: await fn(), replayed: false };
    }

    // Fast path: a previously completed result cached in Redis — replay without hitting the DB.
    const cached = await this.redis.get(redisResultKey(key));
    if (cached) {
      try {
        return { result: JSON.parse(cached) as T, replayed: true };
      } catch {
        /* corrupt cache entry — fall through to the durable table path */
      }
    }

    const claimed = await this.db
      .insert(schema.idempotencyKeys)
      .values({ key, scope, status: 'in_progress' })
      .onConflictDoNothing({ target: schema.idempotencyKeys.key })
      .returning();

    if (claimed.length === 0) {
      const [existing] = await this.db
        .select()
        .from(schema.idempotencyKeys)
        .where(eq(schema.idempotencyKeys.key, key))
        .limit(1);
      if (existing?.status === 'completed' && existing.responseBody) {
        // Warm the Redis cache so subsequent replays skip the DB.
        await this.redis.set(
          redisResultKey(key),
          JSON.stringify(existing.responseBody),
          REDIS_RESULT_TTL_SECONDS,
        );
        return { result: existing.responseBody as T, replayed: true };
      }
      throw new ConflictException({
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'A request with this idempotency key is already being processed.',
      });
    }

    try {
      const result = await fn();
      await this.db
        .update(schema.idempotencyKeys)
        .set({
          status: 'completed',
          responseStatus: 200,
          responseBody: result,
          entityId: typeof result.id === 'string' ? result.id : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.idempotencyKeys.key, key));
      // Cache the completed result for fast future replays (DB row remains authoritative).
      await this.redis.set(redisResultKey(key), JSON.stringify(result), REDIS_RESULT_TTL_SECONDS);
      return { result, replayed: false };
    } catch (err) {
      // Release the claim so a genuine retry can proceed after a transient failure.
      await this.db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, key));
      throw err;
    }
  }
}
