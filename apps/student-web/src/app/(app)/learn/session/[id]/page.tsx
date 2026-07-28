'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEdrionLearnSession } from '@/lib/hooks/useEdrionLearnSession';
import { StudentClientError, useStudentClient } from '@/lib/student-client';
import { EdrionLearnBlockCard, type OverflowVerb } from '@/components/edrion-learn/EdrionLearnBlockCard';
import { BlockCollapsedRow } from '@/components/edrion-learn/BlockCollapsedRow';
import { learnMoveIcon } from '@/components/edrion-learn/learn-move-icons';
import { SessionProgressBar } from '@/components/edrion-learn/SessionProgressBar';
import { ArtifactRail } from '@/components/edrion-learn/ArtifactRail';
import { CompletionOverlay } from '@/components/edrion-learn/CompletionOverlay';
import { useToast } from '@/components/ui/toast';
import { PillButton } from '@/components/ui/pill-button';
import { useModalDialog } from '@/lib/hooks/useModalDialog';
import type { BlockV1, LearnPolicyV1, SessionBlockV1Dto } from '@edrion/schemas';

function blockSnippet(block: BlockV1): { title: string; body: string } {
  switch (block.block_type) {
    case 'explanation':
      return { title: block.title ?? 'Lesson note', body: block.body_md };
    case 'worked_example':
      return {
        title: block.title ?? 'Worked example',
        body: [block.problem_md, ...block.steps.map((s) => s.step_md)].join('\n\n'),
      };
    case 'question_set':
      return {
        title: block.title ?? 'Question',
        body: block.questions.map((q) => q.prompt_md).join('\n\n'),
      };
    case 'probe':
      return { title: 'Probe', body: block.question_md };
    case 'synthesis':
      return { title: 'Synthesis', body: block.prompt_md };
    case 'canvas_embed':
      return { title: block.caption ?? 'Diagram', body: block.caption ?? 'Lesson diagram' };
    default:
      return { title: 'Lesson note', body: 'From Edrion Learn' };
  }
}

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
    <div className="space-y-1">
      {notices.map((n) => (
        <p key={n} className="text-[11px] text-st-muted">
          {n}
        </p>
      ))}
    </div>
  );
}

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
        <button type="button" onClick={onRetry} className="rounded-full bg-st-accent px-4 py-2 text-sm text-white">
          Retry
        </button>
        <Link href="/learn" className="rounded-full border border-st-bd2 px-4 py-2 text-sm">
          Back
        </Link>
      </div>
    </div>
  );
}

function ExitSheet({
  open,
  onClose,
  onEnd,
  onPause,
}: {
  open: boolean;
  onClose: () => void;
  onEnd: () => void;
  onPause: () => void;
}) {
  const panelRef = useModalDialog(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-sheet-title"
        className="w-full max-w-sm rounded-t-[15px] bg-st-card p-5 shadow-lg sm:rounded-[15px]"
      >
        <h2 id="exit-sheet-title" className="text-base font-semibold text-st-ink">
          Leave this lesson?
        </h2>
        <p className="mt-1 text-sm text-st-muted">Pause to come back later, or end and save your progress.</p>
        <div className="mt-4 flex flex-col gap-2">
          <PillButton className="w-full min-h-0 py-2" onClick={onPause}>
            Pause
          </PillButton>
          <PillButton variant="ghost" className="w-full min-h-0 py-2" onClick={onEnd}>
            End lesson
          </PillButton>
          <button type="button" className="text-sm text-st-muted" onClick={onClose}>
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EdrionLearnSessionPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const client = useStudentClient();
  const { say } = useToast();
  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
    streaming,
    streamingText,
    streamingMoveType,
    streamError,
    offline,
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
  const [composerComposing, setComposerComposing] = useState(false);
  const [queuedAsks, setQueuedAsks] = useState<string[]>([]);
  const [showNewPill, setShowNewPill] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [expandedPast, setExpandedPast] = useState<Set<string>>(() => new Set());
  const mainRef = useRef<HTMLElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (!session || session.orchestratorStatus === 'closed' || session.readOnly) return;
    startStream();
    return stopStream;
  }, [session?.id, session?.orchestratorStatus, session?.readOnly, startStream, stopStream]);

  useEffect(() => {
    if (atBottomRef.current && mainRef.current) {
      mainRef.current.scrollTop = mainRef.current.scrollHeight;
    } else if (session?.blocks.length) {
      setShowNewPill(true);
    }
  }, [session?.blocks.length, streaming, streamingText?.text]);

  // Drain queued composer when no longer awaiting a locked interaction.
  useEffect(() => {
    if (!queuedAsks.length || !session || offline) return;
    if (session.orchestratorStatus === 'awaiting_response') return;
    const [next, ...rest] = queuedAsks;
    if (!next) return;
    ask.mutate(next);
    setQueuedAsks(rest);
  }, [queuedAsks, session?.orchestratorStatus, ask, session, offline]);

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
        <div className="flex h-32 items-center justify-center rounded-[15px] bg-st-surface2">
          <span className="animate-pulse text-2xl text-st-muted motion-reduce:animate-none">◈</span>
        </div>
      </div>
    );
  }

  if (streamError && !session.blocks.length) {
    return (
      <SessionErrorCard
        message={streamError.message}
        code={streamError.source === 'network' ? undefined : streamError.code}
        onRetry={restartStream}
      />
    );
  }

  const budget = session.timeBudgetMinutes ?? 15;
  const elapsed = session.elapsedMinutes ?? 0;
  const cpTotal = Math.max(session.checkpointsTotal, 1);
  const cpDone = session.checkpointsDone ?? 0;
  const estRemaining =
    cpDone > 0 ? Math.max(1, Math.round(((cpTotal - cpDone) / cpDone) * Math.max(elapsed, 1))) : budget;
  const timeChip =
    elapsed >= budget / 2 || cpDone >= cpTotal / 2
      ? `${Math.max(0, estRemaining)} min left`
      : cpDone > 0
        ? `${cpDone}/${cpTotal} steps`
        : `${budget} min`;
  const awaiting = session.orchestratorStatus === 'awaiting_response';
  // Composer queues while awaiting — but the active card must stay interactive
  // (selecting MCQ options / Submit / Continue). Only offline/read-only hard-locks cards.
  const cardLocked = offline || Boolean(session.readOnly);

  const enqueueComposer = () => {
    const text = composer.trim();
    if (!text) return;
    if (awaiting || offline) {
      setQueuedAsks((q) => [...q, text]);
      setComposer('');
      return;
    }
    ask.mutate(text);
    setComposer('');
  };

  const onOverflow = (verb: OverflowVerb, blockRow: SessionBlockV1Dto) => {
    if (verb === 'explain_simpler' || verb === 'explain_deeper') {
      ask.mutate(
        verb === 'explain_simpler'
          ? 'Explain the last block more simply, without advancing.'
          : 'Go deeper on the last block, without advancing.',
      );
      return;
    }
    const snippet = blockSnippet(blockRow.block);
    void (async () => {
      try {
        if (verb === 'save_notes') {
          await client.post('/library/from-learn-block/note', {
            sessionId: params.id,
            title: snippet.title,
            bodyMd: snippet.body.slice(0, 8000),
          });
          say('Saved to notes');
        } else {
          await client.post('/library/from-learn-block/flashcard', {
            sessionId: params.id,
            prompt: snippet.title,
            answer: snippet.body.slice(0, 4000),
          });
          say('Flashcard saved');
        }
      } catch (e) {
        say((e as Error).message ?? 'Could not save');
      }
    })();
  };

  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4 pb-28 pt-3 lg:flex-row lg:items-start lg:gap-8">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,color-mix(in_srgb,var(--st-accent)_12%,transparent),transparent_55%)]"
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 -mx-4 border-b border-st-divider/80 bg-st-page/90 px-4 pb-3 pt-1 backdrop-blur-md">
          <div className="mx-auto flex max-w-[640px] items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Leave lesson"
              onClick={() => setExitOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-st-muted transition hover:bg-st-surface2 hover:text-st-ink"
            >
              ←
            </button>
            <h1 className="min-w-0 flex-1 truncate text-center font-display text-[15px] font-semibold tracking-tight text-st-ink">
              {session.topicTitle}
            </h1>
            <span className="shrink-0 rounded-full border border-st-bd2 bg-st-card px-2.5 py-0.5 font-mono-ui text-[10px] uppercase tracking-wide text-st-muted">
              {timeChip}
            </span>
          </div>
          <div className="mx-auto mt-2.5 max-w-[640px]">
            <SessionProgressBar session={session} />
          </div>
        </header>

        {offline && (
          <div className="mx-auto mt-2 max-w-[640px] rounded-md bg-st-surface2 px-3 py-1.5 text-xs text-st-muted">
            You're offline — reading saved blocks. Interactions resume when you're back.
          </div>
        )}

        <main
          ref={mainRef}
          className="relative mx-auto mt-5 flex min-h-0 w-full max-w-[640px] flex-1 flex-col gap-2.5 overflow-y-auto pb-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (atBottomRef.current) setShowNewPill(false);
          }}
          aria-live="polite"
        >
          {session.blocks.map((b, idx) => {
            const focusIndex = session.blocks.length - 1;
            const isFocus = idx === focusIndex && !streamingText;
            const collapsed = idx < focusIndex && !expandedPast.has(b.id);
            const blockHandlers = {
              onAnswer: (questionId: string, response: unknown, hintsUsed?: number) =>
                answer.mutate({ blockId: b.id, questionId, response, hintsUsed }),
              onInteract: (action: string, data?: Record<string, unknown>) =>
                interact.mutate({ blockId: b.id, action, data, version: b.version }),
              onCommit: (cardSelections: string[]) => commitArtifacts.mutate(cardSelections),
              onOverflow,
              answerPending: answer.isPending,
              locked: cardLocked,
            };
            if (collapsed) {
              return (
                <BlockCollapsedRow
                  key={b.id}
                  blockRow={b}
                  onExpand={() => setExpandedPast((s) => new Set(s).add(b.id))}
                />
              );
            }
            return (
              <EdrionLearnBlockCard
                key={b.id}
                blockRow={b}
                isLastBlock={isFocus && !streaming}
                isActive={isFocus}
                handlers={blockHandlers}
              />
            );
          })}
          {streamingText && (
            <article className="animate-st-fade-up rounded-[18px] border border-st-accentBd/60 bg-st-card p-5 shadow-sm motion-reduce:animate-none">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-st-accent motion-reduce:animate-none" />
                <span className="font-mono-ui text-[10px] uppercase tracking-wider text-st-muted">Writing…</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-st-inkSoft">
                {streamingText.text.slice(0, 800)}
                {streamingText.text.length > 800 ? '…' : ''}
              </p>
            </article>
          )}
          {streamError && (
            <div className="rounded-[15px] border border-st-amberBd bg-st-amberSoft px-4 py-3 text-left">
              <p className="text-sm text-st-amberInk">{streamError.message}</p>
              <button
                type="button"
                onClick={restartStream}
                className="mt-2 rounded-full border border-st-amberBd px-3 py-1 text-xs font-medium text-st-amberInk"
              >
                Retry
              </button>
            </div>
          )}
          {streaming && !streamingText && (
            <div
              className="flex h-24 animate-st-fade-up items-center justify-center gap-2 rounded-[15px] border border-dashed border-st-bd2 bg-st-surface2 motion-reduce:animate-none"
              aria-busy="true"
              aria-label="Loading next lesson step"
            >
              <span className="text-2xl text-st-muted motion-reduce:animate-none">
                {learnMoveIcon(streamingMoveType)}
              </span>
              <span className="text-xs text-st-muted">Preparing your next step…</span>
            </div>
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

        <footer className="fixed bottom-0 left-0 right-0 border-t border-st-divider/80 bg-st-page/92 p-3 backdrop-blur-md">
          <div className="mx-auto max-w-[640px] space-y-2">
            <PolicyNotice policy={session.policySnapshot} />
            <div className="flex items-center gap-2 rounded-full border border-st-bd2 bg-st-card p-1 shadow-sm">
              <input
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onCompositionStart={() => setComposerComposing(true)}
                onCompositionEnd={() => setComposerComposing(false)}
                onKeyDown={(e) => {
                  if (composerComposing) return;
                  if (e.key !== 'Enter' || e.shiftKey || !composer.trim() || session.orchestratorStatus === 'closed')
                    return;
                  e.preventDefault();
                  enqueueComposer();
                }}
                placeholder={awaiting ? 'Finish this step first — or queue a question…' : 'Ask anything about this lesson…'}
                disabled={session.orchestratorStatus === 'closed' || offline}
                className="min-w-0 flex-1 bg-transparent px-3.5 py-2 text-sm text-st-ink outline-none placeholder:text-st-faint"
              />
              <PillButton
                className="min-h-0 shrink-0 rounded-full px-4 py-2 text-sm disabled:opacity-40"
                disabled={!composer.trim() || session.orchestratorStatus === 'closed' || offline}
                onClick={enqueueComposer}
              >
                Send
              </PillButton>
            </div>
            {queuedAsks.length > 0 && (
              <div className="space-y-1.5 px-1" aria-live="polite">
                {queuedAsks.map((q, i) => (
                  <div
                    key={`${i}-${q.slice(0, 24)}`}
                    className="flex items-start justify-between gap-2 rounded-xl border border-st-bd2 bg-st-card/80 px-3 py-2"
                  >
                    <p className="text-[11px] leading-snug text-st-muted">
                      Queued: &ldquo;{q.slice(0, 80)}
                      {q.length > 80 ? '…' : ''}&rdquo;
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-[11px] font-medium text-st-accent hover:underline"
                      onClick={() => setQueuedAsks((all) => all.filter((_, j) => j !== i))}
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </footer>
      </div>

      <ArtifactRail session={session} />

      <ExitSheet
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        onPause={() => {
          pause.mutate();
          setExitOpen(false);
          router.push('/learn');
        }}
        onEnd={() => {
          end.mutate(true);
          setExitOpen(false);
        }}
      />

      <CompletionOverlay session={session} />
    </div>
  );
}
