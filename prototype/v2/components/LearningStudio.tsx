'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TOPICS, type Topic } from '../simulations/runtime';
import {
  advanceInvestigation,
  buildInvestigation,
  evidenceLabel,
  freshInvestigationSession,
  freshProgress,
  parseInvestigationSession,
  INVESTIGATION_STORAGE,
  type InvestigationSession,
  type LearningAction,
} from '../core/investigation';
import type { Review } from '../core/visual-review';
import { EvidenceTable, InvestigationVisual } from './InvestigationVisual';
import {
  checkpoints,
  frameInsight,
  frameMeasurements,
} from '../core/investigation-playback';
import s from './learning-studio.module.css';

const topics: Record<Topic, { name: string; subject: string; symbol: string }> =
  {
    neural: {
      name: 'A learning machine',
      subject: 'Neural learning',
      symbol: '⌘',
    },
    rocket: {
      name: 'The falling rocket',
      subject: 'Motion & forces',
      symbol: '↗',
    },
    attention: { name: 'A word’s world', subject: 'Attention', symbol: 'Aa' },
    traffic: {
      name: 'The invisible wave',
      subject: 'Traffic systems',
      symbol: '≋',
    },
    relativity: {
      name: 'Two different clocks',
      subject: 'Special relativity',
      symbol: '◷',
    },
  };
const stages = ['predict', 'observe', 'explain', 'reflect'] as const;
const stageNames = ['Predict', 'Experiment', 'Explain', 'Take it further'];
const fmt = (n: number) => Number(n.toFixed(2)).toString();

export function LearningStudio({
  canSignOut = false,
}: {
  canSignOut?: boolean;
}) {
  const [session, setSession] = useState<InvestigationSession>(
    freshInvestigationSession,
  );
  const [ready, setReady] = useState(false),
    [storageMessage, setStorageMessage] = useState('');
  const [selection, setSelection] = useState<{
    caseId: string;
    id: string;
  } | null>(null);
  const [reason, setReason] = useState<{ caseId: string; id: string } | null>(
    null,
  );
  const [playback, setPlayback] = useState({
    key: '',
    frame: 0,
    playing: false,
  });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [notesOpen, setNotesOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const [review, setReview] = useState<{
    report: Review;
    layout: string[];
  } | null>(null);
  const latest = useRef(session),
    notes = useRef<HTMLElement>(null),
    stageHeading = useRef<HTMLHeadingElement>(null),
    workbench = useRef<HTMLElement>(null);
  const progress = session.topics[session.active] ?? freshProgress();
  const task = useMemo(
    () => buildInvestigation(session.active, progress.caseIndex),
    [session.active, progress.caseIndex],
  );
  const revealed = progress.stage !== 'predict',
    stageNumber = stages.indexOf(progress.stage);
  const playbackKey = `${task.id}:${progress.attempts.length}`;
  const frameIndex =
    playback.key === playbackKey
      ? Math.min(task.frames.length - 1, playback.frame)
      : revealed
        ? task.frames.length - 1
        : 0;
  const playing = playback.key === playbackKey && playback.playing;
  const setFrameIndex = (value: number | ((old: number) => number)) =>
    setPlayback((old) => ({
      key: playbackKey,
      frame:
        typeof value === 'function'
          ? value(old.key === playbackKey ? old.frame : frameIndex)
          : value,
      playing: old.key === playbackKey && old.playing,
    }));
  const setPlaying = (value: boolean) =>
    setPlayback((old) => ({
      key: playbackKey,
      frame: old.key === playbackKey ? old.frame : frameIndex,
      playing: value,
    }));
  const liveMeasures = useMemo(
    () => frameMeasurements(task, frameIndex),
    [task, frameIndex],
  );
  const insight = useMemo(
    () => frameInsight(task, frameIndex),
    [task, frameIndex],
  );
  const moments = useMemo(() => checkpoints(task), [task]);
  const selected = selection?.caseId === task.id ? selection.id : null;
  const selectedReason = reason?.caseId === task.id ? reason.id : null;
  const lastAttempt =
    progress.stage === 'reflect' ? progress.attempts.at(-1) : undefined;
  const totalEvidence = Object.values(session.topics).reduce(
    (n, p) => n + (p?.attempts.length ?? 0),
    0,
  );
  const nextTopic = TOPICS.find(
    (topic) =>
      topic !== session.active &&
      new Set((session.topics[topic]?.attempts ?? []).map((a) => a.caseId))
        .size < 3,
  );
  const previousAttempts = progress.attempts.filter(
    (a) => a.caseId === task.id,
  );
  const isPractice =
    previousAttempts.length > (progress.stage === 'reflect' ? 1 : 0);
  const fieldNotes = useMemo(() => {
    if (!notesOpen) return [];
    const cases = new Map<string, ReturnType<typeof buildInvestigation>>();
    const getCase = (topic: Topic, caseId: string) => {
      if (!cases.has(caseId))
        cases.set(caseId, buildInvestigation(topic, +caseId.split(':')[1]));
      return cases.get(caseId)!;
    };
    return TOPICS.flatMap((topic) =>
      (session.topics[topic]?.attempts ?? []).map((attempt, i) => ({
        topic,
        attempt,
        i,
        investigation: getCase(topic, attempt.caseId),
      })),
    );
  }, [notesOpen, session.topics]);
  latest.current = session;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INVESTIGATION_STORAGE);
      if (raw) setSession(parseInvestigationSession(raw));
    } catch {
      setStorageMessage(
        'Saved progress could not be restored. This visit starts with a fresh investigation.',
      );
    }
    setReady(true);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlayback((old) => ({ ...old, playing: false }));
    };
    update();
    media.addEventListener('change', update);
    const save = () => {
      try {
        localStorage.setItem(
          INVESTIGATION_STORAGE,
          JSON.stringify(latest.current),
        );
      } catch {
        /* The persistent notice below handles storage denial. */
      }
    };
    window.addEventListener('pagehide', save);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('pagehide', save);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(INVESTIGATION_STORAGE, JSON.stringify(session));
      } catch {
        setStorageMessage(
          'Progress cannot be saved in this browser. You can still complete this investigation.',
        );
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [ready, session]);
  useEffect(() => {
    setHelpOpen(false);
  }, [playbackKey]);
  useEffect(() => {
    setReview(null);
  }, [task.id]);
  useEffect(() => {
    if (!playing || reducedMotion || !revealed) return;
    const timer = setInterval(
      () =>
        setPlayback((old) => {
          if (old.key !== playbackKey || !old.playing) return old;
          const frame = Math.min(task.frames.length - 1, old.frame + 1);
          return { ...old, frame, playing: frame < task.frames.length - 1 };
        }),
      (task.topic === 'attention' ? 650 : 100) / speed,
    );
    return () => clearInterval(timer);
  }, [
    playing,
    reducedMotion,
    revealed,
    task.id,
    task.frames.length,
    task.topic,
    playbackKey,
    speed,
  ]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) setPlayback((old) => ({ ...old, playing: false }));
    };
    document.addEventListener('visibilitychange', stop);
    return () => document.removeEventListener('visibilitychange', stop);
  }, []);
  const receiveReview = useCallback((report: Review, layout: string[]) => {
    setReview((old) =>
      JSON.stringify(old) === JSON.stringify({ report, layout })
        ? old
        : { report, layout },
    );
  }, []);
  const dispatch = (action: LearningAction) => {
    if (!ready) return;
    setSession((previous) => {
      if (previous.active !== task.topic) return previous;
      const old = previous.topics[task.topic] ?? freshProgress();
      return {
        ...previous,
        topics: {
          ...previous.topics,
          [task.topic]: advanceInvestigation(old, task, action),
        },
      };
    });
  };
  const chooseTopic = (topic: Topic) => {
    if (!ready || topic === session.active) return;
    setPlaying(false);
    setSelection(null);
    setReason(null);
    setHelpOpen(false);
    setSession((previous) => ({ ...previous, active: topic }));
  };
  const practiseCase = (topic: Topic, caseIndex: number) => {
    setPlayback({ key: '', frame: 0, playing: false });
    setSelection(null);
    setReason(null);
    setNotesOpen(false);
    setSession((previous) => {
      const p = previous.topics[topic];
      if (!p) return previous;
      return {
        ...previous,
        active: topic,
        topics: {
          ...previous.topics,
          [topic]: advanceInvestigation(
            p,
            buildInvestigation(topic, p.caseIndex),
            { type: 'revisit', caseIndex },
          ),
        },
      };
    });
    requestAnimationFrame(() => stageHeading.current?.focus());
  };
  const inspectMoment = (index: number) => {
    setPlaying(false);
    setFrameIndex(index);
  };
  const followCause = () => {
    inspectMoment(0);
    requestAnimationFrame(() =>
      workbench.current?.scrollIntoView({
        behavior: reducedMotion ? 'instant' : 'smooth',
        block: 'start',
      }),
    );
  };
  const testPrediction = () => {
    if (!selected || !ready) return;
    dispatch({ type: 'predict', id: selected });
    setFrameIndex(reducedMotion ? task.frames.length - 1 : 0);
    setPlaying(!reducedMotion);
    if (window.innerWidth <= 740)
      requestAnimationFrame(() =>
        workbench.current?.scrollIntoView({
          behavior: 'instant',
          block: 'start',
        }),
      );
  };
  const showHint = () => {
    dispatch({ type: 'hint' });
    setHelpOpen(true);
  };
  const finishObservation = () => {
    setPlaying(false);
    setFrameIndex(task.frames.length - 1);
    dispatch({ type: 'inspect' });
    requestAnimationFrame(() => stageHeading.current?.focus());
  };
  const inspectReason = () => {
    if (!selectedReason) return;
    setPlaying(false);
    setFrameIndex(task.frames.length - 1);
    dispatch({ type: 'explain', id: selectedReason });
    requestAnimationFrame(() => stageHeading.current?.focus());
  };
  const nextCase = () => {
    setPlaying(false);
    setSelection(null);
    setReason(null);
    dispatch({ type: 'next' });
    requestAnimationFrame(() => stageHeading.current?.focus());
  };
  const replay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (reducedMotion) {
      setFrameIndex((index) =>
        index >= task.frames.length - 1 ? 0 : task.frames.length - 1,
      );
      return;
    }
    if (frameIndex >= task.frames.length - 1) setFrameIndex(0);
    setPlaying(true);
  };
  const predictionText = task.prediction.find(
    (c) => c.id === progress.prediction,
  )?.text;
  const resultHeading = lastAttempt
    ? !lastAttempt.reasonCorrect
      ? 'Let’s untangle the cause.'
      : !lastAttempt.predictionCorrect
        ? 'You changed your mind. That’s learning.'
        : 'You connected the cause and effect.'
    : '';
  const shownTime =
    task.frames[frameIndex]?.reference.time - task.frames[0].reference.time;
  const goodVisual = review?.report.ok && review.layout.length === 0;

  if (!ready)
    return (
      <main
        className={s.studio}
        data-testid="learning-studio"
        data-ready="false"
      >
        <div className={s.loading} role="status">
          <span className={s.brandMark}>p</span>
          <h1>Opening your learning notebook…</h1>
          <p>Restoring your place and preparing the experiment.</p>
        </div>
      </main>
    );

  return (
    <main
      className={s.studio}
      data-testid="learning-studio"
      data-ready={ready}
      data-topic={session.active}
      data-stage={progress.stage}
    >
      <header className={s.header}>
        <a href="/prototype?view=2d" className={s.brand}>
          <span className={s.brandMark}>p</span>petros
          <span className={s.brandNote}>
            a little curiosity goes a long way
          </span>
        </a>
        <div className={s.headerActions}>
          <span className={s.localBadge}>
            <i />
            Interactive learning lab
          </span>
          <button
            className={s.notesButton}
            onClick={() => {
              setNotesOpen(!notesOpen);
              if (!notesOpen)
                requestAnimationFrame(() =>
                  notes.current?.scrollIntoView({
                    behavior: reducedMotion ? 'instant' : 'smooth',
                    block: 'start',
                  }),
                );
            }}
          >
            Field notes <span>{totalEvidence.toString().padStart(2, '0')}</span>
          </button>
          {canSignOut && (
            <form method="post" action="/prototype/api/logout">
              <button type="submit">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <div className={s.layout}>
        <aside className={s.sidebar}>
          <div className={s.railEyebrow}>A PLACE TO FIGURE THINGS OUT</div>
          <nav className={s.topicNav} aria-label="Investigations">
            {TOPICS.map((topic, i) => (
              <button
                key={topic}
                aria-current={topic === session.active ? 'page' : undefined}
                onClick={() => chooseTopic(topic)}
              >
                <span className={s.topicSymbol} aria-hidden="true">
                  {topics[topic].symbol}
                </span>
                <span>
                  <small>
                    0{i + 1} / {topics[topic].subject}
                  </small>
                  <strong>{topics[topic].name}</strong>
                  {!!session.topics[topic]?.attempts.length && (
                    <span className={s.topicProgress}>
                      {
                        new Set(
                          session.topics[topic]!.attempts.map((a) => a.caseId),
                        ).size
                      }
                      /3 cases explored
                    </span>
                  )}
                </span>
                <span className={s.topicArrow} aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </nav>
          <div className={s.railNote}>
            <span aria-hidden="true">✳</span>
            <p>
              Understanding starts with
              <br />
              <em>“what if?”</em>
            </p>
            <small>
              Make a guess. Change one thing.
              <br />
              Follow what happens.
            </small>
          </div>
          <a className={s.freeLab} href="/prototype?view=2d&mode=explore">
            Open the free lab <span>↗</span>
            <small>All controls & prepared questions</small>
          </a>
        </aside>

        <div className={s.mainContent}>
          <section
            className={s.introduction}
            aria-labelledby="investigation-title"
          >
            <div>
              <div className={s.eyebrow}>
                INVESTIGATION 0{TOPICS.indexOf(session.active) + 1}
                <span />
                {progress.caseIndex === 0
                  ? 'THE FIRST QUESTION'
                  : `A DIFFERENT CASE · ${progress.caseIndex + 1} OF 3`}
              </div>
              <h1 id="investigation-title">{task.title}</h1>
              <p>{task.subtitle}</p>
            </div>
            <div className={s.caseNumber} aria-hidden="true">
              0{progress.caseIndex + 1}
              <span> / 03</span>
            </div>
          </section>
          <ol className={s.steps} aria-label="Investigation steps">
            {stages.map((stage, i) => (
              <li
                key={stage}
                aria-current={progress.stage === stage ? 'step' : undefined}
                data-complete={i < stageNumber}
              >
                <span>{i < stageNumber ? '✓' : `0${i + 1}`}</span>
                {stageNames[i]}
              </li>
            ))}
          </ol>
          {isPractice && (
            <div className={s.practiceNotice}>
              ↺ Practice visit · your earlier prediction stays in your field
              notes.
            </div>
          )}

          <div className={s.lessonGrid}>
            <section
              ref={workbench}
              className={s.workbench}
              aria-label="Experiment workbench"
            >
              <div className={s.boardHeader}>
                <div>
                  <span className={s.eyebrow}>
                    {revealed ? 'THE COMPARISON' : 'MEET YOUR MODEL'}
                  </span>
                  <h2>{task.focus}</h2>
                </div>
                <span className={s.modelTag}>
                  <i />
                  Computed model
                </span>
              </div>
              <div className={s.intervention}>
                <span className={s.changeIcon} aria-hidden="true">
                  ↗
                </span>
                <div>
                  <small>CHANGE ONE THING</small>
                  <strong>{task.change}</strong>
                </div>
                <div className={s.held}>
                  <small>KEEP THE REST FIXED</small>
                  <span>{task.held}</span>
                </div>
              </div>
              <div className={s.legend}>
                <span>
                  <i className={s.referenceDot} />
                  Reference
                </span>
                <span>
                  <i className={s.changedDot} />
                  {revealed ? 'Changed run' : 'Your experiment'}
                </span>
                {!revealed && (
                  <small>Make your prediction to reveal the comparison.</small>
                )}
              </div>
              <InvestigationVisual
                key={task.id}
                task={task}
                revealed={revealed}
                frameIndex={frameIndex}
                onReview={receiveReview}
              />
              <div className={s.transport}>
                <button
                  className={s.playButton}
                  onClick={replay}
                  disabled={!revealed}
                  aria-label={
                    reducedMotion
                      ? 'Toggle reference and final snapshot'
                      : playing
                        ? 'Pause experiment replay'
                        : 'Replay experiment'
                  }
                >
                  {reducedMotion ? '↔' : playing ? 'Ⅱ' : '▷'}
                </button>
                <div className={s.timeline}>
                  <div>
                    <span>
                      {revealed
                        ? task.playbackLabel
                        : 'The result waits for your prediction'}
                    </span>
                    <small>
                      {task.duration > 0
                        ? `${fmt(shownTime || 0)} s`
                        : `snapshot ${frameIndex + 1} / ${task.frames.length}`}
                    </small>
                  </div>
                  <input
                    type="range"
                    aria-label="Experiment replay position"
                    min="0"
                    max={task.frames.length - 1}
                    step="1"
                    value={frameIndex}
                    disabled={!revealed}
                    onChange={(event) => {
                      setPlaying(false);
                      setFrameIndex(+event.target.value);
                    }}
                  />
                </div>
                <button
                  className={s.speedButton}
                  aria-label="Replay speed"
                  disabled={!revealed || reducedMotion}
                  onClick={() => setSpeed((old) => (old === 1 ? 0.5 : 1))}
                >
                  {speed}×
                </button>
                <button
                  className={s.endButton}
                  disabled={!revealed}
                  onClick={() => {
                    setPlaying(false);
                    setFrameIndex(task.frames.length - 1);
                  }}
                >
                  Final frame ↗
                </button>
              </div>
              {revealed && (
                <div className={s.observationDeck}>
                  <nav
                    aria-label="Experiment checkpoints"
                    className={s.checkpoints}
                  >
                    {moments.map((moment, i) => (
                      <button
                        key={moment.index}
                        aria-pressed={frameIndex === moment.index}
                        onClick={() => inspectMoment(moment.index)}
                      >
                        <span>0{i + 1}</span>
                        {moment.label}
                      </button>
                    ))}
                  </nav>
                  <div className={s.insight} data-testid="frame-insight">
                    <span aria-hidden="true">✳</span>
                    <div>
                      <strong>{insight.title}</strong>
                      <p>{insight.text}</p>
                    </div>
                  </div>
                </div>
              )}
              {progress.stage === 'observe' && (
                <button
                  className={s.mobileContinue}
                  onClick={finishObservation}
                >
                  I’ve compared the runs · explain →
                </button>
              )}
              {revealed && (
                <div
                  className={s.measurements}
                  aria-label="Current snapshot measurements"
                >
                  <div className={s.resultLabel}>
                    {frameIndex === task.frames.length - 1
                      ? 'AT THE END OF THE EXPERIMENT'
                      : 'AT THIS SNAPSHOT · MOVE THE TIMELINE TO COMPARE'}
                  </div>
                  {liveMeasures.map((m, i) => (
                    <div
                      key={m.id}
                      className={i === 0 ? s.mainMeasure : undefined}
                      data-measure-id={m.id}
                    >
                      <span>{m.label}</span>
                      <strong>
                        <del data-value="reference">{fmt(m.reference)}</del>
                        <b aria-hidden="true">→</b>
                        <span data-value="changed">{fmt(m.changed)}</span>{' '}
                        <small>{m.unit}</small>
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              <details className={s.modelDetails}>
                <summary>
                  Inside this model <span>+</span>
                </summary>
                <p>{task.limitation}</p>
                {revealed && <EvidenceTable task={task} revealed />}
              </details>
            </section>

            <aside className={s.guide} aria-label="Learning guide">
              <div className={s.petros}>
                <img src="/petros/petros-idle.png" alt="Petros" />
                <div>
                  <strong>A thought from Petros</strong>
                  <span>Let’s figure it out together.</span>
                </div>
                <span className={s.spark} aria-hidden="true">
                  ✳
                </span>
              </div>
              <div className={s.guideContent}>
                <div className={s.eyebrow}>
                  {progress.stage === 'predict'
                    ? 'BEFORE WE TRY IT'
                    : progress.stage === 'observe'
                      ? 'LOOK CLOSELY'
                      : progress.stage === 'explain'
                        ? 'MAKE THE CONNECTION'
                        : 'YOUR FIELD NOTE'}
                </div>
                <h2 ref={stageHeading} tabIndex={-1}>
                  {progress.stage === 'predict'
                    ? 'What do you think will happen?'
                    : progress.stage === 'observe'
                      ? 'Hold your guess next to the evidence.'
                      : progress.stage === 'explain'
                        ? 'What caused that result?'
                        : resultHeading}
                </h2>
                {progress.stage === 'predict' && (
                  <>
                    <p className={s.question}>{task.question}</p>
                    <fieldset className={s.choices}>
                      <legend>Your prediction</legend>
                      {task.prediction.map((choice, i) => (
                        <label
                          key={choice.id}
                          data-selected={selected === choice.id}
                        >
                          <input
                            type="radio"
                            name="prediction"
                            value={choice.id}
                            checked={selected === choice.id}
                            onChange={() =>
                              setSelection({ caseId: task.id, id: choice.id })
                            }
                          />
                          <span className={s.choiceLetter}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{choice.text}</span>
                        </label>
                      ))}
                    </fieldset>
                    <button
                      className={s.primaryButton}
                      disabled={!selected || !ready}
                      onClick={testPrediction}
                    >
                      Test my prediction <span>↗</span>
                    </button>
                    <p className={s.smallNote}>
                      A guess is a starting point, not a grade.
                    </p>
                  </>
                )}
                {progress.stage === 'observe' && (
                  <>
                    <div className={s.committedPrediction}>
                      <small>YOU PREDICTED</small>
                      <p>“{predictionText}”</p>
                    </div>
                    <p className={s.question}>
                      Follow <strong>{task.focus.toLowerCase()}</strong>. The
                      reference stays visible while the changed run plays.
                    </p>
                    <p className={s.quietNote}>
                      Use the checkpoints, or slow the replay. The numbers
                      and explanation follow the snapshot you’re viewing.
                    </p>
                    <button
                      className={s.primaryButton}
                      onClick={finishObservation}
                    >
                      Explain what changed <span>→</span>
                    </button>
                  </>
                )}
                {progress.stage === 'explain' && (
                  <>
                    <p className={s.question}>
                      Choose the explanation that connects the change to the
                      evidence.
                    </p>
                    <fieldset className={s.choices}>
                      <legend>Your explanation</legend>
                      {task.reasons.map((choice, i) => (
                        <label
                          key={choice.id}
                          data-selected={selectedReason === choice.id}
                        >
                          <input
                            type="radio"
                            name="reason"
                            value={choice.id}
                            checked={selectedReason === choice.id}
                            onChange={() =>
                              setReason({ caseId: task.id, id: choice.id })
                            }
                          />
                          <span className={s.choiceLetter}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{choice.text}</span>
                        </label>
                      ))}
                    </fieldset>
                    <button
                      className={s.primaryButton}
                      disabled={!selectedReason}
                      onClick={inspectReason}
                    >
                      Check my explanation <span>→</span>
                    </button>
                  </>
                )}
                {lastAttempt && (
                  <>
                    <div
                      className={s.evidenceStamp}
                      data-revisit={!lastAttempt.reasonCorrect}
                    >
                      <span>{lastAttempt.reasonCorrect ? '↗' : '↺'}</span>
                      {evidenceLabel(lastAttempt)}
                    </div>
                    {!lastAttempt.reasonCorrect && (
                      <div className={s.feedback}>
                        <p>
                          {
                            task.reasons.find(
                              (c) => c.id === lastAttempt.reason,
                            )?.feedback
                          }
                        </p>
                        <button onClick={followCause}>
                          Show me the cause, step by step ↗
                        </button>
                      </div>
                    )}
                    <p className={s.takeaway}>{task.takeaway}</p>
                    <ol className={s.causalTrace}>
                      {task.mechanism.map((line, i) => (
                        <li key={i}>
                          <span>{i + 1}</span>
                          {line}
                        </li>
                      ))}
                    </ol>
                    <div className={s.reflection}>
                      <label htmlFor="reflection-note">
                        {lastAttempt.predictionCorrect
                          ? 'Where would this rule stop working?'
                          : 'What changed your mind?'}
                      </label>
                      <textarea
                        id="reflection-note"
                        maxLength={1000}
                        rows={3}
                        value={lastAttempt.reflection ?? ''}
                        onChange={(event) =>
                          dispatch({
                            type: 'reflect',
                            text: event.target.value,
                          })
                        }
                        placeholder="Put the idea in your own words…"
                        aria-describedby="reflection-help"
                      />
                      <small id="reflection-help">
                        Optional · saved with this attempt · not automatically
                        graded
                      </small>
                    </div>
                    {progress.caseIndex < 2 ? (
                      <button className={s.primaryButton} onClick={nextCase}>
                        {lastAttempt.reasonCorrect
                          ? 'Try a different case'
                          : 'Test that idea in a new case'}{' '}
                        <span>→</span>
                      </button>
                    ) : (
                      <>
                        <div className={s.closingNote}>
                          <strong>Three cases, one idea to carry.</strong>
                          <p>
                            Your record shows what you predicted and explained.
                            It does not certify mastery.
                          </p>
                        </div>
                        <button
                          className={s.primaryButton}
                          onClick={() =>
                            nextTopic
                              ? chooseTopic(nextTopic)
                              : (setNotesOpen(true),
                                requestAnimationFrame(() =>
                                  notes.current?.scrollIntoView({
                                    block: 'start',
                                  }),
                                ))
                          }
                        >
                          {nextTopic
                            ? 'Explore another question'
                            : 'Review my learning journey'}{' '}
                          <span>↗</span>
                        </button>
                      </>
                    )}
                    <div className={s.caseRevisit}>
                      <small>REVISIT AN EXPLORED CASE</small>
                      <div>
                        {[0, 1, 2]
                          .filter((index) =>
                            progress.attempts.some(
                              (a) => a.caseId === `${task.topic}:${index}:v1`,
                            ),
                          )
                          .map((index) => (
                            <button
                              key={index}
                              onClick={() => practiseCase(task.topic, index)}
                            >
                              Case {index + 1} ↺
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                )}
                {progress.stage !== 'reflect' && (
                  <div className={s.hintArea}>
                    <button onClick={showHint} aria-expanded={helpOpen}>
                      ✳ {helpOpen ? 'Your hint' : 'Give me a foothold'}
                    </button>
                    {helpOpen && (
                      <div role="note">
                        <p>{task.hint}</p>
                        <small>
                          This attempt will be recorded as assisted.
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className={s.guideFooter}>
                <span className={s.eyebrow}>WHAT YOU’RE LEARNING</span>
                <p>{task.objective}</p>
              </div>
            </aside>
          </div>

          <div className={s.belowBoard}>
            <span>
              <i className={s.smallStar}>✳</i> Small experiments. Better
              questions.
            </span>
            <details className={s.review}>
              <summary>
                {!review
                  ? 'Checking the visual…'
                  : goodVisual
                    ? 'Visual checks passed'
                    : 'Using a checked data fallback'}{' '}
                <span>⌄</span>
              </summary>
              <div>
                <strong>What we can check automatically</strong>
                {review?.report.checks.map((check) => (
                  <p key={check.name}>
                    <b>{check.ok ? '✓' : '!'}</b>
                    <span>
                      {check.name}
                      <small>{check.detail}</small>
                    </span>
                  </p>
                ))}
                <p>
                  <b>{review && !review.layout.length ? '✓' : '!'}</b>
                  <span>
                    Label legibility
                    <small>
                      Rendered text is checked for size, overlap and clipping at
                      this viewport.
                    </small>
                  </span>
                </p>
                <small>
                  These checks detect specific visual failures. They do not
                  replace teacher review or demonstrate that a student has
                  learned.
                </small>
              </div>
            </details>
          </div>

          <section
            ref={notes}
            className={s.fieldNotes}
            hidden={!notesOpen}
            aria-label="Learning field notes"
          >
            <div className={s.notesHeading}>
              <div className={s.eyebrow}>YOUR LEARNING RECORD</div>
              <h2>What the experiments tell us.</h2>
              <p>
                Predictions, explanations and assistance stay separate. Watching
                a replay never counts as understanding.
              </p>
            </div>
            {!totalEvidence ? (
              <p>Your first note appears after you explain an experiment.</p>
            ) : (
              <div className={s.notesGrid}>
                {fieldNotes.map(({ topic, attempt, i, investigation }) => {
                  return (
                    <article key={`${topic}-${i}`}>
                      <small>
                        {topics[topic].subject} · case{' '}
                        {investigation.caseIndex + 1}
                      </small>
                      <h3>{evidenceLabel(attempt)}</h3>
                      <p>
                        <b>Prediction:</b>{' '}
                        {
                          investigation.prediction.find(
                            (c) => c.id === attempt.prediction,
                          )?.text
                        }{' '}
                        {attempt.predictionCorrect ? '✓' : '↺'}
                      </p>
                      <p>
                        <b>Explanation:</b>{' '}
                        {
                          investigation.reasons.find(
                            (c) => c.id === attempt.reason,
                          )?.text
                        }
                      </p>
                      <span>
                        {attempt.hint ? 'Hint used' : 'No hint used'} ·{' '}
                        {attempt.reasonCorrect
                          ? 'Explanation matched evidence'
                          : 'Explanation needs another look'}
                      </span>
                      {attempt.reflection && (
                        <blockquote>{attempt.reflection}</blockquote>
                      )}
                      <button
                        className={s.noteRevisit}
                        onClick={() =>
                          practiseCase(topic, investigation.caseIndex)
                        }
                      >
                        Practise this case ↗
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <footer className={s.footer}>
            <span>EDRION / LEARN BY EXPLORING</span>
            <span role="status">
              {storageMessage ||
                'Saved on this browser · authored investigations · live AI paused'}
            </span>
          </footer>
        </div>
      </div>
    </main>
  );
}
