'use client';
import React from 'react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FilePenLine,
  Flag,
  Layers3,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  ShieldCheck,
  Send,
  Target,
  WandSparkles,
  WifiOff,
} from 'lucide-react';
import type {
  PetrosLearningSessionDocument,
  PetrosDetour,
  PetrosSessionBlock,
  PetrosStudentQuestionState,
  PetrosTeachingBlockContent,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import { PetrosArtifactCuration, type PetrosArtifactCounts } from './petros-artifact-curation';
import styles from './petros-session.module.css';

interface SessionProps {
  topic: string;
  score?: string;
  source: string;
  resultId?: string;
  sessionId?: string;
}

type SnapOpening = {
  prompt?: string;
  fastestUsefulNextStep?: string;
  completeSolutionIncluded?: boolean;
};

export function PetrosRepairSession({ topic, score, source, resultId, sessionId }: SessionProps) {
  const api = useStudentApi();
  const [document, setDocument] = useState<PetrosLearningSessionDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [parkedQuestion, setParkedQuestion] = useState('');
  const [submittingQuestionId, setSubmittingQuestionId] = useState<string | null>(null);
  const [hintingQuestionId, setHintingQuestionId] = useState<string | null>(null);
  const [submittingComposer, setSubmittingComposer] = useState(false);
  const [artifactCounts, setArtifactCounts] = useState<PetrosArtifactCounts | null>(null);
  const [expanding, setExpanding] = useState(false);
  const expansionOfferedFor = useRef<string | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const continueKey = useRef<string | null>(null);
  const interactionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const requestNext = useCallback(
    async (id: string) => {
      if (!navigator.onLine) {
        setOnline(false);
        setError(
          'You are offline. Your completed blocks are still here; reconnect to prepare the next one.',
        );
        return;
      }
      setContinuing(true);
      setError('');
      setSlow(false);
      requestAbort.current?.abort();
      const controller = new AbortController();
      requestAbort.current = controller;
      continueKey.current ??= newIdempotencyKey();
      const slowTimer = setTimeout(() => setSlow(true), 4_000);
      const pollTimer = setInterval(() => {
        void api
          .get<PetrosLearningSessionDocument>(`/student/petros/sessions/${id}`, controller.signal)
          .then((latest) => setDocument(latest))
          .catch(() => undefined);
      }, 2_500);
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${id}/continue`,
          { idempotencyKey: continueKey.current },
          undefined,
          controller.signal,
        );
        continueKey.current = null;
        setDocument(next);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError'))
          setError(formatApiError(caught));
      } finally {
        clearTimeout(slowTimer);
        clearInterval(pollTimer);
        setContinuing(false);
        setSlow(false);
      }
    },
    [api],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    requestAbort.current = controller;
    setOnline(navigator.onLine);
    const onlineListener = () => setOnline(true);
    const offlineListener = () => setOnline(false);
    window.addEventListener('online', onlineListener);
    window.addEventListener('offline', offlineListener);

    async function start() {
      setLoading(true);
      setError('');
      try {
        let current: PetrosLearningSessionDocument;
        if (sessionId) {
          current = await api.get(`/student/petros/sessions/${sessionId}`, controller.signal);
        } else {
          throw new Error('Open Petros from a verified result, exam, document, learning path, or assistant preview.');
        }
        if (cancelled) return;
        setDocument(current);
        const savedQuestion = sessionStorage.getItem(`petros:parked-question:${current.id}`);
        if (savedQuestion) setParkedQuestion(savedQuestion);
        if (current.status === 'active' && current.blocks.length === 0)
          void requestNext(current.id);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError'))
          setError(formatApiError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
      controller.abort();
      requestAbort.current?.abort();
      interactionTimers.current.forEach(clearTimeout);
      window.removeEventListener('online', onlineListener);
      window.removeEventListener('offline', offlineListener);
    };
  }, [api, requestNext, resultId, score, sessionId, source, topic]);

  const updateInteraction = useCallback(
    (blockId: string, patch: Record<string, unknown>, immediate = false) => {
      setDocument((current) =>
        current
          ? {
              ...current,
              blocks: current.blocks.map((block) =>
                block.id === blockId
                  ? {
                      ...block,
                      interactionState: { ...block.interactionState, ...patch },
                    }
                  : block,
              ),
            }
          : current,
      );
      if (!document) return;
      const existing = interactionTimers.current.get(blockId);
      if (existing) clearTimeout(existing);
      const persist = () => {
        const currentBlock = document.blocks.find((block) => block.id === blockId);
        const interactionState = {
          ...currentBlock?.interactionState,
          ...patch,
        };
        void api
          .put(`/student/petros/sessions/${document.id}/blocks/${blockId}/interaction`, {
            interactionState,
          })
          .catch(() => undefined);
        interactionTimers.current.delete(blockId);
      };
      if (immediate) persist();
      else interactionTimers.current.set(blockId, setTimeout(persist, 500));
    },
    [api, document],
  );

  const completeBlock = useCallback(
    async (block: PetrosSessionBlock) => {
      if (!document || !online) return;
      setError('');
      try {
        const completed = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/blocks/${block.id}/complete`,
          {
            idempotencyKey: newIdempotencyKey(),
            blockType: block.content.type,
            expectedBlockVersion: block.version,
            interactionState: block.interactionState,
            observedOutcome: { completed: true, stage: 3 },
          },
        );
        setDocument(completed);
        if (completed.status === 'active') void requestNext(completed.id);
      } catch (caught) {
        setError(formatApiError(caught));
      }
    },
    [api, document, online, requestNext],
  );

  const submitAnswer = useCallback(
    async (
      block: PetrosSessionBlock,
      questionId: string,
      answer: string,
      confidence: 'sure' | 'think_so' | 'guessing',
      responseTimeMs: number,
    ) => {
      if (!document || !online || submittingQuestionId) return;
      setSubmittingQuestionId(questionId);
      setError('');
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/blocks/${block.id}/answers`,
          {
            idempotencyKey: newIdempotencyKey(),
            questionId,
            answer,
            confidence,
            expectedBlockVersion: block.version,
            responseTimeMs,
          },
        );
        setDocument(next);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setSubmittingQuestionId(null);
      }
    },
    [api, document, online, submittingQuestionId],
  );

  const requestHint = useCallback(
    async (block: PetrosSessionBlock, questionId: string) => {
      if (!document || !online || hintingQuestionId) return;
      setHintingQuestionId(questionId);
      setError('');
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/blocks/${block.id}/hint`,
          {
            idempotencyKey: newIdempotencyKey(),
            questionId,
            expectedBlockVersion: block.version,
          },
        );
        setDocument(next);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setHintingQuestionId(null);
      }
    },
    [api, document, hintingQuestionId, online],
  );

  const submitComposerQuestion = useCallback(async () => {
    if (!document || !online || submittingComposer || parkedQuestion.trim().length < 2) return;
    setSubmittingComposer(true);
    setError('');
    try {
      const next = await api.post<PetrosLearningSessionDocument>(
        `/student/petros/sessions/${document.id}/questions`,
        {
          idempotencyKey: newIdempotencyKey(),
          question: parkedQuestion.trim(),
          expectedSessionVersion: document.version,
        },
      );
      setDocument(next);
      setParkedQuestion('');
      sessionStorage.removeItem(`petros:parked-question:${document.id}`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setSubmittingComposer(false);
    }
  }, [api, document, online, parkedQuestion, submittingComposer]);

  const lifecycle = useCallback(
    async (action: 'pause' | 'resume' | 'close') => {
      if (!document) return;
      requestAbort.current?.abort();
      setError('');
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/${action}`,
          action === 'close'
            ? { idempotencyKey: newIdempotencyKey(), reason: 'student_stopped' }
            : { idempotencyKey: newIdempotencyKey() },
        );
        setDocument(next);
        setConfirmClose(false);
      } catch (caught) {
        setError(formatApiError(caught));
      }
    },
    [api, document],
  );

  const expandFiveMinute = useCallback(async () => {
    if (!document || document.sourceContext?.door !== 'five_minute') return;
    setExpanding(true);
    setError('');
    try {
      const next = await api.post<PetrosLearningSessionDocument>('/student/petros/sessions', {
        clientRequestId: newIdempotencyKey(),
        sessionType: 'learn',
        topic: document.topic,
        goal: `Continue beyond the completed five-minute session on ${document.topic}.`,
        timeBudgetSeconds: 900,
        maxMoves: 5,
        learnerContext: { expandedFromFiveMinuteSessionId: document.id },
        topicContext: { explicitExpansionAccepted: true },
        sourceContext: { door: 'student_portal', referenceId: document.id, label: 'Explicitly expanded five-minute session' },
        profileContext: { subjectLabel: document.topic },
      });
      void api.post('/student/petros/modality-events', {
        mode: 'five_minute', type: 'expansion_accepted', sessionId: document.id,
        idempotencyKey: newIdempotencyKey(),
      }).catch(() => undefined);
      window.location.assign(`/petros/session?session=${next.id}`);
    } catch (caught) {
      setError(formatApiError(caught));
      setExpanding(false);
    }
  }, [api, document]);

  const completedCount =
    document?.checkpoints.filter((checkpoint) => checkpoint.status === 'complete').length ?? 0;
  const artifactIntents =
    document?.blocks.filter((block) => typeof block.interactionState.artifactIntent === 'string')
      .length ?? 0;
  const artifactCommitReady = document?.blocks.some((block) => block.content.type === 'artifact_commit') ?? false;
  const closed = document?.status === 'closed';
  const sourceView = contextualSourceView(document, source);
  const isFiveMinute = document?.sourceContext?.door === 'five_minute';
  useEffect(() => {
    if (!document || !closed || !isFiveMinute || expansionOfferedFor.current === document.id) return;
    expansionOfferedFor.current = document.id;
    const startedAt = new Date(document.createdAt).getTime();
    const finishedAt = new Date(document.updatedAt).getTime();
    const durationMs = Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? Math.max(0, finishedAt - startedAt)
      : undefined;
    void api.post('/student/petros/modality-events', {
      mode: 'five_minute',
      type: 'expansion_offered',
      sessionId: document.id,
      durationMs,
      // The session id makes the offer idempotent across refreshes and devices.
      idempotencyKey: document.id,
    }).catch(() => undefined);
  }, [api, closed, document, isFiveMinute]);
  let snapOpening: SnapOpening | null = null;
  if (document?.sourceContext?.door === 'snap_question') {
    try {
      snapOpening = JSON.parse(sessionStorage.getItem(`petros:snap-opening:${document.id}`) ?? 'null') as SnapOpening | null;
    } catch {
      snapOpening = null;
    }
  }

  if (loading && !document) return <SessionLoading topic={topic} />;

  return (
    <div className={styles.shell}>
      <header className={styles.stickyHeader}>
        <div className={styles.headerRow}>
          <Link href={sourceView.returnHref} className={styles.back}>
            <ArrowLeft aria-hidden="true" /> {sourceView.returnLabel}
          </Link>
          <div className={styles.identity}>
            <span>
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <strong>Petros</strong>
              <small>{sourceView.sessionLabel} · {document?.topic ?? topic}</small>
            </div>
          </div>
          <div className={styles.sessionControls}>
            {document?.status === 'paused' ? (
              <button
                className={styles.pause}
                data-action="resume"
                onClick={() => void lifecycle('resume')}
              >
                <Play aria-hidden="true" /> Resume
              </button>
            ) : (
              <button
                className={styles.pause}
                data-action="pause"
                disabled={!document || closed}
                onClick={() => void lifecycle('pause')}
              >
                <Pause aria-hidden="true" /> Save and pause
              </button>
            )}
            <button
              className={styles.closeButton}
              disabled={!document || closed}
              aria-label="Close session"
              onClick={() => setConfirmClose(true)}
            >
              <Square aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={document?.checkpoints.length ?? 4}
          aria-valuenow={completedCount}
          aria-label={`${completedCount} of ${document?.checkpoints.length ?? 4} checkpoints complete`}
        >
          {(
            document?.checkpoints ??
            Array.from({ length: 4 }, (_, index) => ({
              id: String(index),
              status: 'pending',
            }))
          ).map((checkpoint) => (
            <span
              key={checkpoint.id}
              data-complete={checkpoint.status === 'complete'}
              data-current={checkpoint.status === 'current'}
            >
              <i />
            </span>
          ))}
        </div>
      </header>

      <div className={styles.layout}>
        <article className={styles.document} aria-live="polite">
          <section className={styles.opening}>
            <div className={styles.kicker}>
              <WandSparkles aria-hidden="true" /> Opened from{' '}
              {sourceView.openedFrom}
            </div>
            {/*
              The goal is what this session is actually for, so it is the headline. The mode
              slogan is the same sentence for every student in that mode, so it sits under it
              as supporting text rather than dominating the screen.
            */}
            <h1>{document?.currentGoal ?? `A focused session on ${topic}.`}</h1>
            <p>
              {[sourceView.contextLine, sourceView.heading].filter(Boolean).join(' · ')}
            </p>
            <div className={styles.goal}>
              <Clock3 aria-hidden="true" />
              <span>
                <strong>
                  About {Math.ceil((document?.timeBudgetSeconds ?? 480) / 60)} minutes
                </strong>{' '}
                · one step at a time · up to {document?.maxMoves ?? 4} guided steps
              </span>
            </div>
          </section>

          {sourceView.citations.length ? (
            <section className={styles.grounding} aria-label="Verified session sources">
              <strong>Verified source context</strong>
              {sourceView.citations.slice(0, 6).map((citation) => (
                <span key={`${citation.label}:${citation.page ?? citation.section ?? ''}`}>
                  {citation.label}{citation.page ? ` · p. ${citation.page}` : ''}{citation.section ? ` · ${citation.section}` : ''}
                </span>
              ))}
            </section>
          ) : null}
          {snapOpening && (
            <section className={styles.grounding} aria-label="Photographed question opening">
              <strong>{snapOpening.prompt}</strong>
              <span>Fastest useful next step: {snapOpening.fastestUsefulNextStep}</span>
              <span>No complete solution is shown before this teaching step.</span>
            </section>
          )}
          {document?.institutionalPolicy ? (
            <InstitutionalPolicyPanel document={document} />
          ) : null}

          {!online && (
            <StatusBanner
              icon={WifiOff}
              tone="warning"
              title="You are offline"
              body="Everything already shown remains readable. Reconnect to complete or prepare another block."
            />
          )}
          {document?.fallbackNotice && (
            <StatusBanner
              icon={RotateCcw}
              tone="neutral"
              title="A built-in teaching step kept this session moving"
              body={document.fallbackNotice}
            />
          )}
          {document?.personalization?.status === 'neutral' && (
            <StatusBanner
              icon={Target}
              tone="neutral"
              title="A neutral starting route"
              body="There is not enough comparable history to infer a preference yet, so this session follows the topic profile and your choices here."
            />
          )}
          {document?.personalization?.status === 'stale_fallback' && (
            <StatusBanner
              icon={RotateCcw}
              tone="neutral"
              title="Using a safe topic-first route"
              body="Your learning model is being refreshed. Petros is using the topic profile and this session’s choices until it is current."
            />
          )}
          {error && (
            <StatusBanner
              icon={CircleHelp}
              tone="warning"
              title="This teaching action did not finish"
              body={error}
              action={
                document && online ? (
                  <button onClick={() => void requestNext(document.id)}>Try again</button>
                ) : undefined
              }
            />
          )}
          {confirmClose && (
            <StatusBanner
              icon={Square}
              tone="warning"
              title="Close this session deliberately?"
              body="Your existing blocks and interaction state stay available, but no more moves will be planned."
              action={
                <>
                  <button onClick={() => void lifecycle('close')}>Close session</button>
                  <button onClick={() => setConfirmClose(false)}>Keep learning</button>
                </>
              }
            />
          )}

          {document?.detours.map((detour) => (
            <DetourBanner key={detour.id} detour={detour} />
          ))}

          {document?.blocks.map((block) => (
            <TeachingBlock
              key={block.id}
              block={block}
              onInteraction={(patch, immediate) => updateInteraction(block.id, patch, immediate)}
            >
              <BlockContent
                block={block}
                onInteraction={(patch, immediate) => updateInteraction(block.id, patch, immediate)}
                onComplete={() => void completeBlock(block)}
                onAnswer={(questionId, answer, confidence, responseTimeMs) =>
                  void submitAnswer(block, questionId, answer, confidence, responseTimeMs)
                }
                onHint={(questionId) => void requestHint(block, questionId)}
                submittingQuestionId={submittingQuestionId}
                hintingQuestionId={hintingQuestionId}
              />
            </TeachingBlock>
          ))}

          {document && artifactCommitReady && (
            <PetrosArtifactCuration sessionId={document.id} onCounts={setArtifactCounts} />
          )}

          {continuing && (
            <BlockSkeleton expected={document?.expectedMoveType ?? null} slow={slow} />
          )}
          {!loading && document && document.blocks.length === 0 && !continuing && !error && (
            <StatusBanner
              icon={BookOpen}
              tone="neutral"
              title="This session is ready for its first block"
              body="Prepare one teaching move from the current goal and result context."
              action={<button onClick={() => void requestNext(document.id)}>Start the loop</button>}
            />
          )}

          {closed && (
            <section className={styles.close}>
              <div>
                <span>
                  <Check aria-hidden="true" />
                </span>
                <div>
                  <p>Session closed · {document.closeReason?.replace(/_/g, ' ')}</p>
                  <h2>Your session document is saved. Only artifacts you explicitly curated appear in your library.</h2>
                </div>
              </div>
              {isFiveMinute && (
                <button type="button" disabled={expanding} onClick={() => void expandFiveMinute()}>
                  {expanding ? 'Opening…' : 'Choose a full session'} <ArrowRight aria-hidden="true" />
                </button>
              )}
              <Link href={sourceView.returnHref} onClick={() => {
                if (document?.sourceContext && typeof document.sourceContext.intentId === 'string') {
                  void api.post(`/student/petros/intents/${document.sourceContext.intentId}/events`, {
                    event: 'returned', idempotencyKey: newIdempotencyKey(), sessionId: document.id,
                  }).catch(() => undefined);
                }
              }}>
                Return to {sourceView.returnLabel.toLowerCase()} <ArrowRight aria-hidden="true" />
              </Link>
            </section>
          )}

          <section className={styles.composer} aria-labelledby="petros-composer-title">
            <div>
              <MessageSquareText aria-hidden="true" />
              <div>
                <strong id="petros-composer-title">A question came up?</strong>
                <small>
                  Submit it to the teaching loop. It will become a visible detour, not a chat
                  thread.
                </small>
              </div>
            </div>
            <textarea
              value={parkedQuestion}
              onChange={(event) => {
                setParkedQuestion(event.target.value);
                if (document)
                  sessionStorage.setItem(
                    `petros:parked-question:${document.id}`,
                    event.target.value,
                  );
              }}
              maxLength={2000}
              disabled={closed || submittingComposer}
              placeholder="Ask something that should change what happens next…"
              aria-label="Question for the Petros teaching loop"
            />
            <button
              className={styles.composerSubmit}
              disabled={closed || submittingComposer || parkedQuestion.trim().length < 2}
              onClick={() => void submitComposerQuestion()}
            >
              {submittingComposer ? (
                <LoaderCircle aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              {submittingComposer ? 'Redirecting…' : 'Send into the plan'}
            </button>
          </section>
        </article>

        <aside className={styles.rail} aria-label="Session progress and artifacts">
          <div className={styles.railCard}>
            <p>THIS SESSION</p>
            {(document?.checkpoints ?? []).map((checkpoint, index) => (
              <div
                key={checkpoint.id}
                data-active={checkpoint.status === 'current'}
                data-done={checkpoint.status === 'complete'}
              >
                <span>
                  {checkpoint.status === 'complete' ? <Check aria-hidden="true" /> : index + 1}
                </span>
                <strong>{checkpoint.label}</strong>
              </div>
            ))}
          </div>
          {(() => {
            const proposed = artifactCounts?.proposed ?? artifactIntents;
            const saved = artifactCounts?.saved ?? 0;
            const completed =
              document?.blocks.filter((block) => block.status === 'completed').length ?? 0;
            // At the start of a session every count is zero. Three zeroes under a paragraph
            // of explanation is noise, so the card stays quiet until there is something to show.
            if (!proposed && !saved && !completed) {
              return (
                <div className={styles.railCard}>
                  <p>WHAT YOU’RE BUILDING</p>
                  <small>
                    Notes and flashcards you make here appear in this list. Nothing is saved until
                    you choose it.
                  </small>
                </div>
              );
            }
            return (
              <div className={styles.railCard}>
                <p>WHAT YOU’RE BUILDING</p>
                <dl>
                  {proposed ? (
                    <div>
                      <dt>Suggested</dt>
                      <dd>{proposed}</dd>
                    </div>
                  ) : null}
                  {saved ? (
                    <div>
                      <dt>Saved</dt>
                      <dd>{saved}</dd>
                    </div>
                  ) : null}
                  {completed ? (
                    <div>
                      <dt>Steps done</dt>
                      <dd>{completed}</dd>
                    </div>
                  ) : null}
                </dl>
                <small>Suggestions stay out of your saved work until you pick them.</small>
              </div>
            );
          })()}
          <div className={styles.rules}>
            <ShieldIcon />
            <div>
              <strong>Your institution’s rule</strong>
              {sourceView.policyDisclosures.map((disclosure) => <p key={disclosure}>{disclosure}</p>)}
            </div>
          </div>
          {document?.status === 'paused' && (
            <div className={styles.pausedCard}>
              <Pause aria-hidden="true" />
              <div>
                <strong>Session paused</strong>
                <p>Elapsed time is stopped. Resume whenever you are ready.</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TeachingBlock({
  block,
  onInteraction,
  children,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
  children: ReactNode;
}) {
  const Icon = iconFor(block.content.type);
  const showWhy = block.interactionState.whyOpen === true;
  return (
    <section
      className={styles.block}
      data-complete={block.status === 'completed'}
      data-block-type={block.content.type}
    >
      <div className={styles.blockHead}>
        <span>
          <Icon aria-hidden="true" />
        </span>
        <div>
          <p>
            {labelFor(block.content.type)}
          </p>
          <h2>{block.content.title}</h2>
        </div>
        <button
          aria-expanded={showWhy}
          aria-controls={`why-${block.id}`}
          onClick={() => onInteraction({ whyOpen: !showWhy }, true)}
        >
          Why this step?
        </button>
      </div>
      {showWhy && (
        <div id={`why-${block.id}`} className={styles.why}>
          {studentFriendlyWhy(block.content.type, block.whyThis)}
        </div>
      )}
      <div className={styles.blockBody}>
        {children}
        <BlockActions block={block} onInteraction={onInteraction} />
      </div>
    </section>
  );
}

function BlockContent({
  block,
  onInteraction,
  onComplete,
  onAnswer,
  onHint,
  submittingQuestionId,
  hintingQuestionId,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
  onComplete: () => void;
  onAnswer: (
    questionId: string,
    answer: string,
    confidence: 'sure' | 'think_so' | 'guessing',
    responseTimeMs: number,
  ) => void;
  onHint: (questionId: string) => void;
  submittingQuestionId: string | null;
  hintingQuestionId: string | null;
}) {
  const content = block.content;
  const completed = block.status === 'completed';
  const recovered =
    block.questions.length === 0 ||
    [...new Set(block.questions.map((question) => question.equivalenceKey))].every((key) =>
      block.questions.some(
        (question) =>
          question.equivalenceKey === key &&
          question.attempts.some((attempt) => attempt.correctness === 'correct'),
      ),
    );
  const questions = block.questions.length ? (
    <QuestionStack
      block={block}
      onInteraction={onInteraction}
      onAnswer={onAnswer}
      onHint={onHint}
      submittingQuestionId={submittingQuestionId}
      hintingQuestionId={hintingQuestionId}
    />
  ) : null;
  if (content.type === 'layered_explanation') {
    const expanded = Array.isArray(block.interactionState.expandedLayerIds)
      ? block.interactionState.expandedLayerIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.explanation}>{content.firstLayer}</p>
            <div className={styles.layers}>
              {content.deeperLayers.map((layer) => {
                const open = expanded.includes(layer.id);
                return (
                  <div key={layer.id}>
                    <button
                      aria-expanded={open}
                      onClick={() =>
                        onInteraction(
                          {
                            expandedLayerIds: open
                              ? expanded.filter((id) => id !== layer.id)
                              : [...expanded, layer.id],
                          },
                          true,
                        )
                      }
                    >
                      <Layers3 aria-hidden="true" /> {layer.label}
                      <ChevronRight aria-hidden="true" />
                    </button>
                    {open && <p>{layer.content}</p>}
                  </div>
                );
              })}
            </div>
            <div className={styles.keyIdea}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>Key idea</strong>
                <p>{content.keyIdea}</p>
              </div>
            </div>
            <Grounding content={content} />
            {!completed && (
              <CompleteButton onClick={onComplete}>I have the key idea</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'worked_example') {
    const revealed = Math.max(1, Number(block.interactionState.revealedStepCount ?? 1));
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt}>{content.problemStatement}</p>
            <div className={styles.steps}>
              {content.steps.map((step, index) => (
                <Step
                  key={step.id}
                  number={index + 1}
                  title={step.title}
                  body={step.explanation}
                  prediction={step.predictionPrompt}
                  visible={index < revealed}
                />
              ))}
            </div>
            {revealed < content.steps.length ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealedStepCount: revealed + 1 }, true)}
              >
                Predict the next step, then reveal <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <>
                <div className={styles.finalCheck}>
                  <strong>Final check</strong>
                  <p>{content.finalCheck}</p>
                </div>
                {!completed && (
                  <CompleteButton onClick={onComplete}>Finish this example</CompleteButton>
                )}
              </>
            )}
            <Grounding content={content} />
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'recall_check') {
    return (
      <>
        <p className={styles.prompt}>{content.instructions}</p>
        {questions}
        {completed ? (
          <div className={styles.submitted}>
            <Check aria-hidden="true" /> {content.feedback.submittedMessage}
          </div>
        ) : (
          <CompleteButton onClick={onComplete} disabled={!recovered}>
            Complete this check
          </CompleteButton>
        )}
        <p className={styles.helper}>{content.feedback.stageBoundary}</p>
      </>
    );
  }
  if (content.type === 'hook' || content.type === 'predict_then_reveal') {
    const revealed = block.interactionState.revealed === true;
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt}>{content.prompt}</p>
            {!revealed ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealed: true }, true)}
              >
                Show the connection <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <div className={styles.keyIdea}>
                <Lightbulb aria-hidden="true" />
                <div>
                  <strong>{content.type === 'hook' ? 'Why this matters' : 'What happens'}</strong>
                  <p>{content.reveal}</p>
                  {content.type === 'hook' && !isGenericAnchor(content.anchor) ? (
                    <small>{content.anchor}</small>
                  ) : content.type !== 'hook' ? (
                    <small>{content.explanation}</small>
                  ) : null}
                </div>
              </div>
            )}
            {!completed && revealed && (
              <CompleteButton onClick={onComplete}>Keep going</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'prerequisite_check') {
    return (
      <>
        <p className={styles.prompt}>{content.instructions}</p>
        <div className={styles.layers}>
          {content.prerequisites.map((prerequisite) => (
            <div key={prerequisite.key}>
              <p>{prerequisite.label}</p>
            </div>
          ))}
        </div>
        {questions}
        <p className={styles.helper}>{content.detourMessage}</p>
        {!completed && (
          <CompleteButton onClick={onComplete} disabled={!recovered}>
            Finish the foundation check
          </CompleteButton>
        )}
      </>
    );
  }
  if (content.type === 'goal_frame') {
    return (
      <>
        <div className={styles.keyIdea}>
          <Target aria-hidden="true" />
          <div>
            <strong>{content.timeEstimateMinutes} minute target</strong>
            <p>{content.goal}</p>
          </div>
        </div>
        <ol className={styles.steps}>
          {content.checkpoints.map((checkpoint, index) => (
            <Step
              key={checkpoint}
              number={index + 1}
              title={checkpoint}
              body="A bounded checkpoint in this session."
              visible
            />
          ))}
        </ol>
        {!completed && <CompleteButton onClick={onComplete}>Start with this target</CompleteButton>}
      </>
    );
  }
  if (content.type === 'analogy') {
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt}>
              {content.targetIdea} through {content.familiarDomain}
            </p>
            <div className={styles.steps}>
              {content.mappings.map((mapping, index) => (
                <Step
                  key={`${mapping.familiar}-${mapping.target}`}
                  number={index + 1}
                  title={mapping.familiar}
                  body={`Maps to: ${mapping.target}`}
                  visible
                />
              ))}
            </div>
            <div className={styles.finalCheck}>
              <strong>Where the analogy stops</strong>
              <p>{content.limit}</p>
            </div>
            {!completed && (
              <CompleteButton onClick={onComplete}>I can use—and limit—the analogy</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'story') {
    const revealed = Math.max(1, Number(block.interactionState.revealedEventCount ?? 1));
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt}>{content.setup}</p>
            <div className={styles.steps}>
              {content.events.map((event, index) => (
                <Step
                  key={event.id}
                  number={index + 1}
                  title={event.label}
                  body={event.detail}
                  visible={index < revealed}
                />
              ))}
            </div>
            {revealed < content.events.length ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealedEventCount: revealed + 1 }, true)}
              >
                Continue the causal thread <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <div className={styles.keyIdea}>
                <Flag aria-hidden="true" />
                <div>
                  <strong>Causal thread</strong>
                  <p>{content.takeaway}</p>
                </div>
              </div>
            )}
            {!completed && revealed >= content.events.length && (
              <CompleteButton onClick={onComplete}>I can trace the thread</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'derivation') {
    const revealed = Math.max(1, Number(block.interactionState.revealedStepCount ?? 1));
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <div className={styles.finalCheck}>
              <strong>Starting assumptions</strong>
              <p>{content.startingAssumptions.join(' · ')}</p>
            </div>
            <div className={styles.steps}>
              {content.steps.map((step, index) => (
                <Step
                  key={step.id}
                  number={index + 1}
                  title={step.expression}
                  body={step.explanation}
                  visible={index < revealed}
                />
              ))}
            </div>
            {revealed < content.steps.length ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealedStepCount: revealed + 1 }, true)}
              >
                Predict the transformation, then reveal <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <div className={styles.keyIdea}>
                <Lightbulb aria-hidden="true" />
                <div>
                  <strong>Conclusion</strong>
                  <p>{content.conclusion}</p>
                </div>
              </div>
            )}
            {!completed && revealed >= content.steps.length && (
              <CompleteButton onClick={onComplete}>I can justify each step</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'diagram') {
    const expanded = block.interactionState.diagramExpanded === true;
    const edited = isRecord(block.interactionState.diagramNodeLabels)
      ? block.interactionState.diagramNodeLabels
      : {};
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <div
              className={styles.diagram}
              data-expanded={expanded}
              role="img"
              aria-label={content.altText}
            >
              {content.nodes.map((node) => (
                <label key={node.id}>
                  <input
                    aria-label={`Edit ${node.label}`}
                    value={
                      typeof edited[node.id] === 'string' ? String(edited[node.id]) : node.label
                    }
                    disabled={completed}
                    onChange={(event) =>
                      onInteraction({
                        diagramNodeLabels: {
                          ...edited,
                          [node.id]: event.target.value,
                        },
                      })
                    }
                  />
                  <small>{node.description}</small>
                </label>
              ))}
              <ul>
                {content.edges.map((edge, index) => (
                  <li key={`${edge.from}-${edge.to}-${index}`}>
                    {edge.from} → {edge.to}
                    {edge.label ? ` · ${edge.label}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <button
              className={styles.reveal}
              aria-pressed={expanded}
              onClick={() => onInteraction({ diagramExpanded: !expanded }, true)}
            >
              {expanded ? 'Fit diagram to block' : 'Open diagram larger'}{' '}
              <ChevronRight aria-hidden="true" />
            </button>
            <details className={styles.feedbackWhy}>
              <summary>Nonvisual description</summary>
              <p>{content.altText}</p>
              <pre>{content.fallbackText}</pre>
            </details>
            {!completed && (
              <CompleteButton onClick={onComplete}>
                Keep this edited diagram in the session
              </CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'contrast_case') {
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <div className={styles.contrastGrid}>
              {[content.left, content.right].map((item) => (
                <section key={item.label}>
                  <strong>{item.label}</strong>
                  <p>{item.prompt}</p>
                  <small>{item.method}</small>
                </section>
              ))}
            </div>
            <div className={styles.keyIdea}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>Key distinction</strong>
                <p>{content.keyDistinction}</p>
              </div>
            </div>
            {!completed && (
              <CompleteButton onClick={onComplete}>I can tell the cases apart</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'misconception_demolition') {
    return (
      <>
        <blockquote className={styles.prompt}>{content.misconception}</blockquote>
        {questions}
        {recovered ? (
          <>
            <div className={styles.keyIdea}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>Correction</strong>
                <p>{content.correction}</p>
              </div>
            </div>
            <div className={styles.grounding}>
              <strong>Evidence</strong>
              {content.evidence.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            {!completed && (
              <CompleteButton onClick={onComplete}>Update this intuition</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'socratic_probe') {
    return (
      <>
        <p className={styles.helper}>
          Probe {content.probeNumber} of 2 · Petros explains after the cap.
        </p>
        {questions}
        {recovered && content.probeNumber === 2 && (
          <div className={styles.keyIdea}>
            <Lightbulb aria-hidden="true" />
            <div>
              <strong>Direct explanation</strong>
              <p>{content.explanationAfterCap}</p>
            </div>
          </div>
        )}
        {!completed && (
          <CompleteButton onClick={onComplete} disabled={!recovered}>
            Finish this probe
          </CompleteButton>
        )}
      </>
    );
  }
  if (content.type === 'apply_to_your_world') {
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt}>{content.prompt}</p>
            <ul>
              {content.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
            {content.examShape && (
              <div className={styles.finalCheck}>
                <strong>Exam-shaped response</strong>
                <p>{content.examShape}</p>
              </div>
            )}
            {!completed && (
              <CompleteButton onClick={onComplete}>I found a use for it</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'artifact_commit') {
    const selected = Array.isArray(block.interactionState.selectedProposalIds)
      ? block.interactionState.selectedProposalIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const declined = block.interactionState.artifactsDeclined === true;
    return (
      <>
        <p className={styles.prompt}>{content.prompt}</p>
        <div className={styles.choiceGrid}>
          {content.proposals.map((proposal) => {
            const active = selected.includes(proposal.id);
            return (
              <button
                key={proposal.id}
                role="checkbox"
                aria-checked={active}
                data-selected={active}
                disabled={completed || declined}
                onClick={() =>
                  onInteraction(
                    {
                      selectedProposalIds: active
                        ? selected.filter((id) => id !== proposal.id)
                        : [...selected, proposal.id],
                      artifactsDeclined: false,
                    },
                    true,
                  )
                }
              >
                <strong>{proposal.label}</strong>
                <small>
                  {proposal.kind.replace('_', ' ')} · {proposal.preview}
                </small>
              </button>
            );
          })}
        </div>
        {!completed && (
          <button
            className={styles.hintButton}
            onClick={() =>
              onInteraction({ selectedProposalIds: [], artifactsDeclined: true }, true)
            }
          >
            Save nothing from these proposals
          </button>
        )}
        <p className={styles.helper}>
          This block records your session choice. The review bundle below lets you edit each item;
          only its separate save action adds anything to your products.
        </p>
        {!completed && (
          <CompleteButton onClick={onComplete} disabled={!declined && selected.length === 0}>
            Confirm this artifact choice
          </CompleteButton>
        )}
      </>
    );
  }
  if (content.type === 'forward_link') {
    return (
      <>
        <div className={styles.forwardLink}>
          <Flag aria-hidden="true" />
          <div>
            <strong>{content.nextConcept}</strong>
            <p>{content.connection}</p>
          </div>
        </div>
        <div className={styles.finalCheck}>
          <strong>Unfinished thread</strong>
          <p>{content.openQuestion}</p>
        </div>
        {!completed && (
          <CompleteButton onClick={onComplete}>Park this for next time</CompleteButton>
        )}
      </>
    );
  }
  if (content.type !== 'synthesis') return null;
  const response =
    typeof block.interactionState.response === 'string' ? block.interactionState.response : '';
  return (
    <>
      <label className={styles.textLabel} htmlFor={`synthesis-${block.id}`}>
        {content.prompt}
      </label>
      <textarea
        id={`synthesis-${block.id}`}
        value={response}
        disabled={completed}
        onChange={(event) => onInteraction({ response: event.target.value })}
      />
      <p className={styles.helper}>{content.tighteningGuidance}</p>
      {content.forwardLink && (
        <div className={styles.forwardLink}>
          <Flag aria-hidden="true" /> {content.forwardLink}
        </div>
      )}
      {completed ? (
        <div className={styles.submitted}>
          <Check aria-hidden="true" /> Synthesis recorded
        </div>
      ) : (
        <CompleteButton onClick={onComplete} disabled={response.trim().length < 12}>
          Finish the session
        </CompleteButton>
      )}
    </>
  );
}

function QuestionStack({
  block,
  onInteraction,
  onAnswer,
  onHint,
  submittingQuestionId,
  hintingQuestionId,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
  onAnswer: (
    questionId: string,
    answer: string,
    confidence: 'sure' | 'think_so' | 'guessing',
    responseTimeMs: number,
  ) => void;
  onHint: (questionId: string) => void;
  submittingQuestionId: string | null;
  hintingQuestionId: string | null;
}) {
  const drafts = isRecord(block.interactionState.questionDrafts)
    ? block.interactionState.questionDrafts
    : {};
  const confidences = isRecord(block.interactionState.questionConfidence)
    ? block.interactionState.questionConfidence
    : {};
  return (
    <div className={styles.questionStack} aria-label="Question attempts">
      {block.questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          draft={typeof drafts[question.id] === 'string' ? String(drafts[question.id]) : ''}
          confidence={
            isConfidence(confidences[question.id])
              ? (confidences[question.id] as 'sure' | 'think_so' | 'guessing')
              : null
          }
          submitting={submittingQuestionId === question.id}
          hinting={hintingQuestionId === question.id}
          onDraft={(answer) =>
            onInteraction({
              questionDrafts: { ...drafts, [question.id]: answer },
            })
          }
          onConfidence={(confidence) =>
            onInteraction(
              {
                questionConfidence: {
                  ...confidences,
                  [question.id]: confidence,
                },
              },
              true,
            )
          }
          onSubmit={(answer, confidence, responseTimeMs) =>
            onAnswer(question.id, answer, confidence, responseTimeMs)
          }
          onHint={() => onHint(question.id)}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  question,
  draft,
  confidence,
  submitting,
  hinting,
  onDraft,
  onConfidence,
  onSubmit,
  onHint,
}: {
  question: PetrosStudentQuestionState;
  draft: string;
  confidence: 'sure' | 'think_so' | 'guessing' | null;
  submitting: boolean;
  hinting: boolean;
  onDraft: (answer: string) => void;
  onConfidence: (confidence: 'sure' | 'think_so' | 'guessing') => void;
  onSubmit: (
    answer: string,
    confidence: 'sure' | 'think_so' | 'guessing',
    responseTimeMs: number,
  ) => void;
  onHint: () => void;
}) {
  const shownAt = useRef(Date.now());
  const attempt = question.attempts.at(-1);
  const locked = question.locked || !question.active;
  const label =
    question.purpose === 'guess_first'
      ? 'Guess first'
      : question.purpose === 'reworded_success'
        ? 'Earned-success attempt'
        : question.purpose === 'equivalent_retry'
          ? 'Try it another way'
          : 'Recall check';
  return (
    <section className={styles.questionCard} data-locked={locked} data-purpose={question.purpose}>
      <div className={styles.questionLabel}>
        <Target aria-hidden="true" />
        <span>{label}</span>
        {locked && (
          <em>
            <Check aria-hidden="true" /> Answer locked
          </em>
        )}
      </div>
      <p className={styles.questionPrompt}>{question.prompt}</p>
      {question.responseType === 'single_choice' ? (
        <div className={styles.choiceGrid} role="radiogroup" aria-label="Answer choices">
          {question.choices?.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={(attempt?.rawAnswer ?? draft) === choice.id}
              disabled={locked || submitting}
              data-selected={(attempt?.rawAnswer ?? draft) === choice.id}
              onClick={() => onDraft(choice.id)}
            >
              {(attempt?.rawAnswer ?? draft) === choice.id && <Check aria-hidden="true" />}
              {choice.label}
            </button>
          ))}
        </div>
      ) : (
        <textarea
          aria-label="Your answer"
          maxLength={4000}
          disabled={locked || submitting}
          value={attempt?.rawAnswer ?? draft}
          onChange={(event) => onDraft(event.target.value)}
        />
      )}

      {!locked && (
        <>
          <div className={styles.confidence} role="radiogroup" aria-label="How confident are you?">
            <span>How confident?</span>
            {(
              [
                ['sure', 'Sure'],
                ['think_so', 'Think so'],
                ['guessing', 'Guessing'],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={confidence === value}
                data-selected={confidence === value}
                onClick={() => onConfidence(value)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className={styles.questionControls}>
            <button
              type="button"
              className={styles.hintButton}
              disabled={hinting || submitting}
              onClick={onHint}
            >
              {hinting ? <LoaderCircle aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}
              {hinting ? 'Preparing hint…' : 'Ask for a hint'}
            </button>
            <button
              type="button"
              className={styles.commitAnswer}
              disabled={!draft.trim() || !confidence || submitting}
              onClick={() =>
                confidence && onSubmit(draft, confidence, Math.max(0, Date.now() - shownAt.current))
              }
            >
              {submitting ? <LoaderCircle aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {submitting ? 'Checking…' : 'Commit answer'}
            </button>
          </div>
        </>
      )}

      {question.hints.map((hint) => (
        <div key={hint.observationId} className={styles.ladderSupport} data-kind="hint">
          <Lightbulb aria-hidden="true" />
          <div>
            <strong>Useful hint</strong>
            <p>{hint.text}</p>
          </div>
        </div>
      ))}
      {attempt && (
        <div
          className={styles.answerFeedback}
          data-correctness={attempt.correctness}
          aria-live="polite"
        >
          <div>
            <strong>
              {attempt.correctness === 'correct'
                ? 'That lands.'
                : attempt.correctness === 'partial'
                  ? 'Part of it is there.'
                  : attempt.correctness === 'invalid'
                    ? 'This needs an evaluable response.'
                    : 'Not yet.'}
            </strong>
            <span>Confidence: {attempt.confidence.replace('_', ' ')}</span>
          </div>
          <p>{attempt.feedback}</p>
          {attempt.highValueMisconception && (
            <div className={styles.calibrationNote}>
              <Brain aria-hidden="true" /> This confident miss is worth slowing down for; the
              correction is getting a deliberate moment.
            </div>
          )}
          {attempt.fragileSuccess && (
            <div className={styles.calibrationNote}>
              <RotateCcw aria-hidden="true" /> Correct with uncertainty: this target will return
              sooner for a quick recheck.
            </div>
          )}
          {attempt.recovery && (
            <div className={styles.recovery}>
              <Check aria-hidden="true" /> You stayed with the stretch and finished it on a
              successful attempt.
            </div>
          )}
          {attempt.supportText && (
            <div className={styles.ladderSupport} data-kind={attempt.supportKind}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>{supportLabel(attempt.supportKind)}</strong>
                <p>{attempt.supportText}</p>
              </div>
            </div>
          )}
          {attempt.why.length > 0 && (
            <details className={styles.feedbackWhy}>
              <summary>Why?</summary>
              <ul>
                {attempt.why.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function InstitutionalPolicyPanel({ document }: { document: PetrosLearningSessionDocument }) {
  const api = useStudentApi();
  const policy = document.institutionalPolicy!;
  const [acknowledged, setAcknowledged] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [breakPoint, setBreakPoint] = useState('I am still stuck at the step shown in the latest attempt.');
  const [nextStep, setNextStep] = useState('Please check the broken step and suggest one short practice example.');
  const [handoff, setHandoff] = useState<{ id: string; status: string } | null>(null);
  const [homeworkCorrected, setHomeworkCorrected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assignmentContext = document.sourceContext?.assignmentContext && typeof document.sourceContext.assignmentContext === 'object' && !Array.isArray(document.sourceContext.assignmentContext)
    ? document.sourceContext.assignmentContext as Record<string, unknown>
    : null;
  const classId = typeof document.sourceContext?.classId === 'string'
    ? document.sourceContext.classId
    : typeof assignmentContext?.classId === 'string' ? assignmentContext.classId : null;
  const subjectId = typeof document.sourceContext?.subjectId === 'string'
    ? document.sourceContext.subjectId
    : typeof assignmentContext?.subjectId === 'string' ? assignmentContext.subjectId : null;
  const offerHandoff = policy.handoffEnabled && document.observationSummary.activeWrongAttemptCount >= policy.handoffOfferAfterFailedRepairCount && classId && subjectId;
  const institutionalDecision = document.sourceContext?.institutionalDecision && typeof document.sourceContext.institutionalDecision === 'object' && !Array.isArray(document.sourceContext.institutionalDecision)
    ? document.sourceContext.institutionalDecision as Record<string, unknown>
    : null;
  const homeworkDecision = institutionalDecision?.homework && typeof institutionalDecision.homework === 'object' && !Array.isArray(institutionalDecision.homework)
    ? institutionalDecision.homework as Record<string, unknown>
    : null;
  const assignmentId = typeof homeworkDecision?.assignmentId === 'string'
    ? homeworkDecision.assignmentId
    : typeof assignmentContext?.assignmentId === 'string' ? assignmentContext.assignmentId : null;

  async function acknowledge() {
    setBusy(true); setError('');
    try {
      await api.post(`/student/petros/institutional/sessions/${document.id}/disclosure/acknowledge`, {});
      setAcknowledged(true);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  async function createHandoff() {
    if (!classId || !subjectId) return;
    setBusy(true); setError('');
    try {
      const attempts = document.blocks.flatMap((block) => block.questions.flatMap((question) => question.attempts));
      const row = await api.post<{ id: string; status: string }>('/student/petros/institutional/handoffs', {
        sessionId: document.id,
        classId,
        subjectId,
        summary: {
          concept: document.topic,
          goal: document.currentGoal,
          whatWasTried: document.blocks.map((block) => block.content.title).slice(-6),
          observedBreakPoint: breakPoint,
          evidence: attempts.slice(-6).map((attempt) => ({ label: `${attempt.correctness} attempt after ${attempt.supportKind.replaceAll('_', ' ')}`, sourceEventId: attempt.observationId })),
          usefulTeacherNextStep: nextStep,
        },
        idempotencyKey: newIdempotencyKey(),
      });
      setHandoff(row);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  async function correctHomework() {
    if (!assignmentId) return;
    setBusy(true); setError('');
    try {
      await api.post(`/student/petros/institutional/sessions/${document.id}/homework-correction`, {
        assignmentId,
        correctionReason: 'This question is not asking for the assigned answer.',
        idempotencyKey: newIdempotencyKey(),
      });
      setHomeworkCorrected(true);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  async function act(action: 'consent' | 'deliver' | 'cancel') {
    if (!handoff) return;
    setBusy(true); setError('');
    try {
      const row = await api.post<{ id: string; status: string }>(`/student/petros/institutional/handoffs/${handoff.id}`, { action, idempotencyKey: newIdempotencyKey() });
      setHandoff(row);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.policyDisclosure} aria-label="Petros institution policy disclosure">
      <header className={styles.policyHeader}>
        <span><ShieldCheck aria-hidden="true" /></span>
        <div>
          <strong>Your privacy and learning boundaries</strong>
          <p>A short summary of how Petros works in this session.</p>
        </div>
      </header>
      <ul className={styles.policySummary}>
        <li>Petros stays within learning material approved by your institution.</li>
        <li>For active homework, Petros teaches with hints and feedback instead of completing the final answer for you.</li>
      </ul>
      <details className={styles.privacyDetails}>
        <summary>Who can see information from this session?</summary>
        <div>
          <p><strong>Your teacher</strong>{audienceAccess(policy.disclosure.visibleToTeacher, policy.disclosure.teacherRetentionDays, policy.disclosure.teacherPurpose)}</p>
          <p><strong>A linked parent or guardian</strong>{audienceAccess(policy.disclosure.visibleToParent, policy.disclosure.parentRetentionDays, policy.disclosure.parentPurpose)}</p>
          <p><strong>Never shared</strong>{excludedAccess(policy.disclosure.excludedByPlatform)}</p>
        </div>
      </details>
      {homeworkDecision?.mode === 'guided_homework' && homeworkDecision.correctionAllowed === true && assignmentId ? (
        <div>
          <p>{homeworkCorrected ? 'Homework match corrected. Normal teaching applies from the next move.' : 'Wrong match? You can correct it without exposing your answer.'}</p>
          {!homeworkCorrected ? <button type="button" disabled={busy} onClick={() => void correctHomework()}>This is not related homework</button> : null}
        </div>
      ) : null}
      <div className={styles.policyFooter}>
        <span>These settings will not change halfway through this session.</span>
        <span>Voice is optional; every step is also available as text.</span>
      </div>
      {!acknowledged ? <button disabled={busy} onClick={() => void acknowledge()}>Got it</button> : <span className={styles.policyAcknowledged} role="status"><Check aria-hidden="true" /> Privacy summary acknowledged</span>}
      {offerHandoff ? (
        <div>
          <p><strong>Would you like to hand this to your teacher?</strong> This is optional. You review the summary before anything is delivered.</p>
          {!handoffOpen && !handoff ? <button onClick={() => setHandoffOpen(true)}>Preview teacher handoff</button> : null}
          {handoffOpen && !handoff ? <div>
            <label>Where it broke<textarea value={breakPoint} maxLength={700} onChange={(event) => setBreakPoint(event.target.value)} /></label>
            <label>Useful next step<textarea value={nextStep} maxLength={700} onChange={(event) => setNextStep(event.target.value)} /></label>
            <button disabled={busy} onClick={() => void createHandoff()}><Send aria-hidden="true" /> Prepare summary</button>
            <button onClick={() => setHandoffOpen(false)}>Not now</button>
          </div> : null}
          {handoff?.status === 'preview' ? <div role="status"><p>Summary prepared. It has not been sent.</p><button disabled={busy} onClick={() => void act('consent')}>I consent to this summary</button><button onClick={() => void act('cancel')}>Cancel</button></div> : null}
          {handoff?.status === 'consented' ? <div role="status"><p>Consent recorded. Delivery is still your choice.</p><button disabled={busy} onClick={() => void act('deliver')}>Queue for my teacher</button><button onClick={() => void act('cancel')}>Cancel</button></div> : null}
          {handoff?.status === 'queued' ? <div role="status"><p>Queued. You can withdraw it before delivery.</p><button disabled={busy} onClick={() => void act('cancel')}>Withdraw before delivery</button></div> : null}
          {['delivered', 'read'].includes(handoff?.status ?? '') ? <span role="status">Teacher handoff: {handoff?.status}.</span> : null}
        </div>
      ) : null}
      {error ? <span role="alert">{error}</span> : null}
    </section>
  );
}

function TeachingLocked() {
  return (
    <div className={styles.teachingLocked}>
      <Target aria-hidden="true" />
      <div>
        <strong>The teaching stays covered until this attempt is resolved.</strong>
        <p>
          Use the support step, then commit to the active equivalent question. This stretch will not
          end on a failure.
        </p>
      </div>
    </div>
  );
}

function DetourBanner({ detour }: { detour: PetrosDetour }) {
  const title =
    detour.status === 'pending'
      ? 'Question added to the next PLAN'
      : detour.status === 'rejoined'
        ? 'Detour complete · back to the main goal'
        : detour.status === 'parked'
          ? 'Question parked deliberately'
          : detour.status === 'clarifying'
            ? 'Petros needs a sharper version of this question'
            : 'This question changed the route';
  return (
    <section className={styles.detour} data-status={detour.status} aria-live="polite">
      <div>
        <MessageSquareText aria-hidden="true" />
        <div>
          <p>STRUCTURED DETOUR</p>
          <h2>{title}</h2>
        </div>
      </div>
      <blockquote>{detour.question}</blockquote>
      {detour.acknowledgement && <p>{detour.acknowledgement}</p>}
      {detour.routeChange && (
        <div className={styles.routeChange}>
          <Flag aria-hidden="true" />
          <span>
            <strong>Route change</strong>
            {detour.routeChange}
          </span>
        </div>
      )}
      {detour.returnPlan && (
        <div className={styles.returnPlan}>
          <RotateCcw aria-hidden="true" />
          <span>
            <strong>Return plan</strong>
            {detour.returnPlan}
          </span>
        </div>
      )}
    </section>
  );
}

function BlockActions({
  block,
  onInteraction,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
}) {
  const action =
    typeof block.interactionState.requestedAction === 'string'
      ? block.interactionState.requestedAction
      : '';
  return (
    <div className={styles.blockActions}>
      <button
        onClick={() => onInteraction({ artifactIntent: 'note', requestedAction: 'note' }, true)}
      >
        <FilePenLine aria-hidden="true" /> Save to notes
      </button>
      <button
        onClick={() =>
          onInteraction({ artifactIntent: 'flashcard', requestedAction: 'flashcard' }, true)
        }
      >
        <Sparkles aria-hidden="true" /> Make a flashcard
      </button>
      <button onClick={() => onInteraction({ requestedAction: 'simpler' }, true)}>
        <Lightbulb aria-hidden="true" /> Explain simpler
      </button>
      <button onClick={() => onInteraction({ requestedAction: 'deeper' }, true)}>
        <Layers3 aria-hidden="true" /> Explain deeper
      </button>
      {action && (
        <small>
          {action === 'note' || action === 'flashcard'
            ? 'Proposed only—nothing was auto-saved.'
            : 'Your choice applies immediately to this session and does not become a durable preference from one use.'}
        </small>
      )}
    </div>
  );
}

function Grounding({
  content,
}: {
  content: Extract<PetrosTeachingBlockContent, { type: 'layered_explanation' | 'worked_example' }>;
}) {
  if (!content.sourceGrounding.length) return null;
  return (
    <div className={styles.grounding}>
      <strong>Grounded in</strong>
      {content.sourceGrounding.map((source) => (
        <span key={`${source.label}-${source.reference ?? ''}`}>
          {source.label}
          {source.reference ? ` · ${source.reference}` : ''}
        </span>
      ))}
    </div>
  );
}

function CompleteButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={styles.completeButton} disabled={disabled} onClick={onClick}>
      {children}
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function Step({
  number,
  title,
  body,
  prediction,
  visible,
}: {
  number: number;
  title: string;
  body: string;
  prediction?: string;
  visible: boolean;
}) {
  return (
    <div className={styles.step} data-visible={visible}>
      <span>{number}</span>
      {visible ? (
        <div>
          <strong>{title}</strong>
          {prediction && <em>{prediction}</em>}
          <p>{body}</p>
        </div>
      ) : (
        <div className={styles.stepHidden}>Commit to what you think comes next.</div>
      )}
    </div>
  );
}

function BlockSkeleton({
  expected,
  slow,
}: {
  expected: PetrosTeachingBlockContent['type'] | null;
  slow: boolean;
}) {
  const Icon = expected ? iconFor(expected) : Brain;
  return (
    <section className={styles.blockSkeleton} role="status">
      <div>
        <span>
          <Icon aria-hidden="true" />
        </span>
        <div>
          <p>PETROS IS PREPARING</p>
          <strong>
            {expected
              ? `Preparing: ${labelFor(expected).toLowerCase()}`
              : 'Choosing the next helpful step'}
          </strong>
        </div>
        <LoaderCircle aria-hidden="true" />
      </div>
      <i />
      <i />
      <i />
      {slow && (
        <small>
          This is taking longer than usual. The current document is safe, and you can pause at any
          time.
        </small>
      )}
    </section>
  );
}

function SessionLoading({ topic }: { topic: string }) {
  return (
    <div className={styles.shell}>
      <div className={styles.loadingPage} role="status">
        <Sparkles aria-hidden="true" />
        <p>Resuming Petros</p>
        <h1>{topic}</h1>
        <span>Loading the saved session document…</span>
      </div>
    </div>
  );
}

function StatusBanner({
  icon: Icon,
  title,
  body,
  action,
  tone,
}: {
  icon: typeof CircleHelp;
  title: string;
  body: string;
  action?: ReactNode;
  tone: 'warning' | 'neutral';
}) {
  return (
    <section className={styles.statusBanner} data-tone={tone}>
      <Icon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
        {action && <div>{action}</div>}
      </div>
    </section>
  );
}

function iconFor(type: PetrosTeachingBlockContent['type']) {
  if (type === 'hook' || type === 'analogy' || type === 'misconception_demolition')
    return Lightbulb;
  if (type === 'prerequisite_check' || type === 'goal_frame' || type === 'predict_then_reveal')
    return Target;
  if (type === 'layered_explanation') return Layers3;
  if (type === 'worked_example' || type === 'story' || type === 'derivation') return BookOpen;
  if (type === 'diagram' || type === 'contrast_case') return Brain;
  if (type === 'socratic_probe' || type === 'recall_check' || type === 'apply_to_your_world')
    return MessageSquareText;
  if (type === 'artifact_commit') return FilePenLine;
  return Flag;
}

function studentFriendlyWhy(type: PetrosTeachingBlockContent['type'], fallback: string) {
  const explanations: Partial<Record<PetrosTeachingBlockContent['type'], string>> = {
    hook: 'A quick opening question helps Petros understand what stands out to you and where to begin.',
    prerequisite_check: 'This checks whether a small foundation needs strengthening before you continue.',
    goal_frame: 'A clear goal keeps this session focused on what you actually need to achieve.',
    recall_check: 'A short memory check shows what is secure and what deserves another pass.',
    worked_example: 'A worked example makes the method visible before you try it independently.',
    predict_then_reveal: 'Making a prediction first helps the explanation stick.',
    socratic_probe: 'Thinking it through in your own words gives Petros better evidence than simply showing an answer.',
    synthesis: 'Bringing the ideas together checks that the full picture makes sense.',
  };
  return explanations[type] ?? fallback;
}

function isGenericAnchor(value: string) {
  return ['question', 'hook', 'prompt', 'opening question'].includes(value.trim().toLowerCase());
}

const VISIBILITY_LABELS: Record<string, string> = {
  session_metadata: 'basic session details such as the date and duration',
  concept_and_goal: 'the topic and learning goal',
  attempt_summary: 'a summary of your attempts and progress',
  teacher_handoff: 'a support summary you explicitly choose to send',
  raw_transcript: 'the session transcript',
  private_questions: 'questions you asked privately',
  voice_recording: 'voice recordings',
  images: 'images shared in the session',
  unsaved_artifacts: 'unsaved notes and learning drafts',
};

function naturalList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function audienceAccess(categories: string[], retentionDays: number, purpose: string) {
  if (categories.length === 0) return ': cannot see anything from this session.';
  const visible = naturalList(categories.map((category) => VISIBILITY_LABELS[category] ?? category.replaceAll('_', ' ')));
  const purposeText = purpose.trim().replace(/[.]+$/, '').replace(/^./, (character) => character.toLowerCase());
  return `: can see ${visible}. This is kept for up to ${retentionDays} days and used to ${purposeText}.`;
}

function excludedAccess(items: string[]) {
  const labels = items.map((item) => item
    .replace('provider or model identity', 'private AI system details')
    .replace('hidden chain-of-thought', 'Petros’s private internal reasoning')
    .replace('unsaved artifact drafts', 'notes and drafts you have not saved')
    .replace('unrelated personal history', 'unrelated personal history')
    .replace('credentials', 'passwords or sign-in details')
    .replace('internal routing data', 'internal technical routing information'));
  return `: ${naturalList(labels)}.`;
}

function labelFor(type: PetrosTeachingBlockContent['type']) {
  const labels: Record<PetrosTeachingBlockContent['type'], string> = {
    hook: 'Let’s get started',
    prerequisite_check: 'Quick foundation check',
    goal_frame: 'Your goal',
    layered_explanation: 'Step-by-step explanation',
    worked_example: 'Worked example',
    analogy: 'A helpful comparison',
    story: 'A story to remember',
    derivation: 'How it works',
    diagram: 'Visual explanation',
    predict_then_reveal: 'Make a prediction',
    contrast_case: 'Spot the difference',
    misconception_demolition: 'Clear up a common mix-up',
    socratic_probe: 'Think it through',
    recall_check: 'Quick recall',
    apply_to_your_world: 'Use it in context',
    synthesis: 'Bring it together',
    artifact_commit: 'Save what matters',
    forward_link: 'What’s next',
  };
  return labels[type];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function contextualSourceView(document: PetrosLearningSessionDocument | null, legacySource: string) {
  const context = document?.sourceContext ?? {};
  const door = typeof context.door === 'string' ? context.door : legacySource === 'result' ? 'result_repair' : 'student_portal';
  const returnHref = typeof context.returnHref === 'string' && context.returnHref.startsWith('/') ? context.returnHref : door === 'result_repair' ? '/results' : '/home';
  const returnLabel = typeof context.returnLabel === 'string' ? context.returnLabel : door === 'result_repair' ? 'Results' : 'Portal';
  const label = typeof context.label === 'string' ? context.label : '';
  const citations = Array.isArray(context.citations)
    ? context.citations.filter(isRecord).map((citation) => ({
        label: typeof citation.label === 'string' ? citation.label : 'Session source',
        page: typeof citation.page === 'number' ? citation.page : null,
        section: typeof citation.section === 'string' ? citation.section : null,
      }))
    : [];
  const policyDisclosures = Array.isArray(context.policyDisclosures)
    ? context.policyDisclosures.filter((item): item is string => typeof item === 'string')
    : ['Petros follows the permissions and source rules visible on the screen that opened this session.'];
  const copy: Record<string, { sessionLabel: string; openedFrom: string; heading: string }> = {
    result_repair: { sessionLabel: 'Repair session', openedFrom: 'your published result', heading: 'Let’s find the part worth fixing.' },
    upcoming_exam: { sessionLabel: 'Revision session', openedFrom: 'your published exam schedule', heading: 'Use the remaining time on what earns recall and marks.' },
    uploaded_document: { sessionLabel: 'Document session', openedFrom: 'your uploaded pages', heading: 'Build the idea from the page in front of you.' },
    learning_path: { sessionLabel: 'Learning path session', openedFrom: 'your active learning path', heading: 'Take the next topic adaptively, one move at a time.' },
    assistant_handoff: { sessionLabel: 'Contextual doubt session', openedFrom: 'the assistant offer you accepted', heading: 'Continue from your question without repeating it.' },
    snap_question: { sessionLabel: 'Photographed doubt session', openedFrom: 'your confirmed question photo', heading: 'Start at the point where you are stuck.' },
    handwriting: { sessionLabel: 'Handwriting repair', openedFrom: 'your confirmed handwritten lines', heading: 'Repair the first logical break, then reattempt.' },
    voice: { sessionLabel: 'Voice session', openedFrom: 'an optional turn-based microphone session', heading: 'Speak, generate, and keep every essential detail in text.' },
    five_minute: { sessionLabel: 'Five-minute session', openedFrom: 'your finite five-minute choice', heading: 'One concept, four moves, a deliberate close.' },
    student_portal: { sessionLabel: 'Learning session', openedFrom: 'your student portal', heading: 'Work on one clear learning goal.' },
  };
  return {
    ...(copy[door] ?? copy.student_portal!),
    returnHref,
    returnLabel,
    contextLine: label,
    citations,
    policyDisclosures,
  };
}

function isConfidence(value: unknown): value is 'sure' | 'think_so' | 'guessing' {
  return value === 'sure' || value === 'think_so' || value === 'guessing';
}

function supportLabel(kind: string) {
  if (kind === 'missing_step') return 'Specific missing step';
  if (kind === 'worked_solution') return 'Full worked solution · now earn the reworded success';
  if (kind === 'stuck_path') return 'A legitimate next step';
  return 'Useful hint';
}

function ShieldIcon() {
  return (
    <span className={styles.shield}>
      <Sparkles aria-hidden="true" />
    </span>
  );
}
