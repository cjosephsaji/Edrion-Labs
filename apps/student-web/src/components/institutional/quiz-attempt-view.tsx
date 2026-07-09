'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttemptAnswerUpdateInput } from '@edrion/schemas';
import { Camera } from 'lucide-react';
import { webEnv } from '@/lib/env';
import type { QuizPaperDto, QuizPaperQuestion } from '@/lib/hooks/quiz-attempts';
import { useUploadAnswerPhoto } from '@/lib/hooks/quiz-attempts';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageHeader, StatSlot } from '@/components/ui/primitives';

type LocalAnswer = {
  choiceKey?: string;
  answerText?: string;
  answerObjectId?: string;
  photoName?: string;
};

function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const resolved = path.replace('/storage/', '/files/');
  return `${webEnv.apiBaseUrl}${resolved}`;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isMcqType(qtype: string): boolean {
  return qtype === 'mcq_single' || qtype === 'mcq_multi' || qtype === 'true_false';
}

function isTextType(qtype: string): boolean {
  return (
    qtype === 'short_answer' ||
    qtype === 'long_answer' ||
    qtype === 'fill_blank' ||
    qtype === 'numeric' ||
    qtype === 'matching'
  );
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

function QuestionBody({
  q,
  answer,
  onMcqSelect,
  onTextChange,
  onPhotoUpload,
  photoUploading,
}: {
  q: QuizPaperQuestion;
  answer: LocalAnswer | undefined;
  onMcqSelect: (choiceKey: string) => void;
  onTextChange: (text: string) => void;
  onPhotoUpload: (file: File) => void;
  photoUploading: boolean;
}) {
  const promptImage = mediaUrl(q.promptImageUrl);
  const selectedKeys = new Set((answer?.choiceKey ?? '').split(',').map((k) => k.trim()).filter(Boolean));

  return (
    <div className="p-5">
      {promptImage && (
        <img src={promptImage} alt="" className="mb-4 max-h-48 w-full rounded-xl object-contain" />
      )}
      <p className="font-display text-lg text-st-ink">{q.prompt}</p>

      {isMcqType(q.qtype) && q.options && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {q.options.map((opt) => {
            const selected = selectedKeys.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onMcqSelect(opt.key)}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  selected
                    ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                    : 'border-st-bd2 bg-st-card hover:border-st-accent'
                }`}
              >
                <span className="font-mono-ui font-semibold text-st-accent">{opt.key}.</span> {opt.label}
                {opt.imageUrl && mediaUrl(opt.imageUrl) && (
                  <img
                    src={mediaUrl(opt.imageUrl)!}
                    alt=""
                    className="mt-2 max-h-24 rounded-lg object-contain"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {q.qtype === 'true_false' && !q.options && (
        <div className="mt-4 flex gap-2">
          {['true', 'false'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onMcqSelect(key)}
              className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition ${
                answer?.choiceKey === key
                  ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                  : 'border-st-bd2 bg-st-card hover:border-st-accent'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {isTextType(q.qtype) && (
        <div className="mt-4 space-y-3">
          {q.qtype === 'long_answer' ? (
            <textarea
              value={answer?.answerText ?? ''}
              onChange={(e) => onTextChange(e.target.value)}
              rows={5}
              placeholder="Type your answer…"
              className="w-full rounded-xl border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none focus:border-st-accent"
            />
          ) : (
            <input
              type={q.qtype === 'numeric' ? 'number' : 'text'}
              value={answer?.answerText ?? ''}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Type your answer…"
              className="w-full rounded-xl border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none focus:border-st-accent"
            />
          )}

          <div className="rounded-xl border border-dashed border-st-bd2 bg-st-surface2 p-4">
            <p className="text-xs font-semibold text-st-faint">PHOTO ANSWER (OPTIONAL)</p>
            <p className="mt-1 text-xs text-st-muted">Upload a photo of handwritten work.</p>
            {answer?.answerObjectId ? (
              <p className="mt-2 text-sm text-st-success">Photo attached{answer.photoName ? `: ${answer.photoName}` : ''}</p>
            ) : null}
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-st-accent hover:text-st-accentDeep">
              <Camera size={16} aria-hidden />
              {photoUploading ? 'Uploading…' : answer?.answerObjectId ? 'Replace photo' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPhotoUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
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

      <Card className="mt-6" eyebrow={`${q.qtype.replace(/_/g, ' ').toUpperCase()} · ${q.marks} mark${q.marks === 1 ? '' : 's'}`} noPadding>
        <QuestionBody
          q={q}
          answer={answers[q.id]}
          onMcqSelect={(key) => handleMcqSelect(q, key)}
          onTextChange={(text) => handleTextChange(q, text)}
          onPhotoUpload={(file) => void handlePhotoUpload(q, file)}
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
