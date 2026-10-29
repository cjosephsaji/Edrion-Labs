'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useMemo } from 'react';
import { BookOpen, Globe2 } from 'lucide-react';
import { Home } from './home';
import { Workspace, type Patch } from './workspace';
import { lessons } from '../lessons';
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
import { goToCheckpoint, teachAction } from '../teaching/checkpoint';
import { retrieveExplanation } from '../teaching/contextual-explanations';
import travelStyles from '../world/travel.module.css';
import s from './showcase.module.css';
const World = dynamic(() => import('../world/room'), {
  ssr: false,
  loading: () => null,
});
export function Showcase() {
  const [state, setState] = useState<ShowcaseState>(initialState);
  const [home, setHome] = useState(true);
  const [notice, setNotice] = useState('');
  const [travel, setTravel] = useState<TravelPhase>('idle');
  const travelRef = useRef<TravelPhase>('idle');
  const [loadStatus, setLoadStatus] = useState('Loading the immersive study…');
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(m.matches);
    const change = () => setReducedMotion(m.matches);
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
  const patch: Patch = (p) =>
    setState((current) =>
      typeof p === 'function' ? p(current) : { ...current, ...p },
    );
  const lesson = useMemo(
    () =>
      lessonForState(
        lessons.find((l) => l.id === state.lessonId),
        state,
      ),
    [
      state.lessonId,
      state.visualState.kind === 'tree'
        ? state.visualState.treeOrder
        : undefined,
    ],
  );
  function choose(l: Lesson) {
    const n = selectLesson(
      state,
      l,
      receipts.find((r) => r.filename === l.filename)?.sha256 ?? null,
    );
    sessionRef.current = n.sessionId;
    setState(n);
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
  async function topic(text: string) {
    const key =
      text.trim().toLowerCase() === 'is time travel possible?'
        ? 'time'
        : text.toLowerCase() === 'how does artificial intelligence work?'
          ? 'open-ai'
          : null;
    const l = lessons.find((l) => l.id === key);
    if (l) {
      choose(l);
      return;
    }
    if (!text.trim()) return;
    setNotice('Connecting to a qualified model…');
    try {
      const r = await fetch('/prototype/api/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: text.slice(0, 240) }),
      });
      const data = await r.json();
      setNotice(data.error + ' ' + data.reason);
    } catch {
      setNotice(
        'The model connection is unavailable. Your topic is still in the input.',
      );
    }
  }
  async function ask(text: string) {
    if (pending.current || !lesson || !text.trim()) return;
    pending.current = true;
    const session = state.sessionId;
    const request = crypto.randomUUID();
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
        );
        if (r.ok) excerpt = (await r.json()).text.slice(0, 3000);
      }
      const r = await fetch('/prototype/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session,
          lessonId: lesson.id,
          step: state.stepId,
          question: q.task,
          source: lesson.filename,
          pages: q.pages,
          excerpt,
          visual: state.visualState,
          highlight: state.highlightTargetId,
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
            label: r.ok
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
      pending.current = false;
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
              onResume={() => setHome(false)}
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
            <span>Showcase session · progress held in memory only</span>
          </footer>
        </div>
      )}
      {travel !== 'idle' && (
        <div
          className={travelStyles.destination}
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
            onReducedChange={setReducedMotion}
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
