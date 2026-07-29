'use client';

import { useState } from 'react';
import { ExamTimer } from '@/components/lab/exam/ExamTimer';
import { QuestionPalette, type PaletteItem } from '@/components/lab/exam/QuestionPalette';
import { QuestionInput } from '@/components/lab/exam/inputs/QuestionInput';
import {
  isAnswered,
  normalizeQuestionType,
} from '@/components/lab/exam/answer-model';
import { MathText } from '@/components/learn/MathText';
import { NtaComingSoonNote } from '../../NtaComingSoonNote';
import type { MockPlayerSharedProps } from './types';

/** Default digital-exam skin (D5). Also used when reserved `nta` resolves via skin-resolver. */
export function StandardPlayer(props: MockPlayerSharedProps) {
  const {
    exam,
    store,
    queue,
    showNtaNote,
    onAnswerPatch,
    onToggleFlag,
    onSubmit,
    onLeave,
    onExpire,
  } = props;
  const [warning, setWarning] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const questions = exam.questions ?? [];
  const current = questions[store.state.currentIndex];
  const durationMs = (exam.context?.durationMin ?? 60) * 60_000;

  const paletteItems: PaletteItem[] = questions.map((q, index) => ({
    index,
    sequence: q.sequence,
    sectionName: q.sectionId,
    answered: isAnswered(normalizeQuestionType(String(q.qtype)), store.state.answers[q.id]),
    flagged: !!store.state.flags[q.id],
  }));
  const answeredCount = paletteItems.filter((p) => p.answered).length;

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-st-bg text-st-ink">
      {showNtaNote ? <NtaComingSoonNote /> : null}
      <header className="flex items-center justify-between gap-3 border-b border-st-bd2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{exam.title}</p>
          <p className="font-mono text-xs text-st-muted">
            Q{store.state.currentIndex + 1}/{questions.length}
            {current.sectionId ? ` · ${current.sectionId}` : ''}
          </p>
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
            className="rounded-full border border-st-bd2 px-3 py-1 text-xs"
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

      {warning && (
        <div className="animate-st-fade-up bg-st-amberSoft px-4 py-2 text-center text-sm text-st-amber">
          {warning}
        </div>
      )}

      {(queue.size ?? 0) > 0 ? (
        <div className="bg-amber-50 px-4 py-1 text-center text-xs text-amber-800">
          Saving offline — will sync
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <QuestionPalette
          items={paletteItems}
          currentIndex={store.state.currentIndex}
          answeredCount={answeredCount}
          onSelect={store.goTo}
          onFinish={onSubmit}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
          <p className="font-mono text-xs text-st-muted">
            {current.topic} · {current.marks} mark{current.marks === 1 ? '' : 's'}
          </p>
          <div className="mt-3 text-lg leading-relaxed">
            <MathText>{current.prompt}</MathText>
          </div>
          <div className="mt-6">
            <QuestionInput
              question={current}
              value={store.state.answers[current.id] ?? {}}
              onChange={onAnswerPatch}
            />
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 pb-24">
            <button
              type="button"
              className="rounded-full border border-st-bd2 px-4 py-2 text-sm"
              disabled={store.state.currentIndex === 0}
              onClick={store.prev}
            >
              Previous
            </button>
            <button type="button" className="text-sm text-st-muted" onClick={onToggleFlag}>
              {store.state.flags[current.id] ? 'Unflag' : 'Mark for review'}
            </button>
            <button
              type="button"
              className="rounded-full border border-st-bd2 px-4 py-2 text-sm"
              disabled={store.state.currentIndex >= questions.length - 1}
              onClick={store.next}
            >
              Save & Next
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
