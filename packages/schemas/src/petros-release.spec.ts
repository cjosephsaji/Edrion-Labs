import { describe, expect, it } from 'vitest';
import { PETROS_PRODUCTION_QUALITY_GATES, petrosProductionQualityReportSchema, petrosReleaseBundleSchema, petrosPilotEventSchema } from './petros-release';
const id='12345678-1234-4234-8234-123456789abc', other='12345678-1234-4234-8234-123456789abd', hash='a'.repeat(64);
const identities={application:hash,migrations:hash,sourcePack:hash,promptSchema:hash,policy:hash,modelRouting:hash,fixtures:hash,evaluator:hash};
const report=()=>({schemaVersion:'petros.production-quality.v1',id,environment:'disposable_synthetic',runtime:'production_owners',identities,fixtureVersion:'fixture.v1',evaluatorVersion:'assertions.v1',createdAt:'2026-10-03T00:00:00.000Z',expiresAt:'2026-10-04T00:00:00.000Z',checks:PETROS_PRODUCTION_QUALITY_GATES.map(gate=>({gate,layer:'deterministic',status:'pass',samples:1,evidenceSha256:hash})),accounting:{attempts:3,failed:1,cancelled:1,costMicros:20,maxCostMicros:30,openReservations:0,reconciled:true,evidenceSha256:hash},educatorAcceptance:'pending',pilotAcceptance:'pending'});
describe('Phase5 release evidence authority contracts',()=>{
 it('requires every distinct deterministic gate and bounded reconciled accounting',()=>{
  expect(petrosProductionQualityReportSchema.safeParse(report()).success).toBe(true);
  for(const mutation of [ {...report(),checks:report().checks.slice(1)}, {...report(),checks:[...report().checks,report().checks[0]]}, {...report(),accounting:{...report().accounting,openReservations:1}}, {...report(),accounting:{...report().accounting,cancelled:3}}, {...report(),expiresAt:'2026-12-04T00:00:00.000Z'} ]) expect(petrosProductionQualityReportSchema.safeParse(mutation).success).toBe(false);
 });
 it('cannot substitute educator approval, freeform private text or another runtime',()=>{
  for(const mutation of [{...report(),educatorAcceptance:'approved'},{...report(),pilotAcceptance:'approved'},{...report(),runtime:'separate_evaluator'},{...report(),conversation:'private'}]) expect(petrosProductionQualityReportSchema.safeParse(mutation).success).toBe(false);
 });
 it('requires distinct rollback identity and permanently disabled admissions',()=>{
  const bundle={schemaVersion:'petros.release-bundle.v1',id,identities,evaluationId:id,createdAt:report().createdAt,expiresAt:report().expiresAt,functions:[{functionId:id,versionId:id,rollbackVersionId:other,candidateSha256:hash,rollbackSha256:hash,configurationSha256:hash}],admissions:'disabled',externalAcceptance:'pending'};
  expect(petrosReleaseBundleSchema.safeParse(bundle).success).toBe(true);
  for(const mutation of [{...bundle,admissions:'enabled'},{...bundle,functions:[...bundle.functions,...bundle.functions]},{...bundle,functions:[{...bundle.functions[0],rollbackVersionId:id}]}]) expect(petrosReleaseBundleSchema.safeParse(mutation).success).toBe(false);
 });
 it('accepts only coarse allowlisted pilot events, never learner content or identifiers',()=>{
  const event={schemaVersion:'petros.pilot-event.v1',eventId:id,journeyId:id,experiment:'synthetic.v1',event:'recovery_shown',outcome:'unavailable',durationBucket:null,connectivity:'intermittent'};
  expect(petrosPilotEventSchema.safeParse(event).success).toBe(true);
  for(const key of ['text','draft','memory','studentId','age','email','score']) expect(petrosPilotEventSchema.safeParse({...event,[key]:'private'}).success).toBe(false);
 });
});
