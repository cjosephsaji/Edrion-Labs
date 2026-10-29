import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.argv.length!==2)throw new Error('M2_TARGET_ARGUMENTS_REFUSED');
if(process.versions.node.split('.')[0]!=='24')throw new Error('M2_REQUIRES_NODE_24');
const api=resolve(dirname(fileURLToPath(import.meta.url)),'..'),env={NODE_ENV:'test',LC_ALL:'C',LANG:'C'};
for(const k of ['PATH','HOME','USER','LOGNAME','TMPDIR'])if(process.env[k])env[k]=process.env[k];
execFileSync(process.execPath,['-r',resolve(api,'node_modules/ts-node/register/transpile-only'),'-r',resolve(api,'node_modules/tsconfig-paths/register'),resolve(api,'scripts/benchmark-petros-m2.ts')],{cwd:api,env,stdio:'inherit'});
