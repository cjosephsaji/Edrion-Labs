// Isolated M3 regressions. Preserve historical artifacts even when upstream tests write to them.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const selection=process.argv[2]??'--suite=all';
if(process.argv.length>3||!['--suite=all','--suite=regression','--suite=m2','--suite=authority','--suite=m3'].includes(selection))throw new Error('M3_TARGET_ARGUMENTS_REFUSED');
if(process.versions.node.split('.')[0]!=='24')throw new Error('M3_REQUIRES_NODE_24');
for(const key of Object.keys(process.env))if((key.startsWith('PG')||['DATABASE_URL','DATABASE_MIGRATION_URL','DATABASE_RUNTIME_URL'].includes(key))&&process.env[key])throw new Error('M3_CONFIGURED_DATABASE_TARGET_REFUSED');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/verification/petros-v2/m3-evidence/verification-runs',new Date().toISOString().replaceAll(':','-'));
mkdirSync(output,{recursive:true});
const protectedPaths=[
  'docs/verification/petros-v2/m1-evidence/repository-query-behavior.json',
  'docs/verification/petros-v2/m1-evidence/source-identity-demo.json',
  'docs/verification/petros-v2/m2/database-evidence.json',
  'docs/verification/petros-v2/m2fa-evidence/database-evidence.json',
];
const visual='docs/verification/petros-v2/m2g-2026-10-13/visual';
for(const name of readdirSync(resolve(root,visual)).filter(name=>!name.startsWith('._')))protectedPaths.push(`${visual}/${name}`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const preserved=protectedPaths.filter(path=>existsSync(resolve(root,path))).map(path=>({path,bytes:readFileSync(resolve(root,path))}));
// Keep recoverable copies on disk before launching tests, including on interruption.
for(const file of preserved){const target=resolve(output,'preserved-before',file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file.bytes);}
const env={NODE_ENV:'test',LC_ALL:'C',LANG:'C'};
for(const key of ['PATH','HOME','USER','LOGNAME','TMPDIR'])if(process.env[key])env[key]=process.env[key];
const commands=[];
function run(workspace,name,files=[],flags={}) {
  const workers=['authority-regression-tests','student-regression-tests'].includes(name)?1:2;
  const bounds=name==='authority-regression-tests'?['--testTimeout=15000']:[];
  const cwd=resolve(root,workspace),args=[resolve(cwd,'node_modules/vitest/vitest.mjs'),'run',...files,`--maxWorkers=${workers}`,'--minWorkers=1',...bounds,'--reporter=default','--reporter=json',`--outputFile=${resolve(output,`${name}.json`)}`];
  commands.push({cwd:relative(root,cwd),executable:process.execPath,args,environment:{NODE_ENV:'test',...flags}});
  try{writeFileSync(resolve(output,`${name}.log`),execFileSync(process.execPath,args,{cwd,env:{...env,...flags},encoding:'utf8',maxBuffer:64*1024*1024}));}
  catch(error){writeFileSync(resolve(output,`${name}.log`),String(error.stdout??'')+String(error.stderr??''));throw error;}
}
try {
  if(['--suite=all','--suite=regression'].includes(selection))run('apps/api','api-regression-tests');
  if(['--suite=all','--suite=m3'].includes(selection)) {
    run('apps/api','proposal-tests',['src/modules/portal/teaching/petros-learning-proposal.spec.ts']);
    run('apps/api','m3-database-tests',['src/modules/integrations/petros-m3-gateway.integration.spec.ts','src/modules/integrations/petros-m3-learning-proposals.integration.spec.ts','src/modules/integrations/petros-m3-private-review.integration.spec.ts'],{PETROS_M3_DB_TESTS:'1'});
    run('apps/institution-web','ui-tests');
  }
  if(['--suite=all','--suite=regression','--suite=authority'].includes(selection))run('apps/api','authority-regression-tests',[
    'src/modules/integrations/petros-m1-foundations.integration.spec.ts','src/modules/integrations/petros-assignment-authority.integration.spec.ts',
    'src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts'],{PETROS_M1_DB_TESTS:'1',PETROS_LOCAL_DB_TESTS:'1'});
  if(['--suite=all','--suite=regression','--suite=m2'].includes(selection))run('apps/api','m2-regression-tests',['src/modules/integrations/petros-m2-document-understanding.integration.spec.ts'],{PETROS_M2_DB_TESTS:'1',PETROS_M2G_TESTS:'1',PETROS_M2FA_TESTS:'1'});
  if(['--suite=all','--suite=regression'].includes(selection))for(const [workspace,name] of [['packages/schemas','schema-regression-tests'],['apps/student-web','student-regression-tests'],['packages/learn-evals','evals-regression-tests']])run(workspace,name);
} finally {
  const restoration=[];
  for(const file of preserved){
    const path=resolve(root,file.path),generated=readFileSync(path),changed=hash(generated)!==hash(file.bytes);
    if(changed){const target=resolve(output,'upstream-generated',file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,generated);}
    writeFileSync(path,file.bytes);
    restoration.push({path:file.path,upstreamWroteArtifact:changed,beforeHash:hash(file.bytes),afterHash:hash(readFileSync(path))});
  }
  writeFileSync(resolve(output,'historical-preservation.json'),JSON.stringify(restoration,null,2)+'\n');
  writeFileSync(resolve(output,'commands.json'),JSON.stringify(commands,null,2)+'\n');
  console.log(`M3 verification artifacts: ${output}`);
  if(restoration.some(row=>row.beforeHash!==row.afterHash))throw new Error('M3_HISTORICAL_RESTORE_FAILED');
}
