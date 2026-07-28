'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Eyebrow } from '@/components/ui/primitives';
import type { LearnGoal } from '@/components/learn/session/learn-visual';
import { LEARN_GOAL_LABELS } from '@/components/learn/session/learn-visual';
import { useStudentClient, StudentClientError } from '@/lib/student-client';
import type { SessionView } from '@/components/learn/session/SessionShell';

/**
 * Door transition: topic title is already the hero before POST returns.
 * Then replace → /learn/session/[id] with the live fixture lesson.
 */
function NewSessionInner() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useStudentClient();
  const q = (params.get('q') ?? '').trim();
  const goal = (params.get('goal') as LearnGoal | null) ?? 'learn';
  const [status, setStatus] = useState('Looking at what you already know…');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const goalLabel = LEARN_GOAL_LABELS[goal] ?? LEARN_GOAL_LABELS.learn;

  const skeletonLines = useMemo(
    () => [
      'Framing where we start…',
      'Choosing the shape of this lesson…',
      params.get('ai') === '0'
        ? 'Loading the teaching spine…'
        : 'Petros is writing the teaching (if generation is on)…',
    ],
    [params],
  );

  useEffect(() => {
    if (!q) {
      router.replace('/learn');
      return;
    }
    if (started.current) return;
    started.current = true;

    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      if (step < skeletonLines.length) setStatus(skeletonLines[step]!);
    }, 700);

    void (async () => {
      try {
        const session = await client.post<SessionView & { generationSource?: string }>(
          '/learn/sessions',
          {
            topicTitle: q,
            goal,
            timeBudgetMinutes: goal === 'quick' ? 8 : 15,
            useAi: params.get('ai') !== '0',
          },
        );
        window.clearInterval(timer);
        router.replace(`/learn/session/${session.id}`);
      } catch (err) {
        window.clearInterval(timer);
        const msg =
          err instanceof StudentClientError
            ? err.message
            : 'Could not start the lesson. Try again in a moment.';
        setError(msg);
        setStatus('Something blocked the start.');
      }
    })();

    return () => window.clearInterval(timer);
  }, [q, goal, client, router, skeletonLines]);

  return (
    <main className="relative mx-auto flex min-h-[78dvh] max-w-[720px] flex-col px-5 pb-16 pt-10 md:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,_rgba(30,122,94,0.12),_transparent_70%)]"
      />

      <div className="relative flex items-center justify-between gap-3">
        <Link href="/learn" className="text-sm font-medium text-st-muted transition hover:text-st-ink">
          ← Back
        </Link>
        <span className="rounded-full border border-st-bd2 bg-st-card px-3 py-1 text-[11px] font-medium text-st-muted">
          {goalLabel}
        </span>
      </div>

      <header className="relative mt-10 text-center animate-st-fade-up">
        <Eyebrow color="accent">NEW LESSON</Eyebrow>
        <h1 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.35rem)] font-semibold tracking-[-0.02em] text-st-ink">
          {q}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-st-muted">{status}</p>
        {error && (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-st-amberBd bg-st-amberSoft px-4 py-3 text-sm text-st-amberInk">
            {error}
            <button
              type="button"
              className="mt-2 block w-full text-sm font-semibold"
              onClick={() => {
                window.location.reload();
              }}
            >
              Try again
            </button>
          </div>
        )}
      </header>

      <div className="relative mt-12 space-y-4">
        <div className="animate-st-block-in rounded-[18px] border border-st-bd1 bg-st-card/80 p-5">
          <div className="h-3 w-24 rounded-full bg-st-accentSoft" />
          <div className="mt-4 space-y-2.5">
            <div className="h-3 w-full rounded-full bg-st-surface2" />
            <div className="h-3 w-[92%] rounded-full bg-st-surface2" />
            <div className="h-3 w-[78%] rounded-full bg-st-surface2" />
          </div>
        </div>
        <div
          className="animate-st-block-in rounded-[18px] border border-dashed border-st-bd2 bg-st-cardAlt/70 p-5"
          style={{ animationDelay: '80ms' }}
        >
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-st-faint">
            Teaching arrives next
          </p>
          <p className="mt-2 text-sm text-st-muted">
            First block will never be a question — orientation and real content first.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LearnSessionNewPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[50dvh] items-center justify-center text-sm text-st-muted">
          Opening lesson…
        </main>
      }
    >
      <NewSessionInner />
    </Suspense>
  );
}
