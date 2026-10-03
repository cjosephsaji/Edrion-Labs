import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { and, eq, schema } from '@edrion/database';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PortalAuthService } from '../portal/portal-auth.service';
import { AssignmentsService } from '../portal/assignments.service';
import { AssignmentsRepository } from '../portal/assignments.repository';
import { PortalAudienceService } from '../portal/portal-audience.service';
import { RecipientResolver } from '../portal/recipient-resolver.service';
import { UsersRepository } from '../portal/users.repository';
import { PortalEntityResolver } from '../portal/portal-entity-resolver';
import { PortalCrudEngine } from '../portal/portal-crud.engine';
import { PortalCourseContentService } from '../portal/course-content/portal-course-content.service';
import { MaterialDocumentPreviewService } from '../student/materials/material-document-preview.service';
import { KnowledgePreparationRepository } from '../student/knowledge/knowledge-preparation.repository';
import { StudentAssignmentsService } from '../student/assignments/student-assignments.service';
import type { Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import type { PortalActionContext } from '../portal/portal-action-context';

export async function phase4InstitutionalFixture(database:Phase2TestDatabase,f:Awaited<ReturnType<typeof phase2AuthorityFixture>>){
  const env={...f.env,PETROS_CONTINUITY_ENABLED:true};
  const year=randomUUID(),grade=randomUUID(),classId=randomUUID(),reviewerUserId=randomUUID(),reviewerStaffId=randomUUID();
  await f.admin.insert(schema.academicYears).values({id:year,institutionId:f.institutionId,name:'Synthetic current year',startDate:'2026-01-01',endDate:'2030-12-31',status:'active',isCurrent:true});
  await f.admin.insert(schema.gradeLevels).values({id:grade,institutionId:f.institutionId,name:'Synthetic cohort'});
  await f.admin.insert(schema.classes).values({id:classId,institutionId:f.institutionId,academicYearId:year,gradeLevelId:grade,name:'Synthetic class'});
  await f.admin.insert(schema.classSubjectTeachers).values({institutionId:f.institutionId,classId,subjectId:f.subjectId,teacherId:f.teacherId});
  await f.admin.update(schema.students).set({classId,status:'enrolled'}).where(eq(schema.students.id,f.student.studentId));
  for(let i=0;i<4;i++){
   const userId=randomUUID();await f.admin.insert(schema.institutionUsers).values({id:userId,institutionId:f.institutionId,fullName:`Synthetic peer ${i}`,email:`${userId}@example.test`,status:'active'});
   await f.admin.insert(schema.institutionUserRoles).values({institutionUserId:userId,roleKey:'student'});
   const [peer]=await f.admin.insert(schema.students).values({institutionId:f.institutionId,classId,institutionUserId:userId,status:'enrolled',admissionNo:randomUUID(),firstName:'Synthetic',lastName:`Peer ${i}`}).returning();
   await f.admin.insert(schema.courseEnrollments).values({institutionId:f.institutionId,studentId:peer!.id,courseId:f.course.id});
  }
  await f.admin.insert(schema.institutionUsers).values({id:reviewerUserId,institutionId:f.institutionId,fullName:'Synthetic second educator',email:`${reviewerUserId}@example.test`,status:'active'});
  await f.admin.insert(schema.institutionUserRoles).values({institutionUserId:reviewerUserId,roleKey:'institution_owner'});
  await f.admin.insert(schema.staff).values({id:reviewerStaffId,institutionId:f.institutionId,institutionUserId:reviewerUserId,firstName:'Synthetic',lastName:'Reviewer'});
  const auth=new PortalAuthService(database.db,env as never);const reviewer=await f.institution(()=>auth.resolveById(reviewerUserId,null));
  const reviewCtx={...f.ctx,principal:reviewer} as PortalActionContext;
  const config=defaultInstitutionPolicy();config.classSignals.enabled=true;config.classSignals.minimumCohortSize=5;config.classSignals.minimumIndependentEvidence=2;
  await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({institutionId:f.institutionId,scopeLevel:'institution',version:1,status:'published',schemaVersion:'petros.institutional-policy.v1',config,reason:'Explicit synthetic institutional sharing authority',authorId:f.teacherUserId,effectiveFrom:new Date(0),publishedAt:new Date()});
  const entities=new PortalEntityResolver(database.db);
  const audience=new PortalAudienceService(database.db,new RecipientResolver(database.db,entities,new UsersRepository(database.db)));
  const assignments=new AssignmentsService(new AssignmentsRepository(database.db),audience,{ingestAssignmentSubmission:vi.fn()} as never,database.db,database.auditWriter);
  const service=new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),{execute:vi.fn(()=>{throw new Error('No providers');})} as never,database.auditWriter,env as never,assignments);
  const publisher=new PortalCourseContentService(new PortalCrudEngine(database.db,database.auditWriter,entities),database.db,env as never,new MaterialDocumentPreviewService(),{resolve:async()=>null} as never,new KnowledgePreparationRepository(database.db),database.auditWriter);
  const students=new StudentAssignmentsService(database.db,{log:vi.fn()} as never);
  const rotate=()=>f.admin.update(schema.classSubjectTeachers).set({teacherId:reviewerStaffId}).where(and(eq(schema.classSubjectTeachers.classId,classId),eq(schema.classSubjectTeachers.subjectId,f.subjectId)));
  const preview=()=>f.institution(()=>service.previewIntervention(f.ctx,{classId,subjectId:f.subjectId,conceptKey:'component_motion',title:'Compare velocity components',description:'Explain the two velocity components with one source-grounded contrast.',expiresAt:new Date(Date.now()+86400000).toISOString(),commandId:randomUUID()}));
  return{...f,env,classId,reviewerUserId,reviewerStaffId,reviewCtx,service,publisher,students,rotate,preview,assignments,config};
}
