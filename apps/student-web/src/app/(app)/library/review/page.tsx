'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStudentClient } from '@/lib/student-client';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  clearGradeOutbox,
  loadGradeOutbox,
  loadSessionCache,
  queueGrade,
  removeGrade,
  saveSessionCache,
  type PendingGrade,
} from '@/lib/library/review-offline';

type Grade = 'again' | 'hard' | 'good' | 'easy';

type SessionCard = {
  card: { id: string; deck_name: string; prompt: string; answer: string };
  preview: Record<Grade, { intervalLabel: string; dueAt: string }>;
};

type GradeResponse = {
  next_card: SessionCard | null;
  remaining: number;
  break_due: boolean;
  queue_cleared: boolean;
  again_loop_capped?: boolean;
};

export default function LibraryReviewPage() {
  const client = useStudentClient();
  const router = useRouter();
  const params = useSearchParams();
  const source = params.get('source') ?? 'library';
  const deckId = params.get('deck_id') ?? undefined;
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const summary = useQuery({
    queryKey: ['library', 'review', 'summary'],
    queryFn: () =>
      client.get<{
        due_count: number;
        est_minutes: number;
        exam_boosts: Array<{ deck_name: string; exam_label: string; days_out: number }>;
        streak: { current: number; cleared_today: boolean };
      }>('/library/review/queue-summary'),
  });

  const start = useMutation({
    mutationFn: () =>
      client.post<{ session_id: string; cards: SessionCard[]; remaining: number }>(
        '/library/review/sessions',
        { source, deck_id: deckId },
      ),
  });

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<SessionCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [graded, setGraded] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [breakDue, setBreakDue] = useState(false);
  const [loopCapped, setLoopCapped] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const flipAt = useRef<number | null>(null);
  const reviewIds = useRef(new Map<string, string>());

  useEffect(() => {
    if (!start.isPending && !start.data && !start.isError) {
      void (async () => {
        const cached = await loadSessionCache();
        if (cached?.session_id && cached.cards.length) {
          setSessionId(cached.session_id);
          setQueue(cached.cards as SessionCard[]);
          return;
        }
        const res = await start.mutateAsync();
        setSessionId(res.session_id);
        setQueue(res.cards);
        await saveSessionCache({
          session_id: res.session_id,
          cards: res.cards,
          remaining: res.remaining,
          cached_at: new Date().toISOString(),
        });
      })();
    }
  }, [start]);

  useEffect(() => {
    void (async () => {
      if (!sessionId) return;
      const pending = await loadGradeOutbox();
      for (const grade of pending) {
        try {
          await client.post(`/library/review/sessions/${sessionId}/grades`, {
            client_review_id: grade.client_review_id,
            card_id: grade.card_id,
            grade: grade.grade,
            elapsed_ms: grade.elapsed_ms,
          });
          await removeGrade(grade.client_review_id);
        } catch {
          break;
        }
      }
    })();
  }, [sessionId, client]);

  const current = queue[index];
  const total = graded + (summary.data?.due_count ?? queue.length);

  const grade = useMutation({
    mutationFn: (payload: { g: Grade; clientReviewId: string; elapsedMs: number }) =>
      client.post<GradeResponse>(`/library/review/sessions/${sessionId}/grades`, {
        client_review_id: payload.clientReviewId,
        card_id: current!.card.id,
        grade: payload.g,
        elapsed_ms: payload.elapsedMs,
      }),
  });

  const onGrade = useCallback(
    async (g: Grade) => {
      if (!sessionId || !current || breakDue) return;
      const clientReviewId =
        reviewIds.current.get(current.card.id) ?? crypto.randomUUID();
      reviewIds.current.set(current.card.id, clientReviewId);
      const elapsedMs = flipAt.current ? Date.now() - flipAt.current : 5000;

      const offlineGrade: PendingGrade = {
        client_review_id: clientReviewId,
        card_id: current.card.id,
        grade: g,
        elapsed_ms: elapsedMs,
        reviewed_at: new Date().toISOString(),
      };
      await queueGrade(offlineGrade);

      let res: GradeResponse;
      try {
        res = await grade.mutateAsync({ g, clientReviewId, elapsedMs });
        await removeGrade(clientReviewId);
      } catch {
        return;
      }

      setGraded((n) => n + 1);
      setFlipped(false);
      flipAt.current = null;
      reviewIds.current.delete(current.card.id);

      if (res.again_loop_capped) {
        setLoopCapped(current.card.prompt);
      }

      if (res.queue_cleared) {
        await clearGradeOutbox();
        setCleared(true);
        return;
      }

      if (res.break_due) {
        setBreakDue(true);
        return;
      }

      if (res.next_card) {
        setQueue((q) => [
          ...q.slice(index + 1),
          { card: res.next_card!.card, preview: res.next_card!.preview },
        ]);
        setIndex(0);
      } else {
        setIndex((i) => i + 1);
      }
    },
    [sessionId, current, grade, index, breakDue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (breakDue) return;
      if (!flipped && e.code === 'Space') {
        e.preventDefault();
        setFlipped(true);
        flipAt.current = Date.now();
        return;
      }
      if (!flipped) return;
      if (e.key === '1') void onGrade('again');
      if (e.key === '2') void onGrade('hard');
      if (e.key === '3' || e.code === 'Space') void onGrade('good');
      if (e.key === '4') void onGrade('easy');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, onGrade, breakDue]);

  const minutes = useMemo(
    () => Math.max(1, Math.round((Date.now() - startedAt) / 60_000)),
    [startedAt, cleared],
  );

  if (start.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <p className="text-lg">Couldn&apos;t load your queue.</p>
        <button type="button" className="rounded-full bg-ink px-5 py-2 text-ivory" onClick={() => start.mutate()}>
          Retry
        </button>
      </div>
    );
  }

  if (!current && !cleared && !breakDue) {
    return <div className="min-h-dvh shimmer m-6 rounded-2xl" />;
  }

  if (breakDue) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">☕</div>
        <h1 className="text-2xl font-medium">Good time for a break.</h1>
        <p className="max-w-sm text-muted">
          You&apos;ve reviewed {graded} cards. Step away for a few minutes, then come back fresh.
        </p>
        <button
          type="button"
          className="mt-4 rounded-full bg-ink px-6 py-3 text-ivory"
          onClick={() => setBreakDue(false)}
        >
          Continue reviewing
        </button>
        <button type="button" className="text-sm text-muted" onClick={() => router.back()}>
          End session
        </button>
      </div>
    );
  }

  if (cleared) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">✓</div>
        <h1 className="text-2xl font-medium">All clear.</h1>
        <p className="text-muted">
          {graded} cards · {minutes} min
          {summary.data?.streak.cleared_today ? ` · ${summary.data.streak.current} day streak` : ''}
        </p>
        <button
          type="button"
          className="mt-4 rounded-full bg-ink px-6 py-3 text-ivory"
          onClick={() => router.push(source === 'today' ? '/today' : '/library')}
        >
          {source === 'today' ? 'Back to Today' : 'Back to Library'}
        </button>
      </div>
    );
  }

  const progress = total > 0 ? graded / total : 0;
  const boost = summary.data?.exam_boosts?.[0];

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh flex-col bg-ivory">
      <div className="h-0.5 w-full bg-border">
        <div
          className={`h-full bg-emerald-600 ${reduceMotion ? '' : 'transition-all'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {boost && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
          Exam boost: {boost.deck_name} · {boost.exam_label} in {boost.days_out} days
        </div>
      )}
      <header className="relative flex items-center justify-center px-4 py-3">
        <button type="button" className="absolute left-4 text-lg" onClick={() => router.back()} aria-label="Exit">
          ✕
        </button>
        <p className="text-xs text-muted">{current!.card.deck_name}</p>
      </header>
      {loopCapped && (
        <p className="px-4 text-center text-xs text-muted">
          Paused &ldquo;{loopCapped.slice(0, 40)}&rdquo; after repeated Again — come back tomorrow.
        </p>
      )}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-32">
        <button
          type="button"
          className={`w-full max-w-lg rounded-2xl border border-border bg-white p-8 text-center shadow-sm ${
            reduceMotion ? '' : 'transition-transform duration-[140ms]'
          }`}
          style={reduceMotion ? undefined : { transform: flipped ? 'rotateY(180deg)' : undefined }}
          onClick={() => {
            setFlipped((f) => {
              if (!f) flipAt.current = Date.now();
              return !f;
            });
          }}
        >
          <p className="text-lg leading-relaxed">{flipped ? current!.card.answer : current!.card.prompt}</p>
        </button>
      </main>
      <footer className="fixed inset-x-0 bottom-0 border-t border-border bg-ivory p-4 pb-safe">
        {!flipped ? (
          <button
            type="button"
            className="w-full rounded-full bg-ink py-3.5 text-ivory"
            onClick={() => {
              setFlipped(true);
              flipAt.current = Date.now();
            }}
          >
            Show answer
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {(['again', 'hard', 'good', 'easy'] as const).map((g) => (
              <button
                key={g}
                type="button"
                className="rounded-xl border border-border bg-white py-3 text-sm capitalize"
                onClick={() => void onGrade(g)}
              >
                <div>{g}</div>
                <div className="mt-1 text-[11px] text-muted">{current!.preview[g].intervalLabel}</div>
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
