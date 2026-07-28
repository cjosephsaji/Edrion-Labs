'use client';

import { ArrowDown, ChevronLeft, Clock } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AdvanceButton } from '@/components/learn/session/AdvanceButton';
import { AskComposer } from '@/components/learn/session/AskComposer';
import {
  CheckpointDivider,
  ExplanationBlock,
  ProbeBlock,
  QuestionBlock,
  SystemNotice,
  WorkedExampleBlock,
} from '@/components/learn/session/blocks';
import { CompletionCard, type ProposedCard } from '@/components/learn/session/CompletionCard';
import { GraphPlot } from '@/components/learn/session/GraphPlot';
import { PathRail, PathStrip } from '@/components/learn/session/PathRail';
import { SessionAside, type ParkedQuestion } from '@/components/learn/session/SessionAside';

export type { ProposedCard };

export type SessionBlock =
  | {
      id: string;
      surface: 'explanation';
      heading?: string;
      bodyMd: string;
      deeperMd?: string;
      whyHere: string;
    }
  | {
      id: string;
      surface: 'worked_example';
      problemMd: string;
      steps: string[];
      predictAtStep?: number;
      whyHere: string;
    }
  | {
      id: string;
      surface: 'question_set';
      promptMd: string;
      options: Array<{
        id: string;
        label: string;
        correct?: boolean;
        mistake?: { name: string; explainsMd: string };
      }>;
      whyCorrectMd?: string;
      whyHere: string;
      answerKey: { correctOptionId: string };
    }
  | { id: string; surface: 'probe'; questionMd: string; whyHere: string }
  | { id: string; surface: 'checkpoint'; name: string }
  | { id: string; surface: 'system_notice'; message: string; actionLabel?: string }
  | {
      id: string;
      surface: 'graph_plot';
      caption: string;
      expression: string;
      param: { name: string; min: number; max: number; value: number };
      whyHere: string;
    };

export type SessionView = {
  id: string;
  topicTitle: string;
  goal: string;
  timeBudgetMinutes: number;
  lessonShape: {
    checkpoints: Array<{ id: string; label: string; role: string }>;
  };
  blocks: SessionBlock[];
  capabilities?: string[];
  summaryMd?: string;
  pathContext?: { label: string; index: number; total: number } | null;
};

type SessionShellProps = {
  session: SessionView;
  onComplete?: () => Promise<{ summaryMd?: string; cards?: ProposedCard[] } | void>;
  onPersistAnswer?: (blockId: string, selectedOptionId: string) => void;
  onSaveCards?: (cards: ProposedCard[]) => Promise<{ deckId?: string } | void>;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function SessionShell({
  session,
  onComplete,
  onPersistAnswer,
  onSaveCards,
}: SessionShellProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [completedCheckpoints, setCompletedCheckpoints] = useState(0);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [fullyRevealed, setFullyRevealed] = useState<Record<string, boolean>>({});
  const [parked, setParked] = useState<ParkedQuestion[]>([]);
  const [showCompletion, setShowCompletion] = useState(false);
  const [cards, setCards] = useState<ProposedCard[]>([]);
  const [summary, setSummary] = useState(session.summaryMd ?? '');
  const [selectedCards, setSelectedCards] = useState<Record<string, boolean>>({});
  const [activeOffscreen, setActiveOffscreen] = useState(false);

  const columnRef = useRef<HTMLDivElement>(null);
  const advancedFrom = useRef<Set<string>>(new Set());

  const checkpoints = session.lessonShape.checkpoints;
  const totalSteps = Math.max(checkpoints.length, 1);
  const currentStep = Math.min(completedCheckpoints + 1, totalSteps);
  const currentLabel = checkpoints[Math.min(completedCheckpoints, checkpoints.length - 1)]?.label;
  const nextLabel = checkpoints[completedCheckpoints + 1]?.label;

  const learned = useMemo(
    () => checkpoints.slice(0, completedCheckpoints).map((c) => c.label),
    [checkpoints, completedCheckpoints],
  );

  const progressPct =
    session.blocks.length > 1
      ? Math.max((focusIndex / (session.blocks.length - 1)) * 100, 3)
      : 3;

  const scrollToBlock = useCallback((index: number) => {
    const el = columnRef.current?.querySelector<HTMLElement>(`[data-block-index="${index}"]`);
    el?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  const advance = useCallback(
    (fromIndex: number, blockId?: string) => {
      if (blockId && advancedFrom.current.has(blockId)) return;
      if (blockId) advancedFrom.current.add(blockId);

      if (session.blocks[fromIndex]?.surface === 'checkpoint') {
        setCompletedCheckpoints((n) => Math.min(n + 1, checkpoints.length));
      }
      setFocusIndex(Math.min(fromIndex + 1, session.blocks.length - 1));
    },
    [checkpoints.length, session.blocks],
  );

  /** Scroll after commit — the newly focused block does not exist before it. */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    scrollToBlock(focusIndex);
  }, [focusIndex, scrollToBlock]);

  const finish = useCallback(async () => {
    const result = await onComplete?.();
    if (result?.summaryMd) setSummary(result.summaryMd);
    const nextCards = result?.cards ?? [];
    setCards(nextCards);
    setSelectedCards(Object.fromEntries(nextCards.map((c) => [c.id, true])));
    setShowCompletion(true);
  }, [onComplete]);

  /** Enter advances whenever the active block exposes a forward action. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || showCompletion) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
      ) {
        return;
      }
      const action = columnRef.current?.querySelector<HTMLButtonElement>(
        '[data-active="true"] [data-advance]',
      );
      if (!action) return;
      e.preventDefault();
      action.click();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCompletion]);

  /**
   * Only nudge with "jump to current" once the student has scrolled away from it.
   * Stays disarmed while the advance scroll is still animating, so the pill
   * never flashes on the way to a block that is about to be in view anyway.
   */
  useEffect(() => {
    setActiveOffscreen(false);
    const el = columnRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const offscreen = () => {
      const r = el.getBoundingClientRect();
      return r.bottom < 96 || r.top > window.innerHeight - 96;
    };

    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
      setActiveOffscreen(offscreen());
    }, 700);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (armed) setActiveOffscreen(!entry?.isIntersecting);
      },
      { rootMargin: '-96px 0px -96px 0px', threshold: 0 },
    );
    observer.observe(el);

    return () => {
      window.clearTimeout(arm);
      observer.disconnect();
    };
  }, [focusIndex]);

  const parkQuestion = (text: string) => {
    setParked((list) => [
      ...list,
      {
        id: `${Date.now()}-${list.length}`,
        text,
        atStep: currentLabel ?? session.topicTitle,
      },
    ]);
  };

  return (
    <div className="flex min-h-full flex-col bg-st-page">
      <header className="sticky top-0 z-30 border-b border-st-bd1 bg-st-page/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-3 md:px-6">
          <Link
            href="/learn"
            className="-ml-2 inline-flex min-h-[40px] items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-st-muted transition hover:bg-st-surface2 hover:text-st-ink"
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Back</span>
          </Link>

          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-st-ink md:text-[19px]">
              {session.topicTitle}
            </h1>
            <p className="mt-0.5 font-mono-ui text-[9.5px] font-semibold uppercase tracking-[0.14em] text-st-faint">
              Step {currentStep} of {totalSteps}
              {currentLabel && <span className="hidden md:inline"> · {currentLabel}</span>}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-st-bd2 bg-st-card px-2.5 py-1 text-[11px] font-medium text-st-muted">
            <Clock size={12} strokeWidth={2} aria-hidden />
            {session.timeBudgetMinutes} min
          </span>
        </div>

        <div className="mx-auto w-full max-w-[1240px] px-4 pb-2.5 md:hidden">
          <PathStrip checkpoints={checkpoints} current={completedCheckpoints} />
        </div>

        <div
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          className="h-[2px] w-full bg-st-bd1/50"
        >
          <div
            className="h-full rounded-r-full bg-st-accent transition-[width] duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1240px] flex-1 grid-rows-[minmax(min-content,1fr)] gap-x-10 px-4 pb-2 pt-8 md:grid-cols-[184px_minmax(0,1fr)] md:px-6 lg:grid-cols-[200px_minmax(0,1fr)_240px]">
        <aside className="hidden md:block">
          <PathRail
            checkpoints={checkpoints}
            current={completedCheckpoints}
            onJump={(i) => {
              const target = session.blocks.findIndex(
                (b) => b.surface === 'checkpoint' && b.name === checkpoints[i]?.label,
              );
              scrollToBlock(target >= 0 ? target : 0);
            }}
            pathContext={session.pathContext}
          />
        </aside>

        <div ref={columnRef} className="mx-auto flex w-full max-w-[672px] flex-col">
          <div className="space-y-8" aria-live="polite">
            {session.blocks.map((block, idx) => {
              if (idx > focusIndex) return null;
              const active = idx === focusIndex;
              const settled = idx < focusIndex;

              const wrapperClass = `scroll-mt-[92px] transition-opacity duration-500 ${
                settled ? 'opacity-[0.62] hover:opacity-100 focus-within:opacity-100' : ''
              }`;

              const shell = (body: ReactNode) => (
                <section
                  key={block.id}
                  data-block-index={idx}
                  data-active={active ? 'true' : undefined}
                  aria-current={active ? 'step' : undefined}
                  className={wrapperClass}
                >
                  {body}
                </section>
              );

              if (block.surface === 'checkpoint') {
                return shell(
                  <>
                    <CheckpointDivider name={block.name} />
                    {active && (
                      <AdvanceButton align="center" onClick={() => advance(idx, block.id)} />
                    )}
                  </>,
                );
              }

              if (block.surface === 'explanation') {
                return shell(
                  <>
                    <ExplanationBlock {...block} state={active ? 'active' : 'completed'} />
                    {active && <AdvanceButton onClick={() => advance(idx, block.id)} />}
                  </>,
                );
              }

              if (block.surface === 'worked_example') {
                const ready = !!fullyRevealed[block.id];
                return shell(
                  <>
                    <WorkedExampleBlock
                      {...block}
                      state={active ? 'active' : 'completed'}
                      onAllRevealed={() =>
                        setFullyRevealed((s) => (s[block.id] ? s : { ...s, [block.id]: true }))
                      }
                    />
                    {active && ready && <AdvanceButton onClick={() => advance(idx, block.id)} />}
                  </>,
                );
              }

              if (block.surface === 'question_set') {
                const options = block.options.map((o) => ({
                  ...o,
                  correct: o.correct ?? o.id === block.answerKey.correctOptionId,
                }));
                return shell(
                  <>
                    <QuestionBlock
                      promptMd={block.promptMd}
                      options={options}
                      whyHere={block.whyHere}
                      whyCorrectMd={block.whyCorrectMd}
                      state={active ? 'active' : 'completed'}
                      onAnswered={(selected) => {
                        onPersistAnswer?.(block.id, selected);
                        setAnswered((s) => ({ ...s, [block.id]: true }));
                      }}
                    />
                    {active && answered[block.id] && (
                      <AdvanceButton onClick={() => advance(idx, block.id)} />
                    )}
                  </>,
                );
              }

              if (block.surface === 'probe') {
                return shell(
                  <>
                    <ProbeBlock
                      {...block}
                      state={active ? 'active' : 'completed'}
                      onJustExplain={active ? () => advance(idx, block.id) : undefined}
                    />
                    {active && <AdvanceButton onClick={() => advance(idx, block.id)} />}
                  </>,
                );
              }

              if (block.surface === 'graph_plot') {
                return shell(
                  <>
                    <GraphPlot
                      expression={block.expression}
                      param={block.param}
                      caption={block.caption}
                    />
                    <p className="mt-2 text-[11.5px] text-st-faint">{block.whyHere}</p>
                    {active && <AdvanceButton onClick={() => advance(idx, block.id)} />}
                  </>,
                );
              }

              if (block.surface === 'system_notice') {
                return shell(
                  <SystemNotice
                    message={block.message}
                    actionLabel={active ? (block.actionLabel ?? 'Finish lesson') : undefined}
                    onAction={active ? () => void finish() : undefined}
                  />,
                );
              }

              return null;
            })}
          </div>

          {nextLabel && !showCompletion && (
            <p className="mt-9 flex items-center gap-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.12em] text-st-faint2">
              <span className="h-px w-6 bg-st-bd2" aria-hidden />
              Up next · {nextLabel}
            </p>
          )}

          <AskComposer onPark={parkQuestion} stepLabel={currentLabel} />
        </div>

        <aside className="hidden lg:block">
          <SessionAside
            learned={learned}
            totalCheckpoints={totalSteps}
            parked={parked}
            onRemoveParked={(id) => setParked((list) => list.filter((q) => q.id !== id))}
          />
        </aside>
      </div>

      {activeOffscreen && !showCompletion && (
        <button
          type="button"
          onClick={() => scrollToBlock(focusIndex)}
          className="fixed bottom-32 left-1/2 z-40 inline-flex -translate-x-1/2 animate-st-fade-up items-center gap-1.5 rounded-full bg-st-accentDeep px-4 py-2 text-[13px] font-semibold text-st-page shadow-[0_14px_30px_-14px_rgba(12,63,49,0.8)]"
        >
          <ArrowDown size={14} strokeWidth={2.4} aria-hidden />
          Jump to current step
        </button>
      )}

      {showCompletion && (
        <CompletionCard
          topicTitle={session.topicTitle}
          checkpoints={checkpoints.map((c) => c.label)}
          summaryMd={summary}
          cards={cards}
          parked={parked}
          selected={selectedCards}
          onToggle={(id) => setSelectedCards((s) => ({ ...s, [id]: !s[id] }))}
          onSelectAll={(next) =>
            setSelectedCards(Object.fromEntries(cards.map((c) => [c.id, next])))
          }
          onSave={async () => {
            const picked = cards.filter((c) => selectedCards[c.id]);
            if (!picked.length) {
              window.location.href = '/learn';
              return;
            }
            const result = onSaveCards ? await onSaveCards(picked) : undefined;
            const deckId = result && 'deckId' in result ? result.deckId : undefined;
            window.location.href = deckId ? `/library/decks/${deckId}` : '/library';
          }}
        />
      )}
    </div>
  );
}
