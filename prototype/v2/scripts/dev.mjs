import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Explicit development helper: import only the OpenAI credential, never academic/database configuration.
const env = { ...process.env, PETROS_V2_LOCAL_ONLY: '1' };
// An explicitly blank prototype key is intentional; never refill it from the platform credential.
for (const path of [new URL('../.env.local', import.meta.url), new URL('../../../.env', import.meta.url)]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^(OPENAI_API_KEY|PETROS_V2_TEACHER_MODEL|PETROS_V2_VOICE_MODEL)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'dev',
    '--webpack',
    '-H',
    '127.0.0.1',
    '-p',
    '3022',
  ],
  { cwd: new URL('..', import.meta.url), env, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 1));
