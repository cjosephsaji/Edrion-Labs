'use client';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useLibraryArtifact,
  useLibraryTutor,
  useQuizAttempt,
  useSubmitQuizAttempt,
} from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import Link from 'next/link';

type QuizItem = {
  qtype: 'mcq' | 'short';
  prompt: string;
  options?: Array<{ key: string; label: string }>;
  sourcePage?: number;
};

export default function QuizPageInner({ params }: { params: { id: string } }) {
  const search = useSearchParams();
  const attemptParam = search.get('attempt');
  const { data, isLoading } = useLibraryArtifact(params.id);
  const submit = useSubmitQuizAttempt(params.id);
  const attemptQ = useQuizAttempt(params.id, attemptParam ?? undefined);
  const tutor = useLibraryTutor(data?.itemId ?? '');
  const router = useRouter();

  const items = useMemo(() => {
    const content = data?.content as { items?: QuizItem[] } | undefined;
    return content?.items ?? [];
  }, [data?.content]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<number, { choiceKey?: string; answerText?: string }>
  >({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<{
    attemptId: string;
    results: Array<{ index: number; verdict: string; note: string; sourcePage?: number }>;
    patterns: string[];
  } | null>(null);

  const showResults = results ?? (attemptParam ? attemptQ.data : null);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="h-64 shimmer rounded-[15px]" />
      </div>
    );
  }

  if (!data || data.kind !== 'quiz') {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <EmptyState eyebrow="QUIZ" title="Quiz not found" />
      </div>
    );
  }

  if (showResults) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref={data.itemId ? `/library/${data.itemId}` : '/library'}
          eyebrow={<Eyebrow>✦ RESULTS</Eyebrow>}
          title={data.title}
          subtitle={data.fromLabel}
        />
        <ul className="mt-6 space-y-3">
          {showResults.results.map((r) => (
            <li key={r.index} className="rounded-[15px] border border-st-bd1 bg-st-card p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.verdict === 'solid'
                      ? 'bg-st-mintBg text-st-success'
                      : r.verdict === 'slipped'
                        ? 'bg-st-amberSoft text-st-amber'
                        : 'bg-st-dangerSoft text-st-danger'
                  }`}
                >
                  {r.verdict}
                </span>
                <span className="text-xs text-st-faint">Q{r.index + 1}</span>
              </div>
              <p className="mt-2 text-sm text-st-ink">{r.note}</p>
              {r.sourcePage && data.itemId && (
                <Link
                  href={`/library/${data.itemId}`}
                  className="mt-2 inline-block text-xs font-semibold text-st-accent"
                >
                  From p.{r.sourcePage}
                </Link>
              )}
            </li>
          ))}
        </ul>
        {showResults.patterns.length > 0 && (
          <div className="mt-6 rounded-[15px] border border-st-bd1 bg-st-cardAlt p-4">
            <p className="text-[10px] font-semibold tracking-wide text-st-faint">PATTERNS</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-st-ink">
              {showResults.patterns.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {data.itemId && (
          <div className="mt-6">
            <PillButton
              type="button"
              disabled={tutor.isPending || !data.itemId}
              onClick={async () => {
                const weak = showResults.results.find((r) => r.verdict !== 'solid');
                const focus = weak ? items[weak.index]?.prompt?.slice(0, 80) : undefined;
                const r = await tutor.mutateAsync(focus ? { focusConcept: focus } : undefined);
                router.push(`/learn/session/${r.sessionId}`);
              }}
            >
              Turn my weak spots into a revision session
            </PillButton>
          </div>
        )}
      </div>
    );
  }

  const item = items[index];
  if (!item) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <EmptyState eyebrow="QUIZ" title="No questions in this quiz" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref={data.itemId ? `/library/${data.itemId}` : '/library'}
        eyebrow={<Eyebrow>✦ QUIZ</Eyebrow>}
        title={data.title}
        subtitle={data.fromLabel}
      />

      <div className="mt-4 flex flex-wrap gap-1">
        {items.map((_, i) => {
          const answered = answers[i]?.choiceKey || answers[i]?.answerText;
          const isFlag = flagged.has(i);
          return (
            <button
              key={i}
              type="button"
              aria-label={`Question ${i + 1}`}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-xs font-semibold ${
                i === index
                  ? 'bg-st-accent text-white'
                  : answered
                    ? 'bg-st-accentSoft text-st-accentDeep'
                    : 'border border-st-bd1 text-st-muted'
              } ${isFlag ? 'ring-2 ring-st-amber' : ''}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-[15px] border border-st-bd1 bg-st-card p-4">
        <p className="font-display text-lg text-st-ink">{item.prompt}</p>
        {item.qtype === 'mcq' && item.options && (
          <div className="mt-4 space-y-2">
            {item.options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`flex min-h-[44px] w-full items-center rounded-full border px-4 text-left text-sm ${
                  answers[index]?.choiceKey === opt.key
                    ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                    : 'border-st-bd1 text-st-ink'
                }`}
                onClick={() =>
                  setAnswers((a) => ({ ...a, [index]: { choiceKey: opt.key } }))
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {item.qtype === 'short' && (
          <textarea
            className="mt-4 min-h-[100px] w-full rounded-[12px] border border-st-bd2 bg-st-cardAlt p-3 text-sm"
            value={answers[index]?.answerText ?? ''}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [index]: { answerText: e.target.value } }))
            }
            placeholder="Your answer"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PillButton
          type="button"
          variant="ghost"
          onClick={() =>
            setFlagged((s) => {
              const next = new Set(s);
              if (next.has(index)) next.delete(index);
              else next.add(index);
              return next;
            })
          }
        >
          {flagged.has(index) ? 'Unflag' : 'Flag for review'}
        </PillButton>
        <PillButton
          type="button"
          variant="ghost"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Prev
        </PillButton>
        <PillButton
          type="button"
          variant="ghost"
          disabled={index >= items.length - 1}
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
        >
          Next
        </PillButton>
        <PillButton
          type="button"
          disabled={submit.isPending}
          onClick={async () => {
            const payload = {
              answers: items.map((_, i) => ({
                itemIndex: i,
                choiceKey: answers[i]?.choiceKey,
                answerText: answers[i]?.answerText,
              })),
            };
            const r = await submit.mutateAsync(payload);
            setResults(r);
            router.replace(`/library/quiz/${params.id}?attempt=${r.attemptId}`);
          }}
        >
          Submit
        </PillButton>
      </div>
    </div>
  );
}
