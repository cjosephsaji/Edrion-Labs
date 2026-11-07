'use client';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Canvas } from '@react-three/fiber';
import * as T from 'three';
import type { SimTool, Topic } from '../simulations/runtime';
import { useWorld, type Quality } from '../world-v3/store';
import type { GuidedState } from '../core/teaching';
import type { StageAdapter } from './lesson';
import { paletteVariables } from './palette';
import { labelValue, StageLabels } from './StageLabels';
import { StageCamera, type OrbitState } from './StageCamera';
import { Studio, StageEffects, StageMetrics } from './Studio';
import { GlossaryCaption } from './GlossaryCaption';
import { clamp } from './logic';
import c from './stage.module.css';
import { stageTopics } from './navigation';
import { resolveStageAction } from './lesson';
import {
  StageSummary,
  ExplainerCard,
  StageControls,
  StageLessonPanel,
} from './StageHUD';
export interface StageExperienceProps<S> extends StageAdapter<S> {
  caption: string;
  teacherBeat: string;
  teacherFocus: string | null;
  hydrated: boolean;
  message: string;
  guide: GuidedState;
  questions: { question: string; options: string[] };
  observations: ReactNode;
  onAction: (tool: SimTool, args?: Record<string, unknown>) => Promise<void>;
  onExplain: (text: string, target: string) => void;
  onRead: (text: string) => void;
  onPause: () => void;
  onBegin: () => void;
  onContinue: () => void;
  onChoose: (i: number) => void;
  onTransfer: () => void;
  onAsk: (q: string) => void;
  onReset: () => void | Promise<void>;
  onTopic?: (id: Topic) => void;
  preparedQuestions: { id: string; question: string }[];
}
class StageBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className={c.failure} role="alert">
        <h1>The Stage needs a fresh start.</h1>
        <p>Your lesson is saved in this browser.</p>
        <button onClick={() => location.reload()}>Reload Stage</button>
        <a href="?view=world">Open World</a>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function StageExperience<S>(props: StageExperienceProps<S>) {
  const { lesson, state, Specimen } = props,
    root = useRef<HTMLElement>(null),
    intro = useRef(0);
  const [selected, setSelected] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [chipId, setChipId] = useState<string | null>(null),
    [moving, setMoving] = useState(true),
    [replay, setReplay] = useState(0),
    [auto, setAuto] = useState(false),
    [storyEnabled, setStoryEnabled] = useState(true),
    [hint, setHint] = useState(false),
    [reduced, setReduced] = useState(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    [phone, setPhone] = useState(
      () => matchMedia('(max-width: 720px)').matches,
    ),
    [panel, setPanel] = useState(false),
    [demo, setDemo] = useState<{ id: string; at: number } | null>(null),
    [flash, setFlash] = useState('');
  const orbit = useRef<OrbitState>({
      az: 0,
      polar: 0,
      last: 0,
      dial: false,
      cancel: () => {},
    }),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    trigger = useRef<HTMLElement | null>(null),
    inflight = useRef(false),
    pendingActions = useRef(0),
    stepEpoch = useRef(0);
  const quality = useWorld((s) => s.quality),
    effectiveQuality: Quality = phone ? 'low' : quality;
  const teacherBeat = useRef(props.teacherBeat);
  useEffect(() => {
    if (teacherBeat.current === props.teacherBeat) return;
    teacherBeat.current = props.teacherBeat;
    setSelected(
      lesson.parts.some((p) => p.id === props.teacherFocus)
        ? props.teacherFocus
        : null,
    );
    setChipId(null);
  }, [props.teacherBeat, props.teacherFocus, lesson]);
  const callbacks = useRef(props);
  callbacks.current = props;
  // Manual input supersedes an in-flight auto step. Further auto ticks wait
  // for the worker's committed result, so they cannot cancel a pending edit.
  const dispatchAction = useCallback(
    async (tool: SimTool, args?: Record<string, unknown>) => {
      pendingActions.current++;
      try {
        await callbacks.current.onAction(tool, args);
      } finally {
        pendingActions.current--;
      }
    },
    [],
  );
  const resetLesson = async () => {
    pendingActions.current++;
    try {
      await callbacks.current.onReset();
    } finally {
      pendingActions.current--;
    }
  };
  const story = storyEnabled && lesson.story.enabled(state),
    chip = lesson.chips.find((q) => q.id === chipId);
  const stopDemo = useCallback(() => {
    stepEpoch.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDemo(null);
    setFlash('');
  }, []);
  const dismissHint = () => {
    setHint(false);
    try {
      localStorage.setItem('petros-stage-inspected', '1');
    } catch {
      /* memory only */
    }
  };
  const restore = useCallback(() => {
    stopDemo();
    setAuto(false);
    setSelected(null);
    setChipId(null);
    setHovered(null);
    callbacks.current.onPause();
    trigger.current?.focus({ preventScroll: true });
  }, [stopDemo]);
  const open = useCallback(
    (id: string, part?: string) => {
      const q = lesson.chips.find((q) => q.id === id);
      if (!q) return;
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      stopDemo();
      setAuto(false);
      setChipId(id);
      const focus = part ?? q.part;
      setSelected(focus);
      setHovered(null);
      setPanel(false);
      dismissHint();
      callbacks.current.onExplain(q.answer(callbacks.current.state), focus);
    },
    [lesson, stopDemo],
  );
  const onPart = (id: string) => {
    const p = lesson.parts.find((p) => p.id === id);
    if (p) open(p.chip, p.id);
  };
  useEffect(() => {
    root.current
      ?.querySelector<HTMLElement>(
        'nav[aria-label="Stage lessons"] [aria-current="page"]',
      )
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'instant',
      });
  }, [lesson.id]);
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)'),
      narrow = matchMedia('(max-width: 720px)');
    const update = () => {
      setReduced(motion.matches);
      setPhone(narrow.matches);
    };
    update();
    motion.addEventListener('change', update);
    narrow.addEventListener('change', update);
    try {
      setHint(!localStorage.getItem('petros-stage-inspected'));
    } catch {
      setHint(true);
    }
    return () => {
      motion.removeEventListener('change', update);
      narrow.removeEventListener('change', update);
    };
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuto(false);
        setPanel(false);
        restore();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [restore]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(async () => {
      const p = callbacks.current;
      if (p.lesson.solved(p.state) || document.hidden) {
        setAuto(false);
        return;
      }
      if (inflight.current || pendingActions.current > 0) return;
      inflight.current = true;
      try {
        const action = resolveStageAction(
          p.lesson.train.autoAction ?? p.lesson.train.action,
          p.state,
        );
        await p.onAction(action.tool, action.args);
      } finally {
        inflight.current = false;
      }
    }, lesson.train.intervalMs ?? 520);
    return () => clearInterval(id);
  }, [auto, lesson]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        setAuto(false);
        stopDemo();
        callbacks.current.onPause();
      }
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, [stopDemo]);
  const runDemo = () => {
    if (!chip) return;
    stopDemo();
    setAuto(false);
    callbacks.current.onPause();
    setDemo({ id: chip.demo, at: performance.now() });
    const later = (ms: number, fn: () => void) =>
      timers.current.push(setTimeout(fn, reduced ? Math.min(ms, 150) : ms));
    const definition = lesson.demos[chip.demo];
    const phases =
      typeof definition === 'function'
        ? definition(callbacks.current.state)
        : (definition ?? []);
    for (const phase of phases) {
      const run = () => {
        const s = callbacks.current.state;
        if (phase.action) {
          const action = phase.action(s);
          void dispatchAction(action.tool, action.args);
        }
        if (phase.message) setFlash(phase.message(s, story));
        if (phase.highlight) setFlash(phase.highlight);
        if (phase.focus !== undefined) setSelected(phase.focus);
        if (phase.closeCard) setChipId(null);
        if (phase.control)
          root.current
            ?.querySelector<HTMLInputElement>(`#stage-${lesson.parameter.id}`)
            ?.focus();
      };
      if (phase.delay === 0) run();
      else later(phase.delay, run);
    }
    later(Math.max(4800, ...phases.map((p) => p.delay + 800)), () => {
      setFlash('');
      setDemo(null);
    });
  };
  const caption =
    props.caption.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? props.caption;
  const orbitDrag = useRef<{
    x: number;
    y: number;
    az: number;
    polar: number;
  } | null>(null);
  const pauseTraining = () => {
    setAuto(false);
    stopDemo();
  };
  const stepOnce = async () => {
    dismissHint();
    pauseTraining();
    if (lesson.train.resetFocus) restore();
    const token = stepEpoch.current,
      action = resolveStageAction(lesson.train.action, callbacks.current.state);
    await dispatchAction(action.tool, action.args);
    if (lesson.train.runAfterAction && token === stepEpoch.current)
      setAuto(true);
  };
  return (
    <main
      ref={root}
      className={c.stage}
      data-lesson={lesson.id}
      style={paletteVariables as CSSProperties}
      data-testid="petros-stage"
      data-presentation="stage"
      data-focus={selected ?? 'overview'}
      data-camera-moving={moving}
      data-intro-complete={!moving && intro.current >= 2.4}
      onClick={(e) => {
        if (e.target === e.currentTarget) restore();
      }}
    >
      <div className={c.area} data-stage-area />
      <div
        className={c.canvas}
        data-region={lesson.canvasRegion ?? 'full'}
        onPointerDown={(e) => {
          if (orbit.current.dial) return;
          orbit.current.cancel();
          orbitDrag.current = {
            x: e.clientX,
            y: e.clientY,
            az: orbit.current.az,
            polar: orbit.current.polar,
          };
          e.currentTarget
            .querySelector('canvas')
            ?.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = orbitDrag.current;
          if (!d || orbit.current.dial) return;
          orbit.current.az = clamp(d.az - (e.clientX - d.x) * 0.006, -0.9, 0.9);
          orbit.current.polar = clamp(
            d.polar - (e.clientY - d.y) * 0.004,
            -0.2,
            0.28,
          );
          orbit.current.last = performance.now();
        }}
        onPointerUp={() => {
          orbitDrag.current = null;
        }}
        onPointerCancel={() => {
          orbitDrag.current = null;
        }}
      >
        <StageBoundary>
          <Canvas
            dpr={Math.min(2, window.devicePixelRatio)}
            shadows={effectiveQuality === 'low' ? false : 'soft'}
            camera={{ fov: 30, near: 0.1, far: 100, position: [0, 7, 25] }}
            gl={{
              antialias: effectiveQuality === 'low',
              alpha: false,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = T.SRGBColorSpace;
              gl.toneMapping =
                effectiveQuality === 'low'
                  ? T.ACESFilmicToneMapping
                  : T.NoToneMapping;
              gl.toneMappingExposure = 1.08;
              gl.shadowMap.type = T.PCFSoftShadowMap;
              gl.domElement.tabIndex = 0;
              gl.domElement.setAttribute(
                'aria-label',
                lesson.canvasDescription,
              );
            }}
            onPointerMissed={(e) => {
              if (e.type === 'click') restore();
            }}
          >
            <Studio quality={effectiveQuality} reduced={reduced} />
            <Specimen
              state={state}
              lesson={lesson}
              quality={effectiveQuality}
              reduced={reduced}
              story={story}
              selected={selected}
              hovered={hovered}
              demo={demo}
              intro={intro}
              onPart={onPart}
              onHover={setHovered}
              onAction={dispatchAction}
              onDial={(v) => {
                orbit.current.dial = v;
                if (v) {
                  orbit.current.cancel();
                  if (lesson.parameter.keepRunning) stopDemo();
                  else pauseTraining();
                }
              }}
            />
            <StageCamera
              lesson={lesson}
              state={state}
              selected={selected}
              reduced={reduced}
              replay={replay}
              root={root}
              orbit={orbit}
              intro={intro}
              onMotion={setMoving}
            />
            <StageLabels
              lesson={lesson}
              state={state}
              story={story}
              root={root}
              intro={intro}
              selected={selected}
              demo={demo}
            />
            <StageEffects
              quality={effectiveQuality}
              bloomHeight={lesson.bloomHeight}
            />
            <StageMetrics quality={effectiveQuality} />
          </Canvas>
        </StageBoundary>
      </div>
      <div className={c.vignette} />
      <svg className={c.leaders} aria-hidden="true">
        {lesson.labels.map(({ id }) => (
          <g key={id}>
            <line data-leader={id} />
            <circle data-dot={id} r="3" />
          </g>
        ))}
      </svg>
      {lesson.ruler?.ticks(state).map((v) => (
        <span
          key={v}
          data-stage-ruler={v}
          className={c.ruler}
          data-zero={v === 0}
        >
          {v === 0 ? '0 ─' : v}
        </span>
      ))}
      {lesson.parts.map((p) => (
        <span
          key={p.id}
          className={c.anchor}
          data-stage-anchor={p.id}
          data-world-anchor
          data-petros-id={p.id}
          aria-hidden="true"
        />
      ))}
      {lesson.labels.map(({ id }) => (
        <button
          type="button"
          className={c.tag}
          data-stage-label={id}
          key={id}
          onClick={() => onPart(id)}
          aria-label={`Inspect ${lesson.parts.find((p) => p.id === id)!.name}`}
        >
          <i>{lesson.labels.find((l) => l.id === id)!.title}</i>
          <b>{labelValue(id, state, lesson, story)}</b>
        </button>
      ))}
      <header className={c.top}>
        <a href="?view=stage" className={c.brand}>
          <span className={c.brandMark}>p</span>petros
        </a>
        <nav aria-label="Stage lessons">
          {stageTopics.map((item) => (
            <button
              key={item.id}
              disabled={!item.enabled}
              aria-current={item.id === lesson.id ? 'page' : undefined}
              onClick={() => {
                if (item.id === lesson.id) {
                  restore();
                  intro.current = reduced ? 3 : 0;
                  setReplay((n) => n + 1);
                } else {
                  pauseTraining();
                  props.onPause();
                  props.onTopic?.(item.id);
                }
              }}
            >
              {item.label}
              {item.id === lesson.id ? (
                <span>↻</span>
              ) : !item.enabled ? (
                <small>next</small>
              ) : null}
            </button>
          ))}
        </nav>
        <button
          className={c.lessonToggle}
          aria-expanded={panel}
          onClick={() => {
            pauseTraining();
            setPanel(!panel);
          }}
        >
          Lesson & settings
        </button>
      </header>
      <StageSummary
        lesson={lesson}
        state={state}
        story={story}
        storyEnabled={storyEnabled}
        onStory={() => setStoryEnabled((v) => !v)}
        flash={flash}
        onPart={onPart}
        open={open}
      />
      {hovered && !selected && (
        <div className={c.hoverName}>
          {lesson.parts.find((p) => p.id === hovered)?.name}
        </div>
      )}
      <div
        className={c.firstHint}
        data-visible={hint && !chip}
        aria-hidden={!hint || !!chip}
      >
        Tap any part or question to learn what it is
      </div>
      {flash && !lesson.equation.includes(flash) && (
        <div className={c.flash} role="status">
          {flash}
        </div>
      )}
      {chip && (
        <ExplainerCard
          chip={chip}
          part={selected ?? chip.part}
          lesson={lesson}
          state={state}
          runDemo={runDemo}
          restore={restore}
          onRead={props.onRead}
        />
      )}
      <footer className={c.bottom}>
        <div className={c.chips}>
          <span>Ask about this</span>
          <div>
            {lesson.chips.map((q) => (
              <button
                key={q.id}
                id={q.id}
                onClick={() => open(q.id)}
                aria-pressed={chipId === q.id}
              >
                {q.text}
              </button>
            ))}
          </div>
        </div>
        <div className={c.caption} data-testid="stage-caption">
          <GlossaryCaption
            text={caption}
            glossary={lesson.glossary}
            onOpen={open}
          />
          {caption.trim().length < props.caption.trim().length && (
            <button
              aria-label="Read full caption"
              className={c.captionMore}
              onClick={() => {
                pauseTraining();
                setPanel(true);
              }}
            >
              More
            </button>
          )}
        </div>
        <span className={c.srOnly} aria-live="polite" aria-atomic="true">
          {props.caption}
        </span>
        <StageControls
          {...props}
          onAction={dispatchAction}
          onReset={resetLesson}
          auto={auto || props.sim.running}
          onStep={() => void stepOnce()}
          pauseTraining={pauseTraining}
          restore={restore}
          parameterChanged={
            lesson.parameter.resetFocus
              ? restore
              : lesson.parameter.keepRunning
                ? stopDemo
                : pauseTraining
          }
          onAuto={() => {
            dismissHint();
            stopDemo();
            if (props.sim.running) {
              setAuto(false);
              props.onPause();
              return;
            }
            if (lesson.train.resetFocus) {
              setSelected(null);
              setChipId(null);
            }
            setAuto((v) => !v);
          }}
        />
        <div className={c.hint}>
          Drag a control or the studio · explore this example
        </div>
      </footer>
      {panel && (
        <StageLessonPanel
          {...props}
          onAction={dispatchAction}
          phone={phone}
          effectiveQuality={effectiveQuality}
          onClose={() => setPanel(false)}
          pauseTraining={pauseTraining}
          open={open}
        />
      )}
      {props.message && (
        <div className={c.message} role="status">
          {props.message}
        </div>
      )}
      {props.observations}
    </main>
  );
}
