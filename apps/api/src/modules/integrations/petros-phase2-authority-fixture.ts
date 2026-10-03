import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { runInStudentTenant, runInInstitutionTenant, schema } from '@edrion/database';
import { curriculumAlignmentSchema, petrosConceptPackCandidateSchema, type PetrosConceptPackCandidate,
  type PetrosTeachingPackReviewCommand } from '@edrion/schemas';
import { phase2PackCandidate, phase2PackReviewReceipt } from '../../../../../packages/schemas/src/__fixtures__/petros-phase2-pack';
import { PortalAuthService } from '../portal/portal-auth.service';
import { StudentMaterialsService } from '../student/materials/student-materials.service';
import { KnowledgeDocumentService, publishKnowledgeExtraction } from '../student/knowledge/knowledge-document.service';
import { documentPageCitation } from '../student/petros-session-intent/petros-document-source';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';
import { PetrosTeachingPackRepository } from '../student/knowledge/petros-teaching-pack.repository';
import { appendCourseCurriculum } from '../portal/courses/course-curriculum.repository';
import type { Phase2TestDatabase } from './petros-phase2-test-database';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import type { PortalActionContext } from '../portal/portal-action-context';

export type Phase2CandidateConfigurator = (
  candidate: PetrosConceptPackCandidate,
) => PetrosConceptPackCandidate | void;

/** Synthetic identities only. Calls real source, curriculum, compiler and review owners. */
export async function phase2AuthorityFixture(
  fixture:Phase2TestDatabase,
  configureCandidate?:Phase2CandidateConfigurator,
) {
  const admin=drizzle(fixture.adminSql,{schema});
  const institutionId=randomUUID(),studentId=randomUUID(),studentUserId=randomUUID(),teacherId=randomUUID(),teacherUserId=randomUUID();
  const courseId=randomUUID(),subjectId=randomUUID(),sessionId=randomUUID(),qualificationId=randomUUID();
  const env={STUDENT_STORAGE_DIR:fixture.directory,PETROS_DOCUMENT_RETRIEVAL_ENABLED:true,
    PETROS_ADAPTIVE_TEACHING_ENABLED:true,PETROS_ASSIGNMENT_LEARNING_ENABLED:true,PETROS_ASSESSMENT_CONTRACT_ENABLED:true,
    PETROS_OBJECTIVE_EVIDENCE_ENABLED:true,PETROS_QUALITATIVE_REVIEW_ENABLED:true,PETROS_PROJECTILE_ENABLED:true};
  await admin.insert(schema.institutions).values({id:institutionId,publicId:randomUUID(),legalName:'Synthetic authority fixture',
    displayName:'Synthetic authority fixture',type:'school',country:'IN',primaryContact:{name:'Synthetic',email:'only@example.test'}});
  await admin.insert(schema.institutionUsers).values([
    {id:studentUserId,institutionId,fullName:'Synthetic learner',email:`${studentId}@example.test`,status:'active'},
    {id:teacherUserId,institutionId,fullName:'Synthetic educator',email:`${teacherId}@example.test`,status:'active'},
  ]);
  await admin.insert(schema.institutionUserRoles).values([
    {institutionUserId:studentUserId,roleKey:'student'}, {institutionUserId:teacherUserId,roleKey:'institution_owner'},
  ]);
  await admin.insert(schema.students).values({id:studentId,institutionId,institutionUserId:studentUserId,
    admissionNo:randomUUID(),firstName:'Synthetic',lastName:'Learner'});
  await admin.insert(schema.staff).values({id:teacherId,institutionId,institutionUserId:teacherUserId,firstName:'Synthetic',lastName:'Educator'});
  await admin.insert(schema.subjects).values({id:subjectId,institutionId,name:'Synthetic physics',code:randomUUID()});
  const [course]=await admin.insert(schema.courses).values({id:courseId,institutionId,subjectId,professorTeacherId:teacherId,
    name:'Synthetic physics',code:randomUUID()}).returning();
  await admin.insert(schema.courseEnrollments).values({institutionId,studentId,courseId});
  const modules=[{weekNo:1,title:'Synthetic source',topics:['Projectile components']}];
  await admin.insert(schema.courseSyllabusModules).values(modules.map(m=>({...m,courseId})));
  const portalAuth=new PortalAuthService(fixture.db,env as never);
  const principal=await runInInstitutionTenant(fixture.db,institutionId,()=>portalAuth.resolveById(teacherUserId,null));
  const ctx={principal,scope:{mode:'institution'},request:{}} as PortalActionContext;
  const student:InstitutionalStudentPrincipal={kind:'institutional',institutionId,studentId,institutionUserId:studentUserId,
    campusId:null,email:`${studentId}@example.test`,fullName:'Synthetic learner',permissions:['student.learn.use'],lastAuthAt:null};
  const institution=<T>(work:()=>Promise<T>)=>runInInstitutionTenant(fixture.db,institutionId,work);
  const owned=<T>(work:()=>Promise<T>)=>runInStudentTenant(fixture.db,student,work);
  const common=()=>({id:randomUUID(),version:1,provenance:{method:'manual' as const,sourceRef:'synthetic-phase2',
    sourceHash:'a'.repeat(64),observedAt:'2026-01-01T00:00:00.000Z',licence:'synthetic-only'}});
  const effective={from:'2026-01-01T00:00:00.000Z',until:null};
  const objective={...common(),descriptor:'Predict horizontal and vertical projectile motion under constant gravity.',effective};
  const framework={...common(),title:'Synthetic framework',jurisdiction:'Test',subject:'Synthetic physics',level:'Test',
    issuingBody:'Synthetic fixture',externalId:'SYNTHETIC',uri:null};
  const ref=({id,version}:{id:string;version:number})=>({id,version});
  const release={...common(),framework:ref(framework),publisherVersion:'synthetic-1',effective,supersedes:null};
  const item={...common(),release:ref(release),externalId:'SYN-1',uri:null,descriptor:objective.descriptor};
  const payload=curriculumAlignmentSchema.parse({schemaVersion:'petros.curriculum-alignment.v1',objectives:[objective],
    frameworks:[framework],releases:[release],items:[item],relationships:[],moduleObjectives:[{weekNo:1,objectives:[ref(objective)]}],
    alignments:[{...common(),objective:ref(objective),standard:ref(item),relation:'addresses',rationale:'Synthetic only',
      gaps:[],confidence:null,status:'proposed',effective,overrideReason:null}]});
  await institution(()=>appendCourseCurriculum(fixture.db,ctx,course!,modules,{expectedRevision:0,commandId:randomUUID(),reason:'Synthetic proposal',payload}));
  payload.alignments[0]!.status='approved';payload.alignments[0]!.version=2;
  await institution(()=>appendCourseCurriculum(fixture.db,ctx,course!,modules,{expectedRevision:1,commandId:randomUUID(),reason:'Synthetic explicit approval',payload}));

  // Extraction bytes are controlled. PDF parsing is covered by the separate Phase 1 preparation journey.
  const text='Under uniform gravity with no drag, horizontal velocity remains constant. Vertical velocity decreases by gravity times elapsed time. At the apex vertical velocity is zero. Level-ground landing returns vertical position to zero.';
  const key=`synthetic-${randomUUID()}.bin`;const bytes=Buffer.from(text);writeFileSync(join(fixture.directory,key),bytes);
  const fileHash=createHash('sha256').update(bytes).digest('hex');
  const [object]=await admin.insert(schema.storageObjects).values({institutionId,ownerStudentId:studentId,kind:'pdf',driver:'local',
    storageKey:key,mimeType:'application/pdf',sizeBytes:bytes.length,checksumSha256:fileHash,processingStatus:'ready'}).returning();
  const [material]=await admin.insert(schema.classMaterials).values({institutionId,contextType:'course',contextId:courseId,
    subjectId,title:'Synthetic source',objectId:object!.id}).returning();
  const [source]=await admin.insert(schema.knowledgeItems).values({institutionId,studentId,kind:'pdf',title:'Synthetic source',
    objectIds:[object!.id],pageCount:1,pagesDone:1,extractedTextReady:true,status:'ready',origin:{source:'teacher_class_material',
      classMaterialId:material!.id,petrosExtraction:{schemaVersion:'petros.document-source.v1',fileSha256:fileHash,indexing:'not_built',
        representation:'pdf_text',extractorVersion:'synthetic-controlled-extraction.v1',truncated:false,readable:true}}}).returning();
  const extraction=await admin.transaction(tx=>publishKnowledgeExtraction(tx,source!,[text]));
  const knowledge=new KnowledgeDocumentService(fixture.db,new StudentMaterialsService(fixture.db),env as never);
  const document=await owned(()=>knowledge.resolve(student,source!.id));
  const citation=documentPageCitation(document.item,document.allPages[0]!,extraction.version.fingerprint,'Source');
  await admin.insert(schema.petrosLearningSessions).values({id:sessionId,institutionId,studentId,clientRequestId:randomUUID(),
    stateVersion:'petros.session-state.v3',sessionType:'learn',topic:'Synthetic projectile',currentGoal:objective.descriptor,
    timeBudgetSeconds:600,maxMoves:8,checkpoints:[],currentCheckpointId:'synthetic',promptVersion:'synthetic',outputSchemaVersion:'synthetic',
    sourceContext:{door:'uploaded_document',referenceId:source!.id,sourceFingerprint:extraction.version.fingerprint,citations:[citation]}});
  const raw=JSON.parse(JSON.stringify(phase2PackCandidate));
  raw.pack.id=randomUUID();raw.subject=subjectId;raw.objective=ref(objective);raw.objectiveStatement=objective.descriptor;
  raw.curriculumRevision=2;raw.sourceVersion=extraction.version.fingerprint;
  raw.concepts[0].definition='Horizontal velocity is constant while uniform gravity changes vertical velocity.';
  raw.coreExplanation='Separate the velocity into horizontal and vertical components. Without drag, gravity changes only the vertical component.';
  raw.claims[0].statement='Horizontal velocity remains constant in the declared no-drag model.';
  raw.misconceptions[0]={...raw.misconceptions[0],id:'apex_stops_all_motion',claim:'Both velocity components vanish at the apex.',
    discriminator:'Compare horizontal and vertical velocity at the apex.',correction:'Only the vertical component vanishes at the apex.'};
  raw.assessments[0].prompt='Which velocity component becomes zero at the apex?';raw.assessments[0].evaluator={kind:'exact_text',answerKey:'vertical',aliases:['vertical velocity'],caseSensitive:false};
  raw.assessments[1].prompt='For horizontal velocity 6 m/s, what horizontal distance is travelled after 2 s?';
  raw.visualIntent={representation:'analytic_projectile',requiredCapability:'physics.projectile.no-drag@1',meaningfulManipulations:['gravity','launch_velocity_x']};
  for(const list of [raw.claims,raw.concepts,raw.prerequisites,raw.examples,raw.misconceptions,raw.assessments])
    for(const entry of list)for(const anchor of entry.anchors)anchor.locator=citation.locator;
  const editable=structuredClone(petrosConceptPackCandidateSchema.parse(raw));
  const candidate=petrosConceptPackCandidateSchema.parse(configureCandidate?.(editable) ?? editable);
  const packs=new PetrosTeachingPackService(new PetrosTeachingPackRepository(fixture.db),knowledge,portalAuth,fixture.db,env as never,fixture.auditWriter);
  const compileCommand={schemaVersion:'petros.teaching-pack-compile.v1' as const,commandId:randomUUID(),courseId,sourceItemId:source!.id,candidate};
  const compiled=await institution(()=>packs.compile(ctx,compileCommand));
  const reviewCommand:PetrosTeachingPackReviewCommand={schemaVersion:'petros.teaching-pack-review-command.v1',commandId:randomUUID(),
    expectedPayloadHash:compiled.payloadHash,decision:'approved',qualificationId,expectedQualificationVersion:1,
    coverage:phase2PackReviewReceipt.coverage,rationale:'Explicit synthetic educator approval for controlled engineering tests only.'};
  const qualify=()=>admin.insert(schema.petrosReviewerQualifications).values({id:qualificationId,version:1,institutionId,
    reviewerUserId:teacherUserId,reviewerStaffId:teacherId,subjectKey:subjectId,status:'active',
    validFrom:new Date('2026-01-01'),validUntil:new Date('2030-01-01'),evidenceKind:'institution_record',evidenceHash:'c'.repeat(64),
    recordedByUserId:teacherUserId});
  const approve=()=>institution(()=>packs.review(ctx,compiled.candidateId,reviewCommand));
  const current=()=>owned(()=>packs.requireApprovedPack(student,sessionId,{packId:candidate.pack.id,packVersion:candidate.pack.version}));
  return {admin,env,institutionId,student,principal,ctx,institution,owned,course:course!,subjectId,sessionId,source:source!,material:material!,
    object:object!,extraction,citation,knowledge,packs,candidate,compiled,compileCommand,reviewCommand,qualify,approve,current,qualificationId,teacherId,teacherUserId};
}
