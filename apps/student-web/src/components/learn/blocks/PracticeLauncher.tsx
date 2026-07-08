'use client';
import { useCallback, useMemo, useState } from 'react';
import type { PracticeItemBlock } from '@edrion/schemas';
import { Pencil } from 'lucide-react';
import { usePreferences } from '@/lib/hooks';
import type { BlockAnswerResult } from '@/lib/learn-session-types';
import { StudentClientError } from '@/lib/student-client';
import { MathText } from '../MathText';
import { HintLadder } from '../HintLadder';
import { BlockCard } from '../BlockCard';
import { BlockContinue } from '../BlockContinue';
import { PillButton } from '@/components/ui/pill-button';

export function PracticeLauncher({
  content,
  sessionId,
  blockId,
  onFetchHint,
  onSubmit,
  onContinue,
  readOnly,
  completed,
}: {
  content: PracticeItemBlock;
  sessionId?: string;
  blockId?: string;
  onFetchHint?: (blockId: string, rung: 2 | 3) => Promise<string>;
  onSubmit: (answer: string, hintsUsed: number) => Promise<BlockAnswerResult>;
  onContinue?: () => void;
  readOnly?: boolean;
  completed?: boolean;
}) {
  const { data: prefs } = usePreferences();
  const [answer, setAnswer] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [passed, setPassed] = useState(completed ?? false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hintTexts, setHintTexts] = useState<[string, string, string]>(() => [
    content.hints[0] ?? '',
    content.hints[1] ?? '',
    content.hints[2] ?? '',
  ]);
  const [loadingRung, setLoadingRung] = useState<number | null>(null);

  const startRevealed = useMemo(() => {
    if (prefs?.hintGenerosity === 'direct') return 1;
    return 0;
  }, [prefs?.hintGenerosity]);

  const handleReveal = useCallback(
    async (rung: 1 | 2 | 3) => {
      setHintsUsed((h) => Math.max(h, rung));
      const idx = rung - 1;
      if (hintTexts[idx]?.trim()) return;

      if ((rung === 2 || rung === 3) && sessionId && blockId && onFetchHint) {
        setLoadingRung(rung);
        try {
          const hint = await onFetchHint(blockId, rung);
          if (hint.trim()) {
            setHintTexts((prev) => {
              const next = [...prev] as [string, string, string];
              next[idx] = hint;
              return next;
            });
          }
        } finally {
          setLoadingRung(null);
        }
      }
    },
    [blockId, hintTexts, onFetchHint, sessionId],
  );

  const handleSubmit = async () => {
    if (!answer.trim() || readOnly || submitting || passed) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await onSubmit(answer, hintsUsed);
      const ok = Boolean(result.evaluation.correct || result.evaluation.accepted);
      setPassed(ok);
      setFeedback(
        result.evaluation.feedback ?? (ok ? 'Nice work — that looks right.' : 'Not quite — check the hints and try again.'),
      );
    } catch (err) {
      const message =
        err instanceof StudentClientError ? err.message : 'Something went wrong — try again.';
      setFeedback(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showContinue = passed && onContinue;

  return (
    <BlockCard
      eyebrow="PRACTICE"
      tone="violet"
      icon={Pencil}
      footer={passed && !showContinue ? 'Answer accepted — continue when you are ready.' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-st-ink">Solve it yourself</h2>
        {content.questionIndex != null && content.questionTotal != null && (
          <span className="font-mono-ui text-xs text-st-faint">
            {content.questionIndex}/{content.questionTotal}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-st-ink">
        <MathText>{content.statement}</MathText>
      </p>
      {content.math && (
        <div className="mt-3 rounded-xl bg-st-violetSoft/50 p-3">
          <MathText display>{content.math}</MathText>
        </div>
      )}
      {!readOnly && !passed && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-st-bd1 bg-st-surface2/50 p-4">
            <p className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">SCRATCHPAD</p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Work through the problem here…"
              className="mt-2 w-full resize-none bg-transparent text-sm text-st-ink outline-none"
              rows={4}
            />
          </div>
          <HintLadder
            hints={hintTexts}
            startRevealed={startRevealed}
            loadingRung={loadingRung}
            onReveal={handleReveal}
          />
          <PillButton onClick={() => void handleSubmit()} disabled={!answer.trim() || submitting}>
            {submitting ? 'Checking…' : 'Check answer'}
          </PillButton>
        </div>
      )}

      {feedback && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            passed
              ? 'border-st-success bg-st-mintBg text-st-success'
              : 'border-st-amberBd bg-st-amberSoft text-st-amberInk'
          }`}
        >
          {feedback}
        </div>
      )}

      {showContinue && <BlockContinue onContinue={onContinue} />}
    </BlockCard>
  );
}
