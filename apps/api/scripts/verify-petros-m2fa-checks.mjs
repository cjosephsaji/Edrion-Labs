// Local type, build and lint evidence. Never bootstraps the API or reads dotenv.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

if (process.argv.length !== 2) throw new Error('M2FA_TARGET_ARGUMENTS_REFUSED');
if (process.versions.node.split('.')[0] !== '24') throw new Error('M2FA_REQUIRES_NODE_24');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'docs/verification/petros-v2/m2fa-evidence');
mkdirSync(output, { recursive: true });
const environment = { NODE_ENV: 'test', LC_ALL: 'C', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'])
  if (process.env[key]) environment[key] = process.env[key];
const execute = promisify(execFile);
const results = [];
async function run(name, workspace, args) {
  const command = {
    name, cwd: resolve(root, workspace), executable: process.execPath,
    args, environment, startedAt: new Date().toISOString(),
  };
  const start = performance.now();
  let exitCode = 0, stdout = '', stderr = '';
  try {
    ({ stdout, stderr } = await execute(process.execPath, args, {
      cwd: command.cwd, env: environment, encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024, timeout: 180_000,
    }));
  } catch (error) {
    exitCode = typeof error.code === 'number' ? error.code : 1;
    stdout = String(error.stdout ?? '');
    stderr = String(error.stderr ?? error.message);
  }
  writeFileSync(resolve(output, name + '.log'), stdout + stderr);
  results.push({ ...command, exitCode, durationMs: performance.now() - start });
  process.stdout.write(`${name}: exit ${exitCode}\n`);
}

const typechecks = await Promise.allSettled([
  ['api', 'apps/api'], ['schema', 'packages/schemas'],
  ['evaluation', 'packages/learn-evals'], ['student', 'apps/student-web'],
  ['portal', 'apps/institution-web'],
].map(([name, workspace]) => run(
  `final-${name}-typecheck`, workspace,
  [resolve(root, workspace, 'node_modules/typescript/bin/tsc'), '--noEmit'],
)));
for (const result of typechecks)
  if (result.status === 'rejected') throw result.reason;

const typedFiles = [
  'apps/api/scripts/benchmark-petros-m2fa.ts',
  'apps/api/scripts/inspect-petros-m2.ts',
  'apps/api/src/modules/integrations/petros-m2-document-understanding.integration.spec.ts',
  'apps/api/src/modules/petros-ai-routing/petros-ai-routing.repository.ts',
  'apps/api/src/modules/student/knowledge/adapters/content-adapter.ts',
  'apps/api/src/modules/student/knowledge/adapters/native-file.adapter.ts',
  'apps/api/src/modules/student/knowledge/adapters/native-file-security.spec.ts',
  'apps/api/src/modules/student/knowledge/adapters/m2fa-test-fixtures.ts',
  ...['docx', 'txt', 'markdown'].flatMap(format => [
    `apps/api/src/modules/student/knowledge/adapters/${format}-content.adapter.ts`,
    `apps/api/src/modules/student/knowledge/adapters/${format}-content.adapter.spec.ts`,
  ]),
  ...[
    'knowledge-document.module', 'knowledge-pdf-process',
    'petros-content-intelligence.service', 'petros-content-interpretation',
    'petros-content-unit.repository', 'petros-m2-test-helpers',
    'petros-content-format-expansion.spec',
  ].map(name => `apps/api/src/modules/student/knowledge/${name}.ts`),
  'packages/schemas/src/petros-v2/content.ts',
  'packages/learn-evals/src/petros-v2/format-expansion-a.ts',
];
await run('final-focused-lint', '.', [
  resolve(root, 'node_modules/eslint/bin/eslint.js'), ...typedFiles,
  '--max-warnings=0',
]);
await run('final-api-build', 'apps/api', [
  resolve(root, 'apps/api/node_modules/typescript/bin/tsc'),
  '-p', 'tsconfig.build.json',
]);
if (results.find(result => result.name === 'final-api-build')?.exitCode === 0)
  await run('final-api-build-assets', 'apps/api', ['scripts/copy-build-assets.mjs']);
writeFileSync(resolve(output, 'final-checks.json'), JSON.stringify({
  node: process.version, commands: results,
  success: results.every(result => result.exitCode === 0),
  configuredConnections: 0, providerRequests: 0,
}, null, 2) + '\n');
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1;
