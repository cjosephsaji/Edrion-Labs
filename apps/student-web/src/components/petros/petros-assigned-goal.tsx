'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PetrosTeacherGuidance, PetrosGuidanceAttachment } from '@edrion/schemas';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { ActionButton, ActionLink, Card } from '@/components/design-system';
import { Download, Paperclip } from 'lucide-react';
import { PetrosDoorButton } from './petros-door-button';

export type AssignedPetrosGoal = {
  id: string; dueAt: string | null; status: string; petrosGuidance: PetrosTeacherGuidance;
  attachments?: PetrosGuidanceAttachment[];
  petrosParticipation: { started: boolean; completedSteps: number; currentSessionId: string | null } | null;
};
const approaches = { understand: 'Build understanding', practice: 'Practise a weak area', review: 'Review and recall' };

export function PetrosAssignedGoal({ data }: { data: AssignedPetrosGoal }) {
  const api = useStudentApi();
  const qc = useQueryClient();
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState('');
  const reported = ['submitted', 'late', 'graded'].includes(data.status);
  const guidance = data.petrosGuidance;
  const participation = data.petrosParticipation;
  const report = useMutation({
    mutationFn: () => api.post(`/student/assignments/learning-goals/${data.id}/completion`, { fileObjectIds: [], note: reflection.trim() }),
    onSuccess: () => {
      setError('');
      void qc.invalidateQueries({ queryKey: ['student', 'assignments'] });
      void qc.invalidateQueries({ queryKey: ['student', 'petros'] });
    },
    onError: (cause) => setError(formatApiError(cause)),
  });
  const due = data.dueAt ? new Date(`${data.dueAt}T12:00:00`).toLocaleDateString(undefined,
    { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return <div className="mx-auto max-w-[760px]">
    <Link href="/learn" className="text-sm text-[var(--s-faint)]">← Learn</Link>
    <header className="mt-5" data-petros-target={`entity:assignment:${data.id}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--s-accentDeep)]">Petros Learn · from your teacher</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-[var(--s-ink)]">{guidance.focus}</h1>
      <p className="mt-2 text-sm text-[var(--s-faint)]">{due ? `Complete by ${due} · ` : ''}{approaches[guidance.approach]} · about {guidance.sessionMinutes} minutes per session</p>
    </header>
    <Card className="mt-5" data-petros-target="assignment:brief">
      <h2 className="font-display text-lg font-semibold">Your teacher’s guidance</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--s-inkSoft)]">{guidance.instructions || 'Work on this learning goal with Petros, then explain what you learned.'}</p>
      <p className="mt-3 text-xs leading-5 text-[var(--s-faint)]">Your teacher can see session participation and whether you report completion. Session completion does not establish mastery.</p>
    </Card>
    {data.attachments?.length ? <Card className="mt-4" aria-labelledby="petros-goal-files">
      <h2 id="petros-goal-files" className="font-display text-lg font-semibold">Supporting files</h2>
      <ul className="mt-3 flex flex-col gap-3">{data.attachments.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2"><Paperclip size={16} className="mt-1 shrink-0" aria-hidden="true" /><div className="min-w-0"><p className="break-words text-sm font-medium">{file.filename}</p><p className="mt-1 text-xs text-[var(--s-faint)]">{file.textStatus === 'readable' ? 'Petros can use readable excerpts from this file.' : 'Use the original file as a reference; Petros could not read its text.'}</p></div></div>
        <ActionLink variant="secondary" href={api.fileUrl(`/student/assignments/learning-goals/${data.id}/files/${file.id}`)} download={file.filename} aria-label={`Download ${file.filename}`}><Download size={15} aria-hidden="true" />Download</ActionLink>
      </li>)}</ul>
    </Card> : null}
    <Card className="mt-4" variant="positive">
      <h2 className="font-display text-lg font-semibold">{reported ? 'Completion reported' : 'Learn with Petros'}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--s-inkSoft)]">{reported ? 'Your teacher can now follow up on this goal. You can return for more practice.' : 'Petros will use your teacher’s learning goal and instructions to guide your session.'}</p>
      <div className="mt-3 flex flex-wrap gap-3">{participation?.currentSessionId ?
        <ActionLink href={`/petros/session?session=${participation.currentSessionId}`}>Continue your session</ActionLink>
        : <PetrosDoorButton door="active_homework" sourceId={data.id} label={participation?.started ? 'Practise this goal again' : 'Start this learning goal'} timeBudgetSeconds={guidance.sessionMinutes * 60} />}</div>
    </Card>
    {!reported ? <Card className="mt-4">
      <h2 className="font-display text-lg font-semibold">When you have finished</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--s-inkSoft)]">Work through at least one learning step with Petros, then reflect on what you learned. Reporting completion records your participation for your teacher.</p>
      <label className="mt-4 block text-sm font-medium">What can you explain or do now?
        <textarea className="mt-2 min-h-28 w-full rounded-xl border border-[var(--s-bd2)] bg-[var(--s-cardAlt)] px-3.5 py-3 text-sm text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]" value={reflection} maxLength={2000} onChange={(event) => setReflection(event.target.value)} placeholder="Describe what you learned and anything you still need help with." />
      </label>
      {!(participation?.completedSteps) ? <p className="mt-2 text-xs text-[var(--s-faint)]">Finish a learning step to enable your completion report.</p> : null}
      <ActionButton className="mt-4" loading={report.isPending} loadingLabel="Reporting…" disabled={!participation?.completedSteps || reflection.trim().length < 8} onClick={() => report.mutate()}>Report completion</ActionButton>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--s-danger)]">{error}</p> : null}
    </Card> : null}
  </div>;
}
