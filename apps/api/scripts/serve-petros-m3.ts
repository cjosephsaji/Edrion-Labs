/** Local demonstration ONLY. Disposable cluster and loopback listener; production bootstrap is never used. */
import 'reflect-metadata';
import express from 'express';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandEffectiveKeys } from '@edrion/permissions';
import { ALL_INSTITUTION_PERMISSION_KEYS } from '@edrion/permissions/institution';
import { resolveNomenclature } from '@edrion/shared-types';
import { randomUUID } from 'node:crypto';
import { startM3Fixture, m3FixtureRoot } from '../src/modules/integrations/petros-m3-fixture';
import { PortalTeachingService } from '../src/modules/portal/teaching/portal-teaching.service';
import { controlledSourceProposal } from '../src/modules/portal/teaching/petros-learning-proposal.fixture';
import { eq, schema } from '@edrion/database';
async function main() {
 const f=await startM3Fixture(),teaching=new PortalTeachingService(f.f.db),app=express();
 const cloud=await f.document('cloud-models.pptx','cloud'),english=await f.document('argument.pdf','argument');
 await f.document('m2fa/cloud-notes.docx','cloud');await f.document('m2fa/cloud-notes.txt','cloud');await f.document('m2fa/argument-notes.md','argument');
 const privateSource=await f.document('m3/private-review-source.txt','cloud');
 let syntheticReviewerMode=false;
 const run:typeof f.run=work=>syntheticReviewerMode?f.runReviewer(work):f.run(work);
 for(const [domain,file] of [['cloud',cloud],['argument',english]] as const) await f.run(ctx=>f.service.prepareControlled(ctx,f.classId,f.subjects[domain],
  {commandId:randomUUID(),sourceRevisionId:file.revision.id},units=>controlledSourceProposal(units,domain)));
 app.use((req,res,next)=>{const origin=req.headers.origin;if(origin&& !['http://127.0.0.1:4894','http://localhost:4894'].includes(origin))return res.status(403).end();
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
  res.setHeader('Access-Control-Allow-Headers','content-type,x-institution-scope,x-institution-user-email');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Cache-Control','private, no-store');if(req.method==='OPTIONS')return res.status(204).end();next();});
 app.use(express.json({limit:'100kb'}));
 // Explicit isolated synthetic handoff only. This endpoint never belongs to an application module.
 app.post('/demo/private-review',async(_req,res)=>{try {
  if(!syntheticReviewerMode) {
   await f.qualification('cloud');await f.qualification('cloud','active',undefined,true);
   let proposal=(await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects.cloud,{commandId:randomUUID(),sourceRevisionId:privateSource.revision.id}))).proposal;
   proposal=(await f.run(ctx=>f.service.edit(ctx,f.classId,proposal.subjectId,proposal.id,{commandId:randomUUID(),expectedVersion:proposal.version,change:{kind:'submit_review'}}))).proposal;
   const task=proposal.taskCandidates.find(t=>t.kind==='held_out_verification')!;
   await f.run(ctx=>f.service.prepareVerification(ctx,f.classId,proposal.subjectId,proposal.id,task.id,{commandId:randomUUID(),expectedVersion:proposal.version,expectedFamilyVersion:0}));
   await f.admin.update(schema.storageObjects).set({ownerStaffUserId:f.reviewer}).where(eq(schema.storageObjects.id,privateSource.objectId));
   await f.admin.update(schema.classSubjectTeachers).set({teacherId:f.reviewerStaff}).where(eq(schema.classSubjectTeachers.subjectId,proposal.subjectId));
   syntheticReviewerMode=true;
  }
  res.json({label:'Isolated synthetic qualified reviewer and current source ownership handoff; not actual academic authorization',url:`http://127.0.0.1:4894/teaching/${f.classId}/${f.subjects.cloud}`});
 }catch(e){res.status(500).json({message:e instanceof Error?e.message:'Synthetic setup failed'});}});
 app.get('/demo-info',(_req,res)=>res.json({classId:f.classId,subjects:f.subjects,institutionId:f.institutionId,label:'Controlled fixtures; disposable authorization-path demonstration'}));
 app.get('/v1/portal/me',async(_req,res)=>{const principal=await run(ctx=>Promise.resolve(ctx.principal));res.json({...principal,permissions:expandEffectiveKeys(principal.permissions,ALL_INSTITUTION_PERMISSION_KEYS),
  institutionName:'Isolated M3 demonstration',institutionStatus:'active',onboardingStatus:'completed',institutionType:'school',institutionCountry:'IN',campuses:[],featureFlags:{},nomenclature:resolveNomenclature('school'),navigation:{},timeZone:'Asia/Kolkata'});});
 app.all('/v1/portal/teaching/:classId/:subjectId/proposals/:id?/:action?/:detail?',async(req,res)=>{
  const {classId,subjectId,id,action,detail}=req.params;
  try {const value=await run(ctx=>{
   if(req.method==='GET'&&id==='sources')return f.service.sources(ctx,classId,subjectId);
   if(req.method==='POST'&&!id)return f.service.prepare(ctx,classId,subjectId,req.body);
   if(req.method==='GET'&&id&&!action)return f.service.view(ctx,classId,subjectId,id);
   if(req.method==='GET'&&action==='evidence')return f.service.evidence(ctx,classId,subjectId,id!,detail!);
   if(req.method==='GET'&&action==='readiness')return f.service.readiness(ctx,classId,subjectId,id!);
   if(req.method==='GET'&&action==='revisions')return f.service.view(ctx,classId,subjectId,id!,Number(detail));
   if(req.method==='POST'&&action==='edits')return f.service.edit(ctx,classId,subjectId,id!,req.body);
   if(req.method==='POST'&&action==='reviews')return f.service.review(ctx,classId,subjectId,id!,req.body);
   if(req.method==='GET'&&action==='verification')return f.service.verificationPreview(ctx,classId,subjectId,id!,detail!);
   if(req.method==='POST'&&action==='verification')return f.service.prepareVerification(ctx,classId,subjectId,id!,detail!,req.body);
   if(req.method==='POST'&&action==='release')return f.service.release(ctx,classId,subjectId,id!,req.body);
   throw new Error('Unsupported isolated demonstration request');});res.json(value);
  }catch(e){const err=e as {getStatus?:()=>number;getResponse?:()=>unknown;message?:string};const response=err.getResponse?.();res.status(err.getStatus?.()??500).json(typeof response==='object'?{...response as object,message:err.message}: {message:err.message});}
 });
 app.get('/v1/portal/teaching/:classId/:subjectId/guidance',(_req,res)=>res.json({students:[],goals:[]}));
 app.get('/v1/portal/teaching/:classId/:subjectId',async(req,res)=>{try{res.json(await run(ctx=>teaching.assignment(ctx,req.params.classId,req.params.subjectId)));}catch{res.status(404).json({message:'Unavailable'});}});
 // Surrounding portal chrome receives empty synthetic lists. Proposal operations above are real App-role service calls.
 app.get('/v1/portal/auth/institutions',(_req,res)=>res.json({institutions:[]}));
 app.get('/v1/*',(_req,res)=>res.json({items:[],rows:[],total:0}));
 const server=app.listen(4893,'127.0.0.1',()=>{
  const info={cloud:`http://127.0.0.1:4894/teaching/${f.classId}/${f.subjects.cloud}`,english:`http://127.0.0.1:4894/teaching/${f.classId}/${f.subjects.argument}`};
  writeFileSync(resolve(m3FixtureRoot,'docs/verification/petros-v2/m3-evidence/demo-info.json'),JSON.stringify(info,null,2));console.log(JSON.stringify(info));});
 const stop=()=>server.close(()=>{void f.f.close().then(()=>process.exit(0));});process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
