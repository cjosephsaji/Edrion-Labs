import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import IORedis from 'ioredis';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { RedisService } from '../../../common/redis/redis.service';
import { PetrosV2CommandWorker } from './petros-v2-command.worker';
import type { M4Fixture } from './petros-v2.fixture';
export async function m4IsolatedQueue(f: M4Fixture) {
  const directory = mkdtempSync(join(tmpdir(), 'petros-m4-redis-'));
  const port = await new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const p = (server.address() as { port: number }).port;
      server.close(() => resolve(p));
    });
  });
  let process: ChildProcess;
  async function start() {
    process = spawn(
      'redis-server',
      [
        '--port',
        String(port),
        '--bind',
        '127.0.0.1',
        '--save',
        '',
        '--appendonly',
        'no',
        '--dir',
        directory,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const log = createWriteStream(join(directory, 'redis.log'), { flags: 'a' });
    process.stdout!.pipe(log);
    process.stderr!.pipe(log);
    const client = new IORedis({
      host: '127.0.0.1',
      port,
      maxRetriesPerRequest: 1,
      connectTimeout: 100,
      enableOfflineQueue: false,
    });
    client.on('error', () => undefined);
    try {
      for (let i = 0; i < 50; i++) {
        try {
          if ((await client.ping()) === 'PONG') return;
        } catch { /* Retry while the private Redis process starts. */ }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('ISOLATED_REDIS_START_FAILED');
    } finally {
      client.disconnect();
    }
  }
  async function stop() {
    if (!process || process.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      process.once('exit', () => resolve());
      process.kill('SIGTERM');
    });
  }
  await start();
  const env = {
    ...f.env,
    REDIS_ENABLED: true,
    QUEUE_WORKERS_ENABLED: true,
    REDIS_URL: `redis://127.0.0.1:${port}`,
  };
  const jobs = new JobsService(env),
    redis = new RedisService(env),
    workers = new QueueWorkers(env, redis);
  const worker = new PetrosV2CommandWorker(f.sessions, f.assessment, jobs, workers);
  worker.onModuleInit();
  workers.onModuleInit();
  return {
    port,
    jobs,
    workers,
    worker,
    stop,
    start,
    close: async () => {
      worker.onModuleDestroy();
      await workers.onModuleDestroy();
      await jobs.onModuleDestroy();
      await redis.onModuleDestroy();
      await stop();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
