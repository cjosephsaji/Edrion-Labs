/** Loopback disposable M3 demo only; no configured database or provider. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {m3ProposalSchema,m3ActivityPreview} from '@edrion/schemas';
const out=resolve(__dirname,'../../../docs/verification/petros-v2/m3-evidence');
async function main(){
 const info=JSON.parse(readFileSync(resolve(out,'demo-info.json'),'utf8')),url=new URL(info.cloud);
 if(url.hostname!=='127.0.0.1'||url.port!=='4894')throw Error('M3_ISOLATED_DEMO_REQUIRED');
 const base=`http://127.0.0.1:4893/v1/portal${url.pathname}/proposals`,samples:Record<string,number[]>={};
 async function request(name:string,path:string,body?:unknown){const began=performance.now(),r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(`${name}:${r.status}`);(samples[name]??=[]).push(performance.now()-began);return data;}
 let sources;for(let n=0;n<3;n++)sources=await request('sourceListMs','/sources');
 const selected=sources.items.find((s:{format:string})=>s.format==='pptx');
 const view=await request('preparationAcknowledgmentMs','',{commandId:randomUUID(),sourceRevisionId:selected.revisionId});
 let current=view;for(let n=0;n<3;n++)current=await request('draftSaveMs',`/${current.proposal.id}/edits`,{commandId:randomUUID(),expectedVersion:current.proposal.version,change:{kind:'save'}});
 for(let n=0;n<3;n++)await request('eligibilityMs',`/${current.proposal.id}/readiness`);
 for(let n=0;n<50;n++){let began=performance.now();const p=m3ProposalSchema.parse(current.proposal);(samples['contractValidationMs']??=[]).push(performance.now()-began);began=performance.now();m3ActivityPreview(p,p.activities.find(a=>a.support[0]!.quote.length>=20)!.id);(samples['previewCompilationMs']??=[]).push(performance.now()-began);}
 const measured=Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{samples:v.length,median:v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)],min:Math.min(...v),max:Math.max(...v)}]));
 writeFileSync(resolve(out,'performance.json'),JSON.stringify({label:'Local disposable App-role engineering timings; no human usability claim',measured,preparationStages:view.preparationMetrics??null,actualProviderCalls:0,actualSpendingMicros:0},null,2));console.log(JSON.stringify(measured));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
