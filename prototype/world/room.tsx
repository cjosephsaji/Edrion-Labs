'use client';
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas } from '@react-three/fiber';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageCircle,
  Pause,
  Play,
  Settings2,
  X,
} from 'lucide-react';
import { prepareWorldTypeface } from './typography';
import { placeCloud, type AvatarProjection, type Rect } from './cloud-layout';
import { BoardSemantics, FocusBoard } from './board-surface';
import { activeTree } from '../teaching/tree-variant';
import { teachingPlan } from '../teaching/curriculum';
import { TeachingCycle } from '../components/teaching-cycle';
import { goToCheckpoint } from '../teaching/checkpoint';
import { resume } from '../teaching/controller';
import { Scene } from './scene';
import { greeting, type ScenePresentation } from './storyboard';
import { lessons } from '../lessons';
import { alphaBeta, entail, HAZARDS, POLLUTION } from '../teaching/algorithms';
import { useLessonController } from '../teaching/use-lesson-controller';
import type { Lesson, Patch, ShowcaseState, Station } from '../teaching/types';
import { Reader } from '../components/reader';
import s from './world.module.css';
export interface RoomProps {
  state: ShowcaseState;
  patch: Patch;
  lesson?: Lesson;
  active: boolean;
  onBook: (l: Lesson) => void;
  onClassic: () => void;
  onAsk: (t: string) => Promise<void>;
  onTopic: (t: string) => Promise<void>;
  onReady: () => void;
  onStatus: (t: string) => void;
  onFailure: (t: string) => void;
  notice: string;
  onDismissNotice: () => void;
  reducedMotion: boolean;
  onReducedChange: (v: boolean) => void;
}
class RoomBoundary extends Component<
  {
    children: ReactNode;
    onClassic: () => void;
    onFailure: (s: string) => void;
  },
  { error: boolean }
> {
  override state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  override componentDidCatch() {
    this.props.onFailure(
      'The 3D study could not initialize. Your lesson is still here.',
    );
  }
  override render() {
    return this.state.error ? (
      <main className={s.world}>
        <div className={s.failure} role="alert">
          <h1>The study couldn’t open.</h1>
          <p>Your lesson and draft are still available.</p>
          <button onClick={this.props.onClassic}>Back to Classic</button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function World(props: RoomProps) {
  return (
    <RoomBoundary onClassic={props.onClassic} onFailure={props.onFailure}>
      <WorldExperience {...props} />
    </RoomBoundary>
  );
}
function WorldExperience(props: RoomProps) {
  const {
    state,
    patch,
    lesson,
    active,
    onBook,
    onClassic,
    onAsk,
    onTopic,
    onReady,
    onStatus,
    onFailure,
    notice,
    onDismissNotice,
    reducedMotion: reduced,
    onReducedChange: setReduced,
  } = props;
  const [scene, setScene] = useState<ScenePresentation>({
    phase: 'arrival',
    preset: 'wide',
    reveal: 0,
    replay: 0,
    skipCamera: 0,
    modelAngle: 0,
    feedbackEpoch: 0,
  });
  const [fontsReady, setFontsReady] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null),
    [lost, setLost] = useState(false),
    [recovery, setRecovery] = useState(0),
    [cameraBusy, setCameraBusy] = useState(false),
    [focused, setFocused] = useState(false),
    [library, setLibrary] = useState(false),
    [askOpen, setAskOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [reader, setReader] = useState<'source' | 'explanation' | null>(null),
    [preview, setPreview] = useState<Lesson | null>(null),
    [bubbleDismissed, setBubbleDismissed] = useState(false),
    [topicDraft, setTopicDraft] = useState('');
  const [economy, setEconomy] = useState(false);
  useEffect(() => {
    setEconomy(window.innerWidth <= 800 || navigator.hardwareConcurrency <= 4);
  }, []);
  const [precision, setPrecision] = useState(false);
  const [focusBoard, setFocusBoard] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false),
    [navOpen, setNavOpen] = useState(false);
  const bubble = useRef<HTMLDivElement>(null);
  const previousReaderPause = useRef(false);
  const previousFocusPause = useRef(false);
  const readySent = useRef(false),
    arrived = useRef(false),
    lastLesson = useRef(state.lessonId);
  const activeRef = useRef(active);
  activeRef.current = active;
  const currentLesson = lesson ?? lessons[0]!;
  const c = useLessonController(state, currentLesson, patch);
  const question = lesson ? c.q : null;
  useEffect(() => {
    setPrecision(false);
  }, [state.questionId, scene.phase]);
  useEffect(() => {
    const el = document.querySelector('[aria-label="World guided checkpoint"]');
    if (!el) {
      document
        .querySelector<HTMLElement>('[data-world-typeface]')
        ?.style.removeProperty('--response');
      return;
    }
    const observer = new ResizeObserver(() => {
      const main = el.closest('main');
      if (main)
        main.style.setProperty(
          '--response',
          Math.ceil(el.getBoundingClientRect().height) + 'px',
        );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scene.phase, askOpen, library, settings]);
  useEffect(() => {
    void prepareWorldTypeface().then(() => setFontsReady(true));
    onStatus('Preparing room geometry and original Petros artwork…');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const ok = !!gl;
    setSupported(ok);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (!ok)
      onFailure(
        'This device could not initialize the 3D study. Your lesson is still here.',
      );
  }, []);
  useEffect(() => {
    if (!active || arrived.current) return;
    arrived.current = true;
    if (lesson && state.phase !== 'welcome') {
      setScene((x) => ({
        ...x,
        phase: state.phase === 'recap' ? 'recap' : 'teaching',
        preset: lesson.id.startsWith('ehs') ? 'interaction' : 'teaching',
      }));
    } else patch({ cue: { kind: 'speech', text: greeting(lesson, state) } });
  }, [active]);
  useEffect(() => {
    if (lastLesson.current === state.lessonId) return;
    lastLesson.current = state.lessonId;
    if (!activeRef.current) return;
    setLibrary(false);
    setPreview(null);
    setBubbleDismissed(false);
    setScene((x) => ({
      ...x,
      phase: 'retrieving',
      preset: 'wide',
      reveal: 0,
      modelAngle: 0,
      feedbackEpoch: 0,
    }));
    patch({
      sceneStation: 'bookshelf',
      paused: false,
    });
  }, [state.lessonId]);
  useEffect(() => {
    setBubbleDismissed(false);
  }, [scene.phase, state.questionId, state.lastFeedback]);
  // Presentation follows the shared checkpoint; elapsed time never changes teaching state.
  useEffect(() => {
    if (!lesson || state.phase === 'welcome' || !active) return;
    const i = currentLesson.questions.findIndex(
      (q) => q.id === state.questionId,
    );
    const reveal =
      state.visualState.kind === 'tree' && state.visualState.transfer
        ? state.visualState.reveal >= 3
          ? 10
          : 6
        : i === 0
          ? 2
          : i <= 2
            ? 4
            : i === 3
              ? 5
              : i === 4
                ? 6
                : i === 5
                  ? 9
                  : 10;
    setScene((x) => ({
      ...x,
      reveal,
      phase: state.phase === 'recap' ? 'recap' : 'teaching',
      preset: lesson.id.startsWith('ehs') ? 'interaction' : 'teaching',
    }));
  }, [
    active,
    state.questionId,
    state.phase,
    state.teaching.status,
    state.teaching.variant,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        if (askOpen) {
          setAskOpen(false);
          return;
        }
        if (library) {
          setLibrary(false);
          return;
        }
        if (settings) {
          setSettings(false);
          return;
        }
        overview();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [askOpen, library, settings]);
  function openReader(kind: 'source' | 'explanation') {
    previousReaderPause.current = state.paused;
    patch({ paused: true });
    setReader(kind);
  }
  function overview() {
    setScene((x) => ({
      ...x,
      phase: state.phase === 'recap' ? 'recap' : 'arrival',
      preset: 'wide',
    }));
    patch({ sceneStation: 'desk' });
    setBubbleDismissed(false);
  }
  function station(id: Station) {
    window.__PETROS_WORLD_METRICS__?.stationClicks.push(id);
    if (!active) return;
    setBubbleDismissed(false);
    if (id === 'bookshelf') {
      setLibrary(true);
      setScene((x) => ({ ...x, phase: 'library', preset: 'wide' }));
    } else if (id === 'desk') {
      overview();
    } else if (!lesson) {
      setLibrary(true);
    } else {
      setScene((x) => ({
        ...x,
        phase: id === 'experiment' ? 'practice' : 'teaching',
        preset: id === 'experiment' ? 'interaction' : 'teaching',
      }));
    }
    patch({ sceneStation: id });
  }
  function retrieve(l: Lesson) {
    setLibrary(false);
    setPreview(null);
    setBubbleDismissed(false);
    if (l.id !== lesson?.id) onBook(l);
    else {
      setScene((x) => ({ ...x, phase: 'retrieving', preset: 'wide' }));
      patch({ sceneStation: 'bookshelf', paused: false });
    }
  }
  function beginTeaching() {
    if (!lesson) return;
    if (state.phase === 'welcome')
      patch((current) => goToCheckpoint(current, currentLesson, 0));
    setScene((x) => ({
      ...x,
      phase: 'teaching',
      preset: lesson.id.startsWith('ehs') ? 'interaction' : 'teaching',
      reveal: 2,
    }));
  }
  function chooseBook(l: Lesson) {
    setPreview(l);
    setLibrary(true);
    setScene((x) => ({ ...x, phase: 'library', preset: 'wide' }));
    patch({ sceneStation: 'bookshelf' });
  }
  function pick(id: string, value?: string) {
    if (!lesson || state.interruptionCheckpoint || askOpen) return;
    setToolsOpen(false);
    setPrecision(true);
    patch({ highlightTargetId: id });
    const v = state.visualState;
    if (v.kind === 'tree') {
      patch({ visualState: { ...v, selected: id } });
    }
    if (v.kind === 'hazards') {
      const h = HAZARDS.find((h) => h.id === id);
      if (h) {
        patch({
          visualState: {
            ...v,
            selected: id,
            inspected: [...new Set([...v.inspected, id])],
          },
          lastFeedback: `${h.label} · ${h.reason}`,
          cue: { kind: 'speech', text: h.reason },
        });
      }
    }
    if (v.kind === 'river' && POLLUTION.some((p) => p.id === id))
      patch({ visualState: { ...v, selected: id } });
    if (value) c.choose(value);
  }
  function tell(entity: string) {
    const v = state.visualState;
    if (v.kind !== 'kb') return;
    patch({
      visualState: {
        ...v,
        facts: [...new Set([...v.facts, `Bird(${entity})`])],
      },
      highlightTargetId: `Bird(${entity})`,
    });
    setScene((x) => ({ ...x, reveal: 4 }));
    if (entity === 'Tweety') c.choose('TELL Bird(Tweety)');
  }
  function apply(entity: string) {
    const v = state.visualState;
    if (v.kind !== 'kb') return;
    const query = `HasWings(${entity})`,
      result = entail(v.facts, query);
    if (result.status !== 'entailed') {
      patch({
        lastFeedback: `TELL Bird(${entity}) first; this rule needs that actual premise.`,
      });
      return;
    }
    patch({
      visualState: { ...v, derived: [...new Set([...v.derived, query])] },
      highlightTargetId: query,
    });
    c.choose(query);
  }
  function query(query: string) {
    const v = state.visualState;
    if (v.kind !== 'kb') return;
    const answer = entail(v.facts, query);
    patch({
      visualState: { ...v, query },
      highlightTargetId: query,
      lastFeedback: `${query}: ${answer.status}. ${answer.path.join(' → ')}`,
    });
  }
  function positionCloud(avatar: AvatarProjection) {
    const el = bubble.current;
    if (!el) return;
    const canvas = document
      .querySelector('[data-world-scene] canvas')
      ?.getBoundingClientRect();
    if (!canvas) return;
    const toRect = (r: DOMRect): Rect => ({
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
    });
    const board = (window as any).__PETROS_BOARD__?.rect;
    const obstacles: Rect[] = Array.from(
      document.querySelectorAll('[data-world-obstacle]'),
    )
      .filter((e) => e !== el)
      .map((e) => toRect(e.getBoundingClientRect()));
    if (board && state.sceneStation === 'board')
      obstacles.push({
        x: canvas.left + board.x,
        y: canvas.top + board.y,
        w: board.w,
        h: board.h,
      });
    if (state.sceneStation === 'experiment') {
      const model = (window as any).__PETROS_EXPERIMENT_RECT__;
      if (model)
        obstacles.push({
          x: canvas.left + model.x,
          y: canvas.top + model.y,
          w: model.w,
          h: model.h,
        });
    }
    const placement = placeCloud(
      avatar,
      { w: el.offsetWidth, h: el.offsetHeight },
      {
        x: canvas.left + 12,
        y: canvas.top + 12,
        w: canvas.width - 24,
        h: canvas.height - 24,
      },
      obstacles,
    );
    const dock = placement.docked || window.innerWidth < 800;
    el.dataset.docked = String(dock);
    const main = el.closest('main');
    if (main) main.dataset.cloudDocked = String(dock);
    el.dataset.tail = placement.side;
    el.style.setProperty('--tail-y', String(placement.vertical ?? 0) + 'px');
    el.dataset.avatarVisible = String(avatar.visible);
    if (dock) {
      el.style.left = '';
      el.style.top = '';
    } else {
      el.style.left = placement.x + 'px';
      el.style.top = placement.y + 'px';
    }
    el.style.setProperty('--tail', placement.tail + 'px');
  }
  async function askWorld(text: string) {
    await onAsk(text);
  }
  const teaching = ['teaching', 'practice'].includes(scene.phase) && !!lesson;
  // The shared teaching surface owns teaching captions. The avatar cloud is only for arrival.
  const plan = teachingPlan(state, currentLesson, c.base);
  const spoken =
    state.cue?.text ??
    (teaching
      ? state.teaching.status === 'INTRODUCING'
        ? plan.introduction
        : state.teaching.status === 'DEMONSTRATING'
          ? plan.demonstration
          : state.teaching.status === 'RETEACHING'
            ? plan.simpler
            : state.lastFeedback || c.q.task
      : greeting(lesson, state));
  const shortSpoken = spoken.length > 210 ? spoken.slice(0, 207) + '…' : spoken;
  const sourcePages = state.sourcePages.length
    ? state.sourcePages
    : (lesson?.questions[0]?.pages ?? []);
  const allCount = Object.values(state.completion).filter(
    (x) => x.outcome !== 'skipped',
  ).length;
  return (
    <main
      className={s.world}
      data-tools-open={toolsOpen}
      data-world-typeface
      data-world-phase={scene.phase}
      data-question-id={state.questionId}
      data-teaching-state={state.teaching.status}
      data-reveal={scene.reveal}
      data-paused={state.paused}
      data-preset={scene.preset}
      data-lesson={lesson?.id ?? 'none'}
      data-camera-moving={cameraBusy}
      aria-label="Petros World immersive study"
      onFocusCapture={(e) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          setFocused(true);
      }}
      onBlurCapture={(e) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          setFocused(false);
      }}
    >
      <div className={s.atmosphere} />
      <BoardSemantics
        state={state}
        frame={{
          reveal: scene.reveal,
          visible: teaching,
          caption: '',
        }}
      />
      <div className={s.canvasStage} data-world-scene>
        {supported && fontsReady && !lost ? (
          <Canvas
            key={recovery}
            shadows={!economy}
            dpr={economy ? 1 : [1, 1.5]}
            frameloop="demand"
            camera={{
              position: [-0.1, 1.67, 3.35],
              fov: 50,
              near: 0.05,
              far: 40,
            }}
            gl={{
              antialias: true,
              preserveDrawingBuffer: true,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.setClearColor('#d9dfd0');
              gl.toneMappingExposure = 1;
              gl.domElement.addEventListener(
                'webglcontextlost',
                (e) => {
                  e.preventDefault();
                  setLost(true);
                },
                { once: true },
              );
            }}
            aria-label="Interactive study room with library, teaching board and experiment table"
          >
            <Suspense fallback={null}>
              <Scene
                state={state}
                scene={scene}
                reduced={reduced}
                frozen={focused || precision || !active}
                caption={''}
                progress={1}
                previewId={preview?.id}
                onReady={() => {
                  if (!readySent.current) {
                    readySent.current = true;
                    onStatus('Your study is ready.');
                    onReady();
                  }
                }}
                onBookArrived={() =>
                  setScene((x) =>
                    x.phase === 'retrieving' ? { ...x, phase: 'book' } : x,
                  )
                }
                onStation={station}
                onBook={chooseBook}
                onPick={pick}
                onAnchor={positionCloud}
                onCamera={setCameraBusy}
              />
            </Suspense>
          </Canvas>
        ) : null}
      </div>
      <header className={s.topHud} data-world-obstacle>
        <button className={s.exit} onClick={onClassic}>
          <ArrowLeft size={17} /> Exit Petros World
        </button>
        <div className={s.currentTopic}>
          <span>PETROS’S STUDY</span>
          <strong>{lesson?.title ?? 'A space for your curiosity'}</strong>
          <small>
            {lesson?.module
              ? `${lesson.subject} · Module ${lesson.module}`
              : 'Choose a source or a curiosity notebook'}
          </small>
        </div>
        <button
          aria-label="Accessibility and preferences"
          className={s.iconButton}
          onClick={() => setSettings(!settings)}
        >
          <Settings2 size={19} />
        </button>
      </header>
      {active &&
        supported &&
        !lost &&
        !bubbleDismissed &&
        !library &&
        !askOpen &&
        !teaching && (
          <div
            ref={bubble}
            className={s.speech}
            data-kind={state.cue?.kind ?? 'speech'}
            role="status"
          >
            <span>PETROS</span>
            <button
              aria-label="Dismiss World speech"
              onClick={() => setBubbleDismissed(true)}
            >
              ×
            </button>
            <p>{shortSpoken}</p>
          </div>
        )}
      {cameraBusy && active && (
        <button
          className={s.skipCamera}
          onClick={() =>
            setScene((x) => ({ ...x, skipCamera: x.skipCamera + 1 }))
          }
        >
          Skip camera transition
        </button>
      )}
      <button
        className={s.stationToggle}
        aria-label="Choose a station"
        onClick={() => setNavOpen(!navOpen)}
      >
        Stations
      </button>
      <nav
        data-open={navOpen}
        className={s.stations}
        aria-label="World stations"
      >
        {(
          [
            { id: 'desk', label: 'Desk' },
            { id: 'bookshelf', label: 'Library' },
            { id: 'board', label: 'Whiteboard' },
            { id: 'experiment', label: 'Experiment' },
          ] as const
        ).map((item, i) => (
          <button
            key={item.id}
            aria-pressed={state.sceneStation === item.id}
            onClick={() => {
              station(item.id);
              setNavOpen(false);
            }}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            {item.label}
          </button>
        ))}
      </nav>
      {(scene.phase === 'arrival' || scene.phase === 'library') && !library && (
        <section className={s.arrival}>
          <span className={s.kicker}>WELCOME TO PETROS WORLD</span>
          <p>Your place is saved. Let’s find our source.</p>
          <button
            className={s.primary}
            disabled={state.paused}
            onClick={() => {
              setScene((x) => ({ ...x, phase: 'library', preset: 'wide' }));
              patch({ sceneStation: 'bookshelf' });
              setLibrary(true);
              setPreview(lesson ?? null);
            }}
          >
            {lesson ? 'Find my module' : 'Explore the library'}{' '}
            <ChevronRight size={17} />
          </button>
        </section>
      )}
      {scene.phase === 'retrieving' && (
        <div className={s.bookJourney} role="status">
          <BookOpen size={19} />
          <span>
            Retrieving{' '}
            {lesson?.module
              ? `${lesson.subject} · Module ${lesson.module}`
              : 'your curiosity notebook'}
            <small>The 3D book is moving to the reading stand.</small>
          </span>
        </div>
      )}
      {scene.phase === 'book' && lesson && (
        <section className={s.bookCard}>
          <span className={s.kicker}>
            {lesson.general ? 'CURIOSITY NOTEBOOK' : 'YOUR SOURCE BOOK'}
          </span>
          <h2>
            {lesson.module
              ? `Module ${lesson.module} · source ready`
              : 'Curiosity notebook ready'}
          </h2>
          <p>
            {lesson.subject}
            {lesson.module ? ` · Module ${lesson.module}` : ''}
          </p>
          <small>
            {lesson.filename ?? 'Prepared general-knowledge lesson'}
            {sourcePages.length ? ` · pp. ${sourcePages.join(', ')}` : ''}
          </small>
          <button className={s.primary} onClick={beginTeaching}>
            {state.phase === 'welcome'
              ? 'Let me show you'
              : 'Continue this lesson'}{' '}
            <ChevronRight size={17} />
          </button>
        </section>
      )}
      {teaching && question && !askOpen && !library && !settings && (
        <>
          <div
            data-world-obstacle
            className={s.questionDock}
            aria-label="World guided checkpoint"
          >
            <TeachingCycle state={state} lesson={lesson} patch={patch} />
          </div>
          {toolsOpen && (
            <WorldTools
              state={state}
              patch={(update) => {
                patch(update);
                if (state.visualState.kind === 'hazards') {
                  setPrecision(true);
                  setToolsOpen(false);
                }
              }}
              pick={pick}
              tell={tell}
              apply={apply}
              query={query}
            />
          )}
        </>
      )}
      {(scene.phase === 'recap' || state.phase === 'recap') && lesson && (
        <section className={s.recap}>
          <span className={s.kicker}>BACK AT THE DESK</span>
          <h2>Ideas to take with you.</h2>
          <p>
            {allCount} / {lesson.questions.length} checkpoints explored.{' '}
            {Object.values(state.completion).filter((x) => x.help > 0).length}{' '}
            used help.
          </p>
          <p>
            {[
              ...new Set(
                lesson.questions
                  .filter(
                    (q) =>
                      state.completion[q.id]?.outcome &&
                      state.completion[q.id]?.outcome !== 'skipped',
                  )
                  .map((q) => q.concept),
              ),
            ].join(' · ')}
          </p>
          <small>Practice recap · no mastery or certification claim</small>
          <button
            className={s.primary}
            onClick={() => {
              setLibrary(true);
              setScene((x) => ({ ...x, phase: 'library', preset: 'wide' }));
            }}
          >
            Choose another book
          </button>
        </section>
      )}
      <footer className={s.bottomHud} data-world-obstacle>
        <button
          aria-pressed={state.paused}
          disabled={!!state.pendingRequest}
          onClick={() =>
            patch((current) =>
              current.paused && current.interruptionCheckpoint
                ? resume(current)
                : { ...current, paused: !current.paused },
            )
          }
        >
          {state.paused ? <Play size={16} /> : <Pause size={16} />}
          {state.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          className={s.askButton}
          onClick={() => {
            setAskOpen(true);
            patch({ paused: true });
          }}
        >
          <MessageCircle size={17} /> Ask Petros anything
        </button>
        <button onClick={overview}>
          <Eye size={16} /> Room overview
        </button>
        {teaching && (
          <button
            aria-pressed={toolsOpen}
            onClick={() => {
              setPrecision(false);
              setToolsOpen(!toolsOpen);
            }}
          >
            <Settings2 size={16} />
            {toolsOpen ? 'Close model tools' : 'Model tools'}
          </button>
        )}
        {lesson?.filename && (
          <button onClick={() => openReader('source')} aria-label="Read source">
            Source · {sourcePages.join(', ')}
          </button>
        )}
        {teaching && !lesson?.id.startsWith('ehs') && (
          <button
            onClick={() => {
              previousFocusPause.current = state.paused;
              setFocusBoard(true);
              patch({ paused: true });
            }}
          >
            Focus board
          </button>
        )}
        <span>Text-led teaching</span>
      </footer>
      {notice && (
        <div className={s.toast} role="status">
          {notice}
          <button aria-label="Dismiss World notice" onClick={onDismissNotice}>
            ×
          </button>
        </div>
      )}
      {library && (
        <section className={s.libraryDrawer} aria-label="World library">
          <header>
            <div>
              <span className={s.kicker}>THE LEARNING LIBRARY</span>
              <h2>A book for your next idea.</h2>
            </div>
            <button
              aria-label="Close library"
              onClick={() => setLibrary(false)}
            >
              <X size={19} />
            </button>
          </header>
          <div className={s.bookShelf}>
            {lessons
              .filter((l) => !l.general)
              .map((l) => (
                <button
                  key={l.id}
                  aria-pressed={preview?.id === l.id}
                  onClick={() => setPreview(l)}
                  className={l.id.startsWith('ai') ? s.aiBook : s.ehsBook}
                >
                  <span>
                    {l.id.startsWith('ai')
                      ? 'ARTIFICIAL INTELLIGENCE'
                      : 'ENVIRONMENT & SAFETY'}
                  </span>
                  <strong>Module {l.module}</strong>
                  <small>{l.title}</small>
                </button>
              ))}
          </div>
          {preview && (
            <div className={s.bookDetails}>
              <span>
                {preview.subject}{' '}
                {preview.module ? `/ Module ${preview.module}` : ''}
              </span>
              <h3>{preview.title}</h3>
              <p>
                {preview.filename ?? 'Prepared curiosity notebook'} ·{' '}
                {preview.questions.length} guided checkpoints
              </p>
              <button className={s.primary} onClick={() => retrieve(preview!)}>
                Retrieve this book <ChevronRight size={16} />
              </button>
            </div>
          )}
          <div className={s.curiosity}>
            <span className={s.kicker}>CURIOSITY NOTEBOOKS</span>
            {lessons
              .filter((l) => l.general)
              .map((l) => (
                <button key={l.id} onClick={() => retrieve(l)}>
                  {l.title} <ChevronRight size={16} />
                </button>
              ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onTopic(topicDraft);
              }}
            >
              <input
                aria-label="World open topic"
                maxLength={240}
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                placeholder="Another question on your mind?"
              />
              <button disabled={topicDraft.trim().length < 3}>Explore</button>
            </form>
            <small>Other topics require a qualified model connection.</small>
          </div>
        </section>
      )}
      {askOpen && (
        <section className={s.conversation} aria-label="World conversation">
          <header>
            <div>
              <span className={s.kicker}>PETROS IS LISTENING</span>
              <h2>Stay with the question.</h2>
            </div>
            <button
              aria-label="Close World conversation"
              onClick={() => setAskOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <p className={s.contextLabel}>
            {lesson?.title ?? 'Choose a lesson for contextual help'}{' '}
            {state.highlightTargetId ? `· ${state.highlightTargetId}` : ''}
          </p>
          <div className={s.turns}>
            {state.conversationHistory.map((turn, i) => (
              <div key={i} data-role={turn.role}>
                <small>{turn.label}</small>
                <p>{turn.text}</p>
              </div>
            ))}
          </div>
          <div className={s.quickQuestions}>
            {[
              'Explain more simply',
              'Why this step?',
              'Give me another example',
            ].map((t) => (
              <button
                key={t}
                disabled={!!state.pendingRequest || !lesson}
                onClick={() => void askWorld(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askWorld(state.askDraft);
            }}
          >
            <textarea
              autoFocus
              aria-label="Ask Petros anything"
              rows={2}
              maxLength={1200}
              value={state.askDraft}
              onChange={(e) => patch({ askDraft: e.target.value })}
              placeholder="Ask about the highlighted node or what you can see…"
            />
            <button
              className={s.primary}
              disabled={
                !!state.pendingRequest || !state.askDraft.trim() || !lesson
              }
            >
              {state.pendingRequest
                ? 'Considering your question…'
                : 'Ask Petros'}
            </button>
          </form>
          <small>
            Source-linked explanations are labelled prepared. Broader live AI
            may be unavailable.
          </small>
          <button
            className={s.continue}
            disabled={!!state.pendingRequest}
            onClick={() => {
              patch((current) => resume(current));
              setAskOpen(false);
              setScene((x) => ({ ...x, phase: 'teaching' }));
            }}
          >
            Continue lesson · same checkpoint <ChevronRight size={16} />
          </button>
        </section>
      )}
      {focusBoard && (
        <FocusBoard
          state={state}
          frame={{ reveal: scene.reveal, visible: true, caption: shortSpoken }}
          onPick={pick}
          onClose={() => {
            setFocusBoard(false);
            patch({ paused: previousFocusPause.current });
          }}
        />
      )}
      {settings && (
        <section className={s.preferences} aria-label="World preferences">
          <header>
            <h2>Your study, your pace.</h2>
            <button
              aria-label="Close preferences"
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </button>
          </header>
          <button aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
            Reduced motion {reduced ? 'on' : 'off'}
          </button>
          <button aria-pressed={economy} onClick={() => setEconomy(!economy)}>
            Graphics: {economy ? 'lighter' : 'detailed'}
          </button>
          <p>
            Captions on. Voice is unavailable. Camera motion stops while you
            type. Petros uses static original poses and scene fades.
          </p>
          {lesson && (
            <>
              <h3>Lesson checkpoints</h3>
              <div className={s.checkpointList}>
                {lesson.questions.map((q, i) => (
                  <button
                    key={q.id}
                    aria-current={
                      q.id === state.questionId ? 'step' : undefined
                    }
                    onClick={() => {
                      c.question(i);
                      setSettings(false);
                      setScene((x) => ({
                        ...x,
                        phase: 'teaching',
                        preset: lesson.id.startsWith('ehs')
                          ? 'interaction'
                          : 'teaching',
                        reveal: 0,
                      }));
                    }}
                  >
                    {i + 1}. {q.concept}
                    {state.completion[q.id]
                      ? state.completion[q.id]?.outcome === 'skipped'
                        ? ' · skipped'
                        : ' · explored'
                      : ''}
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={() => openReader('explanation')}>
            Read a full explanation
          </button>
        </section>
      )}
      {reader && lesson && question && (
        <Reader
          lesson={lesson}
          question={question}
          kind={reader}
          onClose={() => {
            setReader(null);
            patch({ paused: previousReaderPause.current });
          }}
        />
      )}
      {((!supported && supported !== null) || lost) && (
        <div className={s.failure} role="alert">
          <h2>
            {lost
              ? 'The 3D canvas was interrupted.'
              : 'This device cannot open the study.'}
          </h2>
          <p>Your lesson and drafts are preserved.</p>
          {lost && (
            <button
              onClick={() => {
                readySent.current = false;
                setLost(false);
                setRecovery((x) => x + 1);
              }}
            >
              Try the room again
            </button>
          )}
          <button onClick={onClassic}>Back to Classic</button>
        </div>
      )}
    </main>
  );
}
function WorldTools({
  state,
  patch,
  pick,
  tell,
  apply,
  query,
}: {
  state: ShowcaseState;
  patch: Patch;
  pick: (id: string, value?: string) => void;
  tell: (e: string) => void;
  apply: (e: string) => void;
  query: (e: string) => void;
}) {
  const v = state.visualState;
  const qi = Number(state.questionId?.slice(-2) ?? 1);
  return (
    <aside className={s.tools} aria-label="In-world activity controls">
      {v.kind === 'tree' ? (
        <>
          <span>INSPECT THE TREE</span>
          <button onClick={() => pick('root')}>Inspect MAX</button>
          {['A', 'B', 'C'].map((name, i) => (
            <button key={name} onClick={() => pick(`branch-${i}`)}>
              Inspect MIN {name}
            </button>
          ))}
          {qi >= 8 && (
            <>
              <button
                onClick={() =>
                  patch({
                    visualState: {
                      ...v,
                      pruneStep: Math.min(6, v.pruneStep + 1),
                    },
                  })
                }
              >
                Step pruning
              </button>
              <p>
                {
                  alphaBeta(activeTree(v))
                    .events.slice(0, v.pruneStep)
                    .filter((e) => !e.skipped).length
                }{' '}
                evaluated ·{' '}
                {
                  alphaBeta(activeTree(v))
                    .events.slice(0, v.pruneStep)
                    .filter((e) => e.skipped).length
                }{' '}
                skipped
              </p>
            </>
          )}
        </>
      ) : v.kind === 'kb' ? (
        <>
          <span>FACTS → RULE → CONCLUSION</span>
          <button onClick={() => tell('Tweety')}>TELL Bird(Tweety)</button>
          <button onClick={() => tell('Rio')}>TELL Bird(Rio)</button>
          <button onClick={() => apply('Tweety')}>Apply rule · Tweety</button>
          {v.facts.includes('Bird(Rio)') && (
            <button onClick={() => apply('Rio')}>Apply rule · Rio</button>
          )}
          <button onClick={() => query('HasWings(Tweety)')}>
            ASK HasWings(Tweety)?
          </button>
          <button onClick={() => query('CanFly(Tweety)')}>
            ASK CanFly(Tweety)?
          </button>
        </>
      ) : v.kind === 'hazards' ? (
        <>
          <span>INSPECT THE MODEL</span>
          <div className={s.smallTools}>
            <button
              aria-label="Rotate model left"
              disabled={(v.angle ?? 0) <= -0.4}
              onClick={() =>
                patch({
                  visualState: {
                    ...v,
                    angle: Math.max(-0.4, (v.angle ?? 0) - 0.2),
                  },
                })
              }
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Rotate model right"
              disabled={(v.angle ?? 0) >= 0.4}
              onClick={() =>
                patch({
                  visualState: {
                    ...v,
                    angle: Math.min(0.4, (v.angle ?? 0) + 0.2),
                  },
                })
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            aria-pressed={v.safer}
            onClick={() => {
              const h = HAZARDS.find((h) => h.id === v.selected) ?? HAZARDS[0];
              patch({
                visualState: { ...v, safer: !v.safer },
                cue: {
                  kind: 'speech',
                  text: !v.safer
                    ? h.reason
                    : 'Compare the original exposed model with the safer changes.',
                },
                lastFeedback: !v.safer
                  ? h.reason
                  : 'Original configuration restored for comparison.',
              });
            }}
          >
            {v.safer ? 'Show before' : 'Show safer setup'}
          </button>
          {state.questionId === 'EHS3-Q11' ? (
            <button
              onClick={() =>
                pick('excavation', 'Unsupported sidewall / collapse risk')
              }
            >
              Inspect unsupported sidewall
            </button>
          ) : (
            HAZARDS.map((h, i) => (
              <button
                key={h.id}
                aria-pressed={v.selected === h.id}
                onClick={() => pick(h.id, h.label)}
              >
                {i + 1}. {h.label}
              </button>
            ))
          )}
        </>
      ) : v.kind === 'river' ? (
        <>
          <span>CONTROL EACH PATHWAY</span>
          {POLLUTION.map((p) => (
            <button
              key={p.id}
              aria-pressed={v.controls.includes(p.id)}
              onClick={() =>
                patch({
                  visualState: {
                    ...v,
                    selected: p.id,
                    controls: v.controls.includes(p.id)
                      ? v.controls.filter((c) => c !== p.id)
                      : [...v.controls, p.id],
                  },
                  lastFeedback: `${p.label}: ${p.reason} Source p. ${p.page}.`,
                })
              }
            >
              {v.controls.includes(p.id) ? '✓' : '+'} {p.control}
            </button>
          ))}
          <small>Qualitative illustration · no drinking-safety claim</small>
        </>
      ) : v.kind === 'network' ? (
        <>
          <span>ONE TINY MODEL</span>
          <label>
            Input {v.input}
            <input
              aria-label="World model input"
              type="range"
              min="1"
              max="5"
              step="1"
              value={v.input}
              onChange={(e) =>
                patch({ visualState: { ...v, input: Number(e.target.value) } })
              }
            />
          </label>
          <label>
            Weight {v.weight.toFixed(1)}
            <input
              aria-label="World connection weight"
              type="range"
              min="0"
              max="2"
              step=".1"
              value={v.weight}
              onChange={(e) =>
                patch({
                  visualState: { ...v, weight: Number(e.target.value) },
                  ...(Number(e.target.value) === 1.5 && v.input === 2
                    ? { studentResponse: 'Weight set to 1.5' }
                    : {}),
                })
              }
            />
          </label>
          <small>Illustrative multiplication, not an LLM.</small>
        </>
      ) : (
        <>
          <span>SIMPLIFIED RELATIVITY</span>
          <label>
            Speed {v.speed.toFixed(1)}c
            <input
              aria-label="World traveler speed"
              type="range"
              min="0"
              max=".9"
              step=".1"
              value={v.speed}
              onChange={(e) =>
                patch({ visualState: { ...v, speed: Number(e.target.value) } })
              }
            />
          </label>
          <button
            onClick={() =>
              patch({ visualState: { ...v, speed: 0.6, earthYears: 10 } })
            }
          >
            Try 0.6c
          </button>
          <button
            onClick={() =>
              patch({ visualState: { ...v, speed: 0.8, earthYears: 10 } })
            }
          >
            Try 0.8c
          </button>
          <small>Constant-speed segment; no established backward travel.</small>
        </>
      )}
    </aside>
  );
}
