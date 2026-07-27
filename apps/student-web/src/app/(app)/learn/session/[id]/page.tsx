'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEdrionLearnSession } from '@/lib/hooks/useEdrionLearnSession';
import { StudentClientError } from '@/lib/student-client';
import { EdrionLearnBlockCard } from '@/components/edrion-learn/EdrionLearnBlockCard';
import { SessionProgressBar } from '@/components/edrion-learn/SessionProgressBar';
import { ArtifactRail } from '@/components/edrion-learn/ArtifactRail';
import { CompletionOverlay } from '@/components/edrion-learn/CompletionOverlay';
import type { LearnPolicyV1 } from '@edrion/schemas';

function PolicyNotice({ policy }: { policy: LearnPolicyV1 }) {
  const notices: string[] = [];
  if (policy.session_visibility !== 'none') {
    notices.push('Your school can see session summaries from Edrion Learn.');
  }
  if (policy.curriculum_bounds === 'institution_curriculum') {
    notices.push('Lessons stay within your institution curriculum.');
  }
  if (policy.answer_directness === 'never_direct_on_assignment') {
    notices.push('During homework windows, Petros probes more than it gives direct answers.');
  }
  if (!notices.length) return null;
  return (
    <div className="space-y-2">
      {notices.map((n) => (
        <p key={n} className="rounded-lg border border-st-amberBd bg-st-amberSoft px-3 py-2 text-xs text-st-amberInk">
          {n}
        </p>
      ))}
    </div>
  );
}

/** Full-screen calm card — Hyperspec 2 §1. `message` is passed through verbatim. */
function SessionErrorCard({
  message,
  code,
  onRetry,
}: {
  message: string;
  code?: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-16 text-center">
      <p className="text-sm text-st-muted">{message}</p>
      {code && <p className="mt-1 font-mono-ui text-[10.5px] uppercase text-st-faint">{code}</p>}
      <div className="mt-4 flex justify-center gap-3">
        <button type="button" onClick={onRetry} className="rounded-full bg-[#1f604a] px-4 py-2 text-sm text-white">
          Retry
        </button>
        <Link href="/learn" className="rounded-full border border-st-bd2 px-4 py-2 text-sm">
          Back
        </Link>
      </div>
    </div>
  );
}

export default function EdrionLearnSessionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
    streaming,
    streamError,
    startStream,
    stopStream,
    restartStream,
    answer,
    interact,
    ask,
    commitArtifacts,
    pause,
    end,
  } = useEdrionLearnSession(params.id);
  const [composer, setComposer] = useState('');
  const [showNewPill, setShowNewPill] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (!session || session.orchestratorStatus === 'closed' || session.readOnly) return;
    startStream();
    // StrictMode double-mounts this effect; without teardown the second run would leave
    // the first server-side stream handler running.
    return stopStream;
  }, [session?.id, session?.orchestratorStatus, session?.readOnly, startStream, stopStream]);

  useEffect(() => {
    if (atBottomRef.current && mainRef.current) {
      mainRef.current.scrollTop = mainRef.current.scrollHeight;
    } else if (session?.blocks.length) {
      setShowNewPill(true);
    }
  }, [session?.blocks.length, streaming]);

  // Failure mode 5: the session GET itself failed. Never fall through to the skeleton.
  if (isError && !session) {
    return (
      <SessionErrorCard
        message={
          error instanceof StudentClientError && error.message
            ? error.message
            : "We couldn't load this lesson right now."
        }
        code={error instanceof StudentClientError ? error.code : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !session) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-10">
        <div className="h-32 animate-pulse rounded-[15px] bg-st-surface2 motion-reduce:animate-none" />
      </div>
    );
  }

  if (streamError && !session.blocks.length) {
    return (
      <SessionErrorCard
        message={streamError.message}
        // Connectivity gets the plain hyperspec card; server-side failures also show their code.
        code={streamError.source === 'network' ? undefined : streamError.code}
        onRetry={restartStream}
      />
    );
  }

  const budget = session.timeBudgetMinutes ?? 15;
  const elapsed = session.elapsedMinutes ?? 0;
  const timeChip = elapsed >= budget / 2 ? `${Math.max(0, budget - elapsed)} min left` : `${budget} min`;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 pb-24 pt-4 lg:flex-row lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 -mx-4 border-b border-st-divider bg-st-page/95 px-4 pb-3 backdrop-blur">
          <div className="mx-auto flex max-w-[640px] items-center justify-between gap-2">
            <button type="button" onClick={() => router.push('/learn')} className="text-sm text-st-muted">
              ←
            </button>
            <h1 className="truncate text-sm font-semibold text-st-ink">{session.topicTitle}</h1>
            <span className="rounded-full bg-st-surface2 px-2 py-0.5 text-xs text-st-muted">{timeChip}</span>
          </div>
          <div className="mx-auto mt-2 max-w-[640px]">
            <SessionProgressBar session={session} />
          </div>
        </header>

        <main
          ref={mainRef}
          className="relative mx-auto mt-4 max-w-[640px] flex-1 space-y-4 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (atBottomRef.current) setShowNewPill(false);
          }}
        >
          <PolicyNotice policy={session.policySnapshot} />
          {session.blocks.map((b) => (
            <EdrionLearnBlockCard
              key={b.id}
              blockRow={b}
              handlers={{
                onAnswer: (questionId, response) =>
                  answer.mutate({ blockId: b.id, questionId, response }),
                onInteract: (action, data) =>
                  interact.mutate({ blockId: b.id, action, data, version: b.version }),
                onCommit: (cardSelections) => commitArtifacts.mutate(cardSelections),
                answerPending: answer.isPending,
              }}
            />
          ))}
          {streamError && (
            <div className="rounded-[15px] border border-st-amberBd bg-st-amberSoft px-4 py-3 text-left">
              <p className="text-sm text-st-amberInk">{streamError.message}</p>
              {streamError.source !== 'network' && (
                <p className="mt-1 font-mono-ui text-[10.5px] uppercase text-st-amberInk/70">
                  {streamError.code}
                </p>
              )}
              <button
                type="button"
                onClick={restartStream}
                className="mt-2 rounded-full border border-st-amberBd px-3 py-1 text-xs font-medium text-st-amberInk"
              >
                Retry
              </button>
            </div>
          )}
          {streaming && (
            <div className="h-24 animate-pulse rounded-[15px] bg-st-surface2 motion-reduce:animate-none" />
          )}
          {showNewPill && (
            <button
              type="button"
              className="fixed bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-st-card px-3 py-1 text-xs shadow-md"
              onClick={() => {
                mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: 'smooth' });
                setShowNewPill(false);
              }}
            >
              ↓ New
            </button>
          )}
        </main>

        <footer className="fixed bottom-0 left-0 right-0 border-t border-st-divider bg-st-page/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-[640px] gap-2">
            <input
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && composer.trim() && session.orchestratorStatus !== 'closed') {
                  ask.mutate(composer.trim());
                  setComposer('');
                }
              }}
              placeholder="Ask anything…"
              disabled={session.orchestratorStatus === 'closed'}
              className="flex-1 rounded-full border border-st-bd2 bg-st-card px-4 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                if (composer.trim()) {
                  ask.mutate(composer.trim());
                  setComposer('');
                }
              }}
              className="rounded-full bg-[#1f604a] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              disabled={!composer.trim() || session.orchestratorStatus === 'closed'}
            >
              Send
            </button>
          </div>
          <div className="mx-auto mt-2 flex max-w-[640px] justify-end gap-2 text-xs">
            <button type="button" onClick={() => pause.mutate()} className="text-st-muted">
              Pause
            </button>
            <button type="button" onClick={() => end.mutate()} className="text-st-muted">
              End lesson
            </button>
          </div>
        </footer>
      </div>

      <div className="hidden lg:mt-16 lg:block">
        <ArtifactRail session={session} />
      </div>

      <CompletionOverlay session={session} />
    </div>
  );
}
