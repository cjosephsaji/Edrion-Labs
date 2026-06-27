// Enqueue a one-off maintenance job by name onto the `maintenance` queue (Phase 10e proof).
// Usage: node scripts/enqueue-maintenance.mjs support-session.expiry
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const jobName = process.argv[2] ?? 'support-session.expiry';
const conn = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const queue = new Queue('maintenance', { connection: conn });
const job = await queue.add(jobName, {});
process.stdout.write(`enqueued ${jobName} as job ${job.id}\n`);
await queue.close();
await conn.quit();
