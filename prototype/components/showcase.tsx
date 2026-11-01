'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useMemo } from 'react';
import { BookOpen, Globe2 } from 'lucide-react';
import { Home } from './home';
import { preparedTopic } from '../teaching/topic-catalog';
import { resolveLesson } from '../teaching/lesson-registry';
import { validTopicLesson } from '../teaching/topic-content';
import { Workspace, type Patch } from './workspace';
import receipts from '../assets/source-receipts.json';
import {
  initialState,
  selectLesson,
  interrupt,
  yieldCue,
} from '../teaching/controller';
import type { Lesson, ShowcaseState, Mode } from '../teaching/types';
import { Portal, type TravelPhase } from '../world/portal';
import { lessonForState } from '../teaching/tree-variant';
import {
  goToCheckpoint,
  startLearning,
  teachAction,
} from '../teaching/checkpoint';
import { retrieveExplanation } from '../teaching/contextual-explanations';
import {
  restoreSession,
  serializeSession,
  SESSION_KEY,
} from '../teaching/persistence';
import travelStyles from '../world/travel.module.css';
import s from './showcase.module.css';
import { runtime, transitionVisual } from '../teaching/visual-spec';
const World = dynamic(() => import('../world/room'), {
  ssr: false,
  loading: () => null,
});
export function Showcase() {
  const [state, setState] = useState<ShowcaseState>(initialState);
  const latestState = useRef(state);
  latestState.current = state;
  const [home, setHome] = useState(true);
  const [notice, setNotice] = useState('');
  const [travel, setTravel] = useState<TravelPhase>('idle');
  const travelRef = useRef<TravelPhase>('idle');
  const [loadStatus, setLoadStatus] = useState('Loading the immersive study…');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const visualPlaying = state.visualState.kind === 'topic' && state.visualState.runtime?.playing;
  useEffect(() => {
    if (!visualPlaying || state.paused || state.pendingRequest || state.interruptionCheckpoint || travel !== 'idle') return;
    const timer = window.setInterval(() => setState(current => {
      const v = current.visualState;
      if (v.kind !== 'topic' || !v.visual || current.paused || current.pendingRequest || current.interruptionCheckpoint) return current;
      return { ...current, visualState: { ...v, runtime: transitionVisual(v.visual, v.runtime ?? runtime(v.visual.initial), { type: 'tick' }) } };
    }), 80);
    return () => window.clearInterval(timer);
  }, [visualPlaying, state.paused, state.pendingRequest, state.interruptionCheckpoint, travel]);
  useEffect(() => {
    try {
      const saved = restoreSession(sessionStorage.getItem(SESSION_KEY));
      if (saved) {
        sessionRef.current = saved.sessionId;
        setState(saved);
        setHome(false);
        if (saved.mode === 'world') setTravelPhase('loading');
      }
    } catch {
      /* Storage may be disabled; the lesson remains usable in memory. */
    }
    setRecovered(true);
  }, []);
  useEffect(() => {
    if (!recovered || !state.lessonId) return;
    try {
      sessionStorage.setItem(SESSION_KEY, serializeSession(state));
      if (state.saveStatus !== 'session') patch({ saveStatus: 'session' });
    } catch {
      if (state.saveStatus !== 'memory-only')
        patch({ saveStatus: 'memory-only' });
    }
  }, [state, recovered]);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const applyPreference = () => {
      try {
        const preference = sessionStorage.getItem(
          'petros.world.motion-preference',
        );
        setReducedMotion(
          preference === null ? m.matches : preference === 'reduce',
        );
      } catch {
        setReducedMotion(m.matches);
      }
    };
    applyPreference();
    const change = applyPreference;
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (travel !== 'entering' && travel !== 'leaving') return;
    const timer = setTimeout(
      finishTravel,
      reducedMotion ? 180 : travel === 'entering' ? 2200 : 1800,
    );
    return () => clearTimeout(timer);
  }, [travel, reducedMotion]);
  useEffect(() => {
    if (travel !== 'loading') return;
    const timer = setTimeout(() => {
      if (travelRef.current === 'loading') {
        setNotice(
          'The study took too long to load. Your lesson is still here; you can try again.',
        );
        setTravelPhase('idle');
        patch({ mode: 'classic', modeSwitchInProgress: false });
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [travel]);
  const pending = useRef(false);
  const sessionRef = useRef('');
  const topicAbort = useRef<AbortController | null>(null),
    topicGeneration = useRef(0);
  const askAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      topicAbort.current?.abort();
      askAbort.current?.abort();
    },
    [],
  );
  const patch: Patch = (p) =>
    setState((current) =>
      typeof p === 'function' ? p(current) : { ...current, ...p },
    );
  const lesson = useMemo(
    () => lessonForState(resolveLesson(state), state),
    [
      state.lessonId,
      state.topicLesson,
      state.visualState.kind === 'tree'
        ? state.visualState.treeOrder
        : undefined,
    ],
  );
  function choose(l: Lesson) {
    topicGeneration.current++;
    topicAbort.current?.abort();
    askAbort.current?.abort();
    askAbort.current = null;
    pending.current = false;
    setNotice('');
    const n = selectLesson(
      latestState.current,
      l,
      receipts.find((r) => r.filename === l.filename)?.sha256 ?? null,
    );
    sessionRef.current = n.sessionId;
    setState(startLearning(n, l));
    setHome(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function setTravelPhase(phase: TravelPhase) {
    travelRef.current = phase;
    setTravel(phase);
  }
  function finishTravel() {
    const entering = travelRef.current === 'entering';
    if (entering) {
      setTravelPhase('active');
      patch({ mode: 'world', modeSwitchInProgress: false });
    } else if (
      travelRef.current === 'leaving' ||
      travelRef.current === 'loading'
    ) {
      setTravelPhase('idle');
      patch({ mode: 'classic', modeSwitchInProgress: false });
    }
  }
  function mode(mode: Mode) {
    topicGeneration.current++;
    topicAbort.current?.abort();
    if (mode === 'world') {
      if (travelRef.current !== 'idle') return;
      patch({
        modeSwitchInProgress: true,
        cue: yieldCue(state.cue),
      });
      setLoadStatus('Loading the immersive study…');
      setTravelPhase('loading');
    } else {
      if (travelRef.current === 'loading' || travelRef.current === 'entering') {
        setTravelPhase('idle');
        patch({ mode: 'classic', modeSwitchInProgress: false });
        return;
      }
      if (travelRef.current === 'active') {
        patch({
          mode: 'classic',
          modeSwitchInProgress: true,
          cue: yieldCue(state.cue),
        });
        setTravelPhase('leaving');
      } else if (travelRef.current === 'leaving') finishTravel();
    }
  }
  function roomReady() {
    if (travelRef.current === 'loading') setTravelPhase('entering');
  }
  function motionPreference(value: boolean) {
    setReducedMotion(value);
    try {
      sessionStorage.setItem(
        'petros.world.motion-preference',
        value ? 'reduce' : 'full',
      );
    } catch {
      /* The system preference still works when storage is unavailable. */
    }
  }
  async function topic(text: string) {
    const l = preparedTopic(text);
    if (l) {
      choose(l);
      return;
    }
    if (!text.trim()) return;
    topicAbort.current?.abort();
    const controller = new AbortController();
    topicAbort.current = controller;
    const generation = ++topicGeneration.current;
    try {
      const r = await fetch('/prototype/api/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: text.slice(0, 240) }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(100000),
        ]),
      });
      const data = await r.json();
      if (generation !== topicGeneration.current) return;
      if (!r.ok)
        throw Error(
          data.error || 'The lesson could not be prepared. Please try again.',
        );
      if (!validTopicLesson(data.lesson))
        throw Error('The lesson response was incomplete. Please try again.');
      choose(data.lesson);
    } catch (error) {
      if (generation !== topicGeneration.current) return;
      throw error instanceof Error &&
        error.name !== 'TimeoutError' &&
        error.name !== 'AbortError'
        ? error
        : Error(
            'Preparing the lesson took too long. Your question is saved; please try again.',
          );
    }
  }
  async function ask(text: string) {
    if (pending.current || !lesson || !text.trim()) return;
    pending.current = true;
    const session = state.sessionId;
    const request = crypto.randomUUID();
    const controller = new AbortController();
    askAbort.current = controller;
    const q = lesson.questions.find((q) => q.id === state.questionId)!;
    patch((current) => ({
      ...interrupt(current, request),
      askDraft: text,
      conversationHistory: [
        ...current.conversationHistory,
        {
          role: 'user' as const,
          text: text.slice(0, 1200),
          label: 'Your question',
        },
      ].slice(-8),
    }));
    try {
      const retrieved = retrieveExplanation(state, lesson, text);
      if (retrieved) {
        patch((current) => {
          const command =
            /simpler|simply|don.t understand|didn.t understand/i.test(text)
              ? 'simpler'
              : /another example/i.test(text)
                ? 'example'
                : /quiz|practice/i.test(text)
                  ? 'practice'
                  : null;
          const prior = current.interruptionCheckpoint;
          const prepared =
            command && prior
              ? teachAction(
                  {
                    ...current,
                    teaching: prior.teaching,
                    paused: false,
                    pendingRequest: null,
                    interruptionCheckpoint: null,
                  },
                  lesson,
                  command,
                )
              : null;
          const previousIndex =
            lesson.questions.findIndex((q) => q.id === current.questionId) - 1;
          const previous =
            /go back|previous (step|checkpoint)/i.test(text) &&
            previousIndex >= 0
              ? goToCheckpoint(
                  {
                    ...current,
                    pendingRequest: null,
                    interruptionCheckpoint: null,
                  },
                  lesson,
                  previousIndex,
                  true,
                )
              : null;
          const resumable = previous ?? prepared;
          return {
            ...current,
            ...(resumable
              ? {
                  observations: resumable.observations,
                  interruptionCheckpoint: {
                    questionId: resumable.questionId,
                    stepId: resumable.stepId,
                    highlight: previous
                      ? previous.highlightTargetId
                      : current.highlightTargetId,
                    visual: resumable.visualState,
                    sceneStation: resumable.sceneStation,
                    teaching: resumable.teaching,
                  },
                }
              : {}),
            pendingRequest: null,
            teaching: { ...current.teaching, status: 'RESUMING' },
            highlightTargetId: retrieved.target ?? current.highlightTargetId,
            visualState:
              current.visualState.kind === 'tree' && retrieved.target
                ? { ...current.visualState, selected: retrieved.target }
                : current.visualState.kind === 'kb' &&
                    /^(HasWings|CanFly)\((Tweety|Rio)\)$/.test(
                      retrieved.target ?? '',
                    )
                  ? { ...current.visualState, query: retrieved.target! }
                  : current.visualState,
            conversationHistory: [
              ...current.conversationHistory,
              {
                role: 'assistant' as const,
                text: retrieved.text,
                label: retrieved.label,
              },
            ].slice(-8),
            cue: {
              kind: retrieved.clarification ? 'notice' : 'speech',
              text: retrieved.text,
            },
          };
        });
        return;
      }
      let excerpt = '';
      if (lesson.filename && q.pages.length) {
        const r = await fetch(
          `/prototype/api/page/${lesson.filename}/${q.pages[0]}`,
          { signal: controller.signal },
        );
        if (r.ok) excerpt = (await r.json()).text.slice(0, 3000);
      }
      const r = await fetch('/prototype/api/ask', {
        method: 'POST',
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(100000),
        ]),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session,
          lessonId: lesson.id,
          topicLesson: state.topicLesson,
          questionId: state.questionId,
          step: state.stepId,
          question: q.task,
          source: lesson.filename,
          pages: q.pages,
          excerpt,
          visual: state.visualState,
          highlight: state.highlightTargetId,
          teaching: state.teaching,
          previousResponse: state.studentResponse,
          misconception: state.misconceptionCategory,
          observations: state.observations[q.id],
          history: state.conversationHistory.slice(-6),
          questionText: text.slice(0, 1200),
        }),
      });
      const data = await r.json();
      if (sessionRef.current !== session) return;
      patch((current) => ({
        ...current,
        pendingRequest: null,
        teaching: { ...current.teaching, status: 'RESUMING' },
        conversationHistory: [
          ...current.conversationHistory,
          {
            role: 'assistant' as const,
            text: r.ok ? data.answer : data.error + ' ' + data.reason,
            label:
              r.ok && typeof data.label === 'string'
                ? data.label
                : r.ok
                  ? lesson.general
                    ? 'General knowledge · live model'
                    : 'Source-based · live model'
                  : 'Model unavailable',
          },
        ].slice(-8),
        cue: {
          kind: 'notice',
          text: r.ok
            ? 'Your answer is ready below.'
            : 'I couldn’t answer that right now. Your lesson is still here.',
        },
      }));
    } catch {
      if (sessionRef.current === session)
        patch({
          pendingRequest: null,
          teaching: { ...state.teaching, status: 'RESUMING' },
          cue: {
            kind: 'notice',
            text: 'I couldn’t answer that right now. Your lesson is still here.',
          },
        });
    } finally {
      if (askAbort.current === controller) {
        askAbort.current = null;
        pending.current = false;
      }
    }
  }
  return (
    <div
      className={s.scope}
      onFocusCapture={(e) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          patch({ cue: yieldCue(state.cue) });
      }}
    >
      {travel !== 'active' && (
        <div
          className={`${s.shell} ${travelStyles.classicLayer}`}
          aria-hidden={travel !== 'idle'}
          ref={(element) => {
            if (element) element.inert = travel !== 'idle';
          }}
          data-travel={travel}
          data-reduced={reducedMotion}
        >
          <header className={s.topbar}>
            <button className={s.brand} onClick={() => setHome(true)}>
              <span className={s.brandMark}>
                <BookOpen size={20} />
              </span>
              Petros <strong>Showcase</strong>
            </button>
            <div className={s.mode} aria-label="Learning mode">
              <button
                aria-pressed={state.mode === 'classic'}
                onClick={() => mode('classic')}
              >
                <BookOpen size={15} />
                Classic
              </button>
              <button
                disabled={state.modeSwitchInProgress}
                aria-pressed={state.mode === 'world'}
                onClick={() => mode('world')}
              >
                <Globe2 size={16} />
                Enter Petros World
              </button>
            </div>
            <span className={s.prototype}>Prototype</span>
          </header>
          {notice && (
            <div className={s.globalNotice} role="status">
              {notice}
              <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          )}
          {home ? (
            <Home
              state={state}
              onLesson={choose}
              onResume={() => {
                topicGeneration.current++;
                topicAbort.current?.abort();
                setHome(false);
              }}
              onTopic={topic}
              onRemoveReceipt={(name) =>
                patch((current) => ({
                  ...current,
                  receipts: current.receipts.filter((r) => r.filename !== name),
                }))
              }
              onReceipts={(r) =>
                patch((current) => ({
                  ...current,
                  receipts: [
                    ...current.receipts.filter((x) => x.sha256 !== r.sha256),
                    r,
                  ].slice(-4),
                }))
              }
            />
          ) : lesson ? (
            <Workspace
              state={state}
              lesson={lesson}
              patch={patch}
              onAsk={ask}
              onHome={() => setHome(true)}
            />
          ) : null}
          <footer className={s.pageFooter}>
            <span>
              EDRION <span>·</span> A thoughtful way to learn.
            </span>
            <span>
              {state.saveStatus === 'session'
                ? 'Saved in this tab · refresh to resume'
                : 'Progress in memory · storage unavailable or no lesson started'}
            </span>
          </footer>
        </div>
      )}
      {travel !== 'idle' && (
        <div
          className={travelStyles.destination}
          aria-hidden={travel !== 'active'}
          ref={(element) => {
            if (element) element.inert = travel !== 'active';
          }}
          data-travel={travel}
          data-reduced={reducedMotion}
        >
          <World
            state={state}
            patch={patch}
            lesson={lesson}
            active={travel === 'active'}
            onBook={choose}
            onClassic={() => mode('classic')}
            onAsk={ask}
            onTopic={topic}
            onReady={roomReady}
            onStatus={setLoadStatus}
            onFailure={(message) => {
              setNotice(message);
              setTravelPhase('idle');
              patch({ mode: 'classic', modeSwitchInProgress: false });
            }}
            notice={notice}
            onDismissNotice={() => setNotice('')}
            reducedMotion={reducedMotion}
            onReducedChange={motionPreference}
          />
        </div>
      )}
      <Portal
        phase={travel}
        status={loadStatus}
        reduced={reducedMotion}
        onSkip={finishTravel}
        onCancel={() => mode('classic')}
      />
    </div>
  );
}
