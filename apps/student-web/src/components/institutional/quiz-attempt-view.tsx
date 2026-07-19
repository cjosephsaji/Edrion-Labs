'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttemptAnswerUpdateInput } from '@edrion/schemas';
import type { QuizPaperDto, QuizPaperQuestion } from '@/lib/hooks/quiz-attempts';
import { useUploadAnswerPhoto } from '@/lib/hooks/quiz-attempts';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageHeader, StatSlot } from '@/components/ui/primitives';
import {
  QuestionPlayer,
  toAnswerPayload,
  type LocalAnswer,
} from '@/components/institutional/question-player';

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ExamTimer({ endsAt, onExpire }: { endsAt: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(() => new Date(endsAt).getTime() - Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const next = new Date(endsAt).getTime() - Date.now();
      setRemaining(next);
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  const urgent = remaining < 5 * 60_000;
  return (
    <span
      className={`rounded-full border px-3 py-1 font-mono-ui text-sm font-semibold ${
        urgent ? 'border-st-dangerBd bg-st-dangerSoft text-st-danger' : 'border-st-bd2 bg-st-card text-st-ink'
      }`}
    >
      {formatCountdown(remaining)}
    </span>
  );
}

export type QuizAttemptViewProps = {
  paper: QuizPaperDto | undefined;
  isLoading: boolean;
  backHref: string;
  backLabel?: string;
  eyebrowLabel: string;
  startPending: boolean;
  finishPending: boolean;
  onStart: () => Promise<void>;
  onSaveAnswer: (questionId: string, body: AttemptAnswerUpdateInput) => Promise<void>;
  onFinish: () => Promise<void>;
  onRefetch: () => void;
};

export function QuizAttemptView({
  paper,
  isLoading,
  backHref,
  backLabel = 'Back',
  eyebrowLabel,
  startPending,
  finishPending,
  onStart,
  onSaveAnswer,
  onFinish,
  onRefetch,
}: QuizAttemptViewProps) {
  const uploadPhoto = useUploadAnswerPhoto();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const textTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const persist = useCallback(
    async (questionId: string, body: AttemptAnswerUpdateInput) => {
      await onSaveAnswer(questionId, body);
    },
    [onSaveAnswer],
  );

  const updateLocal = useCallback((questionId: string, patch: Partial<LocalAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
  }, []);

  const handleMcqSelect = useCallback(
    (q: QuizPaperQuestion, choiceKey: string) => {
      let nextKey = choiceKey;
      if (q.qtype === 'mcq_multi') {
        const current = new Set(
          (answers[q.id]?.choiceKey ?? '').split(',').map((k) => k.trim()).filter(Boolean),
        );
        if (current.has(choiceKey)) current.delete(choiceKey);
        else current.add(choiceKey);
        nextKey = [...current].sort().join(',');
      }
      updateLocal(q.id, { choiceKey: nextKey });
      void persist(q.id, { choiceKey: nextKey || null });
      if (q.qtype !== 'mcq_multi' && paper) {
        const questions = paper.questions;
        const idx = questions.findIndex((x) => x.id === q.id);
        if (idx >= 0 && idx < questions.length - 1) setCurrentIdx(idx + 1);
      }
    },
    [answers, paper, persist, updateLocal],
  );

  const handleTextChange = useCallback(
    (q: QuizPaperQuestion, text: string) => {
      updateLocal(q.id, { answerText: text });
      const existing = textTimers.current[q.id];
      if (existing) clearTimeout(existing);
      textTimers.current[q.id] = setTimeout(() => {
        void persist(q.id, {
          answerText: text || null,
          answerObjectId: answers[q.id]?.answerObjectId ?? null,
        });
      }, 600);
    },
    [answers, persist, updateLocal],
  );

  const handlePhotoUpload = useCallback(
    async (q: QuizPaperQuestion, file: File) => {
      const uploaded = await uploadPhoto.mutateAsync(file);
      updateLocal(q.id, { answerObjectId: uploaded.id, photoName: file.name });
      await persist(q.id, {
        answerText: answers[q.id]?.answerText ?? null,
        answerObjectId: uploaded.id,
      });
    },
    [answers, persist, updateLocal, uploadPhoto],
  );

  const handleMatchingChange = useCallback(
    (q: QuizPaperQuestion, matches: Record<string, string>) => {
      const answerJson = { ...(answers[q.id]?.answerJson ?? {}), matches };
      updateLocal(q.id, { answerJson, answerText: JSON.stringify(matches) });
      const existing = textTimers.current[q.id];
      if (existing) clearTimeout(existing);
      textTimers.current[q.id] = setTimeout(() => {
        void persist(q.id, {
          answerText: JSON.stringify(matches),
          answerJson,
        });
      }, 400);
    },
    [answers, persist, updateLocal],
  );

  const handleCodeChange = useCallback(
    (q: QuizPaperQuestion, source: string, language: string) => {
      const answerJson = { ...(answers[q.id]?.answerJson ?? {}), code: { language, source } };
      updateLocal(q.id, { answerJson, answerText: source });
      const existing = textTimers.current[q.id];
      if (existing) clearTimeout(existing);
      textTimers.current[q.id] = setTimeout(() => {
        void persist(q.id, toAnswerPayload({ answerJson, answerText: source }));
      }, 600);
    },
    [answers, persist, updateLocal],
  );

  const handleExpire = useCallback(() => {
    if (!finishPending) void onFinish().then(() => onRefetch());
  }, [finishPending, onFinish, onRefetch]);

  if (isLoading || !paper) {
    return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;
  }

  if (paper.status === 'ready') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref={backHref}
          backLabel={backLabel}
          eyebrow={<Eyebrow color="amber">{eyebrowLabel}</Eyebrow>}
          title={paper.title}
          subtitle={`${paper.questions.length} questions${paper.durationMin ? ` · ${paper.durationMin} minutes` : ''}`}
        />
        <div className="mt-8 flex justify-center">
          <PillButton onClick={() => void onStart()} disabled={startPending}>
            Start
          </PillButton>
        </div>
      </div>
    );
  }

  if (paper.status === 'completed' && paper.results) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref={backHref}
          backLabel={backLabel}
          eyebrow={<Eyebrow color="amber">RESULTS</Eyebrow>}
          title={paper.title}
          subtitle="Auto-graded score — subjective answers may be reviewed by your teacher."
        />
        <StatSlot
          className="mt-6"
          label="Score"
          value={`${paper.results.autoScore} / ${paper.results.maxScore}`}
          from={`${paper.results.totalQuestions} questions`}
        />
        <div className="mt-8 flex justify-center">
          <PillButton variant="soft" onClick={() => onRefetch()}>
            Refresh results
          </PillButton>
        </div>
      </div>
    );
  }

  const questions = paper.questions;
  const q = questions[currentIdx];
  if (!q || !paper.attempt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">No questions available.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref={backHref}
        backLabel={backLabel}
        eyebrow={
          <Eyebrow>
            QUESTION {currentIdx + 1} OF {questions.length}
          </Eyebrow>
        }
        title={paper.title}
        right={<ExamTimer endsAt={paper.attempt.endsAt} onExpire={handleExpire} />}
      />

      <Card
        className="mt-6"
        eyebrow={`${q.qtype.replace(/_/g, ' ').toUpperCase()} · ${q.marks} mark${q.marks === 1 ? '' : 's'}`}
        noPadding
      >
        <QuestionPlayer
          q={q}
          answer={answers[q.id]}
          onMcqSelect={(key) => handleMcqSelect(q, key)}
          onTextChange={(text) => handleTextChange(q, text)}
          onPhotoUpload={(file) => void handlePhotoUpload(q, file)}
          onMatchingChange={(matches) => handleMatchingChange(q, matches)}
          onCodeChange={(source, language) => handleCodeChange(q, source, language)}
          onFileUpload={(file) => void handlePhotoUpload(q, file)}
          photoUploading={uploadPhoto.isPending}
        />
      </Card>

      <div className="mt-6 flex justify-between">
        <PillButton variant="ghost" disabled={currentIdx === 0} onClick={() => setCurrentIdx((i) => i - 1)}>
          Previous
        </PillButton>
        {currentIdx === questions.length - 1 ? (
          <PillButton onClick={() => void onFinish().then(() => onRefetch())} disabled={finishPending}>
            Finish
          </PillButton>
        ) : (
          <PillButton onClick={() => setCurrentIdx((i) => i + 1)}>Next</PillButton>
        )}
      </div>
    </div>
  );
}
