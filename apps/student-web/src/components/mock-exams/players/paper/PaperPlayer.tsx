'use client';

import { useMemo, useRef, useState } from 'react';
import { ExamTimer } from '@/components/lab/exam/ExamTimer';
import { QuestionPalette, type PaletteItem } from '@/components/lab/exam/QuestionPalette';
import { QuestionInput } from '@/components/lab/exam/inputs/QuestionInput';
import {
  isAnswered,
  normalizeQuestionType,
  type LocalAnswer,
} from '@/components/lab/exam/answer-model';
import { MathText } from '@/components/learn/MathText';
import { useStudentClient } from '@/lib/student-client';
import type { MockPlayerSharedProps } from '../types';

type AnswerMode = 'type' | 'photo' | 'on_paper';

/**
 * Paper skin — scrollable paper, section headers, Type / Photo / On paper modes.
 * Shares headless store + timer contract with the standard player (D6).
 */
export function PaperPlayer(props: MockPlayerSharedProps) {
  const {
    exam,
    store,
    queue,
    onSubmit,
    onLeave,
    onExpire,
    scheduleSave,
  } = props;
  const client = useStudentClient();
  const [warning, setWarning] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const questions = exam.questions ?? [];
  const durationMs = (exam.context?.durationMin ?? 60) * 60_000;

  const sections = useMemo(() => {
    const map = new Map<string, typeof questions>();
    for (const q of questions) {
      const key = q.sectionId ?? 'Paper';
      const list = map.get(key) ?? [];
      list.push(q);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [questions]);

  const paletteItems: PaletteItem[] = questions.map((q, index) => ({
    index,
    sequence: q.sequence,
    sectionName: q.sectionId,
    answered: isAnswered(normalizeQuestionType(String(q.qtype)), store.state.answers[q.id]),
    flagged: !!store.state.flags[q.id],
  }));
  const answeredCount = paletteItems.filter((p) => p.answered).length;

  const setMode = (questionId: string, mode: AnswerMode) => {
    const prev = store.state.answers[questionId] ?? {};
    const next: LocalAnswer = { ...prev, answerMode: mode };
    if (mode === 'on_paper') {
      // Pen chip — answered for palette; self-grade later
      next.text = next.text ?? '';
    }
    store.setAnswer(questionId, next);
    scheduleSave(questionId, next, !!store.state.flags[questionId]);
  };

  const onTypedChange = (questionId: string, patch: Partial<LocalAnswer>) => {
    const prev = store.state.answers[questionId] ?? {};
    const next = { ...prev, ...patch, answerMode: 'type' as const };
    store.setAnswer(questionId, next);
    scheduleSave(questionId, next, !!store.state.flags[questionId]);
  };

  const onPhotoPicked = async (questionId: string, file: File | null) => {
    if (!file) return;
    setUploadingId(questionId);
    try {
      const uploaded = await client.upload<{ id: string }>('mock_answer_photo', file);
      const prev = store.state.answers[questionId] ?? {};
      const refs = [...(prev.photoRefs ?? [])];
      if (uploaded.id && !refs.includes(uploaded.id)) refs.push(uploaded.id);
      const next: LocalAnswer = {
        ...prev,
        answerMode: 'photo',
        photoRefs: refs,
        photoObjectId: refs[0] ?? uploaded.id,
      };
      store.setAnswer(questionId, next);
      scheduleSave(questionId, next, !!store.state.flags[questionId]);
    } catch {
      // Keep offline queue path via scheduleSave of prior state if needed
    } finally {
      setUploadingId(null);
    }
  };

  const retakePhoto = (questionId: string, removeId: string) => {
    const prev = store.state.answers[questionId] ?? {};
    const refs = (prev.photoRefs ?? []).filter((id) => id !== removeId);
    const next: LocalAnswer = {
      ...prev,
      answerMode: refs.length ? 'photo' : 'type',
      photoRefs: refs,
      photoObjectId: refs[0] ?? null,
    };
    store.setAnswer(questionId, next);
    scheduleSave(questionId, next, !!store.state.flags[questionId]);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f7f4ef] text-st-ink">
      <header className="flex items-center justify-between gap-3 border-b border-stone-300 bg-[#f7f4ef] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{exam.title}</p>
          <p className="font-mono text-xs text-st-muted">Paper · {questions.length} questions</p>
        </div>
        {exam.attempt?.endsAt && (
          <ExamTimer
            endsAt={exam.attempt.endsAt}
            durationMs={durationMs}
            onWarning={(kind) =>
              setWarning(kind === 'half' ? 'Halfway through time.' : 'Five minutes left.')
            }
            onExpire={onExpire}
          />
        )}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-full border border-stone-400 px-3 py-1 text-xs"
            onClick={() => setPaletteOpen(true)}
          >
            Palette
          </button>
          <button
            type="button"
            className="rounded-full border border-stone-400 px-3 py-1 text-xs"
            onClick={() => setLeaveOpen(true)}
          >
            Leave
          </button>
          <button
            type="button"
            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
            onClick={onSubmit}
          >
            Submit
          </button>
        </div>
      </header>

      {leaveOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-lg bg-white p-4 shadow-lg">
            <p className="text-sm">
              Your answers are saved. Leave and resume later? The clock keeps running.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="text-sm" onClick={() => setLeaveOpen(false)}>
                Stay
              </button>
              <button
                type="button"
                className="rounded bg-st-ink px-3 py-1 text-sm text-white"
                onClick={onLeave}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/30">
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-sm font-medium">Question palette</p>
              <button type="button" className="text-sm" onClick={() => setPaletteOpen(false)}>
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <QuestionPalette
                items={paletteItems}
                currentIndex={store.state.currentIndex}
                answeredCount={answeredCount}
                onSelect={(i) => {
                  store.goTo(i);
                  setPaletteOpen(false);
                  const el = document.getElementById(`paper-q-${questions[i]?.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                onFinish={onSubmit}
              />
            </div>
          </div>
        </div>
      )}

      {warning && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">{warning}</div>
      )}

      {(queue.size ?? 0) > 0 ? (
        <div className="bg-amber-50 px-4 py-1 text-center text-xs text-amber-800">
          Saving offline — will sync
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-10">
          {sections.map(([sectionName, qs]) => (
            <section key={sectionName} className="space-y-6">
              <h2 className="border-b border-stone-400 pb-1 font-serif text-lg font-semibold tracking-wide">
                {sectionName}
              </h2>
              {qs.map((q) => {
                const idx = questions.findIndex((x) => x.id === q.id);
                const ans = store.state.answers[q.id] ?? {};
                const mode: AnswerMode = ans.answerMode ?? 'type';
                return (
                  <article
                    key={q.id}
                    id={`paper-q-${q.id}`}
                    className="relative rounded border border-stone-300 bg-[#fffcf7] p-4 shadow-sm"
                  >
                    <div className="absolute -left-0 top-4 -translate-x-full pr-2 font-mono text-xs text-stone-500 sm:static sm:mb-2 sm:translate-x-0 sm:pr-0">
                      Q{q.sequence}
                    </div>
                    <p className="font-mono text-[11px] text-stone-500">
                      {q.topic} · {q.marks} mark{q.marks === 1 ? '' : 's'}
                    </p>
                    <div className="mt-2 leading-relaxed">
                      <MathText>{q.prompt}</MathText>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1 rounded-md border border-stone-200 bg-stone-50 p-1 text-xs">
                      {(
                        [
                          ['type', 'Type'],
                          ['photo', 'Photo'],
                          ['on_paper', 'On paper'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`rounded px-2.5 py-1 ${
                            mode === value ? 'bg-white font-medium shadow-sm' : 'text-stone-600'
                          }`}
                          onClick={() => setMode(q.id, value)}
                        >
                          {label}
                          {value === 'on_paper' && mode === 'on_paper' ? ' ✎' : ''}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4">
                      {mode === 'type' && (
                        <QuestionInput
                          question={q}
                          value={ans}
                          onChange={(patch) => onTypedChange(q.id, patch)}
                        />
                      )}
                      {mode === 'photo' && (
                        <div className="space-y-3">
                          <input
                            ref={(el) => {
                              fileRefs.current[q.id] = el;
                            }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              void onPhotoPicked(q.id, f);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            className="rounded border border-stone-400 px-3 py-2 text-sm"
                            disabled={uploadingId === q.id}
                            onClick={() => fileRefs.current[q.id]?.click()}
                          >
                            {uploadingId === q.id ? 'Uploading…' : 'Add photo'}
                          </button>
                          <div className="flex flex-wrap gap-2">
                            {(ans.photoRefs ?? []).map((refId) => (
                              <div key={refId} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={client.fileUrl(refId)}
                                  alt="Answer photo"
                                  className="h-20 w-20 rounded object-cover border border-stone-300"
                                />
                                <button
                                  type="button"
                                  className="absolute -right-1 -top-1 rounded-full bg-stone-800 px-1.5 text-[10px] text-white"
                                  onClick={() => retakePhoto(q.id, refId)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          {(ans.photoRefs?.length ?? 0) > 0 && (
                            <button
                              type="button"
                              className="text-xs text-stone-600 underline"
                              onClick={() => fileRefs.current[q.id]?.click()}
                            >
                              Retake / add another
                            </button>
                          )}
                        </div>
                      )}
                      {mode === 'on_paper' && (
                        <p className="rounded border border-dashed border-stone-400 bg-stone-50 px-3 py-4 text-sm text-stone-700">
                          Marked answered on paper ✎ — you&apos;ll self-grade this after submit.
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="text-xs text-stone-600"
                        onClick={() => {
                          store.goTo(idx);
                          const nextFlag = !store.state.flags[q.id];
                          store.setFlag(q.id, nextFlag);
                          scheduleSave(q.id, store.state.answers[q.id] ?? {}, nextFlag);
                        }}
                      >
                        {store.state.flags[q.id] ? 'Unflag' : 'Mark for review'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </main>

      <button
        type="button"
        className="fixed bottom-5 right-5 z-30 rounded-full bg-st-ink px-4 py-3 text-sm font-medium text-white shadow-lg"
        onClick={() => setPaletteOpen(true)}
      >
        Palette · {answeredCount}/{questions.length}
      </button>
    </div>
  );
}
