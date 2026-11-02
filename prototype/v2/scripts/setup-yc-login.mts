import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import {
  hashPreviewPassword,
  verifyPreviewPassword,
} from '../server/preview-credentials';

const root = new URL('../', import.meta.url);
const localFile = new URL('.env.local', root);
const recordFile = new URL('.env.yc.local', root);
const text = await readFile(localFile, 'utf8').catch(() => '');
const parse = (s: string) =>
  Object.fromEntries(
    s.split('\n').flatMap((line) => {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
    }),
  );
const local = parse(text),
  record = parse(await readFile(recordFile, 'utf8').catch(() => ''));
const rotate = process.argv.includes('--rotate');
const username = local.PETROS_V2_YC_USERNAME || 'petros-guest';
let password = record.YC_REVIEWER_PASSWORD;
let passwordHash = local.PETROS_V2_YC_PASSWORD_HASH;
if (passwordHash && !rotate) {
  if (!password || !(await verifyPreviewPassword(password, passwordHash)))
    throw Error(
      'YC access already exists without a matching local credential record. Use --rotate only to replace it intentionally.',
    );
} else {
  password = `Petros-${randomBytes(15).toString('base64url')}`;
  passwordHash = await hashPreviewPassword(password);
}
const values: Record<string, string> = {
  NODE_VERSION: '22',
  PETROS_V2_ACCESS_SECRET:
    !rotate && local.PETROS_V2_ACCESS_SECRET?.length >= 32
      ? local.PETROS_V2_ACCESS_SECRET
      : randomBytes(32).toString('hex'),
  PETROS_V2_YC_USERNAME: username,
  PETROS_V2_YC_PASSWORD_HASH: passwordHash,
  UPSTASH_REDIS_REST_URL: local.UPSTASH_REDIS_REST_URL || '',
  UPSTASH_REDIS_REST_TOKEN: local.UPSTASH_REDIS_REST_TOKEN || '',
};
const managed = new Set(
  Object.keys(values).filter((key) => key !== 'NODE_VERSION'),
);
const preserved = text
  .split('\n')
  .filter((line) => !managed.has(line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1] ?? ''))
  .join('\n')
  .trimEnd();
await writeFile(
  localFile,
  `${preserved}\n${[...managed].map((key) => `${key}=${values[key]}`).join('\n')}\n`,
  { mode: 0o600 },
);
await writeFile(
  recordFile,
  `# Local credential record. Never commit or import this file into Netlify.\nYC_REVIEWER_USERNAME=${username}\nYC_REVIEWER_PASSWORD=${password}\n`,
  { mode: 0o600 },
);
const env =
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';
const deployFile = new URL('.env.netlify.local', root);
await writeFile(deployFile, env, { mode: 0o600 });
const detailsFile = new URL('YC_ACCESS_DETAILS.local.md', root);
await writeFile(
  detailsFile,
  `# Petros YC preview — private access details\n\nShare only the reviewer username and password below with YC reviewers.\n\n- Username: \`${username}\`\n- Password: \`${password}\`\n- Intended URL after deployment: https://petros-prototype.netlify.app/prototype\n\nThis is one shared reviewer account, with lesson progress stored separately in each browser.\n\n## Owner-only Netlify configuration\n\nImport the sibling file \`.env.netlify.local\` through Netlify’s environment-variable importer, then deploy the \`prototype\` branch using base directory \`prototype/v2\`. The values below include the session-signing secret and Redis REST URL/token; do not give them to reviewers.\n\n\`\`\`env\n${env}\`\`\`\n\nAI and the 3D world remain disabled. The OpenAI key has not been copied into this deployment file.\n${values.UPSTASH_REDIS_REST_URL && values.UPSTASH_REDIS_REST_TOKEN ? '' : '\nRedis credentials are not filled yet. Add them to .env.local and rerun this script; the same reviewer password will be preserved.\n'}`,
  { mode: 0o600 },
);
for (const file of [localFile, recordFile, deployFile, detailsFile])
  await chmod(file, 0o600);
console.log(
  JSON.stringify({
    configured: true,
    username,
    passwordHash: 'PBKDF2-HMAC-SHA256 / 600000 iterations',
    redisReady: !!(
      values.UPSTASH_REDIS_REST_URL && values.UPSTASH_REDIS_REST_TOKEN
    ),
    files: ['.env.netlify.local', 'YC_ACCESS_DETAILS.local.md'],
    secretsPrinted: false,
  }),
);
