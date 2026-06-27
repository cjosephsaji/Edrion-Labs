// Phase 10b queue round-trip proof. Enqueues a `system.ping` job onto the `maintenance` queue
// and waits for the running API's BullMQ worker to set the Redis marker. Run from the repo root:
//   node scripts/queue-proof.mjs
// Prints JOB_OK / JOB_FAIL and exits 0 / 1.
//
// bullmq/ioredis are installed under apps/api (pnpm isolates per package), so resolve them from
// there rather than the workspace root.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
const conn = new IORedis(url, { maxRetriesPerRequest: null });
const marker = `job:proof:${Date.now()}`;
const queue = new Queue('maintenance', { connection: conn });

const job = await queue.add('system.ping', { marker });
process.stderr.write(`enqueued job ${job.id} marker=${marker}\n`);

let result = null;
for (let i = 0; i < 50; i++) {
  result = await conn.get(marker);
  if (result) break;
  await new Promise((r) => setTimeout(r, 100));
}

process.stdout.write(result === 'done' ? 'JOB_OK' : 'JOB_FAIL');
await queue.close();
await conn.quit();
process.exit(result === 'done' ? 0 : 1);
