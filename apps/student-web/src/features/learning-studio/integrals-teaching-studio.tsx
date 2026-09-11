'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Headphones,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { PetrosTeachingPresentation } from '@edrion/schemas';
import { PETROS_TEACHING_PRESENTATION_VERSION } from '@edrion/schemas';
import { PetrosRig } from './petros-rig';
import {
  TeachingTarget,
  TeachingTargetRegistry,
  useTeachingTargets,
} from './target-registry';
import { useTeachingPlayback } from './use-teaching-playback';
import styles from './integrals-teaching-studio.module.css';

export const INTEGRALS_PRESENTATION: PetrosTeachingPresentation = {
  schemaVersion: PETROS_TEACHING_PRESENTATION_VERSION,
  id: 'integrals-reverse-change',
  unitId: 'calculus-antiderivatives',
  title: 'Integration reverses differentiation',
  objective: 'Connect derivatives and antiderivatives, then explain why an arbitrary constant is required.',
  beats: [
    {
      id: 'relationship',
      narration: 'Start with a relationship you already know. Differentiating x cubed gives three x squared.',
      targetId: 'integrals:relationship',
      reveals: ['derivative'],
      gesture: 'point',
      advancement: 'student_continue',
    },
    {
      id: 'differentiate',
      narration: 'The arrow records a change operation. The power comes down, then the exponent decreases by one.',
      targetId: 'integrals:derivative-arrow',
      reveals: ['derivative', 'derivative-rule'],
      gesture: 'point',
      advancement: 'student_continue',
    },
    {
      id: 'reverse',
      narration: 'Integration asks the reverse question: which function could have produced this derivative?',
      targetId: 'integrals:reverse-arrow',
      reveals: ['derivative', 'reverse'],
      gesture: 'point',
      advancement: 'student_continue',
    },
    {
      id: 'constant',
      narration: 'We add C because differentiation erases every constant. The derivative alone cannot tell us which constant was there.',
      targetId: 'integrals:constant',
      reveals: ['derivative', 'reverse', 'constant'],
      gesture: 'point',
      advancement: 'student_continue',
    },
    {
      id: 'curve-family',
      narration: 'These curves sit at different heights, but their slopes match at every x value. They share one derivative.',
      targetId: 'integrals:curves',
      reveals: ['derivative', 'reverse', 'constant', 'curves'],
      gesture: 'point',
      advancement: 'student_continue',
    },
    {
      id: 'explore-constant',
      narration: 'Change C. Watch the curve move vertically while its shape and slope stay the same.',
      targetId: 'integrals:constant-control',
      reveals: ['derivative', 'reverse', 'constant', 'curves', 'explore'],
      gesture: 'look',
      advancement: 'exploration_complete',
    },
    {
      id: 'fresh-problem',
      narration: 'Now try a fresh problem without the worked answer. Find an antiderivative of six x squared.',
      targetId: 'integrals:fresh-problem',
      reveals: ['fresh-problem'],
      gesture: 'rest',
      advancement: 'student_response',
    },
  ],
};

function CurvePlot({ constant }: { constant: number }) {
  const curves = [-2, 0, 2];
  const path = (offset: number) => {
    const points = Array.from({ length: 41 }, (_, index) => {
      const x = -2 + index / 10;
      const px = 20 + ((x + 2) / 4) * 280;
      const y = x ** 3 / 3 + offset;
      const py = 92 - y * 18;
      return `${index ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    });
    return points.join(' ');
  };
  return (
    <svg viewBox="0 0 320 184" role="img" aria-label={`Family of cubic curves with selected constant ${constant}`}>
      <path d="M20 92H304M160 12V170" className={styles.axis} />
      {curves.map((offset) => (
        <path key={offset} d={path(offset)} className={styles.familyCurve} />
      ))}
      <path d={path(constant)} className={styles.activeCurve} />
      <text x="268" y="79">+ C</text>
    </svg>
  );
}

function PetrosPlacement({ targetId, state }: { targetId: string | null; state: 'idle' | 'playing' | 'paused' | 'interrupted' }) {
  const { targets } = useTeachingTargets();
  const dockRef = useRef<HTMLDivElement>(null);
  const target = targetId ? targets.get(targetId) : undefined;
  const dock = dockRef.current?.getBoundingClientRect();
  const available = Boolean(target?.available && dock);
  const targetX = target ? target.rect.left + target.rect.width / 2 : 0;
  const targetY = target ? target.rect.top + target.rect.height / 2 : 0;
  const startX = dock ? dock.left + dock.width * 0.43 : 0;
  const startY = dock ? dock.top + dock.height * 0.49 : 0;
  const angle = available ? (Math.atan2(targetY - startY, targetX - startX) * 180) / Math.PI : -18;
  return (
    <div ref={dockRef} className={styles.petrosDock} data-target-available={available || undefined}>
      <div className={styles.rigWrap}>
        <PetrosRig
          state={state === 'playing' ? 'speak' : state === 'interrupted' ? 'listen' : state === 'paused' ? 'paused' : available ? 'point' : 'rest'}
          pointAngle={Math.max(-70, Math.min(55, angle - 180))}
        />
      </div>
      {available ? (
        <svg className={styles.pointer} aria-hidden="true">
          <defs><marker id="petros-pointer-tip" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7Z" /></marker></defs>
          <line x1={startX} y1={startY} x2={targetX} y2={targetY} markerEnd="url(#petros-pointer-tip)" />
        </svg>
      ) : null}
      <span className={styles.petrosName}>Petros</span>
    </div>
  );
}

function StudioExperience({ initialMode }: { initialMode: 'voice' | 'quiet' }) {
  const [constant, setConstant] = useState(1);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [questionReply, setQuestionReply] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'retry'>('idle');
  const initialCheckpoint = useMemo(
    () => ({
      presentationVersion: PETROS_TEACHING_PRESENTATION_VERSION,
      unitId: INTEGRALS_PRESENTATION.unitId,
      beatId: INTEGRALS_PRESENTATION.beats[0]!.id,
      mode: initialMode,
    }),
    [initialMode],
  );
  const playback = useTeachingPlayback(INTEGRALS_PRESENTATION, { initialCheckpoint });
  const autoStarted = useRef(false);
  useEffect(() => {
    if (initialMode !== 'voice' || autoStarted.current) return;
    autoStarted.current = true;
    playback.play();
  }, [initialMode, playback]);
  const reveals = new Set(playback.beat.reveals);
  const openQuestion = () => {
    playback.interrupt();
    setQuestionOpen(true);
  };
  const ask = () => {
    if (!question.trim()) return;
    setQuestionReply(
      'Think of differentiation as losing vertical-position information. Every curve x³ + C becomes 3x², so reversing the operation has to restore that missing possibility as + C.',
    );
  };
  const closeQuestion = () => {
    setQuestionOpen(false);
    playback.resume();
  };
  const checkAnswer = () => {
    const compact = answer.toLowerCase().replaceAll(' ', '').replaceAll('^', '');
    setAnswerState(compact.includes('2x3') && compact.includes('c') ? 'correct' : 'retry');
  };

  return (
    <TeachingTargetRegistry>
      <main className={styles.studio}>
        <header className={styles.header}>
          <Link href="/learn"><ArrowLeft aria-hidden="true" /> Exit studio</Link>
          <div><span>Calculus · Antiderivatives</span><strong>{INTEGRALS_PRESENTATION.title}</strong></div>
          <div className={styles.headerActions}>
            <span className={styles.saved}><Check aria-hidden="true" /> Saved locally</span>
            <button type="button" onClick={openQuestion}><MessageCircle aria-hidden="true" /> Ask Petros</button>
          </div>
        </header>

        <section className={styles.lessonGrid} aria-label="Teaching studio">
          <div className={styles.board}>
            <div className={styles.boardMeta}><span>IDEA {playback.index + 1} OF {INTEGRALS_PRESENTATION.beats.length}</span><span>Reverse the operation</span></div>
            {!reveals.has('fresh-problem') ? (
              <>
                <div className={styles.relationship}>
                  <TeachingTarget id="integrals:relationship" className={styles.formula}>x<sup>3</sup></TeachingTarget>
                  <TeachingTarget id="integrals:derivative-arrow" className={styles.arrowBlock}>
                    <span>Differentiation</span><ArrowRight aria-hidden="true" />
                  </TeachingTarget>
                  <span className={styles.formula} data-muted={!reveals.has('derivative')}>3x<sup>2</sup></span>
                </div>
                {reveals.has('reverse') ? (
                  <TeachingTarget id="integrals:reverse-arrow" className={styles.reverseRow}>
                    <ArrowLeft aria-hidden="true" /><span>Integration reverses the question</span>
                  </TeachingTarget>
                ) : null}
                {reveals.has('constant') ? (
                  <div className={styles.integralLine}>∫ 3x<sup>2</sup> dx = x<sup>3</sup> <TeachingTarget id="integrals:constant" className={styles.constant}>+ C</TeachingTarget></div>
                ) : null}
                {reveals.has('curves') ? (
                  <TeachingTarget id="integrals:curves" className={styles.curveCard}>
                    <CurvePlot constant={constant} />
                  </TeachingTarget>
                ) : null}
                {reveals.has('explore') ? (
                  <TeachingTarget id="integrals:constant-control" className={styles.explorer}>
                    <label htmlFor="constant-slider"><span>Change the constant</span><output>C = {constant}</output></label>
                    <input id="constant-slider" type="range" min="-2" max="2" step="1" value={constant} onChange={(event) => setConstant(Number(event.target.value))} />
                    <p>The curve moves up or down. Its derivative stays <strong>3x²</strong>.</p>
                  </TeachingTarget>
                ) : null}
              </>
            ) : (
              <TeachingTarget id="integrals:fresh-problem" className={styles.freshProblem}>
                <span>YOUR TURN</span>
                <h2>Find one antiderivative of 6x².</h2>
                <p>Include the constant that represents the full family.</p>
                <label htmlFor="integral-answer">Your answer</label>
                <div><input id="integral-answer" value={answer} onChange={(event) => { setAnswer(event.target.value); setAnswerState('idle'); }} placeholder="∫ 6x² dx = …" /><button type="button" onClick={checkAnswer}>Check</button></div>
                {answerState === 'correct' ? <p className={styles.correct} role="status">That works: 2x³ + C differentiates to 6x².</p> : null}
                {answerState === 'retry' ? <p className={styles.retry} role="status">Check the power: which cubic differentiates to 6x²? Keep + C.</p> : null}
              </TeachingTarget>
            )}
          </div>

          <aside className={styles.explanation}>
            <span className={styles.beatLabel}>{playback.beat.gesture === 'look' ? 'EXPLORE' : playback.beat.advancement === 'student_response' ? 'PRACTISE' : 'NOTICE'}</span>
            <h1>{playback.beat.id === 'constant' ? 'Where did the constant go?' : playback.beat.id === 'fresh-problem' ? 'Now make the move yourself' : playback.beat.id === 'curve-family' ? 'One derivative, many curves' : 'See the relationship'}</h1>
            <p>{playback.beat.narration}</p>
            {playback.caption ? <div className={styles.caption} aria-live="polite"><Volume2 aria-hidden="true" />{playback.caption}</div> : null}
          </aside>

          <PetrosPlacement targetId={playback.beat.targetId} state={playback.status} />
        </section>

        <footer className={styles.transport}>
          <div className={styles.audioControls}>
            <button type="button" aria-label={playback.status === 'playing' ? 'Pause narration' : 'Play narration'} onClick={playback.status === 'playing' ? playback.pause : playback.play}>{playback.status === 'playing' ? <Pause /> : <Play />}</button>
            <button type="button" aria-label="Replay narration" onClick={playback.replay}><RotateCcw /></button>
            <button type="button" aria-label={playback.mode === 'voice' ? 'Switch to quiet study' : 'Turn on narration'} onClick={() => playback.setMode(playback.mode === 'voice' ? 'quiet' : 'voice')}>{playback.mode === 'voice' ? <Volume2 /> : <VolumeX />}</button>
            <span>{playback.mode === 'voice' ? 'Voice on' : 'Quiet study'}</span>
          </div>
          <div className={styles.progress} aria-label={`Idea ${playback.index + 1} of ${INTEGRALS_PRESENTATION.beats.length}`}><span style={{ width: `${((playback.index + 1) / INTEGRALS_PRESENTATION.beats.length) * 100}%` }} /></div>
          <div className={styles.navControls}>
            <button type="button" disabled={playback.isFirst} onClick={playback.previous}>Back</button>
            <button type="button" className={styles.primary} disabled={playback.isLast} onClick={playback.next}>{playback.beat.advancement === 'exploration_complete' ? 'I see it' : 'Continue'} <ArrowRight /></button>
          </div>
        </footer>

        {questionOpen ? (
          <div className={styles.questionLayer}>
            <button className={styles.backdrop} type="button" aria-label="Close Ask Petros" onClick={closeQuestion} />
            <aside className={styles.questionPanel} role="dialog" aria-modal="true" aria-labelledby="ask-petros-title">
              <header><div><span>PAUSED AT IDEA {playback.index + 1}</span><h2 id="ask-petros-title">Ask about this visual</h2></div><button type="button" aria-label="Close" onClick={closeQuestion}><X /></button></header>
              <div className={styles.questionPetros}><PetrosRig state={questionReply ? 'speak' : 'listen'} /><p>{questionReply || 'I’ll keep this exact diagram and your place while we talk.'}</p></div>
              <label htmlFor="question-draft">Your question</label>
              <textarea id="question-draft" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Why do all the curves have the same derivative?" />
              <button type="button" className={styles.primary} disabled={!question.trim()} onClick={ask}><Send /> Ask in context</button>
              {questionReply ? <button type="button" className={styles.resume} onClick={closeQuestion}><Play /> Resume explanation</button> : null}
            </aside>
          </div>
        ) : null}
      </main>
    </TeachingTargetRegistry>
  );
}

export function IntegralsTeachingStudio() {
  const [mode, setMode] = useState<'voice' | 'quiet' | null>(null);
  if (mode) return <StudioExperience initialMode={mode} />;
  return (
    <section className={styles.welcome}>
      <div className={styles.welcomeVisual} aria-hidden="true"><PetrosRig state="enter" /><span>∫</span><i /><i /><i /></div>
      <div className={styles.welcomeCopy}>
        <span className={styles.beatLabel}>PETROS TEACHING STUDIO</span>
        <h1>See why integration needs <em>+ C</em>.</h1>
        <p>One idea, demonstrated visually. Petros will point to each relationship and then hand control to you.</p>
        <div className={styles.modeActions}>
          <button type="button" className={styles.primary} onClick={() => setMode('voice')}><Headphones /> Learn with Petros</button>
          <button type="button" onClick={() => setMode('quiet')}><BookOpen /> Read quietly</button>
        </div>
        <small>Audio begins only after you choose. You can switch modes at any time.</small>
      </div>
    </section>
  );
}
