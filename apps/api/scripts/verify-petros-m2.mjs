// Disposable databases only; never dotenv, application bootstrap or configured target arguments.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv.length !== 2) throw new Error('M2_TARGET_ARGUMENTS_REFUSED');
if (process.versions.node.split('.')[0] !== '24') throw new Error('M2_REQUIRES_NODE_24');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  api = resolve(root, 'apps/api');
const env = { NODE_ENV: 'test', PETROS_M2_DB_TESTS: '1', LC_ALL: 'C', LANG: 'C' };
for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'])
  if (process.env[k]) env[k] = process.env[k];
execFileSync(
  process.execPath,
  [
    resolve(api, 'node_modules/vitest/vitest.mjs'),
    'run',
    'src/modules/integrations/petros-m2-document-understanding.integration.spec.ts',
    '--reporter=default',
    '--reporter=json',
    '--outputFile=../../docs/verification/petros-v2/m2/database-tests.json',
  ],
  { cwd: api, env, stdio: 'inherit' },
);
