'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, FileCheck2, FileUp, LockKeyhole, Paperclip, X } from 'lucide-react';
import { QueryPage } from '@/components/query-page';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { PetrosAssignedGoal, type AssignedPetrosGoal } from '@/components/petros/petros-assigned-goal';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { formatApiError, useStudentApi } from '@/lib/api-client';

type Detail = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  maxPoints: number | null;
  aiPolicy?: 'full' | 'hints_only' | 'off' | string;
  allowResubmission: boolean;
  status: string;
  pointsAwarded: number | null;
  feedback: string | null;
  versions: Array<{ versionNo: number; submittedAt: string; late: boolean; note: string | null }>;
  petrosGuidance?: AssignedPetrosGoal['petrosGuidance'] | null;
  petrosParticipation?: AssignedPetrosGoal['petrosParticipation'];
};

function GovernancePill({ policy }: { policy?: string }) {
  const off = policy === 'off';
  const concept = policy === 'hints_only' || policy === 'concept';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono-ui text-[9px] font-semibold ${off ? 'border-[var(--st-goldBd)] bg-[var(--st-goldSoftBg)] text-[var(--st-goldInk)]' : concept ? 'border-[var(--s-amberBd)] bg-[var(--s-amberSoft)] text-[var(--s-amberInk)]' : 'border-[var(--s-accentBd)] bg-[var(--s-accentSoft)] text-[var(--s-accentDeep)]'}`}>
      <LockKeyhole className="h-3 w-3" /> {off ? 'HELP OFF' : concept ? 'CONCEPT HELP ONLY' : 'FULL HELP ALLOWED'}
    </span>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useStudentApi();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [declared, setDeclared] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['student', 'assignments', id],
    queryFn: () => api.get<Detail>(`/student/assignments/${id}`),
    enabled: Boolean(id),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!file && !note.trim()) throw new Error('Attach a file or include a submission note.');
      if (!declared) throw new Error('Confirm the declaration before submitting.');
      const fileObjectIds: string[] = [];
      if (file) {
        const uploaded = await api.upload('assignment_file', file);
        fileObjectIds.push(uploaded.id);
      }
      return api.post<{ submitted: true; versionNo: number }>(`/student/assignments/${id}/submissions`, {
        fileObjectIds,
        note: note.trim() || null,
      });
    },
    onSuccess: async () => {
      setFormError(null);
      setReviewOpen(false);
      setFile(null);
      setNote('');
      setDeclared(false);
      await qc.invalidateQueries({ queryKey: ['student', 'assignments'] });
      await qc.invalidateQueries({ queryKey: ['student', 'petros', 'mentor'] });
      await query.refetch();
    },
    onError: (error) => setFormError(formatApiError(error)),
  });

  usePetrosPage(query.data ? { title: query.data.title, candidates: [{ ref: id, entityType: 'assignment', entityId: id, title: query.data.title, href: `/assignments/${id}` }] } : null);

  return (
    <QueryPage query={query} loadingLabel="Loading assignment…">
      {(raw) => {
        const data = raw as Detail;
        if (data.petrosGuidance) return <PetrosAssignedGoal data={{ id: data.id, dueAt: data.dueAt,
          status: data.status, petrosGuidance: data.petrosGuidance, petrosParticipation: data.petrosParticipation ?? null }} />;
        const locked = ['graded', 'returned'].includes(data.status) && !data.allowResubmission;
        const canSubmit = !locked && data.status !== 'graded';
        const due = data.dueAt ? new Date(data.dueAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'No due date';

        return (
          <div className="mx-auto max-w-[760px] py-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/assignments" className="text-[12.5px] font-semibold text-[var(--s-faint)] hover:text-[var(--s-accentDeep)]">← All assignments</Link>
            </div>

            <header className="mt-4" data-petros-target={`entity:assignment:${id}`}>
              <GovernancePill policy={data.aiPolicy} />
              <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-.01em] text-[var(--s-ink)]">{data.title}</h1>
              <p className="mt-1 text-[12.5px] text-[var(--s-faint)]">Due {due}{data.maxPoints != null ? ` · ${data.maxPoints} points` : ''} · {data.status.replaceAll('_', ' ')}</p>
            </header>

            <section data-petros-target="assignment:brief" className="mt-5 rounded-[15px] border border-[var(--s-bd1)] bg-[var(--s-card)] p-[18px_22px]">
              <h2 className="font-display text-[16px] font-semibold text-[var(--s-ink)]">Instructions</h2>
              <p className="mt-3 whitespace-pre-wrap font-display text-[14.5px] leading-7 text-[var(--s-inkSoft)]">{data.instructions?.trim() || 'No additional instructions were provided.'}</p>
            </section>

            {!['submitted', 'graded', 'returned'].includes(data.status) ? (
              <section className="mt-3.5 rounded-[15px] border border-[var(--s-accentBd)] bg-[var(--s-accentSoft)] p-[18px_22px]">
                <h2 className="font-display text-[16px] font-semibold text-[var(--s-ink)]">Work through it with Petros</h2>
                <div className="mt-3"><PetrosDoorButton door="active_homework" sourceId={data.id} label="Work on this with Petros" timeBudgetSeconds={900} /></div>
              </section>
            ) : null}

            {data.feedback || data.pointsAwarded != null ? (
              <section className="mt-3.5 rounded-[15px] border border-[var(--s-accentBd)] bg-[var(--s-accentSoft)] p-[18px_22px]">
                <h2 className="font-display text-[16px] font-semibold text-[var(--s-success)]">Returned by your professor</h2>
                {data.pointsAwarded != null ? <p className="mt-2 font-display text-2xl font-semibold text-[var(--s-ink)]">{data.pointsAwarded}{data.maxPoints != null ? ` / ${data.maxPoints}` : ''}</p> : null}
                {data.feedback ? <p className="mt-2 text-[13px] leading-6 text-[var(--s-inkSoft)]">{data.feedback}</p> : null}
              </section>
            ) : null}

            {data.versions.length > 0 ? (
              <section className="mt-3.5 rounded-[15px] border border-[var(--s-bd1)] bg-[var(--s-card)] p-[18px_22px]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-[15px] font-semibold text-[var(--s-ink)]">Submission history</h2>
                  <span className="font-mono-ui text-[9px] text-[var(--s-faint)]">{data.versions.length} {data.versions.length === 1 ? 'VERSION' : 'VERSIONS'}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {data.versions.map((version) => (
                    <li key={version.versionNo} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-[var(--s-surface2)] px-3.5 py-2.5">
                      <span className="rounded-full bg-[var(--s-accentSoft)] px-2.5 py-1 font-mono-ui text-[9px] font-semibold text-[var(--s-accentDeep)]">v{version.versionNo}</span>
                      <span className="text-xs text-[var(--s-inkSoft)]">{new Date(version.submittedAt).toLocaleString()}</span>
                      {version.late ? <span className="ml-auto font-mono-ui text-[9px] font-semibold text-[var(--s-amber)]">LATE</span> : <Check className="ml-auto h-4 w-4 text-[var(--s-success)]" />}
                      {version.note ? <p className="w-full pl-0.5 text-[11px] text-[var(--s-faint)]">{version.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {canSubmit ? (
              <section data-petros-target="assignment:submission" className="mt-3.5 rounded-[15px] border-[1.5px] border-[var(--s-accentBd)] bg-[var(--s-card)] p-[18px_22px] shadow-[0_12px_30px_-24px_rgba(12,63,49,.5)]">
                <h2 className="font-display text-[16px] font-semibold text-[var(--s-ink)]">{data.versions.length ? 'Add a new version' : 'Your submission'}</h2>
                <label className="mt-3 block cursor-pointer rounded-xl border-[1.5px] border-dashed border-[var(--s-bd2)] bg-[var(--s-cardAlt)] px-5 py-7 text-center hover:border-[var(--s-accent)]">
                  <input type="file" className="sr-only" accept=".pdf,image/*,.doc,.docx,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                  {file ? <FileCheck2 className="mx-auto h-6 w-6 text-[var(--s-success)]" /> : <FileUp className="mx-auto h-6 w-6 text-[var(--s-faint)]" />}
                  <span className="mt-2 block text-[13px] font-semibold text-[var(--s-ink)]">{file ? file.name : 'Drop your file here, or choose one'}</span>
                  <span className="mt-1 block text-[11px] text-[var(--s-faint)]">PDF, image, Word, or text file</span>
                </label>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-semibold text-[var(--s-inkSoft)]">Note to your professor <span className="font-normal text-[var(--s-faint)]">(optional)</span></span>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Add context about your submission…" className="w-full resize-y rounded-xl border border-[var(--s-bd2)] bg-[var(--s-cardAlt)] px-3.5 py-3 text-[13px] text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]" />
                </label>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-[var(--s-surface2)] p-3">
                  <input type="checkbox" checked={declared} onChange={(event) => setDeclared(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--s-accent)]" />
                  <span className="text-[11.5px] leading-5 text-[var(--s-inkSoft)]">I confirm this is my work and the attached file is the version I want to submit.</span>
                </label>
                {formError ? <p className="mt-3 text-xs text-[var(--s-danger)]">{formError}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={(!file && !note.trim()) || !declared || submit.isPending} onClick={() => setReviewOpen(true)} className="rounded-[11px] bg-[var(--s-accentDeep)] px-[18px] py-[11px] text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Review submission</button>
                </div>
              </section>
            ) : (
              <section className="mt-3.5 rounded-[15px] border border-[var(--s-bd1)] bg-[var(--s-sidebar)] p-5 text-[13px] text-[var(--s-faint)]">This assignment is closed for further submissions.</section>
            )}

            {reviewOpen ? (
              <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Review submission">
                <div className="w-full max-w-md rounded-t-[20px] border border-[var(--s-bd1)] bg-[var(--s-card)] p-5 shadow-2xl sm:rounded-[18px]">
                  <div className="flex items-center gap-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-[var(--s-ink)]">Ready to submit?</h2>
                    </div>
                    <button type="button" onClick={() => setReviewOpen(false)} className="ml-auto rounded-full p-2 text-[var(--s-faint)]"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="mt-4 space-y-2 rounded-xl bg-[var(--s-surface2)] p-3.5">
                    <div className="flex items-center gap-2 text-xs text-[var(--s-inkSoft)]"><Paperclip className="h-4 w-4 text-[var(--s-accent)]" /> {file?.name ?? 'Submission note only'} <Check className="ml-auto h-4 w-4 text-[var(--s-success)]" /></div>
                    <div className="flex items-center gap-2 text-xs text-[var(--s-inkSoft)]"><FileCheck2 className="h-4 w-4 text-[var(--s-accent)]" /> Declaration signed <Check className="ml-auto h-4 w-4 text-[var(--s-success)]" /></div>
                  </div>
                  <p className="mt-3 text-[11.5px] leading-5 text-[var(--s-faint)]">This creates version {data.versions.length + 1} and timestamps it immediately.</p>
                  {formError ? <p className="mt-2 text-xs text-[var(--s-danger)]">{formError}</p> : null}
                  <div className="mt-4 flex gap-2.5">
                    <button type="button" onClick={() => setReviewOpen(false)} className="flex-1 rounded-[11px] border border-[var(--s-bd2)] px-4 py-2.5 text-[13px] font-semibold text-[var(--s-inkSoft)]">Go back</button>
                    <button type="button" disabled={submit.isPending} aria-busy={submit.isPending} onClick={() => submit.mutate()} className="flex-1 rounded-[11px] bg-[var(--s-accentDeep)] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">{submit.isPending ? 'Submitting…' : 'Submit now'}</button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      }}
    </QueryPage>
  );
}
