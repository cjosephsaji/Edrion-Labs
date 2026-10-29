// M2-F-A isolated selected regressions. Never reads dotenv or accepts target arguments.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) throw new Error('M2FA_TARGET_ARGUMENTS_REFUSED');
if (process.versions.node.split('.')[0] !== '24') throw new Error('M2FA_REQUIRES_NODE_24');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'docs/verification/petros-v2/m2fa-evidence');
mkdirSync(output, { recursive: true });
const visualRoot=resolve(root,'docs/verification/petros-v2/m2g-2026-10-13/visual');
const preserved = [...['repository-query-behavior.json','source-identity-demo.json'].map(name=>resolve(root,'docs/verification/petros-v2/m1-evidence',name)),
  ...readdirSync(visualRoot).filter(name=>!name.startsWith('._')).map(name=>resolve(visualRoot,name))].map(path=>({path,bytes:readFileSync(path)}));
const env = { NODE_ENV: 'test', LC_ALL: 'C', LANG: 'C' };
for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR'])
  if (process.env[key]) env[key] = process.env[key];
const commands = [];
function run(workspace, name, files, flags = {}, testTimeout) {
  const cwd = resolve(root, workspace);
  const args = [
    resolve(cwd, 'node_modules/vitest/vitest.mjs'),
    'run',
    ...files,
    ...(name==='frontend-regression-tests' ? ['--maxWorkers=1','--minWorkers=1'] : []),
    ...(testTimeout ? [`--testTimeout=${testTimeout}`] : []),
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${resolve(output, name + '.json')}`,
  ];
  commands.push({ cwd, executable: process.execPath, args, environment: { ...env, ...flags } });
  try {
    const log = execFileSync(process.execPath, args, {
      cwd,
      env: { ...env, ...flags },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    writeFileSync(resolve(output, name + '.log'), log);
  } catch (error) {
    writeFileSync(
      resolve(output, name + '.log'),
      String(error.stdout ?? '') + String(error.stderr ?? ''),
    );
    throw error;
  }
}
try {
  run('apps/api', 'api-regression-tests', [
    'src/modules/student/knowledge/adapters/txt-content.adapter.spec.ts',
    'src/modules/student/knowledge/adapters/markdown-content.adapter.spec.ts',
    'src/modules/student/knowledge/adapters/docx-content.adapter.spec.ts',
    'src/modules/student/knowledge/adapters/native-file-security.spec.ts',
    'src/modules/student/knowledge/petros-content-format-expansion.spec.ts',
    'src/modules/student/knowledge/knowledge-document-retrieval.spec.ts',
    'src/modules/student/knowledge/knowledge-pdf-process.spec.ts',
    'src/modules/student/knowledge/petros-content-edge-cases.spec.ts',
    'src/modules/student/knowledge/petros-content-intelligence.spec.ts',
    'src/modules/student/knowledge/petros-content-interpretation.spec.ts',
    'src/modules/student/knowledge/petros-content-ocr.spec.ts',
    'src/modules/student/knowledge/petros-m2g-review.spec.ts',
    'src/modules/student/knowledge/petros-m2g-visual.spec.ts',
    'src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts',
    'src/modules/portal/teaching/petros-teacher-guidance-files.service.spec.ts',
    'src/modules/student/knowledge/petros-assessment-boundaries.spec.ts',
    'src/modules/petros-ai-routing/petros-ai-gateway.service.spec.ts',
    'src/modules/petros-ai-routing/petros-provider-adapters.spec.ts',
  ]);
  run(
    'apps/api',
    'database-tests',
    ['src/modules/integrations/petros-m2-document-understanding.integration.spec.ts'],
    { PETROS_M2_DB_TESTS: '1', PETROS_M2G_TESTS: '1',PETROS_M2FA_TESTS:'1' },
  );
  run(
    'apps/api',
    'm1-regression-tests',
    [
      'src/modules/integrations/petros-m1-foundations.integration.spec.ts',
    ],
    { PETROS_M1_DB_TESTS: '1' },
  );
  for (const file of preserved.filter(file=>!file.path.startsWith(visualRoot)))
    writeFileSync(
      resolve(output, `m1-current-${file.path.split('/').pop()}`),
      readFileSync(file.path),
    );
  run('apps/api','v1-source-regression-tests',['src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts'],{PETROS_LOCAL_DB_TESTS:'1'},20000);
  run('packages/schemas', 'schema-regression-tests', []);
  run('packages/learn-evals','evaluation-regression-tests',[]);
  run('apps/student-web', 'frontend-regression-tests', [
    'src/components/petros/use-petros-voice.spec.ts',
    'src/components/petros/petros-mentor.spec.tsx',
    'src/components/petros/material-preparation-status.spec.tsx',
    'src/components/petros/petros-document-door.spec.tsx',
    'src/components/petros/petros-document-study.spec.tsx',
    'src/features/learning-studio/integrals-teaching-studio.spec.tsx',
    'src/features/learning-studio/presentation-adapter.spec.ts',
    'src/features/learning-studio/use-teaching-playback.spec.tsx',
    'src/features/petros-v2/canvas/diagram-routing.spec.ts',
    'src/features/petros-v2/companion/companion-cloud.spec.tsx',
    'src/features/petros-v2/companion/companion-controller.spec.ts',
    'src/features/petros-v2/companion/companion-naturalness.spec.tsx',
    'src/features/petros-v2/playground/narration-playback.spec.ts',
    'src/features/petros-v2/playground/playback-refinement.spec.ts',
    'src/features/petros-v2/playground/practice-history.spec.ts',
    'src/features/petros-v2/playground/teaching-playground.spec.tsx',
    'src/features/petros-v2/playground/workspace-scroll.spec.ts',
    'src/features/petros-v2/voice/teaching-voice-controls.spec.tsx',
    'src/features/petros-v2/voice/voice-preview-audio.spec.ts',
    'src/features/petros-v2/voice/voice-preview.spec.tsx',
    'src/features/petros-v2/voice/voice-service-status.spec.ts',
    'src/app/(app)/petros/companion-playground/page.spec.tsx',
  ]);
} finally {
  const freshVisual=resolve(output,'historical-visual-regression-generated');mkdirSync(freshVisual,{recursive:true});
  for (const file of preserved) {
    if(file.path.startsWith(visualRoot))writeFileSync(resolve(freshVisual,file.path.split('/').pop()),readFileSync(file.path));
    writeFileSync(file.path,file.bytes);
  }
  writeFileSync(resolve(output, 'verification-commands.json'), JSON.stringify(commands, null, 2));
}
