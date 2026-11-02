'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  TOPICS,
  topicInfo,
  specs,
  observe,
  initial,
  namedAnchors,
  restore,
  type Topic,
  type Param,
  type Params,
  type SimTool,
} from '../simulations/runtime';
import { SimulationWorker } from '../simulations/worker-adapter';
import {
  freshSession,
  lesson,
  parseSession,
  hash,
  logChange,
  STORAGE_KEY,
  type Session,
  type LessonSession,
} from '../core/session-store';
import { compile } from '../core/scene-compiler';
import { preparedAnswer, preparedQuestions } from '../core/prepared-answers';
import { prototypeFeatures } from '../core/prototype-features';
import { BeatScheduler, type Beat } from '../core/beat-scheduler';
import { RealtimeVoice, type VoiceStatus } from '../core/voice-provider';
import type { teach } from '../server/teacher-planner';
import { SimulationViewport } from './SimulationViewport';
import { ModelMath } from './ModelMath';
import { FocusScene } from './FocusScene';
import { Narrator } from '../core/narration';
import {
  opening,
  respond,
  transferSetup,
  transferResult,
  interpret,
  goals,
  predictions,
  transfers,
  lessonModel,
  makeBeat,
  type TeachingBeat,
} from '../core/teaching';
import { TeachingPointer } from './TeachingPointer';
import { TeachingCaption } from './TeachingCaption';
import { ContextualInput } from './ContextualInput';
import { VoiceControls } from './VoiceControls';
import { SvgScene } from '../renderers/SvgScene';
import { GraphPlots } from '../renderers/GraphPlots';
import { TrafficPlot } from '../renderers/TrafficPlot';
import worldStyles from '../world-v3/hud.module.css';
import classicStyles from './surface.module.css';
import { PetrosPresence } from './PetrosPresence';
import { PreparedQuestions } from './PreparedQuestions';
import { TutorExplanation } from './TutorExplanation';
import { useWorld } from '../world-v3/store';
const World = dynamic(() => import('../world-v3/WorldExperience'), {
  ssr: false,
  loading: () => <p>Opening the Learning Atelier…</p>,
});
type Result = Awaited<ReturnType<typeof teach>>;
const tabLabels: Record<Topic, string> = {
  neural: 'Neural learning',
  rocket: 'Rocket landing',
  attention: 'Attention',
  traffic: 'Traffic waves',
  relativity: 'Time dilation',
};
export function LiveTeachingSurface({
  api = '/prototype/api',
  assetBase = '/petros',
  presentation = 'world',
}: {
  api?: string;
  assetBase?: string;
  presentation?: '2d' | 'world';
}) {
  const isSpatial = prototypeFeatures.world && presentation === 'world';
  const s = isSpatial ? worldStyles : classicStyles;
  const worldOpening = useWorld((x) => x.opening),
    worldPlace = useWorld((x) => x.place),
    askOpen = useWorld((x) => x.askOpen),
    controlsOpen = useWorld((x) => x.controlsOpen);
  const [session, setSession] = useState<Session>(freshSession),
    [hydrated, setHydrated] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [provider, setProvider] = useState<boolean | null>(
      prototypeFeatures.liveAI ? null : false,
    ),
    [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('disconnected'),
    [mic, setMic] = useState(false),
    [continued, setContinued] = useState(false),
    [storage, setStorage] = useState(true),
    [sound, setSound] = useState(false),
    [labOpen, setLabOpen] = useState(!isSpatial),
    [mobilePane, setMobilePane] = useState<'tutor' | 'model'>('tutor'),
    [mathOpen, setMathOpen] = useState(false),
    [narrationStatus, setNarrationStatus] = useState<
      'loading' | 'speaking' | 'ready'
    >('ready');
  const current = useRef(session),
    soundRef = useRef(false),
    narrator = useRef(new Narrator()),
    epoch = useRef(0),
    abort = useRef<AbortController | null>(null),
    worker = useRef<SimulationWorker | null>(null),
    scheduler = useRef(new BeatScheduler()),
    voice = useRef<RealtimeVoice | null>(null),
    nextText = useRef<(() => void) | null>(null),
    pushToTalkHeld = useRef(false),
    undo = useRef<Partial<Record<Topic, LessonSession[]>>>({}),
    asking = useRef<(q: string, speak?: boolean) => Promise<Result | null>>(
      async () => null,
    ),
    presenting = useRef<(r: Result) => void>(() => {}),
    answerPane = useRef<HTMLDivElement>(null),
    controlsTrigger = useRef<HTMLButtonElement | null>(null),
    closeControlsButton = useRef<HTMLButtonElement>(null);
  const commit = useCallback((fn: (s: Session) => Session) => {
    const next = fn(current.current);
    current.current = next;
    setSession(next);
  }, []);
  const update = useCallback(
    (fn: (t: LessonSession) => LessonSession) =>
      commit((x) => ({
        ...x,
        topics: {
          ...x.topics,
          [x.active]: fn(x.topics[x.active] ?? lesson(x.active)),
        },
      })),
    [commit],
  );
  const remember = () => {
    const x = current.current,
      stack = undo.current[x.active] ?? [];
    undo.current[x.active] = [
      ...stack,
      structuredClone(x.topics[x.active] ?? lesson(x.active)),
    ].slice(-25);
  };
  const cancel = useCallback(() => {
    epoch.current++;
    narrator.current.cancel();
    setNarrationStatus('ready');
    abort.current?.abort();
    abort.current = null;
    scheduler.current.cancel();
    nextText.current?.();
    nextText.current = null;
    setContinued(false);
    setBusy(false);
  }, []);
  const interrupt = useCallback(() => {
    cancel();
    update((t) =>
      logChange(
        t,
        { ...t, sim: { ...t.sim, running: false } },
        'interruption',
        'Cancelled pending narration and model request; preserved committed scene.',
      ),
    );
  }, [cancel, update]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = parseSession(raw);
        current.current = parsed;
        setSession(parsed);
      }
    } catch {
      setMessage(
        'The saved session could not be restored. A fresh experiment is ready.',
      );
    }
    setHydrated(true);
    worker.current = new SimulationWorker();
    let live = true;
    fetch(`${api}/status`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (live) setProvider(d.teacher);
      })
      .catch(() => {
        if (live) setProvider(false);
      });
    return () => {
      live = false;
      worker.current?.close();
      abort.current?.abort();
      scheduler.current.cancel();
      voice.current?.disconnect();
      narrator.current.cancel();
    };
  }, [api]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setStorage(true);
      } catch {
        setStorage(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [session, hydrated]);
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current.current));
      } catch {
        /* The on-screen storage status already discloses unavailable storage. */
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);
  useEffect(() => {
    let pending = false;
    const timer = setInterval(async () => {
      const x = current.current,
        t = x.topics[x.active];
      if (!t?.sim.running || pending || busy) return;
      pending = true;
      const rev = t.revision,
        token = epoch.current;
      try {
        const result = await worker.current?.run(t.sim, 'sim_step', {
          seconds: 0.1,
        });
        if (
          result &&
          token === epoch.current &&
          current.current.active === x.active &&
          current.current.topics[x.active]?.revision === rev
        )
          update((t) => ({
            ...t,
            sim: {
              ...result.state,
              running:
                result.state.id !== 'rocket' ||
                result.state.data.rocket!.status === 'flying',
            },
            revision: t.revision + 1,
          }));
      } catch (e) {
        update((t) => ({ ...t, sim: { ...t.sim, running: false } }));
        setMessage(e instanceof Error ? e.message : 'Simulation failed.');
      } finally {
        pending = false;
      }
    }, 100);
    return () => clearInterval(timer);
  }, [busy, update]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code !== 'KeyV' ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        document.hidden ||
        (e.target as Element)?.closest(
          'input,textarea,select,[contenteditable]',
        ) ||
        !voice.current ||
        voiceStatus === 'disconnected'
      )
        return;
      e.preventDefault();
      pushToTalkHeld.current = true;
      voice.current.microphone(true);
      setMic(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyV' && voice.current && pushToTalkHeld.current) {
        pushToTalkHeld.current = false;
        voice.current.microphone(false);
        setMic(false);
      }
    };
    const blur = () => {
      pushToTalkHeld.current = false;
      voice.current?.microphone(false);
      setMic(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [voiceStatus]);
  const mutate = async (tool: SimTool, args: Record<string, unknown> = {}) => {
    cancel();
    voice.current?.interrupt(true);
    remember();
    // Freeze the loop before dispatch, so an in-flight worker result cannot overwrite this action.
    update((t) => ({
      ...t,
      sim: { ...t.sim, running: false },
      revision: t.revision + 1,
    }));
    const token = epoch.current;
    const x = current.current,
      t = x.topics[x.active] ?? lesson(x.active),
      rev = t.revision;
    try {
      const result = await worker.current!.run(
        { ...t.sim, running: false },
        tool,
        args,
      );
      if (
        token !== epoch.current ||
        current.current.active !== x.active ||
        current.current.topics[x.active]?.revision !== rev
      )
        return;
      update((t) =>
        logChange(
          t,
          {
            ...t,
            sim: result.state,
            guide: { ...t.guide, started: true, phase: 'EXPLORE' },
            followup: '',
            caption: interpret(result.state, t.sim, tool).say,
            captionSource: undefined,
            scene: (() => {
              const b = interpret(result.state, t.sim, tool);
              const r = compile(
                t.scene,
                b.visualCommands,
                namedAnchors(result.state),
              );
              return r.ok ? r.scene : t.scene;
            })(),
          },
          tool,
          JSON.stringify(args),
        ),
      );
      setMessage('');
      if (soundRef.current)
        void speakBeat(interpret(result.state, t.sim, tool), token);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Experiment failed.');
    }
  };
  const target = (id: string) => {
    update((t) => {
      const r = compile(
        t.scene,
        [
          { op: 'focus_target', targetId: id },
          { op: 'highlight', targetId: id, mode: 'circle' },
        ],
        namedAnchors(t.sim),
      );
      return r.ok ? logChange(t, { ...t, scene: r.scene }, 'pointer', id) : t;
    });
  };
  const goBack = () => {
    interrupt();
    const x = current.current,
      t = undo.current[x.active]?.pop();
    if (t)
      update((old) =>
        logChange(
          old,
          { ...t, sim: { ...t.sim, running: false } },
          'restore',
          'Previous committed experiment',
        ),
      );
    else setMessage('You’re at the first experiment in this visit.');
  };
  const present = (result: Result) => {
    let index = 0;
    void scheduler.current
      .play(
        result.beats,
        (beat) => {
          const last = ++index === result.beats.length;
          update((t) => {
            const r = compile(t.scene, beat.do, namedAnchors(t.sim));
            if (!r.ok) {
              setMessage(r.error.message);
              return t;
            }
            return logChange(
              t,
              {
                ...t,
                scene: r.scene,
                caption: beat.say,
                captionSource: 'ai',
                followup: last ? result.followup : '',
              },
              'teaching_beat',
              beat.say,
            );
          });
        },
        async (text, signal) => {
          if (voice.current && voiceStatus !== 'disconnected') {
            await voice.current.speak(text, signal);
            update((t) => logChange(t, t, 'audio_completed', text));
            return;
          }
          if (soundRef.current) {
            try {
              await narrator.current.speak(api, text, setNarrationStatus);
              return;
            } catch (e) {
              if (signal.aborted) return;
              setMessage(
                e instanceof Error ? e.message : 'Continue with captions.',
              );
              soundRef.current = false;
              setSound(false);
            }
          }
          if (index >= result.beats.length) return;
          setContinued(true);
          await new Promise<void>((resolve) => {
            const done = () => {
              nextText.current = null;
              setContinued(false);
              resolve();
            };
            nextText.current = done;
            signal.addEventListener('abort', done, { once: true });
          });
        },
      )
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : 'Narration failed.'),
      );
  };
  presenting.current = present;
  const ask = async (
    question: string,
    speak = true,
    mode: 'auto' | 'prepared' | 'live' = 'auto',
  ): Promise<Result | null> => {
    if (
      /^\s*(just let me explore|explore freely|let me explore)\s*[.!]?$/i.test(
        question,
      )
    ) {
      explore();
      return null;
    }
    if (/^\s*(stop|pause)\s*[.!]?$/i.test(question)) {
      voice.current?.interrupt(true);
      interrupt();
      return null;
    }
    if (/^\s*(go back|undo)\s*[.!]?$/i.test(question)) {
      goBack();
      return null;
    }
    if (/\bmaths?\b|calculation|q\/?k\/?v/i.test(question)) {
      setLabOpen(true);
      setMathOpen(true);
      if (!isSpatial) useWorld.getState().patch({ controlsOpen: true });
    }
    cancel();
    voice.current?.interrupt(speak);
    remember();
    const token = epoch.current;
    abort.current = new AbortController();
    setBusy(true);
    setMessage('');
    update((t) =>
      logChange(
        t,
        {
          ...t,
          sim: { ...t.sim, running: false },
          activeQuestion: question,
          history: [
            ...t.history,
            { role: 'user' as const, text: question },
          ].slice(-40),
        },
        'question',
        question,
      ),
    );
    const t = current.current.topics[current.current.active]!;
    const showPreparedAnswer = () => {
      const answer = preparedAnswer(question, t.sim);
      soundRef.current = false;
      setSound(false);
      if (applyBeat(answer.sim, answer.beat))
        update((t) =>
          logChange(
            t,
            {
              ...t,
              captionSource: 'prepared',
              history: [
                ...t.history.slice(0, -1),
                {
                  role: 'assistant' as const,
                  text: `[Prepared answer · offline] ${answer.beat.say}`,
                },
              ].slice(-40),
            },
            'prepared_answer',
            answer.questionId ?? 'unsupported-question',
          ),
        );
      setBusy(false);
    };
    if (
      !prototypeFeatures.liveAI ||
      mode === 'prepared' ||
      (mode === 'auto' && provider === false)
    ) {
      showPreparedAnswer();
      return null;
    }
    // A slow provider must not leave a demo indefinitely waiting for an answer.
    const controller = abort.current;
    const timeout = setTimeout(() => controller?.abort(), 12000);
    try {
      const r = await fetch(`${api}/teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          sim: t.sim,
          scene: t.scene,
          evidence: t.evidence,
          history: t.history,
          activeQuestion: t.followup,
        }),
        signal: abort.current.signal,
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error ?? 'AI teaching failed.');
      if (token !== epoch.current) return null;
      const data = result as Result;
      const state = restore(data.state);
      setProvider(true);
      update((t) => {
        let next = logChange(
          t,
          {
            ...t,
            sim: { ...state, running: data.state.running },
            skill: data.skill,
            guide: { ...t.guide, started: true, phase: 'EXPLORE' },
            evidence: [
              ...t.evidence,
              {
                question: t.followup,
                answer: question,
                assessment: data.assessment,
                move: data.move,
                assistance: t.evidence.length,
                at: Date.now(),
              },
            ].slice(-100),
            history: [
              ...t.history,
              {
                role: 'assistant' as const,
                text: data.beats.map((b) => b.say).join(' '),
              },
            ].slice(-40),
          },
          'teacher_tools',
          JSON.stringify(data.events),
        );
        return next;
      });
      setBusy(false);
      if (speak) present(data);
      return data;
    } catch (e) {
      if (token === epoch.current) {
        setBusy(false);
        setProvider(false);
        setMessage(
          'Live AI is unavailable. Prepared answers are available below.',
        );
        showPreparedAnswer();
      }
    } finally {
      clearTimeout(timeout);
    }
    return null;
  };
  asking.current = ask;
  const connect = async () => {
    if (!prototypeFeatures.liveAI) return;
    if (voice.current && voiceStatus !== 'disconnected') {
      voice.current.disconnect();
      voice.current = null;
      setMic(false);
      return;
    }
    const v = new RealtimeVoice(api, {
      status: setVoiceStatus,
      error: setMessage,
      interrupt,
      event: (type) =>
        update((t) => ({
          ...t,
          events: [
            ...t.events,
            {
              at: Date.now(),
              kind: 'voice_event',
              before: hash(t.scene),
              after: hash(t.scene),
              detail: type,
            },
          ].slice(-200),
        })),
      transcript: (text, kind) => {
        if (kind === 'student') update((t) => ({ ...t, activeQuestion: text }));
        else
          update((t) => ({
            ...t,
            caption: text,
            captionSource: 'ai',
            events: [
              ...t.events,
              {
                at: Date.now(),
                kind: 'provider_caption',
                before: hash(t.scene),
                after: hash(t.scene),
                detail: text.slice(-400),
              },
            ].slice(-200),
          }));
      },
      question: (q) => asking.current(q, false),
      ready: (r) => presenting.current(r as Result),
    });
    voice.current = v;
    try {
      await v.connect();
      setMessage(
        'Voice connected. Tap Talk, or hold V while this tab is focused.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Voice could not connect.');
    }
  };
  const applyBeat = (
    state: import('../simulations/runtime').Simulation,
    beat: TeachingBeat,
    patch: Partial<LessonSession['guide']> = {},
  ) => {
    let applied = false;
    update((t) => {
      const result = compile(t.scene, beat.visualCommands, namedAnchors(state));
      if (!result.ok) {
        setMessage(result.error.message);
        return t;
      }
      applied = true;
      return logChange(
        t,
        {
          ...t,
          sim: {
            ...state,
            running:
              state.id === 'traffic' &&
              ['ORIENT', 'EXPLAIN', 'DEMONSTRATE'].includes(beat.teachingMove),
          },
          scene: result.scene,
          caption: beat.caption,
          captionSource: undefined,
          followup: '',
          guide: {
            ...t.guide,
            started: true,
            phase: beat.teachingMove,
            beatId: beat.id,
            ...patch,
          },
          history: [
            ...t.history,
            { role: 'assistant' as const, text: beat.say },
          ].slice(-40),
        },
        'visual_committed',
        beat.id,
      );
    });
    return applied;
  };
  const speakBeat = async (beat: TeachingBeat, token: number) => {
    if (!soundRef.current || token !== epoch.current) return false;
    try {
      if (voice.current && voiceStatus !== 'disconnected')
        await voice.current.speak(beat.say, new AbortController().signal);
      else await narrator.current.speak(api, beat.say, setNarrationStatus);
      return true;
    } catch (e) {
      if (token === epoch.current) {
        setMessage(e instanceof Error ? e.message : 'Continue with captions.');
        soundRef.current = false;
        setSound(false);
      }
      return false;
    }
  };
  const advanceOpening = async (index: number, reset = false) => {
    cancel();
    voice.current?.interrupt(true);
    const token = epoch.current;
    let state = reset
      ? lessonModel(current.current.active)
      : (
          current.current.topics[current.current.active] ??
          lesson(current.current.active)
        ).sim;
    for (let i = index; i <= 3; i++) {
      if (token !== epoch.current) return;
      const result = opening(state, i);
      state = result.sim;
      if (
        !applyBeat(state, result.beat, {
          openingIndex: i,
          ...(reset ? { answer: '', transferAnswer: '' } : {}),
        })
      )
        return;
      const spoken = await speakBeat(result.beat, token);
      if (soundRef.current && !spoken) return;
      state = current.current.topics[current.current.active]!.sim;
      if (!soundRef.current || result.beat.awaitStudent) return;
    }
  };
  const startLearning = (withVoice: boolean) => {
    soundRef.current = withVoice;
    setSound(withVoice);
    setMessage('');
    void advanceOpening(0, true);
  };
  const choose = async (choice: number) => {
    cancel();
    voice.current?.interrupt(true);
    remember();
    const token = epoch.current;
    const t = current.current.topics[current.current.active]!;
    const transfer = t.guide.phase === 'TRANSFER_CHECK';
    const result = transfer
      ? transferResult(t.sim, choice)
      : respond(t.sim, choice);
    const question = (transfer ? transfers : predictions)[t.sim.id];
    update((t) =>
      logChange(
        t,
        {
          ...t,
          guide: { ...t.guide, phase: 'OBSERVE_RESPONSE' },
          activeQuestion: question.options[choice],
          evidence: [
            ...t.evidence,
            {
              question: question.question,
              answer: question.options[choice],
              assessment: result.correct
                ? ('correct' as const)
                : ('wrong' as const),
              move: result.correct
                ? ('transfer_check' as const)
                : ('change_representation' as const),
              assistance: 0,
              at: Date.now(),
            },
          ].slice(-100),
          history: [
            ...t.history,
            { role: 'user' as const, text: question.options[choice] },
          ].slice(-40),
        },
        'record_answer',
        question.options[choice],
      ),
    );
    if (
      !applyBeat(result.sim, result.beat, {
        representation: result.correct ? 'scene' : 'compare',
        ...(transfer
          ? { transferAnswer: question.options[choice] }
          : { answer: question.options[choice] }),
      })
    )
      return;
    await speakBeat(result.beat, token);
  };
  const nextTransfer = () => {
    cancel();
    voice.current?.interrupt(true);
    const t = current.current.topics[current.current.active]!;
    const r = transferSetup(t.sim);
    if (applyBeat(r.sim, r.beat, { representation: 'scene' }))
      void speakBeat(r.beat, epoch.current);
  };
  const explore = () => {
    cancel();
    voice.current?.interrupt(true);
    update((t) => ({
      ...t,
      guide: { ...t.guide, phase: 'EXPLORE', started: true },
      followup: '',
      caption:
        'Take the controls. I’ll explain what changes in this model, and you can ask me anything along the way.',
      captionSource: undefined,
    }));
  };
  const changeTopic = (id: Topic) => {
    setMobilePane('tutor');
    cancel();
    voice.current?.interrupt(true);
    commit((x) => ({
      ...x,
      active: id,
      topics: {
        ...x.topics,
        [x.active]: {
          ...(x.topics[x.active] ?? lesson(x.active)),
          sim: {
            ...(x.topics[x.active] ?? lesson(x.active)).sim,
            running: false,
          },
        },
        [id]: x.topics[id] ?? lesson(id),
      },
    }));
    setMessage('');
  };
  const t = session.topics[session.active] ?? lesson(session.active),
    info = topicInfo[session.active],
    observations = observe(t.sim);
  const metrics: Record<Topic, [string, string, string][]> = {
    neural: [
      ['loss', 'Loss', Number(observations.loss).toFixed(5)],
      ['steps', 'Training steps', String(observations.steps)],
      ['target', 'Target', String(t.sim.params.target)],
    ],
    rocket: [
      ['mass', 'Total mass', `${Number(observations.mass).toFixed(0)} kg`],
      ['fuel', 'Fuel', `${Number(observations.fuel).toFixed(1)} kg`],
      ['status', 'Flight', String(observations.status)],
    ],
    attention: [
      ['row-sum', 'Row sum', Number(observations.rowSum).toFixed(4)],
      ['query', 'Query', String(observations.query)],
      ['top-token', 'Strongest key', String(observations.strongestToken)],
    ],
    traffic: [
      [
        'density',
        'Density',
        `${Number(observations.density).toFixed(0)} cars/km`,
      ],
      [
        'min-speed',
        'Slowest',
        `${Number(observations.minSpeed).toFixed(1)} m/s`,
      ],
      ['elapsed', 'Elapsed', `${t.sim.time.toFixed(1)} s`],
    ],
    relativity: [
      ['gamma', 'Lorentz factor', Number(observations.gamma).toFixed(4)],
      ['earth-interval', 'Earth interval', `${observations.earthSeconds} s`],
      [
        'ship-interval',
        'Ship interval',
        `${Number(observations.shipSeconds).toFixed(4)} s`,
      ],
    ],
  };
  useEffect(() => {
    if (answerPane.current) answerPane.current.scrollTop = 0;
  }, [session.active, t.caption]);
  const control = (key: string) => {
    const spec = specs[session.active][key],
      value = t.sim.params[key];
    return (
      <label key={key} className={s.control}>
        <span>
          {spec.label}
          <output>
            {typeof value === 'number'
              ? value.toFixed(spec.step === 1 ? 0 : spec.step === 0.001 ? 3 : 2)
              : typeof value === 'boolean'
                ? ''
                : String(value)}
          </output>
        </span>
        {spec.options ? (
          <select
            aria-label={spec.label}
            value={String(value)}
            onChange={(e) =>
              void mutate('sim_set_params', {
                patch: { [key]: e.target.value },
              })
            }
          >
            {spec.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : typeof spec.default === 'boolean' ? (
          <input
            type="checkbox"
            aria-label={spec.label}
            checked={!!value}
            onChange={(e) =>
              void mutate('sim_set_params', {
                patch: { [key]: e.target.checked },
              })
            }
          />
        ) : typeof spec.default === 'number' ? (
          <input
            type="range"
            aria-label={spec.label}
            min={spec.min}
            max={
              session.active === 'attention' && key === 'query'
                ? String(t.sim.params.tokens).split(/\s+/).length - 1
                : spec.max
            }
            step={spec.step === 1 ? 1 : 'any'}
            value={+value}
            onChange={(e) =>
              void mutate('sim_set_params', {
                patch: { [key]: +e.target.value },
              })
            }
          />
        ) : (
          <input
            type="text"
            aria-label={spec.label}
            defaultValue={String(value)}
            key={String(value)}
            maxLength={240}
            onBlur={(e) => {
              if (e.target.value !== value)
                void mutate('sim_set_params', {
                  patch: { [key]: e.target.value },
                });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        )}
      </label>
    );
  };
  useEffect(() => {
    if (isSpatial) setLabOpen(controlsOpen);
  }, [controlsOpen, isSpatial]);
  const keys = (
    {
      neural: ['weight', 'x1', 'target', 'learningRate', 'model', 'x2'],
      rocket: ['throttle', 'dryMass', 'fuel', 'altitude', 'gravity'],
      attention: ['tokens', 'query', 'causal'],
      traffic: ['headway', 'count', 'desiredSpeed'],
      relativity: ['beta', 'duration', 'frame'],
    } as Record<Topic, string[]>
  )[session.active];
  const openControls = (event: React.MouseEvent<HTMLButtonElement>) => {
    controlsTrigger.current = event.currentTarget;
    setLabOpen(true);
    useWorld.getState().patch({ controlsOpen: true });
  };
  const closeControls = () => {
    useWorld.getState().patch({ controlsOpen: false });
    controlsTrigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!controlsOpen || isSpatial) return;
    if (window.matchMedia('(max-width: 1150px)').matches)
      closeControlsButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        useWorld.getState().patch({ controlsOpen: false });
        controlsTrigger.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [controlsOpen, isSpatial]);
  const demonstrate = () => {
    const sim = current.current.topics[current.current.active]!.sim;
    if (sim.id === 'neural') void mutate('sim_step', { seconds: 1 / 60 });
    else if (sim.id === 'rocket') void mutate('sim_step', { seconds: 0.5 });
    else if (sim.id === 'attention')
      void mutate('sim_set_params', {
        patch: {
          query:
            (+sim.params.query + 1) %
            String(sim.params.tokens).trim().split(/\s+/).length,
        },
      });
    else if (sim.id === 'traffic')
      void mutate('sim_experiment', { seconds: 2, brake: true });
    else
      void mutate('sim_set_params', {
        patch: { beta: 0.99, frame: 'earth' },
      });
  };
  const demonstrationLabel: Record<Topic, string> = {
    neural: 'Try one training step',
    rocket: 'Advance the flight · ½ second',
    attention: 'Follow the next word',
    traffic: 'Create a braking wave',
    relativity: 'Compare the clocks at 0.99c',
  };
  const conversationLog = (
    <details className={s.transcript}>
      <summary>Conversation & experiment log</summary>
      {t.history.map((m, i) => (
        <p key={i}>
          <b>{m.role === 'user' ? 'You' : 'Petros'}:</b> {m.text}
        </p>
      ))}
      <p>
        {t.events.length} events · state {hash({ sim: t.sim, scene: t.scene })}
      </p>
      <button
        onClick={() => {
          const blob = new Blob([JSON.stringify(current.current, null, 2)], {
              type: 'application/json',
            }),
            url = URL.createObjectURL(blob),
            a = document.createElement('a');
          a.href = url;
          a.download = 'petros-session.json';
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Export session
      </button>
    </details>
  );
  const experimentPanel = (
    <details
      className={s.labDrawer}
      open={labOpen}
      onToggle={(e) => {
        setLabOpen(e.currentTarget.open);
        if (isSpatial)
          useWorld.getState().patch({ controlsOpen: e.currentTarget.open });
      }}
    >
      <summary aria-label="Experiment controls">
        Experiment controls & live measurements <span>＋</span>
      </summary>
      {isSpatial && <FocusScene sim={t.sim} onTarget={target} />}
      <div className={s.metrics}>
        {metrics[session.active].map(([id, label, value]) => (
          <div key={id}>
            <span>{label}</span>
            <strong
              data-observation={id}
              data-petros-id={
                isSpatial && (id === 'loss' || id === 'target') ? id : undefined
              }
            >
              {value}
            </strong>
          </div>
        ))}
      </div>
      {!isSpatial && (
        <button className={s.quickExperiment} onClick={demonstrate}>
          {demonstrationLabel[session.active]} →
        </button>
      )}
      <div className={s.experimentBar}>
        <div className={s.actions}>
          <button
            className={s.primary}
            disabled={!hydrated || busy}
            onClick={() => void mutate(t.sim.running ? 'sim_pause' : 'sim_run')}
          >
            {t.sim.running ? 'Ⅱ Pause' : '▷ Run experiment'}
          </button>
          <button
            disabled={!hydrated || busy}
            onClick={() =>
              void mutate('sim_step', {
                seconds: session.active === 'neural' ? 0.25 : 1,
              })
            }
          >
            Step +
          </button>
          {session.active === 'traffic' && (
            <button onClick={() => void mutate('sim_brake')}>
              Brake a car
            </button>
          )}
          <button
            aria-label="Reset experiment"
            onClick={() => void mutate('sim_reset')}
          >
            ↺
          </button>
          <button aria-label="Go back" onClick={goBack}>
            ↶
          </button>
        </div>
        <div className={s.simTime}>t = {t.sim.time.toFixed(1)} s</div>
      </div>
      {isSpatial ? (
        <>
          <div className={s.controls}>
            {control(keys[0])}
            {keys.length > 1 && control(keys[1])}
          </div>
          <details className={s.moreControls}>
            <summary>
              Adjust the experiment <span>＋</span>
            </summary>
            <div className={s.controls}>{keys.slice(2).map(control)}</div>
          </details>
        </>
      ) : (
        <div className={s.controls}>{keys.map(control)}</div>
      )}
      {session.active !== 'attention' && (
        <div className={s.plot}>
          <GraphPlots
            samples={t.sim.history}
            secondary={session.active === 'relativity'}
            label={
              {
                neural: 'Training loss',
                rocket: 'Altitude',
                traffic: 'Mean speed',
                relativity: 'Coordinate time / proper time',
              }[session.active]
            }
            unit={
              {
                neural: '½ (prediction − target)²',
                rocket: 'metres',
                traffic: 'm/s',
                relativity: 'seconds',
              }[session.active]
            }
          />
        </div>
      )}
      {session.active === 'traffic' && <TrafficPlot sim={t.sim} />}
      <details
        className={s.mathDrawer}
        open={mathOpen}
        onToggle={(e) => setMathOpen(e.currentTarget.open)}
      >
        <summary>Show the maths & evidence</summary>
        <ModelMath sim={t.sim} />
        <SimulationViewport sim={t.sim} onTarget={target} />
      </details>
      {t.scene.annotations.length > 0 && (
        <div className={s.annotationNotes} aria-label="Visual annotations">
          {t.scene.annotations.map((a) => (
            <button
              key={a.targetId}
              type="button"
              data-annotation-for={a.targetId}
              onClick={() => target(a.targetId)}
            >
              <span>{a.targetId.replace(/[-_]/g, ' ')}</span>
              {a.text}
            </button>
          ))}
        </div>
      )}
    </details>
  );
  return (
    <main
      className={s.app}
      data-testid="petros-v2"
      data-presentation={isSpatial ? 'world' : '2d'}
      data-world-opening={worldOpening}
      data-world-place={worldPlace}
      data-ask-open={askOpen}
      data-mobile-pane={mobilePane}
      onPointerDownCapture={(e) => {
        if (
          useWorld.getState().tour &&
          (e.target as Element).closest('button,input,select,summary') &&
          !(e.target as Element).closest('[data-tour-control]')
        )
          useWorld.getState().patch({ tour: false });
      }}
    >
      {isSpatial && (
        <World
          disclosure={info.disclosure}
          sim={t.sim}
          scene={t.scene}
          phase={t.guide.phase}
          assessment={t.evidence.at(-1)?.assessment}
          speaking={
            voiceStatus === 'speaking' || narrationStatus === 'speaking'
          }
          thinking={busy}
          onTarget={target}
          onTopic={changeTopic}
          onAction={(tool, args) => void mutate(tool, args)}
          onBegin={() => startLearning(false)}
          onBeat={(index) => void advanceOpening(index)}
          onPause={() => {
            voice.current?.interrupt(true);
            interrupt();
          }}
          onReset={() => {
            cancel();
            voice.current?.interrupt(true);
            commit(() => freshSession());
            setLabOpen(false);
            setMessage('');
          }}
          onMute={() => {
            narrator.current.cancel();
            setNarrationStatus('ready');
            voice.current?.interrupt(true);
            soundRef.current = false;
            setSound(false);
          }}
        />
      )}
      <header className={s.header}>
        <a
          href={isSpatial ? '/prototype' : '/prototype?view=2d'}
          className={s.brand}
        >
          <span className={s.brandMark}>p</span>petros
          <span className={s.brandSub}>a little curiosity goes a long way</span>
        </a>
        {prototypeFeatures.world ? (
          <nav className={s.mode} aria-label="Learning view">
            <a
              href="/prototype?view=2d"
              aria-current={!isSpatial ? 'page' : undefined}
            >
              2D tutor
            </a>
            <a href="/prototype" aria-current={isSpatial ? 'page' : undefined}>
              3D world ↗
            </a>
          </nav>
        ) : (
          <span className={s.prototypeBadge}>
            Interactive prototype · AI paused
          </span>
        )}
      </header>
      <nav className={s.tabs} aria-label="Interactive topics">
        {TOPICS.map((id, i) => (
          <button
            key={id}
            aria-current={id === session.active ? 'page' : undefined}
            onClick={() => {
              changeTopic(id);
              if (isSpatial) useWorld.getState().setPlace(id);
            }}
          >
            <span>0{i + 1}</span>
            {tabLabels[id]}
          </button>
        ))}
      </nav>
      {!isSpatial && (
        <div className={s.mobileTabs} aria-label="Lesson panels">
          <button
            aria-pressed={mobilePane === 'tutor'}
            onClick={() => setMobilePane('tutor')}
          >
            Ask & learn
          </button>
          <button
            aria-pressed={mobilePane === 'model'}
            onClick={() => setMobilePane('model')}
          >
            Live model
          </button>
          <button onClick={openControls}>Controls</button>
        </div>
      )}
      <section className={s.workspace}>
        {!isSpatial && (
          <aside
            className={s.experimentRail}
            data-open={controlsOpen}
            aria-label="Experiment panel"
          >
            <div className={s.railHeader}>
              <span>YOUR EXPERIMENT</span>
              <button
                className={s.closeRail}
                ref={closeControlsButton}
                onClick={closeControls}
              >
                Close controls ×
              </button>
            </div>
            {experimentPanel}
            {conversationLog}
          </aside>
        )}
        <div className={s.notebook} data-petros-id="teaching-surface">
          <div className={s.lessonHeading}>
            <div>
              <div className={s.eyebrow}>{info.kicker}</div>
              <h2>{info.title}</h2>
            </div>
            <span className={s.live}>
              <i />
              LIVE MODEL
            </span>
          </div>
          <p className={s.question}>{goals[session.active]}</p>
          {!isSpatial && (
            <button
              className={s.railToggle}
              onClick={openControls}
              aria-expanded={controlsOpen}
            >
              Experiment controls ↗
            </button>
          )}
          {!isSpatial && (
            <div className={s.model} data-testid="regular-learning-model">
              <FocusScene sim={t.sim} onTarget={target} />
            </div>
          )}
          <div className={s.sceneExplanation}>
            <SvgScene scene={t.scene} onTarget={target} />
          </div>
          {isSpatial && experimentPanel}
          <p className={s.disclosure}>{info.disclosure}</p>
        </div>
        <aside className={s.tutor} data-testid="tutor-panel">
          {!isSpatial && (
            <PetrosPresence
              status={narrationStatus === 'speaking' ? 'speaking' : voiceStatus}
              thinking={busy || narrationStatus === 'loading'}
              assetBase={assetBase}
            />
          )}
          {!prototypeFeatures.liveAI && !isSpatial && (
            <PreparedQuestions
              topic={session.active}
              selected={t.activeQuestion}
              onAsk={(q) => void ask(q, true, 'prepared')}
            />
          )}
          {!prototypeFeatures.liveAI && !isSpatial && (
            <div className={s.questionInput}>
              <ContextualInput
                key={session.active}
                busy={busy}
                onAsk={(q) => void ask(q)}
                placeholder="Type your question for Petros…"
                describedBy="prepared-question-help"
              />
              <small id="prepared-question-help">
                Prepared answers only. Try a listed question or “explain
                simply”.
              </small>
            </div>
          )}
          <div
            ref={answerPane}
            className={s.tutorBody}
            data-phase={t.guide.phase}
            role="region"
            aria-label="Petros answer"
            tabIndex={0}
          >
            <div className={s.teachingLabel}>
              {t.captionSource === 'prepared'
                ? 'PREPARED ANSWER · OFFLINE'
                : !t.guide.started
                  ? 'LET’S FIND OUT TOGETHER'
                  : t.guide.phase === 'PREDICT' ||
                      t.guide.phase === 'TRANSFER_CHECK'
                    ? 'YOUR TURN'
                    : t.guide.phase === 'EXPLORE'
                      ? 'FOLLOW YOUR CURIOSITY'
                      : 'NOTICE THIS'}
            </div>
            {isSpatial ? (
              <TeachingCaption
                text={t.caption}
                followup={t.followup}
                ai={false}
              />
            ) : (
              <TutorExplanation
                sim={t.sim}
                text={t.caption}
                followup={t.followup}
                phase={t.guide.phase}
                compact
                onTarget={target}
                onExperiment={demonstrate}
              />
            )}
            {!t.guide.started && (
              <div className={s.startActions}>
                <button
                  className={s.primary}
                  disabled={!hydrated}
                  onClick={() => startLearning(true)}
                >
                  {prototypeFeatures.liveAI
                    ? 'Start with voice →'
                    : 'Listen with device voice →'}
                </button>
                <button
                  disabled={!hydrated}
                  onClick={() => startLearning(false)}
                >
                  Start learning with captions
                </button>
                <small>
                  {prototypeFeatures.liveAI
                    ? 'Petros uses an AI-generated voice.'
                    : 'Prepared lessons · optional device narration'}
                </small>
              </div>
            )}
            {t.guide.started &&
              t.guide.openingIndex < 3 &&
              ['ORIENT', 'EXPLAIN', 'DEMONSTRATE'].includes(t.guide.phase) && (
                <button
                  className={s.continue}
                  onClick={() => void advanceOpening(t.guide.openingIndex + 1)}
                >
                  Continue with Petros →
                </button>
              )}
            {t.guide.started &&
              ['PREDICT', 'TRANSFER_CHECK'].includes(t.guide.phase) && (
                <div className={s.choices} aria-label="Your prediction">
                  {(t.guide.phase === 'TRANSFER_CHECK'
                    ? transfers
                    : predictions)[session.active].options.map((label, i) => (
                    <button key={label} onClick={() => void choose(i)}>
                      {label}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              )}
            {t.guide.phase === 'RETEACH_OR_EXTEND' && (
              <button className={s.continue} onClick={nextTransfer}>
                Try a fresh example →
              </button>
            )}
            {t.guide.started && (
              <div className={s.quietActions}>
                <button
                  onClick={() => {
                    soundRef.current = !sound;
                    setSound(!sound);
                    if (sound) {
                      narrator.current.cancel();
                      voice.current?.interrupt(true);
                    } else
                      void speakBeat(
                        makeBeat(t.sim, t.guide.phase, t.caption),
                        epoch.current,
                      );
                  }}
                >
                  {sound ? 'Sound on · mute' : 'Read aloud'}
                </button>
                {t.guide.phase !== 'EXPLORE' && (
                  <button onClick={explore}>Explore freely</button>
                )}
                <button onClick={() => startLearning(sound)}>
                  Restart lesson
                </button>
                <button
                  onClick={() => {
                    narrator.current.cancel();
                    voice.current?.interrupt(true);
                    interrupt();
                  }}
                >
                  Pause Petros
                </button>
              </div>
            )}
            {continued && (
              <button
                className={s.continue}
                onClick={() => nextText.current?.()}
              >
                Continue explanation →
              </button>
            )}
          </div>
          {prototypeFeatures.liveAI && (
            <div className={s.try}>
              <span>TRY ASKING</span>
              <button onClick={() => void ask(info.prompt)}>
                {info.prompt} <span>↗</span>
              </button>
            </div>
          )}
          {prototypeFeatures.liveAI && (
            <div className={s.input}>
              <ContextualInput busy={busy} onAsk={(q) => void ask(q)} />
              <details
                className={s.prepared}
                open={provider === false ? true : undefined}
              >
                <summary>Prepared questions · no AI needed</summary>
                <div aria-label="Prepared questions">
                  {preparedQuestions[session.active].map((q) => (
                    <button
                      key={q.id}
                      disabled={!hydrated}
                      onClick={() => void ask(q.question, true, 'prepared')}
                    >
                      {q.question} <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
                {provider === false && (
                  <button
                    className={s.retryAi}
                    disabled={busy}
                    onClick={() =>
                      void ask(t.activeQuestion || info.prompt, true, 'live')
                    }
                  >
                    Retry live AI
                  </button>
                )}
              </details>
            </div>
          )}
          {prototypeFeatures.liveAI && (
            <div className={s.voice}>
              <VoiceControls
                status={voiceStatus}
                mic={mic}
                onConnect={() => void connect()}
                onMic={() => {
                  voice.current?.microphone(!mic);
                  setMic(!mic);
                }}
                onStop={() => {
                  voice.current?.interrupt(true);
                  interrupt();
                }}
              />
            </div>
          )}
          {message && (
            <p className={s.message} role="status">
              {message}
            </p>
          )}
          <div className={s.connection}>
            <span className={provider ? s.connected : s.offline} />
            {provider === null
              ? 'Checking AI connection…'
              : !prototypeFeatures.liveAI
                ? 'Prepared lessons · live simulations · AI paused'
                : provider
                  ? 'Live AI configured'
                  : 'Live AI unavailable · prepared answers ready'}
          </div>
          {isSpatial && conversationLog}
        </aside>
      </section>
      <footer className={s.footer}>
        <span>EDRION / LEARN BY EXPLORING</span>
        <span>
          {storage
            ? 'Saved on this browser'
            : 'Browser storage unavailable · session in memory'}{' '}
          · no mastery inferred
        </span>
      </footer>
      <TeachingPointer scene={t.scene} spatial={isSpatial} />
      {hydrated && (
        <script
          type="application/json"
          id="petros-observations"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              topic: session.active,
              params: t.sim.params,
              observations,
              activeQuestion: t.activeQuestion,
              caption: t.caption,
              captionSource: t.captionSource,
              revision: t.revision,
              scene: t.scene,
              guide: t.guide,
              history: t.history,
              evidence: t.evidence,
              mode: isSpatial ? 'world' : 'classic',
              presentation: isSpatial ? 'world' : '2d',
              sim: t.sim,
              stateHash: hash({ sim: t.sim, scene: t.scene }),
              events: t.events,
            }).replace(/</g, '\\u003c'),
          }}
        />
      )}
    </main>
  );
}
