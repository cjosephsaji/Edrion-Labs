import { describe, expect, it } from 'vitest';
import { MeasurePetrosRuntime, petrosRuntimeMetrics } from './petros-runtime-metrics';
describe('bounded private-content-free owner latency',()=>{
 it('retains a bounded distribution and counts failures without retaining arguments',async()=>{
  class Owner{
   @MeasurePetrosRuntime('retrieval_search')
   async search(privateContent:string,fail=false){if(fail)throw new Error(privateContent);return privateContent;}
  }
  const before=petrosRuntimeMetrics().operations.find(r=>r.operation==='retrieval_search')!;
  const owner=new Owner();
  for(let i=0;i<515;i++)await owner.search('PRIVATE SOURCE TEXT');
  await expect(owner.search('PRIVATE ERROR TEXT',true)).rejects.toThrow();
  const snapshot=petrosRuntimeMetrics(),row=snapshot.operations.find(r=>r.operation==='retrieval_search')!;
  expect(row).toMatchObject({recentSamples:512,totalSamples:before.totalSamples+516,totalFailures:before.totalFailures+1});
  expect(row.p95Ms).toBeGreaterThanOrEqual(row.p50Ms!);
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');expect(snapshot.productionSloAccepted).toBe(false);
 });
});
