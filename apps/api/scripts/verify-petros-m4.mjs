/** No dotenv or configured database/Redis targets. Fixture allocates private PostgreSQL and Redis. */
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (
  !process.versions.node.startsWith('24.') ||
  process.argv.length !== 2 ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_MIGRATION_URL ||
  Object.keys(process.env).some((k) => k.startsWith('PG') && process.env[k])
)
  throw Error('M4_ISOLATED_NODE24_ENVIRONMENT_REQUIRED');
const api = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  root = resolve(api, '../..');
const timestamp = new Date()
  .toISOString()
  .replaceAll(/[-:]/g, '')
  .replace(/\.\d+Z/, 'Z');
const out = resolve(root, 'docs/verification/petros-v2', `m4-replay-${timestamp}`);
mkdirSync(out);
const args = [
  'node_modules/vitest/vitest.mjs',
  'run',
  'src/modules/student/petros-v2',
  '--no-file-parallelism',
  '--testTimeout=30000',
  '--reporter=default',
  '--reporter=json',
  `--outputFile=${out}/m4.json`,
];
const log = createWriteStream(resolve(out, 'm4.log'), { flags: 'wx' });
writeFileSync(
  resolve(out, 'command.json'),
  JSON.stringify(
    {
      cwd: api,
      executable: process.execPath,
      args,
      environment: { PETROS_M4_DB_TESTS: '1', PETROS_M4_EVIDENCE_DIR: out },
      description:
        'Synthetic institutional fixtures only; no configured migrations or paid providers.',
    },
    null,
    2,
  ),
);
const child = spawn(process.execPath, args, {
  cwd: api,
  env: { ...process.env, PETROS_M4_DB_TESTS: '1', PETROS_M4_EVIDENCE_DIR: out },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(log);
child.stderr.pipe(log);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('exit', (code) => {
  log.end();
  process.exitCode = code ?? 1;
  console.log(`Evidence: ${out}`);
});
