// Developer-only verification. No dotenv, application bootstrap or target URL support.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

if (process.argv.length !== 2) throw new Error('M1_TARGET_ARGUMENTS_REFUSED');
if (process.versions.node.split('.')[0] !== '24') throw new Error('M1_REQUIRES_TESTED_NODE_24');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const api = resolve(root, 'apps/api');
const environment = {};
for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR']) if (process.env[name]) environment[name] = process.env[name];
Object.assign(environment, { LC_ALL: 'C', NODE_ENV: 'test', PETROS_M1_DB_TESTS: '1' });
execFileSync(process.execPath, [resolve(api, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/modules/integrations/petros-m1-foundations.integration.spec.ts',
  'src/modules/student/knowledge/petros-assessment-boundaries.spec.ts',
  '--reporter=json', '--outputFile=../../docs/verification/petros-v2/m1-evidence/database-tests.json'],
{ cwd: api, env: environment, stdio: 'inherit' });
process.stdout.write(readFileSync(resolve(root, 'docs/verification/petros-v2/m1-evidence/source-identity-demo.json'), 'utf8'));
