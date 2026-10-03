import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { eq,runInStudentTenant, schema } from '@edrion/database';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosContinuityService } from '../student/petros-continuity/petros-continuity.service';
import { PetrosContinuityRepository } from '../student/petros-continuity/petros-continuity.repository';
import { PetrosPilotService,syntheticCohort } from '../student/petros-continuity/petros-pilot.service';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase,type Phase2TestDatabase } from './petros-phase2-test-database';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS==='1')('Phase5 fail-closed pilot instrumentation / actual disposable owners',()=>{
  let database:Phase2TestDatabase;
  beforeAll(async()=>{database=await startPhase2TestDatabase();},90_000);
  afterAll(async()=>{await database?.close();});
  async function setup(){
    const f=await phase2AuthorityFixture(database);await f.qualify();await f.approve();
    const env={...f.env,NODE_ENV:'test',PETROS_CONTINUITY_ENABLED:true,PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED:false};
    const auth=new StudentAuthService(database.db,database.auditWriter,env as never,{} as never,{} as never,{} as never);
    const policies=new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),{execute:()=>{throw new Error('Provider prohibited');}} as never,database.auditWriter,env as never);
    const continuity=new PetrosContinuityService(database.db,env as never,database.auditWriter,new PetrosContinuityRepository(database.db),auth,{isPortalEnabled:async()=>true} as never,f.knowledge,f.packs,policies);
    const pilot=new PetrosPilotService(database.db,env as never,database.auditWriter,continuity);
    const journey=await continuity.ensure(f.student,f.sessionId);
    const event={schemaVersion:'petros.pilot-event.v1',eventId:randomUUID(),journeyId:journey.id,experiment:'synthetic-phase5-v1',event:'resume_succeeded',outcome:'succeeded',durationBucket:'under_1s',connectivity:'online'};
    return {...f,env,continuity,pilot,journey,event};
  }
  it('never admits a real pilot; collector is disabled, test-only, minimal and stable across mutable preferences',async()=>{
    const x=await setup();expect(x.pilot.admission()).toMatchObject({admitted:false,instrumentation:false,generatedExecutableExtensions:false});
    await expect(x.pilot.recordSynthetic(x.student,x.event)).rejects.toMatchObject({response:{code:'PETROS_PILOT_INSTRUMENTATION_DISABLED'}});
    x.env.PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED=true;x.env.NODE_ENV='production';
    await expect(x.pilot.recordSynthetic(x.student,x.event)).rejects.toThrow();x.env.NODE_ENV='test';
    for(const privateField of ['message','sourceText','memory','draft','score','consentApproved']) {
      await expect(x.pilot.recordSynthetic(x.student,{...x.event,[privateField]:'private'})).rejects.toThrow();
    }
    const bucket=syntheticCohort(x.student,x.event.experiment);
    expect(syntheticCohort({...x.student,permissions:[]} as typeof x.student,x.event.experiment)).toBe(bucket);
    const a=await x.pilot.recordSynthetic(x.student,x.event);expect(a).toMatchObject({accepted:true,duplicate:false,cohort:bucket,synthetic:true});
    expect(await x.pilot.recordSynthetic(x.student,x.event)).toMatchObject({duplicate:true});
    await expect(x.pilot.recordSynthetic(x.student,{...x.event,outcome:'declined'})).rejects.toThrow();
    const rows=await x.owned(()=>database.db.select().from(schema.petrosPilotEvents));expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]?.event)).not.toMatch(/message|memory|draft|sourceText|score/);
    expect(await x.institution(()=>database.db.select().from(schema.petrosPilotEvents))).toEqual([]);
    expect(await database.adminSql`select count(*)::int as n from petros_objective_evidence_events where student_id=${x.student.studentId}`).toEqual([{n:0}]);
  });
  it('uses atomic audit-backed receipts under concurrent devices and rejects both foreign owners/tenants and revoked source',async()=>{
    const first=await setup(),second=await setup();
    for(const x of [first,second]) {
      x.env.PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED=true;
      const attempts=await Promise.all([x.pilot.recordSynthetic(x.student,x.event),x.pilot.recordSynthetic(x.student,x.event)]);
      expect(attempts.filter(r=>r.duplicate)).toHaveLength(1);
      await expect(x.pilot.recordSynthetic({...x.student,studentId:randomUUID()},x.event)).rejects.toThrow();
      const other=x===first?second:first;
      await expect(x.pilot.recordSynthetic(other.student,x.event)).rejects.toThrow();
      expect(await runInStudentTenant(database.db,other.student,()=>database.db.select().from(schema.petrosPilotEvents).where(eq(schema.petrosPilotEvents.studentId,x.student.studentId)))).toEqual([]);
      const failed={...x.event,eventId:randomUUID()};
      const spy=vi.spyOn(database.auditWriter,'logAudit').mockRejectedValueOnce(new Error('Synthetic audit outage'));
      await expect(x.pilot.recordSynthetic(x.student,failed)).rejects.toThrow('Synthetic audit outage');spy.mockRestore();
      expect(await x.owned(()=>database.db.select().from(schema.petrosPilotEvents).where(eq(schema.petrosPilotEvents.eventId,failed.eventId)))).toEqual([]);
      expect(await x.pilot.recordSynthetic(x.student,failed)).toMatchObject({duplicate:false});
      await x.admin.update(schema.knowledgeItems).set({sourceRevokedAt:new Date()}).where(eq(schema.knowledgeItems.id,x.source.id));
      await expect(x.pilot.recordSynthetic(x.student,x.event)).rejects.toThrow();
    }
  },60_000);
  it('cannot collect if the test bootstrap authority is absent even when configuration says test',async()=>{
    const x=await setup();x.env.PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED=true;
    await database.adminSql`drop function edrion_petros_synthetic_fixture()`;
    try {await expect(x.pilot.recordSynthetic(x.student,x.event)).rejects.toMatchObject({response:{code:'PETROS_PILOT_SYNTHETIC_AUTHORITY_MISSING'}});}
    finally {await database.adminSql.unsafe('CREATE FUNCTION edrion_petros_synthetic_fixture() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$');}
  });
});
