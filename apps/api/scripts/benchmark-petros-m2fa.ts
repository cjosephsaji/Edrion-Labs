import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, platform, arch, release } from 'node:os';
import { KnowledgePdfProcess } from '../src/modules/student/knowledge/knowledge-pdf-process';
import { DocxContentAdapter } from '../src/modules/student/knowledge/adapters/docx-content.adapter';
import { TxtContentAdapter } from '../src/modules/student/knowledge/adapters/txt-content.adapter';
import { MarkdownContentAdapter } from '../src/modules/student/knowledge/adapters/markdown-content.adapter';
import { representationHash } from '../src/modules/student/knowledge/petros-content-intelligence.service';
import type { ExtractionMetrics } from '../src/modules/student/knowledge/adapters/content-adapter';
if(process.env.DATABASE_URL||process.env.DATABASE_MIGRATION_URL||Object.keys(process.env).some(k=>k.startsWith('PG')))throw new Error('M2FA_CONFIGURED_TARGET_REFUSED');
const root=resolve(__dirname,'../../..'),worker=new KnowledgePdfProcess();
(async()=>{
 const results=[];
 for(const [format,name,adapter]of [
  ['docx','cloud-notes.docx',new DocxContentAdapter(worker)],['txt','cloud-notes.txt',new TxtContentAdapter(worker)],['markdown','argument-notes.md',new MarkdownContentAdapter(worker)],
 ] as const) {
  const bytes=readFileSync(resolve(root,'packages/learn-evals/src/petros-v2/fixtures/sources/m2fa',name)),samples=[];let pin:string|undefined;
  for(let i=0;i<20;i++) {
   let metrics:ExtractionMetrics|undefined;const start=performance.now();
   const e=await adapter.extract(bytes,new AbortController().signal,()=>{},m=>{metrics=m;});
   const hash=representationHash(e);if(pin&&pin!==hash)throw new Error('M2FA_NONDETERMINISTIC');pin=hash;
   samples.push({...metrics,totalMs:performance.now()-start,characters:e.elements.reduce((n,x)=>n+x.text.length,0),units:e.elements.length,evidenceBytes:Buffer.byteLength(JSON.stringify(e))});
  }
  const percentile=(key:keyof typeof samples[number])=>{const values=samples.map(s=>Number(s[key])).sort((a,b)=>a-b);return values[Math.ceil(values.length*.95)-1];};
  results.push({format,name,sampleCount:samples.length,p95TotalMs:percentile('totalMs'),p95ValidationMs:percentile('validationMs'),p95ParseMs:percentile('parseMs'),p95StructuralMs:percentile('structuralMs'),maxOsReportedParserRssKiB:Math.max(...samples.map(s=>s.selfPeakRssKiB??0)),maxSampledRssKiB:Math.max(...samples.map(s=>s.peakRssKiB??0)),samples,
   interpretation:'not_run',ocr:'not_run',rendering:'native_structure_only',queue:'see_restricted_database_queue_samples'});
 }
 writeFileSync(resolve(root,'docs/verification/petros-v2/m2fa-evidence/performance.json'),JSON.stringify({environment:{node:process.version,platform:platform(),arch:arch(),os:release(),cpu:cpus()[0]?.model,concurrency:1,process:'credential-free OS sandbox',rss:'100ms process-tree sampling; not an instrumented instantaneous peak'},providerRequests:0,results},null,2));
 process.stdout.write(JSON.stringify(results.map(r=>({format:r.format,n:r.sampleCount,p95Ms:r.p95TotalMs,rssKiB:r.maxSampledRssKiB})))+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
