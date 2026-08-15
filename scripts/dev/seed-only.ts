import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { closeDatabase, createDatabase } from '@edrion/database';
import { runDevSeed } from './seed/index.js';
import { printLoginSummary } from './seed/summary.js';
import type { DevSeedContext } from './seed/_context.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

async function clearTimetableCache(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  const redis = new Redis(redisUrl, {
    connectTimeout: 1_500,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'tt:*', 'COUNT', 100);
      if (keys.length) await redis.del(...keys);
      cursor = nextCursor;
    } while (cursor !== '0');
  } catch {
    // Redis is optional in local development; database seeding should still succeed without it.
  } finally {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDatabase({ url });
  const ctx: DevSeedContext = { db, logins: [] };
  try {
    const logins = await runDevSeed(ctx);
    await clearTimetableCache();
    printLoginSummary(logins);
    // eslint-disable-next-line no-console
    console.log('✓ Dev seed complete.');
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ db:seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
