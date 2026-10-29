/** Disposable CC0 M3 engineering fixture. Never imported by application modules. */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, schema, runInScopedTenant } from '@edrion/database';
import { PetrosContentIntelligenceService } from '../student/knowledge/petros-content-intelligence.service';
import { PetrosContentUnitRepository } from '../student/knowledge/petros-content-unit.repository';
import { KnowledgePreparationRepository } from '../student/knowledge/knowledge-preparation.repository';
import { KnowledgePdfProcess } from '../student/knowledge/knowledge-pdf-process';
import { PdfContentAdapter } from '../student/knowledge/adapters/pdf-content.adapter';
import { PptxContentAdapter } from '../student/knowledge/adapters/pptx-content.adapter';
import { DocxContentAdapter } from '../student/knowledge/adapters/docx-content.adapter';
import { TxtContentAdapter } from '../student/knowledge/adapters/txt-content.adapter';
import { MarkdownContentAdapter } from '../student/knowledge/adapters/markdown-content.adapter';
import { sha256 } from '../student/knowledge/adapters/content-adapter';
import { PortalAuthService } from '../portal/portal-auth.service';
import { appendCourseCurriculum } from '../portal/courses/course-curriculum.repository';
import { PortalTeachingService } from '../portal/teaching/portal-teaching.service';
import { PetrosLearningProposalRepository } from '../portal/teaching/petros-learning-proposal.repository';
import { PetrosLearningProposalService } from '../portal/teaching/petros-learning-proposal.service';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';
import { PetrosTeachingPackRepository } from '../student/knowledge/petros-teaching-pack.repository';
import type { PortalActionContext } from '../portal/portal-action-context';
import type { SourceBinding } from '@edrion/schemas';
import { startPhase2TestDatabase } from './petros-phase2-test-database';
export const m3FixtureRoot=resolve(__dirname,'../../../../..');
export async function startM3Fixture() {
 if(process.env.DATABASE_URL||process.env.DATABASE_MIGRATION_URL||Object.keys(process.env).some(k=>k.startsWith('PG')&&process.env[k])) throw new Error('M3_CONFIGURED_TARGET_REFUSED');
 const f=await startPhase2TestDatabase({temporaryRoot:'/tmp'}),admin=drizzle(f.adminSql,{schema});
 try {
 for(const file of ['m2g-staff-source-reservations.sql','m2fa-native-locators.sql','m3-learning-proposals.sql']) await f.adminSql.unsafe(readFileSync(resolve(m3FixtureRoot,'packages/database/proposals',file),'utf8'));
 const institutionId=randomUUID(),foreign=randomUUID(),teacher=randomUUID(),staffId=randomUUID(),student=randomUUID(),studentUser=randomUUID(),other=randomUUID(),otherUser=randomUUID(),classId=randomUUID(),year=randomUUID(),grade=randomUUID();
 const reviewer=randomUUID(),reviewerStaff=randomUUID();
 const subjects={cloud:randomUUID(),argument:randomUUID()},courses={cloud:randomUUID(),argument:randomUUID()};
 const env={NODE_ENV:'test',PETROS_M2_ISOLATED_ENABLED:true,PETROS_ADAPTIVE_TEACHING_ENABLED:true,PETROS_TEACHER_AUTHORING_ENABLED:true,STUDENT_STORAGE_DIR:f.directory} as never;
 await admin.insert(schema.institutions).values([institutionId,foreign].map(id=>({id,publicId:randomUUID(),legalName:'Disposable M3',displayName:'Isolated M3 Institution',type:'school',country:'IN',primaryContact:{name:'Synthetic',email:'fixture@example.test'}})));
 await admin.insert(schema.institutionUsers).values([teacher,reviewer,studentUser,otherUser].map(id=>({id,institutionId,fullName:'Synthetic M3 actor',email:`${id}@example.test`,status:'active'})));
 await admin.insert(schema.institutionUserRoles).values([{institutionUserId:teacher,roleKey:'institution_owner'},{institutionUserId:reviewer,roleKey:'institution_owner'},{institutionUserId:studentUser,roleKey:'student'},{institutionUserId:otherUser,roleKey:'student'}]);
 await admin.insert(schema.staff).values([{id:staffId,institutionId,institutionUserId:teacher,firstName:'Synthetic',lastName:'Teacher'},{id:reviewerStaff,institutionId,institutionUserId:reviewer,firstName:'Synthetic',lastName:'Independent reviewer'}]);
 await admin.insert(schema.academicYears).values({id:year,institutionId,name:'Synthetic year',startDate:'2026-01-01',endDate:'2026-12-31'});
 await admin.insert(schema.gradeLevels).values({id:grade,institutionId,name:'Synthetic level'});
 await admin.insert(schema.classes).values({id:classId,institutionId,academicYearId:year,gradeLevelId:grade,name:'Isolated source review class'});
 await admin.insert(schema.students).values([{id:student,institutionId,institutionUserId:studentUser,classId,admissionNo:randomUUID(),firstName:'Synthetic',lastName:'Recipient'},
  {id:other,institutionId,institutionUserId:otherUser,classId,admissionNo:randomUUID(),firstName:'Synthetic',lastName:'Second recipient'}]);
 for(const domain of ['cloud','argument'] as const) {
  await admin.insert(schema.subjects).values({id:subjects[domain],institutionId,name:domain==='cloud'?'Cloud Computing':'English Argument Analysis',code:randomUUID()});
  await admin.insert(schema.classSubjectTeachers).values({institutionId,classId,subjectId:subjects[domain],teacherId:staffId});
  await admin.insert(schema.courses).values({id:courses[domain],institutionId,subjectId:subjects[domain],professorTeacherId:staffId,name:`Synthetic ${domain}`,code:randomUUID()});
  await admin.insert(schema.courseEnrollments).values([student,other].map(studentId=>({institutionId,courseId:courses[domain],studentId})));
 }
 const auth=new PortalAuthService(f.db,env),units=new PetrosContentUnitRepository(f.db),preps=new KnowledgePreparationRepository(f.db),worker=new KnowledgePdfProcess();
 const packs=new PetrosTeachingPackService(new PetrosTeachingPackRepository(f.db),null as never,auth,f.db,env,f.auditWriter);
 const service=new PetrosLearningProposalService(f.db,env,new PortalTeachingService(f.db),units,new PetrosLearningProposalRepository(f.db),packs);
 const intelligence=new PetrosContentIntelligenceService(f.db,env,new PdfContentAdapter(worker),new PptxContentAdapter(worker),units,preps,null as never,
  new DocxContentAdapter(worker),new TxtContentAdapter(worker),new MarkdownContentAdapter(worker));
 const scope={institutionId,institutionUserId:teacher};
 const run=<T>(work:(ctx:PortalActionContext)=>Promise<T>)=>runInScopedTenant(f.db,scope,async()=>{
  const principal=await auth.resolveById(teacher,null);return work({principal,scope:{mode:'institution'},request:{requestId:randomUUID(),correlationId:randomUUID(),ip:'127.0.0.1',userAgent:'M3 isolated',apiEndpoint:'isolated-fixture'} as never});
 });
 for(const domain of ['cloud','argument'] as const) await run(async ctx=>{
  const [course]=await f.db.select().from(schema.courses).where(eq(schema.courses.id,courses[domain])).limit(1);
  await appendCourseCurriculum(f.db,ctx,course!,[],{commandId:randomUUID(),expectedRevision:0,reason:'Synthetic isolated curriculum context; no actual educational approval.',
    payload:{schemaVersion:'petros.curriculum-alignment.v1',objectives:[],frameworks:[],releases:[],items:[],relationships:[],alignments:[],moduleObjectives:[]}});
 });
 async function document(name:string,domain:'cloud'|'argument',contextKind:'course'|'class'='course') {
  const bytes=readFileSync(resolve(m3FixtureRoot,'packages/learn-evals/src/petros-v2/fixtures/sources',name)),id=randomUUID(),objectId=randomUUID(),key=`m3-${objectId}`;
  writeFileSync(resolve(f.directory,key),bytes);
  const mimeType=name.endsWith('.pdf')?'application/pdf':name.endsWith('.pptx')?'application/vnd.openxmlformats-officedocument.presentationml.presentation':name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':name.endsWith('.txt')?'text/plain':'text/markdown';
  await admin.insert(schema.storageObjects).values({id:objectId,institutionId,ownerStaffUserId:teacher,kind:'pdf',driver:'local',storageKey:key,filename:name,mimeType,sizeBytes:bytes.length,checksumSha256:sha256(bytes),processingStatus:'ready'});
  await admin.insert(schema.classMaterials).values({id,institutionId,contextType:contextKind,contextId:contextKind==='course'?courses[domain]:classId,subjectId:subjects[domain],objectId,title:name,version:1});
  const binding:SourceBinding={kind:'material',materialId:id,materialVersion:1,objectId,contextKind,contextId:contextKind==='course'?courses[domain]:classId,subjectId:subjects[domain]};
  const sourceScope={...scope,sourceItemId:id,courseId:contextKind==='course'?courses[domain]:classId};
  const queued=await intelligence.enqueue(sourceScope,binding),prepared=await intelligence.run(sourceScope,queued.id,new AbortController().signal);
  if(!('revision' in prepared)) throw new Error('M3_REAL_M2_PREPARATION_REQUIRED');
  return {id,objectId,binding,revision:prepared.revision,preparationId:queued.id};
 }
 async function qualification(domain:'cloud'|'argument',status='active',until=new Date(Date.now()+86400000),independent=false) {
  const id=randomUUID();await admin.insert(schema.petrosReviewerQualifications).values({id,version:1,institutionId,reviewerUserId:independent?reviewer:teacher,reviewerStaffId:independent?reviewerStaff:staffId,
   subjectKey:subjects[domain],status,validFrom:new Date(Date.now()-86400000),validUntil:until,evidenceKind:'institution_record',evidenceHash:sha256('isolated qualification'),recordedByUserId:teacher});return id;
 }
 const runReviewer=<T>(work:(ctx:PortalActionContext)=>Promise<T>)=>runInScopedTenant(f.db,{institutionId,institutionUserId:reviewer},async()=>{const principal=await auth.resolveById(reviewer,null);return work({principal,scope:{mode:'institution'},request:{requestId:randomUUID(),correlationId:randomUUID(),ip:'127.0.0.1',userAgent:'M3 isolated independent reviewer',apiEndpoint:'isolated-fixture'} as never});});
 return {f,admin,reviewer,reviewerStaff,runReviewer,service,packs,units,preps,auth,intelligence,run,document,qualification,scope,institutionId,foreign,teacher,staffId,student,other,studentUser,otherUser,classId,subjects,courses};
 } catch(e) {await f.close();throw e;}
}
export type M3Fixture=Awaited<ReturnType<typeof startM3Fixture>>;
