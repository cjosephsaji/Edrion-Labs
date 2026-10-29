import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { M3_MODEL_VERSION, m3ActivityPreview, type ContentUnit, type SourceRevision } from '@edrion/schemas';
import { KnowledgePdfProcess } from '../../student/knowledge/knowledge-pdf-process';
import { PdfContentAdapter } from '../../student/knowledge/adapters/pdf-content.adapter';
import { PptxContentAdapter } from '../../student/knowledge/adapters/pptx-content.adapter';
import { DocxContentAdapter } from '../../student/knowledge/adapters/docx-content.adapter';
import { TxtContentAdapter } from '../../student/knowledge/adapters/txt-content.adapter';
import { MarkdownContentAdapter } from '../../student/knowledge/adapters/markdown-content.adapter';
import { fixtureRevision } from '../../student/knowledge/petros-m2-test-helpers';
import { produceContentUnits } from '../../student/knowledge/petros-content-intelligence.service';
import { controlledAuthorization, controlledGateway } from '../../student/knowledge/petros-m2-controlled-gateway.fixture';
import { engineeringOutline, validateM3Model, proposalEvidence, assembleProposal, proposalHash } from './petros-learning-proposal.validation';
import { controlledSourceProposal } from './petros-learning-proposal.fixture';
import { generateM3WithGateway } from './petros-learning-proposal.gateway';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
const root=resolve(__dirname,'../../../../../../packages/learn-evals/src/petros-v2/fixtures/sources');
const corpus:Record<string,{revision:SourceRevision;units:ContentUnit[]}>= {};
beforeAll(async()=>{
 const worker=new KnowledgePdfProcess();
 for(const [name,adapter] of [['cloud-models.pptx',new PptxContentAdapter(worker)],['cloud-models-revised.pptx',new PptxContentAdapter(worker)],
  ['argument.pdf',new PdfContentAdapter(worker)],['argument-revised.pdf',new PdfContentAdapter(worker)],
  ['m2fa/cloud-notes.docx',new DocxContentAdapter(worker)],['m2fa/cloud-notes.txt',new TxtContentAdapter(worker)],
  ['m2fa/argument-notes.md',new MarkdownContentAdapter(worker)],['ambiguous-arrow.pptx',new PptxContentAdapter(worker)]] as const) {
  const e=await adapter.extract(readFileSync(resolve(root,name)),new AbortController().signal),revision=fixtureRevision(e);
  corpus[name]={revision,units:proposalEvidence(produceContentUnits(e,revision))};
  if(name==='cloud-models.pptx')corpus['original-diagram.pptx']={revision,units:produceContentUnits(e,revision)};
 }
 const zip=await JSZip.loadAsync(readFileSync(resolve(root,'cloud-models.pptx'))),slide=await zip.file('ppt/slides/slide4.xml')!.async('string');
 if(!slide.includes('<p:cxnSp>'))throw Error('Actual source connector required');
 zip.file('ppt/slides/slide4.xml',slide.replace(/<p:cxnSp>.*?<\/p:cxnSp>/g,''));
 const e=await new PptxContentAdapter(worker).extract(await zip.generateAsync({type:'nodebuffer'}),new AbortController().signal),revision=fixtureRevision(e);
 corpus['diagram-removed.pptx']={revision,units:produceContentUnits(e,revision)};
},60000);
describe('M3 real extracted source contracts',()=>{
 for(const name of ['cloud-models.pptx','argument.pdf','m2fa/cloud-notes.docx','m2fa/cloud-notes.txt','m2fa/argument-notes.md'])
  it(`validates source outline with native anchors: ${name}`,()=>{const {revision,units}=corpus[name]!;
   const p=validateM3Model(engineeringOutline(units),revision,units);expect(p.objectives.length).toBeLessThanOrEqual(3);
   expect(p.objectives[0]!.support[0]!.reference.locator.kind).toBe(name.endsWith('.pdf')?'pdf':name.endsWith('.pptx')?'slide':name.endsWith('.docx')?'docx':name.endsWith('.txt')?'txt':'markdown');});
 for(const [name,domain] of [['cloud-models.pptx','cloud'],['argument.pdf','argument']] as const)
  it(`has distinct observable controlled objectives and two activity families: ${domain}`,()=>{const {revision,units}=corpus[name]!;
   const p=validateM3Model(controlledSourceProposal(units,domain),revision,units);expect(p.objectives).toHaveLength(2);
   expect(new Set(p.activities.map(a=>a.family)).size).toBeGreaterThanOrEqual(2);expect(p.relationships).toEqual([]);
   p.objectives.forEach(o=>expect(new Set(p.activities.filter(a=>a.objectiveKey===o.key).map(a=>a.family)).size).toBeGreaterThanOrEqual(2));
   if(domain==='cloud') p.activities.forEach(a=>expect(a.support.every(s=>p.objectives.find(o=>o.key===a.objectiveKey)!.support.some(t=>t.reference.unitId===s.reference.unitId))).toBe(true));});
 it('verifies exact responsibility cells, virtualization wording, locators and distinct source units',()=>{
  const {revision,units}=corpus['cloud-models.pptx']!,model=validateM3Model(controlledSourceProposal(units,'cloud'),revision,units);
  const table=units.find(u=>u.id===model.objectives[0]!.support[0]!.reference.unitId)!;
  expect(table.payload.kind).toBe('table');
  if(table.payload.kind==='table') expect(table.payload.cells.map(c=>c.value)).toEqual(['Model','Consumer responsibility','Provider responsibility','IaaS','Operating system','Physical hardware','PaaS','Application code','Runtime','SaaS','Access policy','Application platform']);
  const virtualization=model.objectives[1]!.support[0]!;
  expect(virtualization.quote).toContain('Virtualization separates logical resources from physical hardware.');
  expect(virtualization.quote).toContain('A virtual machine has an allocated CPU and memory budget.');
  expect(virtualization.reference.locator).toMatchObject({kind:'slide',slide:2,shapeId:'shape.3'});
  expect(model.objectives[0]!.support[0]!.reference.locator).toMatchObject({kind:'slide',slide:3,shapeId:'shape.3'});
  expect(virtualization.reference.unitId).not.toBe(table.id);
  expect(model.activities.filter(a=>a.objectiveKey==='objective_0')[0]!.family).toBe('table_exploration');
  expect(model.activities.filter(a=>a.objectiveKey==='objective_1')[0]!.family).toBe('comparison');
  if(process.env.PETROS_UX_EVIDENCE_OUTPUT) writeFileSync(resolve(process.env.PETROS_UX_EVIDENCE_OUTPUT,'source-audit.json'),JSON.stringify(Object.fromEntries(['cloud-models.pptx','argument.pdf'].map(name=>[name,{revision:corpus[name]!.revision,units:corpus[name]!.units,model:controlledSourceProposal(corpus[name]!.units,name.endsWith('.pdf')?'argument':'cloud')} ])),null,2));
 });
 it('limits trusted comparison previews to objective concepts and never turns co-occurrence into an edge',()=>{
  const {revision,units}=corpus['cloud-models.pptx']!,model=controlledSourceProposal(units,'cloud');
  const p=assembleProposal(model,{id:randomUUID(),institutionId:revision.source.institutionId,classId:randomUUID(),subjectId:revision.source.binding.subjectId,courseId:null,curriculumRevision:0,actorId:revision.processing.createdBy,revision,preferences:{focus:'',durationMinutes:20,emphasis:''},commandId:randomUUID(),requestHash:proposalHash('preview-scope'),origin:'controlled_fixture',concepts:model.concepts.map(()=>({id:randomUUID(),version:1}))});
  p.relationships=[{from:'concept_1',to:'concept_2',kind:'hard_prerequisite',rationale:'Unreviewed test proposal',support:p.objectives[1]!.support,status:'review_required'}];
  const a=p.activities.find(a=>a.objectiveId===p.objectives[1]!.id)!;
  const block=m3ActivityPreview(p,a.id);
  expect(block.content.type).toBe('diagram');
  if(block.content.type==='diagram') {expect(block.content.nodes.map(n=>n.label)).toEqual(['Logical resources','Physical hardware']);expect(block.content.edges).toEqual([]);expect(block.questions).toEqual([]);expect(block.interactionState).toEqual({});}
  a.capabilityStatus='unsupported_execution';expect(()=>m3ActivityPreview(p,a.id)).toThrow('M3_PREVIEW_UNAVAILABLE');
 });
 it('changed actual source bytes reject old support references',()=>{
  for(const [old,current,domain] of [['cloud-models.pptx','cloud-models-revised.pptx','cloud'],['argument.pdf','argument-revised.pdf','argument']] as const){
   expect(corpus[old]!.revision.source.originalHash).not.toBe(corpus[current]!.revision.source.originalHash);
   expect(()=>validateM3Model(controlledSourceProposal(corpus[old]!.units,domain),corpus[current]!.revision,corpus[current]!.units)).toThrow();
  }});
 it('diagram removal changes source identity and no old diagram explanation is inherited',()=>{const old=corpus['original-diagram.pptx']!,changed=corpus['diagram-removed.pptx']!;expect(old.revision.source.originalHash).not.toBe(changed.revision.source.originalHash);
  const before=old.units.filter(u=>u.payload.kind==='diagram').map(u=>u.payload),after=changed.units.filter(u=>u.payload.kind==='diagram').map(u=>u.payload);expect(before).not.toEqual(after);
  expect(()=>validateM3Model(controlledSourceProposal(old.units,'cloud'),changed.revision,proposalEvidence(changed.units))).toThrow();});
 const cases:[string,(p:ReturnType<typeof engineeringOutline>)=>void][]=[
  ['fabricated citation',p=>p.claims[0]!.support[0]!.reference.unitId=randomUUID()],
  ['wrong source hash',p=>p.claims[0]!.support[0]!.reference.sourceHash='a'.repeat(64)],
  ['invented locator',p=>p.claims[0]!.support[0]!.reference.locator={kind:'txt'} as never],
  ['changed quote',p=>p.claims[0]!.support[0]!.quote='private answer'],
  ['incorrect number',p=>p.claims[0]!.statement='Measured value is 123456789.'],
  ['unsupported cause',p=>p.claims[0]!.statement='Every service causes guaranteed performance.'],
  ['unsupported relationship meaning',p=>p.relationships=[{from:'concept_0',to:'concept_1',kind:'related',rationale:'Every service causes guaranteed performance.',support:p.claims[0]!.support}]],
  ['unregistered kernel',p=>p.activities[0]!.kernel='arbitrary-js'],
  ['unsupported gesture',p=>p.activities[0]!.operations=['avatar.fly']],
  ['private editable region',p=>p.activities[0]!.editableRegions=['private_answer']],
  ['missing accessibility',p=>p.activities[0]!.accessibilityAlternative=''],
  ['unknown objective',p=>p.activities[0]!.objectiveKey='foreign'],
  ['duplicate concept key',p=>p.concepts.push(structuredClone(p.concepts[0]!))],
  ['vague capability',p=>p.objectives[0]!.observableCapability='Understand this topic'],
  ['model approval',p=>(p as unknown as Record<string,unknown>).approved=true],
  ['forged reviewer identity',p=>(p as unknown as Record<string,unknown>).reviewerUserId=randomUUID()],
  ['fake genuine origin',p=>(p as unknown as Record<string,unknown>).origin='genuine_model'],
  ['private rubric',p=>(p as unknown as Record<string,unknown>).rubric='PRIVATE_M3_SENTINEL'],
  ['malformed graph',p=>p.relationships=[{from:'foreign',to:'other',kind:'related',rationale:'Invented',support:p.claims[0]!.support}]],
  ['prerequisite cycle',p=>p.relationships=[{from:'concept_0',to:'concept_1',kind:'hard_prerequisite',rationale:'Candidate',support:p.claims[0]!.support},{from:'concept_1',to:'concept_0',kind:'hard_prerequisite',rationale:'Candidate',support:p.claims[0]!.support}]],
 ];
 for(const [name,mutate] of cases)it(`rejects ${name}`,()=>{const {revision,units}=corpus['cloud-models.pptx']!,p=engineeringOutline(units);mutate(p);expect(()=>validateM3Model(p,revision,units)).toThrow();});
 it('compiles public quotations into the existing trusted preview without private fields',()=>{const {revision,units}=corpus['argument.pdf']!,model=engineeringOutline(units);
  const p=assembleProposal(model,{id:randomUUID(),institutionId:revision.source.institutionId,classId:randomUUID(),subjectId:revision.source.binding.subjectId,courseId:null,
   curriculumRevision:0,actorId:revision.processing.createdBy,revision,preferences:{focus:'',durationMinutes:20,emphasis:''},commandId:randomUUID(),requestHash:proposalHash('fixture'),origin:'controlled_fixture',concepts:model.concepts.map(()=>({id:randomUUID(),version:1}))});
  const block=m3ActivityPreview(p,p.activities[0]!.id);expect(block.questions).toEqual([]);expect(JSON.stringify(block)).not.toContain('PRIVATE_M3_SENTINEL');});
});
describe('M3 existing gateway controlled adapter',()=>{
 const auth=(revision:SourceRevision)=>{const a=controlledAuthorization(revision);a.sourceReservation!.stage='teaching.propose';a.sourceReservation!.interpretationVersion=M3_MODEL_VERSION;return a;};
 it('executes controlled adapter through real gateway contract; never labels genuine',async()=>{const {revision,units}=corpus['argument.pdf']!,selected=units.slice(0,8),p=engineeringOutline(selected),g=controlledGateway(p);
  const result=await generateM3WithGateway(g.gateway,revision,selected,{},auth(revision),new AbortController().signal);
  expect(result.generator.origin).toBe('controlled_fixture');expect(result.generator.providerRequestId).toBeNull();expect(g.execute).toHaveBeenCalledOnce();
  expect(g.redis.set).not.toHaveBeenCalled();expect(g.repo.reserveSourceAttempt).toHaveBeenCalledOnce();expect(g.repo.settleDocumentAttempt).toHaveBeenCalledOnce();});
 it('default denies dispatch without authorization',async()=>{const {revision,units}=corpus['argument.pdf']!,g=controlledGateway(engineeringOutline(units));await expect(generateM3WithGateway(g.gateway,revision,units.slice(0,8),{},undefined,new AbortController().signal)).rejects.toThrow('AUTHORIZATION');expect(g.execute).not.toHaveBeenCalled();});
 it('reservation failure dispatches nothing',async()=>{const {revision,units}=corpus['argument.pdf']!,g=controlledGateway(engineeringOutline(units),true);await expect(generateM3WithGateway(g.gateway,revision,units.slice(0,8),{},auth(revision),new AbortController().signal)).rejects.toThrow();expect(g.execute).not.toHaveBeenCalled();});
 it('aborted deadline dispatches nothing',async()=>{const {revision,units}=corpus['argument.pdf']!,g=controlledGateway(engineeringOutline(units)),c=new AbortController();c.abort();await expect(generateM3WithGateway(g.gateway,revision,units.slice(0,8),{},auth(revision),c.signal)).rejects.toThrow();expect(g.execute).not.toHaveBeenCalled();});
 it('genuine mode requires an actual provider receipt',async()=>{const {revision,units}=corpus['argument.pdf']!,g=controlledGateway(engineeringOutline(units.slice(0,8))),a=auth(revision);a.mode='authorized_live';await expect(generateM3WithGateway(g.gateway,revision,units.slice(0,8),{},a,new AbortController().signal)).rejects.toThrow('GENUINE_PROVIDER');});
});
