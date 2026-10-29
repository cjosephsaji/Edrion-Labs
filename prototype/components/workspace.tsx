'use client';
import { TeachingCycle } from './teaching-cycle';
import { goToCheckpoint } from '../teaching/checkpoint';
import { resume } from '../teaching/controller';
import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Pause,
  Play,
  MessageCircle,
  Expand,
} from 'lucide-react';
import type { Lesson, ShowcaseState } from '../teaching/types';
import { yieldCue } from '../teaching/controller';
import { useLessonController } from '../teaching/use-lesson-controller';
import { Tree } from './tree';
import { Knowledge } from './knowledge';
import { Hazards } from './hazards';
import { River } from './river';
import { TopicModel } from './topic-models';
import { Companion } from '../classic/companion';
import { Reader } from './reader';
import s from './showcase.module.css';
import type { Patch } from '../teaching/types';
export type { Patch } from '../teaching/types';
export function Workspace({
  state,
  lesson,
  patch,
  onAsk,
  onHome,
  children,
}: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
  onAsk: (text: string) => Promise<void>;
  onHome: () => void;
  children?: React.ReactNode;
}) {
  const [reader, setReader] = useState<'source' | 'explanation' | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const { q, question, choose } = useLessonController(state, lesson, patch);
  return (
    <>
      <div className={s.lessonCrumb}>
        <button onClick={onHome}>
          <ChevronLeft size={16} /> Learning shelf
        </button>
        <span>
          {lesson.subject}{' '}
          {lesson.module ? `/ Module ${lesson.module}` : '/ General knowledge'}
        </span>
        <span className={s.caption}>
          {
            Object.values(state.completion).filter(
              (c) => c.outcome !== 'skipped',
            ).length
          }
          /{lesson.questions.length} explored
        </span>
      </div>
      <div className={s.lessonTitle}>
        <div>
          <span className={s.eyebrow}>
            {lesson.general
              ? 'PREPARED GENERAL KNOWLEDGE LESSON'
              : 'FROM UPLOADED MODULE'}
          </span>
          <h1>{lesson.title}</h1>
          <p>{lesson.subtitle}</p>
        </div>
        <div className={s.sourceActions}>
          {lesson.filename && (
            <button
              onClick={() => {
                patch({ cue: yieldCue(state.cue) });
                setReader('source');
              }}
            >
              <BookOpen size={16} /> View source
            </button>
          )}
          <button onClick={() => setReader('explanation')}>
            <Expand size={15} /> Full explanation
          </button>
        </div>
      </div>
      {children}
      <div
        className={`${s.learningLayout} ${state.mode === 'world' ? s.worldLearning : ''} ${state.mode === 'world' && state.sceneStation === 'experiment' ? s.worldInteraction : ''}`}
      >
        <main className={s.learningMain}>
          {state.mode === 'world' && state.sceneStation === 'experiment' && (
            <button
              className={s.returnRoom}
              onClick={() => {
                patch({ sceneStation: 'desk' });
                document
                  .querySelector('[aria-label="Petros World learning room"]')
                  ?.scrollIntoView({ block: 'start' });
              }}
            >
              ← Back to room
            </button>
          )}
          {state.phase === 'welcome' ? (
            <section className={s.welcome}>
              <span className={s.eyebrow}>LET’S MAKE SENSE OF IT</span>
              <h2>{lesson.introduction}</h2>
              <p>
                {lesson.questions.length} guided checkpoints · no grades · go at
                your pace
              </p>
              <button
                className={s.primary}
                onClick={() =>
                  patch((current) => goToCheckpoint(current, lesson, 0))
                }
              >
                Start lesson <ArrowRight size={18} />
              </button>
              <p className={s.caption}>
                {lesson.filename
                  ? `Source: ${lesson.filename} · pages ${[...new Set(lesson.questions.flatMap((q) => q.pages))].join(', ')}`
                  : 'Illustrative model. General knowledge, separate from the uploaded modules.'}
              </p>
            </section>
          ) : state.phase === 'recap' ? (
            <section className={s.recap}>
              <span className={s.eyebrow}>MAKE THE CONNECTIONS</span>
              <h2>Here’s what you explored.</h2>
              <p>
                {
                  Object.values(state.completion).filter(
                    (c) => c.outcome !== 'skipped',
                  ).length
                }{' '}
                of {lesson.questions.length} checkpoints explored.
              </p>
              <div className={s.chips}>
                {[
                  ...new Set(
                    lesson.questions
                      .filter(
                        (q) =>
                          state.completion[q.id] &&
                          state.completion[q.id]?.outcome !== 'skipped',
                      )
                      .map((q) => q.concept),
                  ),
                ].map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <p>
                {
                  Object.values(state.completion).filter((c) => c.help > 0)
                    .length
                }{' '}
                checkpoints used hints or a worked explanation.{' '}
                {
                  Object.values(state.completion).filter(
                    (c) => c.outcome === 'skipped',
                  ).length
                }{' '}
                skipped.
              </p>
              <p className={s.caption}>
                {lesson.filename
                  ? `Source pages: ${[...new Set(lesson.questions.flatMap((q) => q.pages))].sort((a, b) => a - b).join(', ')}.`
                  : 'Prepared general knowledge example.'}{' '}
                This is a practice recap, not a mastery claim or certification.
              </p>
              <button className={s.primary} onClick={onHome}>
                Choose another lesson <ArrowRight size={17} />
              </button>
              <button onClick={() => question(0)}>Revisit checkpoints</button>
            </section>
          ) : (
            <>
              <div
                className={s.lessonBoard}
                id="prototype-learning-tool"
                tabIndex={-1}
              >
                <fieldset
                  disabled={state.paused}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  {state.visualState.kind === 'tree' ? (
                    <Tree
                      state={state}
                      patch={(p) => patch(p)}
                      onSelect={choose}
                    />
                  ) : (
                    <Activity
                      state={state}
                      lesson={lesson}
                      patch={patch}
                      onSelect={choose}
                    />
                  )}
                </fieldset>
              </div>
              <TeachingCycle state={state} lesson={lesson} patch={patch} />
            </>
          )}
          <div className={s.supportBar}>
            <button
              aria-pressed={state.paused}
              onClick={() =>
                patch((current) =>
                  current.paused && current.interruptionCheckpoint
                    ? resume(current)
                    : {
                        ...current,
                        paused: !current.paused,
                        cue: yieldCue(current.cue),
                      },
                )
              }
            >
              {state.paused ? <Play size={15} /> : <Pause size={15} />}
              {state.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
          <section className={s.askSection}>
            <button
              className={s.askToggle}
              aria-expanded={askOpen}
              onClick={() => {
                setAskOpen(!askOpen);
                if (!askOpen) patch({ paused: true, cue: null });
              }}
            >
              <MessageCircle size={18} />
              <strong>Ask Petros</strong>
              <span>A question can change how you see it.</span>
              <span>+</span>
            </button>
            {askOpen && (
              <div className={s.askBody}>
                <div className={s.quickAsks}>
                  {['Explain more simply', 'Why this step?', 'Go deeper'].map(
                    (t) => (
                      <button
                        key={t}
                        disabled={!!state.pendingRequest}
                        onClick={() => void onAsk(t)}
                      >
                        {t}
                      </button>
                    ),
                  )}
                </div>
                <p className={s.caption}>
                  Contextual explanations are prepared from the current diagram.
                  Broader live questions need an available qualified model.
                </p>
                {state.conversationHistory.map((turn, i) => (
                  <div key={i} className={s.turn} data-role={turn.role}>
                    <small>{turn.label}</small>
                    <p>{turn.text}</p>
                  </div>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onAsk(state.askDraft);
                  }}
                >
                  <textarea
                    aria-label="Ask Petros a question"
                    maxLength={1200}
                    rows={2}
                    value={state.askDraft}
                    onChange={(e) =>
                      patch({
                        askDraft: e.target.value,
                        cue: yieldCue(state.cue),
                      })
                    }
                    placeholder="Why did MIN choose the smaller value?"
                  />
                  <button
                    className={s.primary}
                    disabled={!!state.pendingRequest || !state.askDraft.trim()}
                  >
                    {state.pendingRequest ? 'Connecting…' : 'Ask Petros'}
                  </button>
                </form>
                {state.paused && (
                  <button
                    onClick={() => {
                      patch((current) => resume(current));
                      setAskOpen(false);
                    }}
                  >
                    Resume explanation · same step
                  </button>
                )}
                {state.conversationHistory.at(-1)?.label ===
                  'Model unavailable' && (
                  <button
                    disabled={!!state.pendingRequest}
                    onClick={() => void onAsk(state.askDraft)}
                  >
                    Retry question
                  </button>
                )}
              </div>
            )}
          </section>
        </main>
        <Companion
          state={askOpen ? { ...state, cue: null } : state}
          patch={(p) => patch(p)}
        />
      </div>
      {reader && (
        <Reader
          lesson={lesson}
          question={q}
          kind={reader}
          onClose={() => setReader(null)}
        />
      )}
    </>
  );
}
function Activity(props: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
  onSelect: (s: string) => void;
}) {
  switch (props.state.visualState.kind) {
    case 'kb':
      return <Knowledge {...props} />;
    case 'hazards':
      return <Hazards {...props} />;
    case 'river':
      return <River {...props} />;
    default:
      return <TopicModel {...props} />;
  }
}
