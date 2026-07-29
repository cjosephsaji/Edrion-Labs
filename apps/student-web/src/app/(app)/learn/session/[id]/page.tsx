'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  SessionShell,
  type ProposedCard,
  type SessionView,
} from '@/components/learn/session/SessionShell';
import { useStudentClient, StudentClientError } from '@/lib/student-client';

export default function LearnSessionPage() {
  const params = useParams<{ id: string }>();
  const client = useStudentClient();
  const [session, setSession] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await client.get<SessionView>(`/learn/sessions/${params.id}`);
        if (!cancelled) setSession(data);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof StudentClientError ? err.message : 'Could not load this lesson.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, params.id]);

  const onPersistAnswer = useCallback(
    (blockId: string, selectedOptionId: string) => {
      void client
        .post(`/learn/sessions/${params.id}/answer`, { blockId, selectedOptionId, kind: 'mcq' })
        .catch(() => undefined);
    },
    [client, params.id],
  );

  const onComplete = useCallback(async () => {
    const result = await client.post<SessionView & { cards?: ProposedCard[] }>(
      `/learn/sessions/${params.id}/complete`,
    );
    return { summaryMd: result.summaryMd, cards: result.cards ?? [] };
  }, [client, params.id]);

  const onSaveCards = useCallback(
    async (cards: ProposedCard[]) => {
      if (!cards.length) return {};
      const result = await client.post<{ deckId: string; saved: number }>(
        '/library/from-learn-session/cards',
        {
          sessionId: params.id,
          topicTitle: session?.topicTitle ?? 'Lesson',
          cards: cards.map((c) => ({ front: c.front, back: c.back })),
        },
      );
      return { deckId: result.deckId };
    },
    [client, params.id, session?.topicTitle],
  );

  if (error) {
    return (
      <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-st-ink">
          Couldn&apos;t open this lesson
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-st-muted">{error}</p>
        <Link
          href="/learn"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-st-accentDeep px-5 py-2.5 text-sm font-semibold text-st-page transition hover:-translate-y-px"
        >
          Back to Learn
        </Link>
      </main>
    );
  }

  if (!session) {
    return <SessionSkeleton />;
  }

  return (
    <SessionShell
      session={session}
      onPersistAnswer={onPersistAnswer}
      onComplete={onComplete}
      onSaveCards={onSaveCards}
    />
  );
}

/** Mirrors the loaded layout so the lesson does not jump in when it arrives. */
function SessionSkeleton() {
  return (
    <div className="flex min-h-full flex-col bg-st-page" aria-busy="true" aria-label="Loading lesson">
      <div className="border-b border-st-bd1">
        <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-3 md:px-6">
          <div className="h-5 w-14 rounded-full bg-st-surface2 shimmer" />
          <div className="mx-auto space-y-1.5">
            <div className="h-4 w-48 rounded-full bg-st-surface2 shimmer" />
            <div className="mx-auto h-2.5 w-24 rounded-full bg-st-surface2 shimmer" />
          </div>
          <div className="h-6 w-16 rounded-full bg-st-surface2 shimmer" />
        </div>
        <div className="h-[2px] w-full bg-st-bd1/50" />
      </div>
      <div className="mx-auto grid w-full max-w-[1240px] gap-x-10 px-4 pt-8 md:grid-cols-[184px_minmax(0,1fr)] md:px-6 lg:grid-cols-[200px_minmax(0,1fr)_240px]">
        <div className="hidden space-y-4 md:block">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-[17px] w-[17px] shrink-0 rounded-full bg-st-surface2 shimmer" />
              <div className="h-3 flex-1 rounded-full bg-st-surface2 shimmer" />
            </div>
          ))}
        </div>
        <div className="mx-auto w-full max-w-[672px] space-y-3">
          <div className="h-5 w-2/3 rounded-full bg-st-surface2 shimmer" />
          <div className="h-3 w-full rounded-full bg-st-surface2 shimmer" />
          <div className="h-3 w-[92%] rounded-full bg-st-surface2 shimmer" />
          <div className="h-3 w-[68%] rounded-full bg-st-surface2 shimmer" />
        </div>
        <div className="hidden lg:block">
          <div className="h-10 w-full rounded-[12px] bg-st-surface2 shimmer" />
        </div>
      </div>
    </div>
  );
}
