import { performance } from 'node:perf_hooks';

type Operation='retrieval_search'|'source_resolve'|'teaching_continue';
const rings=new Map<Operation,Array<{ms:number;failed:boolean}>>();
const totals=new Map<Operation,{samples:number;failed:number}>();
const LIMIT=512;
/** Bounded process-local telemetry; arguments, owner IDs and content are never inspected. */
export function MeasurePetrosRuntime(operation:Operation): MethodDecorator {
 return (_target,_name,descriptor:PropertyDescriptor)=>{
  const original=descriptor.value as (...args:unknown[])=>Promise<unknown>;
  descriptor.value=async function(this:unknown,...args:unknown[]){
   const started=performance.now();let failed=false;
   try{return await original.apply(this,args);}catch(error){failed=true;throw error;}
   finally{
    const ring=rings.get(operation)??[];ring.push({ms:Math.max(0,performance.now()-started),failed});if(ring.length>LIMIT)ring.shift();rings.set(operation,ring);
    const total=totals.get(operation)??{samples:0,failed:0};total.samples++;if(failed)total.failed++;totals.set(operation,total);
   }
  };
 };
}
export function petrosRuntimeMetrics(){
 return {scope:'process_since_start',maxSamplesPerOperation:LIMIT,productionSloAccepted:false,
  limitation:'Recent completed owner calls in this API process; restarts clear samples. Concurrent replicas must be aggregated by the operational telemetry sink.',
  operations:(['retrieval_search','source_resolve','teaching_continue'] as const).map(operation=>{
   const samples=rings.get(operation)??[],sorted=samples.map(v=>v.ms).sort((a,b)=>a-b),total=totals.get(operation)??{samples:0,failed:0};
   const percentile=(p:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]!:null;
   return {operation,totalSamples:total.samples,totalFailures:total.failed,recentSamples:samples.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:sorted.at(-1)??null};
  })};
}
