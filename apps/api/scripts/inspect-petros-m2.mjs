import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.versions.node.split('.')[0] !== '24') throw new Error('M2_REQUIRES_NODE_24');
const api = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { NODE_ENV: 'test', TS_NODE_PROJECT: resolve(api, 'tsconfig.json') };
for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'])
  if (process.env[k]) env[k] = process.env[k];
const child = spawn(
  process.execPath,
  [
    '-r',
    resolve(api, 'node_modules/ts-node/register/transpile-only'),
    '-r',
    resolve(api, 'node_modules/tsconfig-paths/register'),
    resolve(api, 'scripts/inspect-petros-m2.ts'),
    ...process.argv.slice(2),
  ],
  { cwd: api, env, stdio: 'inherit' },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
