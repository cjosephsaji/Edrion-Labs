'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, FileText, LockKeyhole, Upload, X } from 'lucide-react';
import { QueryPage } from '@/components/query-page';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';

type Question = { id: string; sequence: number; promptText: string; maxMarks: number | null };
type Answer = {
  questionId: string;
  mode: 'type' | 'photo' | 'file' | string;
  answerText: string | null;
  answerObjectId: string | null;
  teacherMarks: number | null;
  teacherFeedback: string | null;
};
type Detail = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string;
  status: string;
  aiPolicy?: string;
  subjectName: string | null;
  questions: Question[];
  answers: Answer[];
  totalMarks: number | null;
  totalMax: number | null;
  teacherNote: string | null;
  submittedAt: string | null;
};
type Draft = { mode: 'type' | 'photo' | 'file'; text: string; objectId: string | null; fileName?: string };

function GovernancePill({ policy }: { policy?: string }) {
  const off = policy === 'off';
  const concept = policy === 'hints_only' || policy === 'concept';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono-ui text-[9px] font-semibold ${off ? 'border-[var(--st-goldBd)] bg-[var(--st-goldSoftBg)] text-[var(--st-goldInk)]' : concept ? 'border-[var(--s-amberBd)] bg-[var(--s-amberSoft)] text-[var(--s-amberInk)]' : 'border-[var(--s-accentBd)] bg-[var(--s-accentSoft)] text-[var(--s-accentDeep)]'}`}>
      <LockKeyhole className="h-3 w-3" /> {off ? 'HELP OFF' : concept ? 'CONCEPT HELP ONLY' : 'FULL HELP ALLOWED'}
    </span>
  );
}

export default function HomeworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useStudentApi();
  const qc = useQueryClient();
  const { data: me } = useStudentMe();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const query = useQuery({
    queryKey: ['student', 'homework', id],
    queryFn: () => api.get<Detail>(`/student/homework/${id}`),
    enabled: Boolean(id),
  });
  const backHref = me?.programmeName ? '/assignments' : '/homework';
  const backLabel = me?.programmeName ? 'All assignments' : 'All homework';
  usePetrosPage(query.data ? { title: query.data.title, candidates: [{ ref: id, entityType: 'homework', entityId: id, title: query.data.title, href: `/homework/${id}` }] } : null);

  useEffect(() => {
    if (!query.data) return;
    const next: Record<string, Draft> = {};
    for (const question of query.data.questions) {
      const answer = query.data.answers.find((item) => item.questionId === question.id);
      const mode = answer?.mode === 'photo' || answer?.mode === 'file' ? answer.mode : 'type';
      next[question.id] = { mode, text: answer?.answerText ?? '', objectId: answer?.answerObjectId ?? null };
    }
    setDrafts(next);
  }, [query.data]);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  async function persist(questionId: string, draft: Draft) {
    setSaveState('saving');
    try {
      await api.put(`/student/homework/${id}/answers/${questionId}`, {
        mode: draft.mode,
        answerText: draft.text.trim() || null,
        answerObjectId: draft.objectId,
      });
      setSaveState('saved');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['student', 'homework'] });
    } catch (err) {
      setSaveState('error');
      setError(formatApiError(err));
    }
  }

  function updateDraft(questionId: string, update: Partial<Draft>, autosave = true) {
    setDrafts((current) => {
      const next = { ...(current[questionId] ?? { mode: 'type', text: '', objectId: null }), ...update } as Draft;
      if (autosave) {
        clearTimeout(timers.current[questionId]);
        setSaveState('saving');
        timers.current[questionId] = setTimeout(() => void persist(questionId, next), 900);
      }
      return { ...current, [questionId]: next };
    });
  }

  async function uploadAnswer(questionId: string, file: File, mode: 'photo' | 'file') {
    setUploading(questionId);
    try {
      const uploaded = await api.upload('homework_answer', file);
      const next = { ...(drafts[questionId] ?? { text: '' }), mode, objectId: uploaded.id, fileName: file.name } as Draft;
      updateDraft(questionId, next, false);
      await persist(questionId, next);
    } catch (err) {
      setError(formatApiError(err));
      setSaveState('error');
    } finally {
      setUploading(null);
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      const detail = query.data;
      if (!detail) return;
      for (const question of detail.questions) {
        clearTimeout(timers.current[question.id]);
        const draft = drafts[question.id] ?? { mode: 'type', text: '', objectId: null };
        await api.put(`/student/homework/${id}/answers/${question.id}`, {
          mode: draft.mode,
          answerText: draft.text.trim() || null,
          answerObjectId: draft.objectId,
        });
      }
      return api.post<{ submitted: true; submittedAt: string }>(`/student/homework/${id}/submit`);
    },
    onSuccess: async () => {
      setReviewOpen(false);
      setError(null);
      await qc.invalidateQueries({ queryKey: ['student', 'homework'] });
      await qc.invalidateQueries({ queryKey: ['student', 'petros', 'mentor'] });
      await query.refetch();
    },
    onError: (err) => setError(formatApiError(err)),
  });

  return (
    <QueryPage query={query} loadingLabel="Loading homework…">
      {(raw) => {
        const data = raw as Detail;
        const locked = ['submitted', 'returned', 'graded'].includes(data.status);
        const questions = data.questions.slice().sort((a, b) => a.sequence - b.sequence);
        const answeredCount = questions.filter((question) => {
          const draft = drafts[question.id];
          return Boolean(draft?.text.trim() || draft?.objectId);
        }).length;
        const firstUnanswered = questions.findIndex((question) => {
          const draft = drafts[question.id];
          return !draft?.text.trim() && !draft?.objectId;
        });

        return (
          <div className="mx-auto max-w-[760px] py-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={backHref} className="text-[12.5px] font-semibold text-[var(--s-faint)] hover:text-[var(--s-accentDeep)]">← {backLabel}</Link>
              <span className={`ml-auto font-mono-ui text-[10.5px] ${saveState === 'error' ? 'text-[var(--s-danger)]' : 'text-[var(--s-faint2)]'}`}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Couldn’t save' : 'Saved just now'}
              </span>
            </div>

            <header className="mt-4" data-petros-target={`entity:homework:${id}`}>
              <GovernancePill policy={data.aiPolicy} />
              <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-.01em] text-[var(--s-ink)]">{data.title}</h1>
              <p className="mt-1 text-[12.5px] text-[var(--s-faint)]">{[data.subjectName, `Due ${new Date(data.dueAt).toLocaleString()}`, `${answeredCount} of ${questions.length} answered`].filter(Boolean).join(' · ')}</p>
              {data.instructions ? <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--s-inkSoft)]">{data.instructions}</p> : null}
            </header>

            {data.totalMarks != null || data.teacherNote ? (
              <section className="mt-5 rounded-[15px] border border-[var(--s-accentBd)] bg-[var(--s-accentSoft)] p-[18px_22px]">
                <h2 className="font-display text-[16px] font-semibold text-[var(--s-success)]">Returned by your teacher</h2>
                {data.totalMarks != null ? <p className="mt-2 font-display text-2xl font-semibold text-[var(--s-ink)]">{data.totalMarks}{data.totalMax != null ? ` / ${data.totalMax}` : ''}</p> : null}
                {data.teacherNote ? <p className="mt-2 text-[13px] leading-6 text-[var(--s-inkSoft)]">{data.teacherNote}</p> : null}
              </section>
            ) : null}

            <div className="mt-5 space-y-3.5">
              {questions.map((question, index) => {
                const draft = drafts[question.id] ?? { mode: 'type', text: '', objectId: null };
                const answer = data.answers.find((item) => item.questionId === question.id);
                const answered = Boolean(draft.text.trim() || draft.objectId);
                const active = !locked && (firstUnanswered === index || (firstUnanswered < 0 && index === questions.length - 1));
                return (
                  <section data-petros-target={active || (locked && index === 0) ? 'homework:questions' : undefined} key={question.id} className={`rounded-[15px] border bg-[var(--s-card)] p-[18px_22px] ${active ? 'border-[1.5px] border-[var(--s-accentBd)] shadow-[0_12px_30px_-24px_rgba(12,63,49,.55)]' : 'border-[var(--s-bd1)]'}`}>
                    <div className="flex items-center gap-2">
                      <p className={`font-mono-ui text-[10px] font-semibold ${answered ? 'text-[var(--s-success)]' : active ? 'text-[var(--s-accentDeep)]' : 'text-[var(--s-faint)]'}`}>Q{index + 1} · {answered ? 'ANSWERED' : active ? 'UP NEXT' : 'NOT ANSWERED'}</p>
                      {answered ? <Check className="ml-auto h-4 w-4 text-[var(--s-accent)]" /> : null}
                    </div>
                    <p className="mt-2.5 whitespace-pre-wrap font-display text-[14.5px] leading-7 text-[var(--s-inkSoft)]">{question.promptText}</p>
                    {question.maxMarks != null ? <p className="mt-1 font-mono-ui text-[9px] text-[var(--s-faint)]">{question.maxMarks} MARKS</p> : null}

                    {!locked ? (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {([
                            { id: 'type' as const, label: 'Type it', Icon: FileText },
                            { id: 'photo' as const, label: 'Photo of my notebook', Icon: Camera },
                            { id: 'file' as const, label: 'Attach a file', Icon: Upload },
                          ]).map((mode) => (
                            <button key={mode.id} type="button" onClick={() => updateDraft(question.id, { mode: mode.id })} className={`inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-xs font-semibold ${draft.mode === mode.id ? 'border-[var(--s-accent)] bg-[var(--s-accentSoft)] text-[var(--s-accentDeep)]' : 'border-[var(--s-bd2)] bg-[var(--s-card)] text-[var(--s-muted)]'}`}><mode.Icon className="h-3.5 w-3.5" />{mode.label}</button>
                          ))}
                        </div>
                        {draft.mode === 'type' ? (
                          <textarea value={draft.text} onChange={(event) => updateDraft(question.id, { text: event.target.value })} rows={4} placeholder="Type your steps here…" className="mt-3 w-full resize-y rounded-[11px] border-[1.5px] border-[var(--s-bd2)] bg-[var(--s-cardAlt)] px-3.5 py-3 font-mono-ui text-[13px] leading-6 text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]" />
                        ) : (
                          <label className="mt-3 block cursor-pointer rounded-[11px] border-[1.5px] border-dashed border-[var(--s-bd2)] bg-[var(--s-cardAlt)] px-5 py-6 text-center hover:border-[var(--s-accent)]">
                            <input type="file" accept={draft.mode === 'photo' ? 'image/*' : '.pdf,image/*,.doc,.docx'} capture={draft.mode === 'photo' ? 'environment' : undefined} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAnswer(question.id, file, draft.mode as 'photo' | 'file'); }} />
                            {draft.mode === 'photo' ? <Camera className="mx-auto h-5 w-5 text-[var(--s-faint)]" /> : <Upload className="mx-auto h-5 w-5 text-[var(--s-faint)]" />}
                            <span className="mt-2 block text-[12.5px] font-semibold text-[var(--s-inkSoft)]">{uploading === question.id ? 'Uploading…' : draft.fileName || (draft.mode === 'photo' ? 'Snap your notebook page' : 'Choose a PDF or image')}</span>
                            {draft.objectId ? <span className="mt-1 block text-[10.5px] text-[var(--s-faint)]">Attached</span> : null}
                          </label>
                        )}
                      </>
                    ) : draft.mode === 'type' ? (
                      <div className="mt-3 rounded-[11px] border border-[var(--s-bd1)] bg-[var(--s-cardAlt)] px-3.5 py-3 font-mono-ui text-[13px] leading-6 text-[var(--s-ink)]">{draft.text || 'No typed answer'}</div>
                    ) : (
                      <div className="mt-3 rounded-[11px] border border-[var(--s-bd1)] bg-[var(--s-cardAlt)] px-3.5 py-3 text-[12.5px] text-[var(--s-inkSoft)]">Attached {draft.mode === 'photo' ? 'notebook photo' : 'file'}</div>
                    )}

                    {answer?.teacherFeedback ? (
                      <div className="mt-3 rounded-xl border border-[var(--s-accentBd)] bg-[var(--s-accentSoft)] p-3.5">
                        <p className="font-mono-ui text-[9px] font-semibold text-[var(--s-success)]">TEACHER FEEDBACK{answer.teacherMarks != null ? ` · ${answer.teacherMarks}${question.maxMarks != null ? `/${question.maxMarks}` : ''}` : ''}</p>
                        <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--s-inkSoft)]">{answer.teacherFeedback}</p>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {error ? <p className="mt-3 text-xs text-[var(--s-danger)]">{error}</p> : null}
            {!locked ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setReviewOpen(true)} disabled={answeredCount === 0} className="rounded-[11px] bg-[var(--s-accentDeep)] px-[18px] py-[11px] text-[13px] font-semibold text-white disabled:opacity-45">Submit to your teacher</button>
              </div>
            ) : (
              <section className="mt-4 rounded-[14px] border border-[var(--s-bd1)] bg-[var(--s-sidebar)] p-4 text-[12.5px] text-[var(--s-faint)]">Submitted{data.submittedAt ? ` on ${new Date(data.submittedAt).toLocaleString()}` : ''}.</section>
            )}

            {reviewOpen ? (
              <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Review homework">
                <div className="w-full max-w-md rounded-t-[20px] border border-[var(--s-bd1)] bg-[var(--s-card)] p-5 shadow-2xl sm:rounded-[18px]">
                  <div className="flex items-start gap-3">
                    <h2 className="font-display text-xl font-semibold text-[var(--s-ink)]">Check before you submit</h2>
                    <button type="button" onClick={() => setReviewOpen(false)} className="ml-auto rounded-full p-2 text-[var(--s-faint)]"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="mt-4 divide-y divide-[var(--s-divider)] rounded-xl bg-[var(--s-surface2)] px-3.5">
                    {questions.map((question, index) => {
                      const draft = drafts[question.id];
                      const ok = Boolean(draft?.text.trim() || draft?.objectId);
                      return <div key={question.id} className="flex items-center gap-3 py-2.5 text-xs"><span className="font-semibold text-[var(--s-inkSoft)]">Q{index + 1}</span><span className={`ml-auto font-mono-ui text-[9px] font-semibold ${ok ? 'text-[var(--s-success)]' : 'text-[var(--s-amber)]'}`}>{ok ? 'ANSWERED' : 'EMPTY'}</span></div>;
                    })}
                  </div>
                  {answeredCount < questions.length ? <p className="mt-3 rounded-xl bg-[var(--s-amberSoft)] p-3 text-[11.5px] leading-5 text-[var(--s-amberInk)]">{questions.length - answeredCount} {questions.length - answeredCount === 1 ? 'answer is' : 'answers are'} empty. You can still submit if that is intentional.</p> : null}
                  <div className="mt-4 flex gap-2.5">
                    <button type="button" onClick={() => setReviewOpen(false)} className="flex-1 rounded-[11px] border border-[var(--s-bd2)] px-4 py-2.5 text-[13px] font-semibold text-[var(--s-inkSoft)]">Keep working</button>
                    <button type="button" onClick={() => submit.mutate()} disabled={submit.isPending} aria-busy={submit.isPending} className="flex-1 rounded-[11px] bg-[var(--s-accentDeep)] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">{submit.isPending ? 'Submitting…' : 'Submit now'}</button>
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
