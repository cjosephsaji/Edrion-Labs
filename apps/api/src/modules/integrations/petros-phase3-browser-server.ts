/** Local synthetic full-AppModule runner. Never loads .env or a shared database. */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Test } from '@nestjs/testing';
import { loadApiEnv } from '@edrion/config';
import { schema, eq } from '@edrion/database';
import { PETROS_PROJECTILE_CAPABILITY, petrosProjectileBindingSchema, createEngineReferenceProgram, createEngineSpatialFixture, describeEngineCapabilities, PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION, type PetrosTeachingBlockContent } from '@edrion/schemas';
import { startPhase2TestDatabase } from './petros-phase2-test-database';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import { createHeldOutEngineProgram } from '../../../../../packages/schemas/src/__fixtures__/petros-engine-held-out';

async function freePort(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
async function main(){
  // Remove inherited application/provider credentials before importing application owners.
  for(const key of Object.keys(process.env))if(!['PATH','TMPDIR','HOME','USER','LANG'].includes(key))delete process.env[key];
  process.env.NODE_ENV='test';process.env.DISABLE_SUPPORT_SWEEP='1';
  const db=await startPhase2TestDatabase();
  const redisDir=mkdtempSync(join(tmpdir(),'petros-p3-redis-'));
  const redisPort=await freePort();
  const redis=spawn('redis-server',['--bind','127.0.0.1','--port',String(redisPort),'--save','','--appendonly','no','--dir',redisDir],{stdio:'ignore'});
  let app:import('@nestjs/common').INestApplication|undefined;
  let providerCalls=0;
  const close=async()=>{writeFileSync('/tmp/petros-phase3-server-summary.json',JSON.stringify({closedAt:new Date().toISOString(),providerCalls,disposablePostgresRedis:true,appModule:true}));await app?.close();redis.kill('SIGTERM');await db.close();rmSync(redisDir,{recursive:true,force:true});};
  process.once('SIGINT',()=>{void close().then(()=>process.exit(0));});
  process.once('SIGTERM',()=>{void close().then(()=>process.exit(0));});
  try{
    const f=await phase2AuthorityFixture(db);await f.qualify();await f.approve();
    const policy=defaultInstitutionPolicy();policy.syllabus.allowExternalSources=true;policy.syllabus.knowledgeMode='source_primary';
    await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({institutionId:f.institutionId,scopeLevel:'institution',version:1,status:'published',schemaVersion:PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,config:policy,reason:'Controlled synthetic engineering comparisons',authorId:f.student.institutionUserId,effectiveFrom:new Date(0),publishedAt:new Date()});
    const decisionId=randomUUID(),blockId=randomUUID();
    const content:Extract<PetrosTeachingBlockContent,{type:'diagram'}>={schemaVersion:'petros.render.v2',type:'diagram',title:'Velocity at the apex',diagramType:'comparison',
      nodes:[{id:'horizontal',label:'Horizontal velocity remains',description:'No horizontal force in the trusted no-drag model.'},{id:'vertical',label:'Vertical velocity becomes zero',description:'Gravity still accelerates the body at the apex.'}],
      edges:[{from:'horizontal',to:'vertical',label:'Different velocity components'}],altText:'At the apex only the vertical velocity is zero; horizontal motion continues.',editable:true,
      fallbackText:'At the apex only the vertical velocity is zero; horizontal motion continues.'};
    const binding=petrosProjectileBindingSchema.parse({schemaVersion:'petros.projectile-binding.v1',originalDiagramBlockId:blockId,pack:f.candidate.pack,objective:f.candidate.objective,
      curriculumRevision:f.candidate.curriculumRevision,conceptId:f.candidate.concepts[0]!.id,source:f.candidate.concepts[0]!.anchors[0]!.locator,capability:PETROS_PROJECTILE_CAPABILITY});
    await f.admin.update(schema.petrosLearningSessions).set({resolvedTopicProfile:stage4ProfileFixture('projectile',f.institutionId),checkpoints:[{id:'checkpoint-1',label:'Compare components',status:'current'}],currentCheckpointId:'checkpoint-1'}).where(eq(schema.petrosLearningSessions.id,f.sessionId));
    await f.admin.insert(schema.petrosPlanningDecisions).values({id:decisionId,sessionId:f.sessionId,institutionId:f.institutionId,studentId:f.student.studentId,sequence:1,selectedMoveType:'diagram',targetConcept:'component_motion',
      studentSafeReason:'Compare vertical and horizontal velocity at the apex.',decisionFactors:[],moveParameters:{},expectedEvidence:'none',progressEffect:{},termination:{},guessFirst:{},observationResponse:{},source:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
    await f.admin.insert(schema.petrosTeachingBlocks).values({id:blockId,decisionId,sessionId:f.sessionId,institutionId:f.institutionId,studentId:f.student.studentId,sequence:1,type:'diagram',content,projectileBinding:binding,
      delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'petros.render.v2',correlationId:randomUUID()});
    const env=loadApiEnv({NODE_ENV:'test',DATABASE_URL:'postgres://invalid.invalid/unavailable',REDIS_URL:`redis://127.0.0.1:${redisPort}`,REDIS_ENABLED:'true',QUEUE_WORKERS_ENABLED:'false',
      RATE_LIMIT_ENABLED:'false',STUDENT_STORAGE_DIR:db.directory,SESSION_COOKIE_SECRET:'synthetic-phase3-local-session-secret',API_CORS_ORIGINS:'http://127.0.0.1:3411',PETROS_WORKSPACE_ENABLED:'true',
      PETROS_DOCUMENT_RETRIEVAL_ENABLED:'true',PETROS_PROJECTILE_ENABLED:'true',PETROS_ADAPTIVE_TEACHING_ENABLED:'true',PETROS_ASSESSMENT_CONTRACT_ENABLED:'true'});
    const {AppModule}=await import('../../app.module');
    const {API_ENV,DATABASE,AUDIT_WRITER}=await import('../../common/tokens');
    const {PetrosProviderAdapterRegistry}=await import('../petros-ai-routing/petros-provider-adapters');
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(API_ENV).useValue(env).overrideProvider(DATABASE).useValue(db.db)
      .overrideProvider(AUDIT_WRITER).useValue(db.auditWriter).overrideProvider(PetrosProviderAdapterRegistry).useValue({adapter:()=>({execute:async()=>{providerCalls++;throw new Error('Controlled synthetic provider unavailable');}})}).compile();
    app=module.createNestApplication({logger:['error','warn']});app.setGlobalPrefix('v1');app.enableCors({origin:env.API_CORS_ORIGINS,credentials:true});
    await app.listen(3407,'127.0.0.1');
    const {StudentSessionService}=await import('../student/core/student-session.service');
    const session=await f.owned(()=>app!.get(StudentSessionService).issue({kind:'institutional',userId:f.student.institutionUserId,institutionId:f.institutionId}));
    const {PetrosWorkspaceService}=await import('../student/petros-loop/petros-workspace.service');
    const examples:Record<string,{blockId:string;sessionId:string}>={};
    for(const [i,capabilityId] of ['physics.pendulum.ideal','circuits.dc.series','circuits.rc.series','render.spatial','held-out.combined'].entries()){
      const id=randomUUID(),decision=randomUUID(),lesson=randomUUID();
      const [original]=await f.admin.select().from(schema.petrosLearningSessions).where(eq(schema.petrosLearningSessions.id,f.sessionId));
      await f.admin.insert(schema.petrosLearningSessions).values({...original!,id:lesson,clientRequestId:randomUUID(),topic:'Synthetic '+capabilityId,createdAt:new Date(),updatedAt:new Date()});
      const [planned]=await f.admin.select().from(schema.petrosPlanningDecisions).where(eq(schema.petrosPlanningDecisions.id,decisionId));
      await f.admin.insert(schema.petrosPlanningDecisions).values({...planned!,id:decision,sessionId:lesson,sequence:1,correlationId:randomUUID()});
      await f.admin.insert(schema.petrosTeachingBlocks).values({id,decisionId:decision,sessionId:lesson,institutionId:f.institutionId,studentId:f.student.studentId,sequence:1,type:'diagram',content:{...content,title:'Engineering comparison: '+capabilityId},delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'petros.render.v2',correlationId:randomUUID()});
      const authority={ownerScopeRef:`${f.institutionId}:${f.student.studentId}`,programId:id,source:null,allowedCapabilities:describeEngineCapabilities().capabilities.filter(c=>c.enabled).map(c=>c.id)};
      const program=capabilityId==='render.spatial'?createEngineSpatialFixture(authority):capabilityId==='held-out.combined'?createHeldOutEngineProgram(authority):createEngineReferenceProgram(authority,capabilityId);
      await app.get(PetrosWorkspaceService).command(f.student,lesson,id,{schemaVersion:'petros.engine-command.v1',programId:id,operationId:randomUUID(),expectedRevision:0,expectedExperimentVersion:0,expectedDraftVersion:0,target:'workspace',purpose:'Controlled synthetic reference '+i,action:{type:'create',program}});
      examples[capabilityId]={blockId:id,sessionId:lesson};
    }
    const metadata={examples,api:'http://127.0.0.1:3407/v1',web:'http://127.0.0.1:3411',cookieName:env.STUDENT_SESSION_COOKIE_NAME,token:session.token,sessionId:f.sessionId,blockId,
      url:`http://127.0.0.1:3411/petros/session?session=${f.sessionId}`,studentId:f.student.studentId,institutionId:f.institutionId};
    writeFileSync('/tmp/petros-phase3-browser.json',JSON.stringify(metadata,null,2),{mode:0o600});
    console.log(JSON.stringify({status:'ready',sessionId:f.sessionId,blockId,api:metadata.api,web:metadata.web,providerCalls,metadataFile:'/tmp/petros-phase3-browser.json'}));
  }catch(error){await close();throw error;}
}
void main().catch(error=>{console.error(error);process.exit(1);});
