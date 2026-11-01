'use client';
import { useState } from 'react';
import { BookOpen, ChevronLeft } from 'lucide-react';
import { TeachingCycle } from './teaching-cycle';
import { startLearning } from '../teaching/checkpoint';
import { assistance } from '../teaching/learning-evidence';
import { LearningSummary } from './learning-progress';
import { conceptProgress } from '../teaching/progress';
import type { Lesson, ShowcaseState, Patch } from '../teaching/types';
import { useLessonController } from '../teaching/use-lesson-controller';
import { Tree } from './tree';
import { Knowledge } from './knowledge';
import { Hazards } from './hazards';
import { River } from './river';
import { TopicModel } from './topic-models';
import { TopicLesson } from './topic-lesson';
import { Reader } from './reader';
import s from './showcase.module.css';
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
  const [reader, setReader] = useState(false);
  const { q, qi, choose } = useLessonController(state, lesson, patch);
  const progress = conceptProgress(lesson, qi);
  return (
    <div
      className={`${s.focusWorkspace} ${state.visualState.kind === 'topic' && state.visualState.visual ? s.visualWorkspace : ''}`}
    >
      <div className={s.lessonCrumb}>
        <button onClick={onHome}>
          <ChevronLeft size={16} /> Learning shelf
        </button>
        <span>
          {lesson.subject} {lesson.module ? `/ Module ${lesson.module}` : '/ Explore'}
        </span>
        {lesson.filename && (
          <button
            onClick={() => {
              patch((current) => assistance(current, 'read-source'));
              setReader(true);
            }}
          >
            <BookOpen size={14} /> Source
          </button>
        )}
      </div>
      <div className={s.focusTitle}>
        <div>
          <span className={s.eyebrow}>{lesson.title}</span>
          <h1>{state.phase === 'recap' ? 'Lesson review' : progress.label}</h1>
        </div>
        <span className={s.focusPace}>A little curiosity, one idea at a time.</span>
      </div>
      {state.visualState.kind === 'topic' && state.visualState.visual && (
        <div className={s.visualObjective}>
          <span>
            {state.learning?.stage === 'test'
              ? 'Apply what you know to a fresh example.'
              : state.visualState.visual.objective}
          </span>
          <small>
            {progress.index} / {progress.total} concepts
          </small>
          <progress
            max={progress.total}
            value={progress.index}
            aria-label="Current concept in lesson"
          />
        </div>
      )}
      {children}
      <main className={s.learningMain}>
        {state.phase === 'welcome' ? (
          <section className={s.welcome}>
            <h2>{lesson.introduction}</h2>
            <p>We’ll look, try, and make sense of it together.</p>
            <button
              className={s.primary}
              onClick={() => patch((current) => startLearning(current, lesson))}
            >
              Start learning →
            </button>
            {lesson.experience && (
              <p>
                Begin with two optional starting questions. They choose a useful starting point, not
                an ability score.
              </p>
            )}
          </section>
        ) : state.phase === 'recap' ? (
          <LearningSummary state={state} lesson={lesson} patch={patch} onHome={onHome} />
        ) : (
          <>
            <div className={s.focusBoard} id="prototype-learning-tool" tabIndex={-1}>
              <fieldset
                disabled={state.paused}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                {state.visualState.kind === 'tree' ? (
                  <Tree state={state} patch={patch} onSelect={choose} />
                ) : (
                  <Activity state={state} lesson={lesson} patch={patch} onSelect={choose} />
                )}
              </fieldset>
            </div>
            <TeachingCycle state={state} lesson={lesson} patch={patch} onAsk={onAsk} />
          </>
        )}
      </main>
      {lesson.learningGoals && (
        <details className={s.topicLearningPath}>
          <summary>Learning path, prerequisites and lesson details</summary>
          <p>{lesson.introduction}</p>
          <p>Useful starting knowledge: {lesson.prerequisites?.join(' ')}</p>
          <ul>
            {lesson.learningGoals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
          <ol>
            {lesson.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {lesson.references?.map((ref) => (
            <p key={ref.url}>
              <a href={ref.url} target="_blank" rel="noreferrer">
                {ref.title}
              </a>
            </p>
          ))}
          {lesson.origin === 'generated' && (
            <p>AI-generated general knowledge. Answer-key comparisons remain unverified.</p>
          )}
        </details>
      )}
      {reader && (
        <Reader lesson={lesson} question={q} kind="source" onClose={() => setReader(false)} />
      )}
    </div>
  );
}
function Activity(props: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
  onSelect: (s: string) => void;
}) {
  switch (props.state.visualState.kind) {
    case 'topic':
      return <TopicLesson {...props} />;
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
