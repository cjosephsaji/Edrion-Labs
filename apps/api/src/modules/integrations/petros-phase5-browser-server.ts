/** Local synthetic full-AppModule runner. Never loads .env or a shared database. */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { Test } from '@nestjs/testing';
import { loadApiEnv } from '@edrion/config';
import { schema, eq } from '@edrion/database';
import { PETROS_PROJECTILE_CAPABILITY, petrosProjectileBindingSchema, createEngineReferenceProgram, createEngineSpatialFixture, describeEngineCapabilities, PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION, PETROS_MOVE_TYPES, PETROS_TOPIC_PROFILE_GENERATOR_VERSION, PETROS_TOPIC_PROFILE_PROMPT_VERSION, PETROS_TOPIC_PROFILE_SCHEMA_VERSION, petrosResolvedTopicProfileSchema, type PetrosMoveType, type PetrosTeachingBlockContent } from '@edrion/schemas';
import { startPhase2TestDatabase } from './petros-phase2-test-database';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { createHeldOutEngineProgram } from '../../../../../packages/schemas/src/__fixtures__/petros-engine-held-out';

async function freePort(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
function phase5TopicProfileFixture(topic:string,institutionId:string){
  const key=topic.toLowerCase();
  const weights=Object.fromEntries(PETROS_MOVE_TYPES.map(move=>[move,2_000])) as Record<PetrosMoveType,number>;
  const source={label:'Phase 5 synthetic curriculum fixture',reference:null,licence:'internal'};
  const opening:PetrosMoveType[]=['goal_frame','predict_then_reveal'];
  const practice:PetrosMoveType[]=['layered_explanation','worked_example','recall_check'];
  const closing:PetrosMoveType[]=['synthesis','forward_link'];
  return petrosResolvedTopicProfileSchema.parse({
    profileId:randomUUID(),canonicalVersionId:randomUUID(),canonicalVersion:1,overrideId:null,overrideVersion:null,
    resolvedForInstitutionId:institutionId,resolution:'canonical',resolvedAt:new Date().toISOString(),
    profile:{schemaVersion:PETROS_TOPIC_PROFILE_SCHEMA_VERSION,identity:{topicKey:key.replace(/[^a-z0-9]+/g,'-'),canonicalTitle:topic,
      subjectKey:'physics',subjectLabel:'Physics',gradeBand:'adult',curriculumKey:'phase5-synthetic',curriculumLabel:'Phase 5 synthetic curriculum',syllabusReferences:[source]},
      dimensions:{knowledgeTypes:[{type:'conceptual',weightBasisPoints:10_000}],abstractionLevel:3,
        representations:[{type:'visual',weightBasisPoints:10_000}],prerequisiteDensity:1,prerequisites:[],misconceptionRichness:1,misconceptions:[],
        mathematicalLoad:3,memorisationLoad:1,realWorldAnchors:{availability:3,quality:3,examples:['A synthetic projectile at its apex']},
        moves:{required:[],recommended:[...opening,...practice,...closing],disallowed:[],weights,openingPattern:opening,practicePattern:practice,closingPattern:closing}},
      provenance:{source:'deterministic_seed',confidenceBasisPoints:8_000,generatorVersion:PETROS_TOPIC_PROFILE_GENERATOR_VERSION,
        promptVersion:PETROS_TOPIC_PROFILE_PROMPT_VERSION,sourceReferences:[source],reviewer:'synthetic-fixture-only',reviewedAt:new Date().toISOString()},
      cache:{key:`phase5-synthetic:${key}`,version:1,invalidationInputs:{curriculumVersion:'1',syllabusVersion:'1',
        schemaVersion:PETROS_TOPIC_PROFILE_SCHEMA_VERSION,promptVersion:PETROS_TOPIC_PROFILE_PROMPT_VERSION,groundingHash:'phase5-synthetic-fixture'}}},
  });
}
async function main(){
  // Remove inherited application/provider credentials before importing application owners.
  for(const key of Object.keys(process.env))if(!['PATH','TMPDIR','HOME','USER','LANG'].includes(key))delete process.env[key];
  process.env.NODE_ENV='test';process.env.DISABLE_SUPPORT_SWEEP='1';
  const db=await startPhase2TestDatabase();
  const redisDir=mkdtempSync(join(tmpdir(),'petros-p5-redis-'));
  const redisPort=await freePort();
  const redis=spawn('redis-server',['--bind','127.0.0.1','--port',String(redisPort),'--save','','--appendonly','no','--dir',redisDir],{stdio:'ignore'});
  let app:import('@nestjs/common').INestApplication|undefined;
  let providerCalls=0;
  const providerCaptures:unknown[]=[];
  const close=async()=>{writeFileSync('/tmp/petros-phase5-server-summary.json',JSON.stringify({closedAt:new Date().toISOString(),providerCalls,providerCaptures,disposablePostgresRedis:true,appModule:true}));await app?.close();redis.kill('SIGTERM');await db.close();rmSync(redisDir,{recursive:true,force:true});};
  process.once('SIGINT',()=>{void close().then(()=>process.exit(0));});
  process.once('SIGTERM',()=>{void close().then(()=>process.exit(0));});
  try{
    const f=await phase2AuthorityFixture(db);await f.qualify();await f.approve();
    // A real canonical class roster and distinct teacher sessions back the Institution Portal UI.
    const academicYearId=randomUUID(),gradeLevelId=randomUUID(),classId=randomUUID(),teacherAUserId=randomUUID(),teacherAStaffId=randomUUID();
    await f.admin.insert(schema.institutionUsers).values({id:teacherAUserId,institutionId:f.institutionId,fullName:'Synthetic teacher A',email:`${teacherAUserId}@example.test`,status:'active'});
    await f.admin.insert(schema.institutionUserRoles).values({institutionUserId:teacherAUserId,roleKey:'institution_owner'});
    await f.admin.insert(schema.staff).values({id:teacherAStaffId,institutionId:f.institutionId,institutionUserId:teacherAUserId,firstName:'Synthetic',lastName:'Teacher A'});
    await f.admin.insert(schema.academicYears).values({id:academicYearId,institutionId:f.institutionId,name:'Synthetic current year',startDate:'2026-01-01',endDate:'2030-12-31',status:'active',isCurrent:true});
    await f.admin.insert(schema.gradeLevels).values({id:gradeLevelId,institutionId:f.institutionId,name:'Synthetic current grade',level:10});
    await f.admin.insert(schema.classes).values({id:classId,institutionId:f.institutionId,academicYearId,gradeLevelId,name:'Phase 5 current physics',section:'A',classTeacherId:teacherAStaffId});
    await f.admin.insert(schema.classSubjectTeachers).values({institutionId:f.institutionId,classId,subjectId:f.subjectId,teacherId:teacherAStaffId});
    await f.admin.update(schema.students).set({classId,gradeLevelId,status:'enrolled'}).where(eq(schema.students.id,f.student.studentId));
    await f.admin.insert(schema.studentEnrollments).values({institutionId:f.institutionId,studentId:f.student.studentId,academicYearId,gradeLevelId,classId,rollNo:'P5-001',status:'active'});
    for(let i=0;i<4;i++){
      const peerUserId=randomUUID();
      await f.admin.insert(schema.institutionUsers).values({id:peerUserId,institutionId:f.institutionId,fullName:`Synthetic peer ${i+1}`,email:`${peerUserId}@example.test`,status:'active'});
      await f.admin.insert(schema.institutionUserRoles).values({institutionUserId:peerUserId,roleKey:'student'});
      const [peer]=await f.admin.insert(schema.students).values({institutionId:f.institutionId,classId,gradeLevelId,institutionUserId:peerUserId,status:'enrolled',admissionNo:randomUUID(),firstName:'Synthetic',lastName:`Peer ${i+1}`}).returning();
      await f.admin.insert(schema.studentEnrollments).values({institutionId:f.institutionId,studentId:peer!.id,academicYearId,gradeLevelId,classId,rollNo:`P5-00${i+2}`,status:'active'});
      await f.admin.insert(schema.courseEnrollments).values({institutionId:f.institutionId,studentId:peer!.id,courseId:f.course.id});
    }
    // Teacher A starts as the class teacher; the isolated fixture control can later rotate the
    // assignment to existing teacher B before the independent review.
    const policy=defaultInstitutionPolicy();policy.syllabus.allowExternalSources=true;policy.syllabus.knowledgeMode='source_primary';
    policy.classSignals.enabled=true;policy.classSignals.minimumCohortSize=5;policy.classSignals.minimumIndependentEvidence=2;
    await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({institutionId:f.institutionId,scopeLevel:'institution',version:1,status:'published',schemaVersion:PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,config:policy,reason:'Controlled synthetic engineering comparisons',authorId:f.student.institutionUserId,effectiveFrom:new Date(0),publishedAt:new Date()});
    const decisionId=randomUUID(),blockId=randomUUID();
    const content:Extract<PetrosTeachingBlockContent,{type:'diagram'}>={schemaVersion:'petros.render.v2',type:'diagram',title:'Velocity at the apex',diagramType:'comparison',
      nodes:[{id:'horizontal',label:'Horizontal velocity remains',description:'No horizontal force in the trusted no-drag model.'},{id:'vertical',label:'Vertical velocity becomes zero',description:'Gravity still accelerates the body at the apex.'}],
      edges:[{from:'horizontal',to:'vertical',label:'Different velocity components'}],altText:'At the apex only the vertical velocity is zero; horizontal motion continues.',editable:true,
      fallbackText:'At the apex only the vertical velocity is zero; horizontal motion continues.'};
    const binding=petrosProjectileBindingSchema.parse({schemaVersion:'petros.projectile-binding.v1',originalDiagramBlockId:blockId,pack:f.candidate.pack,objective:f.candidate.objective,
      curriculumRevision:f.candidate.curriculumRevision,conceptId:f.candidate.concepts[0]!.id,source:f.candidate.concepts[0]!.anchors[0]!.locator,capability:PETROS_PROJECTILE_CAPABILITY});
    await f.admin.update(schema.petrosLearningSessions).set({resolvedTopicProfile:phase5TopicProfileFixture('projectile motion',f.institutionId),checkpoints:[{id:'checkpoint-1',label:'Compare components',status:'current'}],currentCheckpointId:'checkpoint-1'}).where(eq(schema.petrosLearningSessions.id,f.sessionId));
    await f.admin.insert(schema.petrosPlanningDecisions).values({id:decisionId,sessionId:f.sessionId,institutionId:f.institutionId,studentId:f.student.studentId,sequence:1,selectedMoveType:'diagram',targetConcept:'component_motion',
      studentSafeReason:'Compare vertical and horizontal velocity at the apex.',decisionFactors:[],moveParameters:{},expectedEvidence:'none',progressEffect:{},termination:{},guessFirst:{},observationResponse:{},source:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
    await f.admin.insert(schema.petrosTeachingBlocks).values({id:blockId,decisionId,sessionId:f.sessionId,institutionId:f.institutionId,studentId:f.student.studentId,sequence:1,type:'diagram',content,projectileBinding:binding,
      delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'petros.render.v2',correlationId:randomUUID()});
    const env=loadApiEnv({NODE_ENV:'test',DATABASE_URL:'postgres://invalid.invalid/unavailable',REDIS_URL:`redis://127.0.0.1:${redisPort}`,REDIS_ENABLED:'true',QUEUE_WORKERS_ENABLED:'false',
      RATE_LIMIT_ENABLED:'false',STUDENT_STORAGE_DIR:db.directory,SESSION_COOKIE_SECRET:'synthetic-phase5-local-session-secret',PETROS_WORKSPACE_ENABLED:'true',
      PETROS_DOCUMENT_RETRIEVAL_ENABLED:'true',PETROS_PROJECTILE_ENABLED:'true',PETROS_ADAPTIVE_TEACHING_ENABLED:'true',PETROS_ASSESSMENT_CONTRACT_ENABLED:'true',PETROS_CONTINUITY_ENABLED:'true',PETROS_AI_MODE:'live',API_CORS_ORIGINS:'http://127.0.0.1:3421,http://127.0.0.1:3423,http://127.0.0.1:3425'});
    const {AppModule}=await import('../../app.module');
    const {API_ENV,DATABASE,AUDIT_WRITER}=await import('../../common/tokens');
    const {PetrosProviderAdapterRegistry}=await import('../petros-ai-routing/petros-provider-adapters');
    const {PetrosAiRoutingService}=await import('../petros-ai-routing/petros-ai-routing.service');
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(API_ENV).useValue(env).overrideProvider(DATABASE).useValue(db.db)
      .overrideProvider(AUDIT_WRITER).useValue(db.auditWriter).overrideProvider(PetrosProviderAdapterRegistry).useValue({adapter:()=>({execute:async(_provider:unknown,_model:unknown,request:unknown)=>{
        providerCalls++;providerCaptures.push(request);writeFileSync('/tmp/petros-phase5-provider-capture.json',JSON.stringify(providerCaptures,null,2));
        return {kind:'json',content:{answer:'Controlled synthetic reply. Context remains input data, not system instruction.'},inputTokens:8,outputTokens:12,cachedTokens:0,providerRequestId:'phase5-controlled'};
      }})}).compile();
    app=module.createNestApplication({logger:['error','warn']});app.setGlobalPrefix('v1');app.enableCors({origin:env.API_CORS_ORIGINS,credentials:true});
    await app.listen(3417,'127.0.0.1');
    await app.get(PetrosAiRoutingService).ensureRegistry();
    const [fn]=await f.admin.select().from(schema.petrosAiFunctions).where(eq(schema.petrosAiFunctions.key,'companion.turn'));
    if(!fn)throw new Error('Built-in companion turn function was not registered');
    const providerId=randomUUID(),modelId=randomUUID();
    await f.admin.insert(schema.petrosAiProviders).values({id:providerId,key:'phase5-controlled',displayName:'Phase 5 controlled capture',adapterType:'openai-compatible',baseUrl:'http://127.0.0.1:9',enabled:true,paused:false,priority:1,
      capabilities:['text','structured_output'],metadata:{synthetic:true},healthStatus:'healthy',version:1});
    await f.admin.insert(schema.petrosAiModels).values({id:modelId,providerId,modelKey:'phase5-capture',displayName:'Phase 5 capture model',enabled:true,custom:true,capabilities:['text','structured_output'],contextWindow:32000,maxOutputTokens:2000,
      pricing:{inputPerMillionMicros:1,outputPerMillionMicros:1,cachedInputPerMillionMicros:1},providerOptions:{},version:1});
    await f.admin.insert(schema.petrosAiFunctionRoutes).values({functionId:fn.id,providerId,modelId,tier:0,trafficPercent:100,enabled:true,overrides:{}});
    const {StudentSessionService}=await import('../student/core/student-session.service');
    const session=await f.owned(()=>app!.get(StudentSessionService).issue({kind:'institutional',userId:f.student.institutionUserId,institutionId:f.institutionId}));
    const {PortalSessionService}=await import('../portal/portal-session.service');
    const portalSessions=app.get(PortalSessionService);
    const teacherA=await f.institution(()=>portalSessions.issue({institutionId:f.institutionId,institutionUserId:teacherAUserId,aal:'aal2',userAgent:'Petros synthetic browser journey A'}));
    const teacherB=await f.institution(()=>portalSessions.issue({institutionId:f.institutionId,institutionUserId:f.teacherUserId,aal:'aal2',userAgent:'Petros synthetic browser journey B'}));
    const adminEmployeeId=randomUUID(),adminRoleId=randomUUID();
    await f.admin.insert(schema.platformEmployees).values({id:adminEmployeeId,email:'phase5-operations@example.test',fullName:'Synthetic Phase 5 Operations Reviewer',status:'active',mfaEnrolled:true});
    await f.admin.insert(schema.platformRoles).values({id:adminRoleId,key:'phase5_operations_viewer',name:'Phase 5 operations viewer',description:'Disposable fixture role with ai.view only',isSystem:false});
    await f.admin.insert(schema.platformPermissions).values({key:'ai.view',group:'AI',description:'View AI operations status',sensitive:false}).onConflictDoNothing();
    await f.admin.insert(schema.platformRolePermissions).values({id:randomUUID(),roleId:adminRoleId,permissionKey:'ai.view'});
    await f.admin.insert(schema.employeeRoleAssignments).values({id:randomUUID(),employeeId:adminEmployeeId,roleId:adminRoleId});
    const {SessionService}=await import('../authentication/session.service');
    const adminSession=await app.get(SessionService).issue({employeeId:adminEmployeeId,aal:'aal2',userAgent:'Petros synthetic operations browser journey'});
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
    const metadata={fixtureName:'petros-phase5-synthetic-projectile-and-operations-v1',phase:'P5',cohortKind:'disposable-synthetic',
      candidateScope:{subject:'introductory projectile motion',ageRange:'18+',language:'English'},
      capabilityManifest:describeEngineCapabilities(),
      examples,api:'http://127.0.0.1:3417/v1',web:'http://127.0.0.1:3421',institutionWeb:'http://127.0.0.1:3423',superAdminWeb:'http://127.0.0.1:3425',cookieName:env.STUDENT_SESSION_COOKIE_NAME,token:session.token,sessionId:f.sessionId,blockId,
      adminCookieName:env.SESSION_COOKIE_NAME,adminToken:adminSession.token,adminEmployeeId,
      url:`http://127.0.0.1:3421/petros/session?session=${f.sessionId}`,studentId:f.student.studentId,institutionId:f.institutionId,
      teacherCookieName:portalSessions.cookieName,teachers:{a:{token:teacherA.token,institutionUserId:teacherAUserId},b:{token:teacherB.token,institutionUserId:f.teacherUserId}},
      classId,subjectId:f.subjectId,materialId:f.material.id,materialTitle:f.material.title,enrolledSyntheticStudents:5,academicYearId,gradeLevelId,
      fixtureControl:{command:'/tmp/petros-phase5-fixture-control.json',ack:'/tmp/petros-phase5-fixture-control-ack.json'},sourceId:f.source.id,sourceVersion:f.extraction.version.fingerprint,sourceLocator:f.citation.locator};
    writeFileSync('/tmp/petros-phase5-browser.json',JSON.stringify(metadata,null,2),{mode:0o600});
    const controlPath=metadata.fixtureControl.command,ackPath=metadata.fixtureControl.ack;
    for(const file of [controlPath,ackPath])if(existsSync(file))unlinkSync(file);
    let lastControlId='';
    const controlTimer=setInterval(()=>{
      if(!existsSync(controlPath))return;
      try{
        const command=JSON.parse(readFileSync(controlPath,'utf8')) as {id?:string;action?:string};
        if(!command.id||command.id===lastControlId)return;
        if(command.action==='rotate-teacher-b'){
          void f.admin.update(schema.classSubjectTeachers).set({teacherId:f.teacherId})
            .where(eq(schema.classSubjectTeachers.classId,classId))
            .then(()=>{lastControlId=command.id!;writeFileSync(ackPath,JSON.stringify({id:command.id,status:'applied',teacherId:f.teacherId}));})
            .catch(error=>writeFileSync(ackPath,JSON.stringify({id:command.id,status:'error',message:String(error)})));
        }
      }catch(error){writeFileSync(ackPath,JSON.stringify({status:'error',message:String(error)}));}
    },50);
    controlTimer.unref();
    console.log(JSON.stringify({status:'ready',sessionId:f.sessionId,blockId,api:metadata.api,web:metadata.web,providerCalls,controlledProvider:true,metadataFile:'/tmp/petros-phase5-browser.json'}));
  }catch(error){await close();throw error;}
}
void main().catch(error=>{console.error(error);process.exit(1);});
