'use client';

import {useRef,useState} from 'react';
import {z} from 'zod';
import {petrosAssignmentLearningPreviewCommandSchema,petrosAssignmentLearningReleaseCandidateSchema,
  petrosAssignmentLearningReceiptSchema,type PetrosConceptPackCandidate,
  type PetrosAssignmentLearningReleaseCandidate} from '@edrion/schemas';
import {usePortalClient,formatPortalError} from '@/lib/portal-client';
import {useScope} from '@/lib/scope';

const field='mt-1 min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm';
const button='min-h-10 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50';

/** Publication uses the existing assignment audience and release owner; it never creates a cohort. */
export function PetrosLessonPublication({candidate,courseId}:{candidate:PetrosConceptPackCandidate;courseId:string}) {
  const api=usePortalClient();const {scope}=useScope();
  const [assignmentId,setAssignmentId]=useState('');const [version,setVersion]=useState('0');
  const [studentId,setStudentId]=useState('');const [sessionId,setSessionId]=useState('');
  const [preview,setPreview]=useState<PetrosAssignmentLearningReleaseCandidate|null>(null);
  const [acknowledged,setAcknowledged]=useState(false);const [busy,setBusy]=useState(false);
  const pendingCommand=useRef<string|null>(null);
  const [error,setError]=useState('');const [receipt,setReceipt]=useState('');
  const change=()=>{pendingCommand.current=null;setPreview(null);setAcknowledged(false);setReceipt('');setError('');};
  async function prepare() {
    pendingCommand.current=null;setBusy(true);setError('');setPreview(null);setAcknowledged(false);
    try {
      const id=z.string().uuid().parse(assignmentId.trim());
      const anchors=[...(candidate.claims??[]),...candidate.concepts,...candidate.prerequisites,...candidate.examples,
        ...candidate.misconceptions,...candidate.assessments].flatMap(item=>item.anchors);
      const locators=[...new Map(anchors.map(anchor=>[JSON.stringify(anchor.locator),anchor.locator])).values()];
      const command=petrosAssignmentLearningPreviewCommandSchema.parse({schemaVersion:'petros.assignment-learning-release.v1',
        expectedAssignmentVersion:Number(version),target:{kind:'objective',courseId,pack:candidate.pack,
          objective:candidate.objective,curriculumRevision:candidate.curriculumRevision,
          source:{sessionId:sessionId.trim(),sourceVersion:candidate.sourceVersion,locators}},
        policy:{assistance:'guided_learning',resourceMode:'source_bound',answerDisclosure:'never',evidenceRequirement:'participation'},
        recipientContexts:[{studentId:studentId.trim(),sessionId:sessionId.trim()}]});
      setPreview(petrosAssignmentLearningReleaseCandidateSchema.parse(await api.post(`/portal/assignments/${id}/learning-release/preview`,scope,command)));
    } catch(cause){setError(formatPortalError(cause,'This assignment cannot currently release the selected lesson.'));}
    finally{setBusy(false);}
  }
  async function publish() {
    if(!preview||!acknowledged||busy)return;
    setBusy(true);setError('');
    try {
      pendingCommand.current??=crypto.randomUUID();
      const result=petrosAssignmentLearningReceiptSchema.parse(await api.post(`/portal/assignments/${preview.assignment.id}/learning-release`,scope,
        {schemaVersion:preview.schemaVersion,commandId:pendingCommand.current,candidate:preview}));
      pendingCommand.current=null;setReceipt(result.releaseId);setPreview(null);setAcknowledged(false);
    } catch(cause){setError(formatPortalError(cause,'Publication was not acknowledged. Check the assignment before retrying.'));}
    finally{setBusy(false);}
  }
  return <details className="mt-4 rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">Publish the reviewed lesson through an existing assignment</summary>
    <p className="my-3 text-sm text-text-secondary">This bounded release supports one explicitly assigned learner. The assignment must already be published with guided learning allowed, and the learner's current document session must name that assignment. Class publication and production pilot approval remain unavailable.</p>
    <div className="grid gap-3 sm:grid-cols-2">{[
      ['Existing assignment ID',assignmentId,setAssignmentId],['Current assignment version',version,setVersion],
      ['Assigned learner ID',studentId,setStudentId],['Assignment-bound document session ID',sessionId,setSessionId],
    ].map(([label,value,setter])=><label key={label as string} className="text-sm">{label as string}<input className={field} value={value as string} disabled={busy}
      onChange={event=>{change();(setter as (value:string)=>void)(event.target.value);}} /></label>)}</div>
    <button type="button" className={`${button} mt-3`} disabled={busy} onClick={()=>void prepare()}>{busy?'Checking current authority…':'Preview assignment release'}</button>
    {preview&&<div className="mt-3 grid gap-2 text-sm"><p>One learner · assignment v{preview.assignment.version} · pack v{preview.target.pack.version} · guided learning · source bound · participation only.</p>
      <p>Independent mastery is not inferred. The server will recheck the audience, source, curriculum, qualified review and policy before publication.</p>
      <details><summary>Exact release scope</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(preview,null,2)}</pre></details>
      <label><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)} /> I checked this exact learner, assignment and reviewed lesson scope.</label>
      <button type="button" className={button} disabled={!acknowledged||busy} onClick={()=>void publish()}>Publish this assignment lesson</button>
    </div>}
    {receipt&&<p role="status" className="mt-3 break-all text-sm">Publication acknowledged. Release receipt {receipt}. Historical lesson and evidence references are retained.</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </details>;
}
