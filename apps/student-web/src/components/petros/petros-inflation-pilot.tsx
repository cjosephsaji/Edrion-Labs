'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Lightbulb,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import {
  PETROS_INFLATION_PILOT,
  PETROS_PILOT_SCENES,
  type PetrosLearningSessionDocument,
  type PetrosPilotAction,
  type PetrosPilotScene,
} from '@edrion/schemas';
import {
  formatApiError,
  newIdempotencyKey,
  StudentApiError,
  useStudentApi,
} from '@/lib/api-client';
import { usePetrosVoice } from './use-petros-voice';
import styles from './petros-inflation-pilot.module.css';

type Action = PetrosPilotAction extends infer T
  ? T extends PetrosPilotAction
    ? Omit<T, 'idempotencyKey' | 'expectedVersion'>
    : never
  : never;
type Session = PetrosLearningSessionDocument;

function Basket({
  after,
  single = false,
}: {
  after: boolean;
  single?: boolean;
}) {
  const amounts = after ? (single ? [40, 40, 30] : [33, 44, 33]) : [30, 40, 30];
  return (
    <div className={styles.basket} data-pilot-anchor={after ? 'right' : 'left'}>
      <span className={styles.smallLabel}>{after ? 'Today' : 'Before'}</span>
      <div className={styles.groceries} aria-hidden="true">
        <span>◒</span>
        <span>▥</span>
        <span>◕</span>
      </div>
      {['Tomatoes', 'Rice', 'Other food'].map((label, i) => (
        <div className={styles.priceRow} key={label}>
          <span>{label}</span>
          <b>₹{amounts[i]}</b>
        </div>
      ))}
      <div className={styles.basketTotal}>
        <span>Same quantities</span>
        <strong>₹{amounts.reduce((a, b) => a + b, 0)}</strong>
      </div>
    </div>
  );
}

export function PilotVisual({
  scene,
  value,
  onValue,
  disabled,
}: {
  scene: PetrosPilotScene;
  value: number;
  onValue: (value: number) => void;
  disabled: boolean;
}) {
  if (scene.id === 'basket' || scene.id === 'definition')
    return (
      <div className={styles.basketPair}>
        <Basket after={false} />
        <span className={styles.betweenArrow}>
          <ArrowRight aria-label="Compare prices" />
        </span>
        <Basket after single={scene.id === 'basket'} />
        <p className={styles.visualNote}>
          {scene.id === 'basket'
            ? 'One price changed. Is that the whole story?'
            : '₹100 → ₹110 · a 10% rise in this simplified basket'}
        </p>
      </div>
    );
  if (scene.id === 'demand' || scene.id === 'costs') {
    const demand = scene.id === 'demand';
    return (
      <div className={styles.experiment}>
        <div className={styles.market}>
          <div data-pilot-anchor="left">
            <span className={styles.smallLabel}>
              {demand ? 'Spending demand' : 'Energy costs'}
            </span>
            <div className={styles.barTrack}>
              <div style={{ height: `${35 + value * 28}%` }} />
            </div>
            <strong>{['Steady', 'Higher', 'Much higher'][value]}</strong>
          </div>
          <div data-pilot-anchor="right">
            <span className={styles.smallLabel}>
              {demand ? 'Available supply' : 'Spending demand'}
            </span>
            <div className={styles.barTrack}>
              <div className={styles.fixedBar} style={{ height: '35%' }} />
            </div>
            <strong>Held steady</strong>
          </div>
        </div>
        <label className={styles.sliderLabel}>
          {demand ? 'Change demand' : 'Change energy costs'}
          <input
            type="range"
            min="0"
            max="2"
            step="1"
            value={value}
            onChange={(e) => onValue(Number(e.target.value))}
            disabled={disabled}
          />
        </label>
        <p className={styles.pressure} aria-live="polite">
          {value === 0
            ? 'Start with steady conditions.'
            : demand
              ? '↑ More demand meets limited supply: upward price pressure.'
              : '↑ Higher input costs: upward price pressure, depending on pass-through.'}
        </p>
        <p className={styles.visualNote}>
          An illustration of a mechanism, not a numerical forecast.
        </p>
      </div>
    );
  }
  if (scene.id === 'consequences')
    return (
      <div className={styles.consequences}>
        <div className={styles.indexChart}>
          {[100, 110, 115.5].map((n, i) => (
            <div
              key={n}
              data-pilot-anchor={
                i === 0 ? 'left' : i === 1 ? 'center' : 'right'
              }
            >
              <strong>{n}</strong>
              <span style={{ height: `${(n - 75) * 2.5}px` }} />
              <small>{['Start', 'Year 1', 'Year 2'][i]}</small>
            </div>
          ))}
        </div>
        <div className={styles.rateLabels}>
          <span>
            +10%<small>First year</small>
          </span>
          <ArrowRight aria-hidden="true" />
          <span>
            +5%<small>Second year</small>
          </span>
        </div>
        <div className={styles.factCards}>
          <p>
            <b>Fixed salary</b>Higher prices → less purchasing power
          </p>
          <p>
            <b>Fixed nominal debt</b>Unexpected inflation can reduce the real
            burden of repayments
          </p>
        </div>
        <p className={styles.visualNote}>
          Price index · illustrative values · other conditions held equal
        </p>
      </div>
    );
  return (
    <div className={styles.connectionMap}>
      <div className={styles.mapCauses}>
        <button
          type="button"
          aria-pressed={value === 0}
          data-pilot-anchor="left"
          onClick={() => onValue(0)}
          disabled={disabled}
        >
          Demand outpaces supply
        </button>
        <button
          type="button"
          aria-pressed={value === 1}
          data-pilot-anchor="right"
          onClick={() => onValue(1)}
          disabled={disabled}
        >
          Production costs rise
        </button>
      </div>
      <div className={styles.mapArrows} aria-hidden="true">
        ↘ <span>↙</span>
      </div>
      <button
        type="button"
        className={styles.mapCenter}
        data-pilot-anchor="center"
        aria-pressed={value === 2}
        onClick={() => onValue(2)}
        disabled={disabled}
      >
        General price level rises
      </button>
      <div className={styles.mapDown} aria-hidden="true">
        ↓
      </div>
      <div className={styles.mapResult}>Fixed money buys less</div>
      <p className={styles.mapCaption} aria-live="polite">
        {
          [
            'Demand-pull: aggregate spending grows faster than supply can respond.',
            'Cost-push: higher input costs can constrain supply and raise prices.',
            'Purchasing power: the same nominal amount buys fewer goods and services.',
          ][value]
        }
      </p>
    </div>
  );
}

export function PetrosInflationPilot({ sessionId }: { sessionId?: string }) {
  const api = useStudentApi();
  const [session, setSession] = useState<Session | null>(null);
  const doc = useRef<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [legacySession, setLegacySession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState('Saving…');
  const locked = useRef(false);
  const pendingAction = useRef(false);
  const retry = useRef<{
    signature: string;
    body: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [value, setValue] = useState(0);
  const edits = useRef({ draft: '', value: 0 });
  const [notebook, setNotebook] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [target, setTarget] = useState<'left' | 'center' | 'right'>('center');
  const [moving, setMoving] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const [targetPosition, setTargetPosition] = useState<number | string>('49%');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(newIdempotencyKey());
  const voice = usePetrosVoice((text) => {
    setQuestion(text);
    setAsking(true);
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const apply = useCallback((next: Session, hydrate = false) => {
    const changed =
      doc.current?.pilot?.scene !== next.pilot?.scene ||
      doc.current?.id !== next.id;
    doc.current = next;
    setSession(next);
    if (next.pilot && (changed || hydrate)) {
      const scene = PETROS_PILOT_SCENES[next.pilot.scene]!;
      const progress = next.pilot.scenes[scene.id]!;
      edits.current = { draft: progress.draft, value: progress.value };
      setDraft(progress.draft);
      setValue(progress.value);
      setTarget(scene.target);
      setQuestion('');
      setAsking(false);
      voiceRef.current.stopSpeaking();
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    const abort = new AbortController();
    api
      .get<Session>(`/student/petros/sessions/${sessionId}`, abort.signal)
      .then((next) => {
        if (!next.pilot) {
          setLegacySession(true);
          throw new Error(
            'This is an existing lesson. Open it from your session history.',
          );
        }
        apply(next, true);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(formatApiError(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api, apply, sessionId, loadAttempt]);

  const send = useCallback(
    async (action: Action) => {
      const current = doc.current!;
      const signature = JSON.stringify({ id: current.id, action });
      const body =
        retry.current?.signature === signature
          ? retry.current.body
          : {
              ...action,
              idempotencyKey: newIdempotencyKey(),
              expectedVersion: current.version,
            };
      retry.current = { signature, body };
      const next = await api.post<Session>(
        `/student/petros/sessions/${current.id}/pilot`,
        body,
      );
      retry.current = null;
      apply(next);
      return next;
    },
    [api, apply],
  );

  const save = useCallback(async () => {
    const current = doc.current;
    if (!current?.pilot || current.status !== 'active') return;
    const scene = PETROS_PILOT_SCENES[current.pilot.scene]!;
    const progress = current.pilot.scenes[scene.id]!;
    const latest = { ...edits.current };
    if (progress.draft !== latest.draft || progress.value !== latest.value)
      await send({ action: 'save', scene: scene.id, ...latest });
  }, [send]);

  const perform = useCallback(
    async (action: Action | 'pause' | 'resume' | 'autosave') => {
      if (action === 'autosave' && (locked.current || pendingAction.current))
        return;
      if (action !== 'autosave') {
        if (pendingAction.current) return;
        pendingAction.current = true;
        setBusy(true);
        setActivity(
          typeof action !== 'string' && action.action === 'answer'
            ? 'Checking your thinking…'
            : 'Saving…',
        );
        voiceRef.current.stopSpeaking();
        if (
          action === 'pause' ||
          action === 'resume' ||
          (typeof action !== 'string' &&
            ['navigate', 'advance'].includes(action.action))
        )
          voiceRef.current.cancelListening();
        // Finish an autosave before committing the student's next action.
        while (locked.current)
          await new Promise((resolve) => setTimeout(resolve, 50));
      }
      locked.current = true;
      if (action !== 'autosave') setBusy(true);
      setError('');
      try {
        await save();
        if (action === 'pause' || action === 'resume') {
          voiceRef.current.stopSpeaking();
          voiceRef.current.cancelListening();
          apply(
            await api.post<Session>(
              `/student/petros/sessions/${doc.current!.id}/${action}`,
              { idempotencyKey: newIdempotencyKey() },
            ),
          );
        } else if (action !== 'autosave') {
          if (action.action !== 'save') voiceRef.current.stopSpeaking();
          await send(action);
          if (action.action === 'advance' || action.action === 'navigate') {
            setNotebook(false);
            requestAnimationFrame(() => titleRef.current?.focus());
          }
        }
      } catch (e) {
        setError(formatApiError(e));
        if (e instanceof StudentApiError && e.status === 409 && doc.current) {
          retry.current = null;
          try {
            apply(
              await api.get<Session>(
                `/student/petros/sessions/${doc.current.id}`,
              ),
            );
          } catch {
            /* Keep local work visible. */
          }
        }
      } finally {
        locked.current = false;
        if (action !== 'autosave') pendingAction.current = false;
        setBusy(pendingAction.current);
      }
    },
    [api, apply, save, send],
  );

  useEffect(() => {
    if (!session?.pilot || session.status !== 'active') return;
    const timer = setTimeout(() => {
      void perform('autosave');
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, value, session, perform]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const current = doc.current;
      if (!current?.pilot || current.status !== 'active') return;
      const progress =
        current.pilot.scenes[PETROS_PILOT_SCENES[current.pilot.scene]!.id]!;
      if (
        progress.draft !== edits.current.draft ||
        progress.value !== edits.current.value ||
        locked.current
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const sceneIndex = session?.pilot?.scene;
  useEffect(() => {
    if (
      sceneIndex === undefined ||
      session?.status !== 'active' ||
      session.pilot?.mode !== 'voice' ||
      asking
    )
      return;
    const scene = PETROS_PILOT_SCENES[sceneIndex]!;
    void voiceRef.current.speak(`${scene.introduction} ${scene.explanation}`);
    return () => voiceRef.current.stopSpeaking();
  }, [sceneIndex, session?.status, session?.pilot?.mode, asking]);

  useEffect(() => {
    setMoving(true);
    const timer = setTimeout(() => setMoving(false), 650);
    return () => clearTimeout(timer);
  }, [target]);

  useEffect(() => {
    const measure = () => {
      const lane = laneRef.current?.getBoundingClientRect();
      const anchor = visualRef.current
        ?.querySelector(`[data-pilot-anchor="${target}"]`)
        ?.getBoundingClientRect();
      if (lane?.width && anchor)
        setTargetPosition(
          Math.max(
            55,
            Math.min(
              lane.width - 55,
              anchor.left + anchor.width / 2 - lane.left,
            ),
          ),
        );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    if (laneRef.current) observer?.observe(laneRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [target, sceneIndex]);

  useEffect(() => {
    if (voice.speaking)
      setTarget(voice.speechProgress < 0.45 ? 'left' : 'right');
  }, [voice.speaking, voice.speechProgress]);

  async function leave() {
    if (locked.current || pendingAction.current) return;
    locked.current = true;
    setBusy(true);
    voice.stopSpeaking();
    voice.cancelListening();
    try {
      await save();
      window.location.assign('/petros');
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function start(mode: 'voice' | 'text') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await api.post<Session>('/student/petros/sessions', {
        clientRequestId: requestId.current,
        experience: PETROS_INFLATION_PILOT,
        topic: 'Inflation: causes, purchasing power and the price level',
        goal: 'Explain inflation, compare its causes and apply the ideas to a new situation.',
        timeBudgetSeconds: 1200,
        maxMoves: 6,
        sourceContext: { door: 'student_portal', label: 'Inflation pilot' },
      });
      apply(next, true);
      window.history.replaceState(null, '', `/petros/pilot?session=${next.id}`);
      await send({ action: 'mode', mode });
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function edit(nextDraft: string, nextValue = value) {
    edits.current = { draft: nextDraft, value: nextValue };
    setDraft(nextDraft);
    setValue(nextValue);
  }
  const pilot = session?.pilot;
  const scene = PETROS_PILOT_SCENES[pilot?.scene ?? 0]!;
  const progress = pilot?.scenes[scene.id];
  const latest = progress?.attempts.at(-1);
  const checked =
    (progress?.outcome === 'independent' ||
      progress?.outcome === 'supported') &&
    latest?.answer === draft;
  const paused = session?.status === 'paused';
  const finished = pilot?.finished || session?.status === 'closed';
  const revisits = PETROS_PILOT_SCENES.filter(
    (item) => pilot?.scenes[item.id]?.outcome === 'unresolved',
  );
  const counts = { independent: 0, supported: 0, unresolved: 0 };
  Object.values(pilot?.scenes ?? {}).forEach((item) => {
    if (item.outcome !== 'unseen') counts[item.outcome]++;
  });

  if (loading)
    return (
      <div className={styles.loading} role="status">
        Opening your teaching stage…
      </div>
    );
  if (!pilot)
    return (
      <section className={styles.welcome}>
        <Link href="/petros" className={styles.back}>
          <ArrowLeft size={16} /> Back to Petros
        </Link>
        <div className={styles.welcomeContent}>
          <span className={styles.eyebrow}>PETROS / THE INFLATION PILOT</span>
          <h1>
            Why does everything
            <br />
            cost more?
          </h1>
          <p>
            A basket of groceries. Two different causes.
            <br />A new way to make sense of inflation.
          </p>
          <div className={styles.startActions}>
            <button
              className={styles.primary}
              onClick={() => void start('voice')}
              disabled={busy || Boolean(sessionId)}
            >
              <Volume2 size={18} /> Teach with voice
            </button>
            <button
              onClick={() => void start('text')}
              disabled={busy || Boolean(sessionId)}
            >
              <BookOpen size={18} /> Learn with text
            </button>
          </div>
          <span className={styles.welcomeNote}>
            About 15–20 minutes, at your pace. Switch modes at any time.
          </span>
          {error && (
            <p role="alert" className={styles.error}>
              {error}{' '}
              {sessionId && legacySession && (
                <Link href={`/petros/session?session=${sessionId}`}>
                  Open original session
                </Link>
              )}
              {sessionId && !legacySession && (
                <button
                  type="button"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  Retry loading
                </button>
              )}
            </p>
          )}
        </div>
        <Image
          className={styles.welcomePetros}
          src="/petros/states/petros-point-left.png"
          width={280}
          height={373}
          alt="Petros, your learning guide"
          priority
        />
        <div className={styles.welcomeStamp}>
          LOOK CLOSER.
          <br />
          MAKE IT CLICK.
        </div>
      </section>
    );

  return (
    <section className={styles.shell} aria-label="Inflation teaching stage">
      <header className={styles.header}>
        <Link
          href="/petros"
          className={styles.back}
          onClick={(e) => {
            e.preventDefault();
            void leave();
          }}
        >
          <ArrowLeft size={16} /> Petros
        </Link>
        <span className={styles.lessonName}>
          THE INFLATION LAB <small>with Petros</small>
        </span>
        <div className={styles.headerActions}>
          {!finished && (
            <button
              type="button"
              onClick={() => setNotebook(!notebook)}
              aria-expanded={notebook}
            >
              <BookOpen size={17} /> Notebook
            </button>
          )}
          {!finished && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void perform(paused ? 'resume' : 'pause')}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {finished ? (
        <div className={styles.summary}>
          <span className={styles.eyebrow}>YOUR LESSON NOTEBOOK</span>
          <h1>You’ve explored the story behind prices.</h1>
          <p>
            Here is what your answers showed today. This is a snapshot, not a
            claim of lasting mastery.
          </p>
          <div className={styles.evidenceCounts}>
            <span>
              <strong>{counts.independent}</strong>Independent checks
            </span>
            <span>
              <strong>{counts.supported}</strong>With support
            </span>
            <span>
              <strong>{counts.unresolved}</strong>To revisit
            </span>
          </div>
          <div className={styles.summaryTopics}>
            {PETROS_PILOT_SCENES.map((item) => (
              <article key={item.id}>
                {['independent', 'supported'].includes(
                  pilot.scenes[item.id]!.outcome,
                ) ? (
                  <Check size={18} />
                ) : (
                  <RotateCcw size={18} />
                )}
                <div>
                  <h2>{item.title}</h2>
                  <p>
                    {pilot.scenes[item.id]!.outcome === 'independent'
                      ? 'Explained independently'
                      : pilot.scenes[item.id]!.outcome === 'supported'
                        ? 'Explained with support'
                        : 'Revisit this idea'}
                  </p>
                  <details>
                    <summary>Your answer and feedback</summary>
                    <p>
                      {item.choices.find(
                        (choice) => choice.id === pilot.scenes[item.id]!.draft,
                      )?.label ||
                        pilot.scenes[item.id]!.draft ||
                        'No answer submitted.'}
                    </p>
                    <p>
                      {pilot.scenes[item.id]!.attempts.at(-1)?.feedback ||
                        item.hint}
                    </p>
                  </details>
                </div>
              </article>
            ))}
          </div>
          <Link
            href="/petros/pilot"
            className={styles.primary}
            onClick={() => {
              requestId.current = newIdempotencyKey();
              doc.current = null;
              setSession(null);
            }}
          >
            Try a fresh lesson <ArrowRight size={16} />
          </Link>
          <Link href="/petros">Back to Petros</Link>
        </div>
      ) : (
        <>
          {notebook && (
            <aside className={styles.notebook} aria-label="Lesson notebook">
              <div>
                <h2>Your ideas so far</h2>
                <button
                  onClick={() => setNotebook(false)}
                  aria-label="Close notebook"
                >
                  <X size={18} />
                </button>
              </div>
              {PETROS_PILOT_SCENES.map((item, index) => (
                <button
                  key={item.id}
                  disabled={index > pilot.unlocked || busy || paused}
                  onClick={() =>
                    void perform({ action: 'navigate', scene: index })
                  }
                  aria-current={pilot.scene === index ? 'step' : undefined}
                >
                  <span>{item.title}</span>
                  <small>
                    {index > pilot.unlocked
                      ? 'Ahead'
                      : pilot.scenes[item.id]!.outcome === 'independent'
                        ? 'Independent check'
                        : pilot.scenes[item.id]!.outcome === 'supported'
                          ? 'With support'
                          : pilot.scenes[item.id]!.outcome === 'unresolved'
                            ? 'To revisit'
                            : 'Exploring'}
                  </small>
                </button>
              ))}
            </aside>
          )}
          {paused && (
            <div className={styles.pauseBanner} role="status">
              <Pause size={20} />
              <div>
                <strong>Take your time.</strong>
                <p>
                  Your place and answers are saved. Resume whenever you’re
                  ready.
                </p>
              </div>
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() => void perform('resume')}
              >
                Resume lesson
              </button>
            </div>
          )}
          {!pilot.mode && (
            <div className={styles.pauseBanner}>
              <p>Choose how you want Petros to teach.</p>
              <button
                onClick={() => void perform({ action: 'mode', mode: 'voice' })}
              >
                With voice
              </button>
              <button
                onClick={() => void perform({ action: 'mode', mode: 'text' })}
              >
                With text
              </button>
            </div>
          )}
          <div className={styles.sceneHeading}>
            <div>
              <span className={styles.eyebrow}>{scene.eyebrow}</span>
              <h1 ref={titleRef} tabIndex={-1}>
                {scene.title}
              </h1>
            </div>
            <span className={styles.sceneNumber}>
              {String(pilot.scene + 1).padStart(2, '0')}
              <small>/ 06</small>
            </span>
          </div>
          <div className={styles.stageGrid}>
            <div className={styles.teachingSurface}>
              <p className={styles.introduction}>{scene.introduction}</p>
              <div
                ref={visualRef}
                className={styles.visual}
                data-target={target}
              >
                <PilotVisual
                  scene={scene}
                  value={value}
                  disabled={busy || paused}
                  onValue={(next) => {
                    edit(draft, next);
                    setTarget(
                      next === 0 ? 'left' : next === 1 ? 'right' : 'center',
                    );
                  }}
                />
              </div>
              <div
                ref={laneRef}
                className={styles.characterLane}
                aria-hidden="true"
              >
                <div
                  className={styles.character}
                  data-moving={moving}
                  data-pose={
                    voice.speaking
                      ? 'talking'
                      : asking
                        ? 'listening'
                        : 'pointing'
                  }
                  style={{
                    left: targetPosition,
                  }}
                >
                  <Image
                    src={`/petros/states/petros-${voice.speaking ? 'talking' : asking ? 'listening' : 'point-up'}.png`}
                    width={116}
                    height={154}
                    alt=""
                    priority
                  />
                  <span />
                </div>
                <span className={styles.characterCaption}>
                  {voice.preparing
                    ? 'Preparing narration…'
                    : voice.speaking
                      ? 'Petros is explaining'
                      : asking
                        ? 'Petros is listening'
                        : 'Take a moment. Try the idea.'}
                </span>
              </div>
              <div className={styles.teachingCaption}>
                <span className={styles.smallLabel}>THE IDEA</span>
                <p>{scene.explanation}</p>
                <div className={styles.voiceControls}>
                  <button
                    disabled={paused}
                    onClick={() => {
                      if (voice.speaking || voice.preparing)
                        voice.stopSpeaking();
                      else
                        void voice.speak(
                          `${scene.introduction} ${scene.explanation}`,
                        );
                    }}
                  >
                    {voice.speaking || voice.preparing ? (
                      <Pause size={15} />
                    ) : (
                      <Volume2 size={15} />
                    )}
                    {voice.speaking || voice.preparing
                      ? 'Stop narration'
                      : 'Read aloud'}
                  </button>
                  <button
                    disabled={busy || paused}
                    onClick={() =>
                      void perform({
                        action: 'mode',
                        mode: pilot.mode === 'voice' ? 'text' : 'voice',
                      })
                    }
                  >
                    {pilot.mode === 'voice'
                      ? 'Switch to text'
                      : 'Switch to voice'}
                    <ChevronDown size={13} />
                  </button>
                  <small>AI-generated voice</small>
                </div>
                {voice.error && (
                  <p role="status" className={styles.error}>
                    {voice.error} The full explanation is above. Use Read aloud
                    to retry.
                  </p>
                )}
              </div>
            </div>
            <div className={styles.responsePanel}>
              {asking ? (
                <div className={styles.askPanel}>
                  <div className={styles.panelLabel}>
                    <span>ASK PETROS</span>
                    <button
                      onClick={() => {
                        voice.cancelListening();
                        setAsking(false);
                      }}
                      aria-label="Return to the lesson"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <h2>What would you like to untangle?</h2>
                  <p>Your place in the lesson stays right here.</p>
                  <label htmlFor="pilot-question">Your question</label>
                  <textarea
                    id="pilot-question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={2000}
                    disabled={busy || paused}
                    placeholder="Why does…"
                  />
                  <div className={styles.askActions}>
                    <button
                      disabled={busy || paused}
                      onClick={() => {
                        if (voice.listening) voice.stopListening();
                        else void voice.startListening();
                      }}
                    >
                      <Mic size={17} />
                      {voice.listening ? 'Finish recording' : 'Use microphone'}
                    </button>
                    <button
                      className={styles.primary}
                      disabled={busy || paused || question.trim().length < 2}
                      onClick={() => void perform({ action: 'ask', question })}
                    >
                      <Send size={16} /> Ask
                    </button>
                  </div>
                  {voice.error && <p role="status">{voice.error}</p>}
                  {progress?.reply && (
                    <div className={styles.feedback} role="status">
                      <p>{progress.reply}</p>
                      <button onClick={() => void voice.speak(progress.reply)}>
                        Read answer aloud
                      </button>
                    </div>
                  )}
                  <button
                    className={styles.returnButton}
                    onClick={() => {
                      voice.cancelListening();
                      setAsking(false);
                    }}
                  >
                    Return to this idea <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.panelLabel}>
                    <span>MAKE IT YOURS</span>
                    <span>
                      {scene.responseType === 'choice'
                        ? 'Choose & check'
                        : 'Explain in your words'}
                    </span>
                  </div>
                  <h2>{scene.question}</h2>
                  {scene.responseType === 'choice' ? (
                    <fieldset
                      className={styles.choices}
                      disabled={busy || paused}
                    >
                      <legend className={styles.srOnly}>Your answer</legend>
                      {scene.choices.map((choice) => (
                        <label
                          key={choice.id}
                          data-selected={draft === choice.id}
                        >
                          <input
                            type="radio"
                            name={scene.id}
                            value={choice.id}
                            checked={draft === choice.id}
                            onChange={() => edit(choice.id)}
                          />
                          <span>{choice.label}</span>
                          {draft === choice.id && <Check size={16} />}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <>
                      <label htmlFor="pilot-answer" className={styles.srOnly}>
                        Your explanation
                      </label>
                      <textarea
                        id="pilot-answer"
                        value={draft}
                        maxLength={4000}
                        onChange={(e) => edit(e.target.value)}
                        disabled={busy || paused}
                        placeholder="I think this happens because…"
                      />
                    </>
                  )}
                  <button
                    className={styles.primary}
                    disabled={busy || paused || !draft.trim()}
                    onClick={() =>
                      void perform({ action: 'answer', answer: draft })
                    }
                  >
                    {busy
                      ? activity
                      : latest
                        ? 'Check this answer'
                        : 'Check my thinking'}{' '}
                    <ArrowRight size={16} />
                  </button>
                  {latest && (
                    <div
                      className={styles.feedback}
                      data-correct={latest.correctness === 'correct'}
                      role="status"
                    >
                      <strong>
                        {latest.correctness === 'correct'
                          ? latest.supported
                            ? 'You explained it with support.'
                            : 'You’ve got this connection.'
                          : latest.correctness === 'partial'
                            ? 'Part of the idea is there.'
                            : 'Let’s look at that again.'}
                      </strong>
                      <p>{latest.feedback}</p>
                      {latest.correctness !== 'correct' &&
                        !latest.feedback.includes(latest.hint) && (
                          <small>{latest.hint}</small>
                        )}
                    </div>
                  )}
                  {progress?.help !== 'none' && (
                    <div className={styles.helpCard}>
                      <Lightbulb size={18} />
                      <div>
                        <strong>
                          {progress?.help === 'example'
                            ? 'A worked example'
                            : 'A small nudge'}
                        </strong>
                        <p>
                          {progress?.help === 'example'
                            ? scene.example
                            : scene.hint}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className={styles.helpActions}>
                    <button
                      disabled={busy || paused}
                      onClick={() =>
                        void perform({ action: 'help', kind: 'hint' })
                      }
                    >
                      <Lightbulb size={15} /> A hint
                    </button>
                    <button
                      disabled={busy || paused}
                      onClick={() =>
                        void perform({ action: 'help', kind: 'example' })
                      }
                    >
                      Show an example
                    </button>
                    <button
                      disabled={paused}
                      onClick={() => {
                        voice.stopSpeaking();
                        setAsking(true);
                      }}
                    >
                      Ask Petros
                    </button>
                  </div>
                  {pilot.scene === 5 &&
                    revisits.filter((item) => item.id !== scene.id).length >
                      0 && (
                      <div className={styles.revisit}>
                        <strong>Before you wrap up</strong>
                        <p>
                          You left these ideas open. Try them again, or keep
                          them in your notebook for later.
                        </p>
                        {revisits
                          .filter((item) => item.id !== scene.id)
                          .map((item) => (
                            <button
                              disabled={busy || paused}
                              key={item.id}
                              onClick={() =>
                                void perform({
                                  action: 'navigate',
                                  scene: PETROS_PILOT_SCENES.indexOf(item),
                                })
                              }
                            >
                              <RotateCcw size={13} />
                              {item.title}
                            </button>
                          ))}
                      </div>
                    )}
                  <div className={styles.nextActions}>
                    {checked ? (
                      <button
                        className={styles.next}
                        disabled={busy || paused}
                        onClick={() =>
                          void perform({ action: 'advance', skip: false })
                        }
                      >
                        {pilot.scene === 5
                          ? 'Finish & see my notebook'
                          : 'Explore the next idea'}
                        <ArrowRight size={17} />
                      </button>
                    ) : (
                      <button
                        className={styles.skip}
                        disabled={busy || paused}
                        onClick={() =>
                          void perform({ action: 'advance', skip: true })
                        }
                      >
                        {pilot.scene === 5
                          ? 'Finish with these ideas to revisit'
                          : 'Move on and revisit'}
                        <ArrowRight size={15} />
                      </button>
                    )}
                    <small>
                      {checked
                        ? 'Your answer is saved.'
                        : 'Moving on keeps this idea marked for review.'}
                    </small>
                  </div>
                </>
              )}
            </div>
          </div>
          <footer className={styles.footer}>
            <span
              className={styles.progressDots}
              aria-label={`Idea ${pilot.scene + 1} of 6`}
            >
              {PETROS_PILOT_SCENES.map((item, i) => (
                <button
                  key={item.id}
                  disabled={i > pilot.unlocked || busy || paused}
                  aria-label={`Open ${item.title}`}
                  aria-current={i === pilot.scene ? 'step' : undefined}
                  onClick={() => void perform({ action: 'navigate', scene: i })}
                />
              ))}
            </span>
            <span>
              {counts.independent} independent · {counts.supported} with support
              · {counts.unresolved} to revisit
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
