import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../tokens';

/**
 * Thin Redis wrapper for the rate limiter, idempotency fast-path and queue connections.
 *
 * Fail-open by design: every method degrades gracefully when Redis is disabled or unreachable so
 * a Redis outage never takes the control plane down. Callers that need a hard guarantee (the
 * idempotency durable record) keep the database as the source of truth — Redis is only the fast
 * front. `REDIS_ENABLED=false` turns the whole thing off for local/offline work.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;
  private healthy = true;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    if (!env.REDIS_ENABLED) {
      this.client = null;
      return;
    }
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      // Fail fast instead of buffering commands forever when the server is gone.
      enableOfflineQueue: false,
    });
    this.client.on('error', () => {
      this.healthy = false;
    });
    this.client.on('ready', () => {
      this.healthy = true;
    });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Atomically increment a fixed-window counter, setting the TTL on first hit. Returns the new
   * count, or null when Redis is unavailable (callers fail-open — allow the request).
   */
  async incrementWindow(key: string, ttlSeconds: number): Promise<number | null> {
    if (!this.client || !this.healthy) return null;
    try {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, ttlSeconds);
      return count;
    } catch {
      return null;
    }
  }

  /** Seconds until a key expires (for Retry-After). 0/undefined when unknown. */
  async ttl(key: string): Promise<number> {
    if (!this.client || !this.healthy) return 0;
    try {
      const t = await this.client.ttl(key);
      return t > 0 ? t : 0;
    } catch {
      return 0;
    }
  }

  /** SET key=value only if absent, with TTL. Returns true when the caller won the claim. */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client || !this.healthy) return false;
    try {
      const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.healthy) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client || !this.healthy) return;
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch {
      /* fail-open */
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.healthy) return;
    try {
      await this.client.del(key);
    } catch {
      /* fail-open */
    }
  }

  async incr(key: string): Promise<number | null> {
    if (!this.client || !this.healthy) return null;
    try {
      return await this.client.incr(key);
    } catch {
      return null;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.client || !this.healthy) return;
    try {
      await this.client.expire(key, ttlSeconds);
    } catch {
      /* fail-open */
    }
  }

  async getInt(key: string): Promise<number | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /** Append a JSON-serialized value to a list and refresh TTL. Returns new list length or null. */
  async jsonListAppend(key: string, value: unknown, ttlSeconds: number): Promise<number | null> {
    if (!this.client || !this.healthy) return null;
    try {
      const len = await this.client.rpush(key, JSON.stringify(value));
      await this.client.expire(key, ttlSeconds);
      return len;
    } catch {
      return null;
    }
  }

  /** Read list entries [start, end] (inclusive). Returns null when Redis is unavailable. */
  async jsonListRange(key: string, start: number, end: number): Promise<unknown[] | null> {
    if (!this.client || !this.healthy) return null;
    try {
      const rows = await this.client.lrange(key, start, end);
      return rows.map((row) => {
        try {
          return JSON.parse(row) as unknown;
        } catch {
          return row;
        }
      });
    } catch {
      return null;
    }
  }

  /**
   * Atomically acquire a student AI quota slot. Idempotent on `idempotencyKey` so BullMQ retries
   * do not double-charge. Returns null when Redis is unavailable (fail-open).
   */
  async acquireStudentQuota(opts: {
    globalKey: string;
    scopeKey: string;
    idempotencyKey: string;
    globalLimit: number;
    scopeLimit: number;
    ttlSeconds: number;
  }): Promise<{
    allowed: boolean;
    globalUsed: number;
    scopeUsed: number;
    deduplicated: boolean;
  } | null> {
    if (!this.client || !this.healthy) return null;
    const script = `
      local idemKey = KEYS[3]
      local existing = redis.call('GET', idemKey)
      if existing then
        local parsed = cjson.decode(existing)
        parsed.deduplicated = 1
        return { parsed.allowed, parsed.globalUsed, parsed.scopeUsed, 1 }
      end
      local globalCount = tonumber(redis.call('GET', KEYS[1]) or '0')
      local scopeCount = tonumber(redis.call('GET', KEYS[2]) or '0')
      local globalLimit = tonumber(ARGV[1])
      local scopeLimit = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])
      if globalCount >= globalLimit or scopeCount >= scopeLimit then
        local denied = cjson.encode({ allowed = 0, globalUsed = globalCount, scopeUsed = scopeCount })
        redis.call('SET', idemKey, denied, 'EX', ttl)
        return { 0, globalCount, scopeCount, 0 }
      end
      local newGlobal = redis.call('INCR', KEYS[1])
      if newGlobal == 1 then redis.call('EXPIRE', KEYS[1], ttl) end
      local newScope = redis.call('INCR', KEYS[2])
      if newScope == 1 then redis.call('EXPIRE', KEYS[2], ttl) end
      local granted = cjson.encode({ allowed = 1, globalUsed = newGlobal, scopeUsed = newScope })
      redis.call('SET', idemKey, granted, 'EX', ttl)
      return { 1, newGlobal, newScope, 0 }
    `;
    try {
      const result = (await this.client.eval(
        script,
        3,
        opts.globalKey,
        opts.scopeKey,
        opts.idempotencyKey,
        String(opts.globalLimit),
        String(opts.scopeLimit),
        String(opts.ttlSeconds),
      )) as [number, number, number, number];
      return {
        allowed: result[0] === 1,
        globalUsed: result[1],
        scopeUsed: result[2],
        deduplicated: result[3] === 1,
      };
    } catch {
      return null;
    }
  }

  /** Liveness probe for System Health. */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => undefined);
  }
}
