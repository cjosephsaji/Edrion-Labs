import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const output=resolve(root,'docs/verification/petros-v2/m3-teacher-ux-final-evidence');
const receipts=[];
for(const suite of ['m3','m2','compatibility']) {
  const args=[resolve(root,'apps/api/scripts/verify-petros-m3-teacher-ux-final.mjs'),`--suite=${suite}`];
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
  writeFileSync(resolve(output,`closing-${suite}.log`),String(result.stdout??'')+String(result.stderr??''));
  receipts.push({suite,executable:process.execPath,args,status:result.status,signal:result.signal});
  writeFileSync(resolve(output,'closing-commands.json'),JSON.stringify(receipts,null,2));
  console.log(JSON.stringify(receipts.at(-1)));
  if(result.status!==0){process.exitCode=1;break;}
}
