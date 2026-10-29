'use strict';

const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { register } = require('tsconfig-paths');

const apiRoot = resolve(__dirname, '..');
const dist = join(apiRoot, 'dist');
process.chdir(apiRoot);
// main.ts retains dotenv override semantics, with an explicit release-root path.
process.env.EDRION_ENV_FILE = resolve(apiRoot, '../../.env');
register({
  baseUrl: dist,
  paths: JSON.parse(readFileSync(join(dist, 'runtime-paths.json'), 'utf8')),
});
require(join(dist, 'apps/api/src/main.js'));
