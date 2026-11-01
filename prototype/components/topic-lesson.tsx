'use client';
import type { Lesson, Patch, ShowcaseState } from '../teaching/types';
import { integralArea } from '../teaching/topic-content';
import s from './showcase.module.css';
import { VisualEngine } from './visual-engine';

export function TopicControls({
  state,
  patch,
  compact = false,
}: {
  state: ShowcaseState;
  patch: Patch;
  compact?: boolean;
}) {
  const v = state.visualState;
  if (v.kind === 'topic' && v.visual)
    return <VisualEngine state={state} patch={patch} controlsOnly />;
  if (v.kind !== 'topic' || !v.area) return null;
  const area = v.area;
  const change = (update: Partial<typeof area>) =>
    patch({ visualState: { ...v, area: { ...area, ...update } } });
  return (
    <div className={s.topicParameterControls} data-compact={compact}>
      <label>
        Line slope <output>{area.slope}</output>
        <input
          aria-label="Integral line slope"
          type="range"
          min="1"
          max="3"
          step="1"
          value={area.slope}
          onChange={(e) => change({ slope: Number(e.target.value) })}
        />
      </label>
      <label>
        Upper limit <output>{area.upper}</output>
        <input
          aria-label="Integral upper limit"
          type="range"
          min="1"
          max="4"
          step="1"
          value={area.upper}
          onChange={(e) => change({ upper: Number(e.target.value) })}
        />
      </label>
      <div>
        <span>Rectangles</span>
        <div className={s.topicPieces}>
          {[4, 8, 16, 32].map((n) => (
            <button
              key={n}
              aria-label={`${n} rectangles`}
              aria-pressed={area.slices === n}
              onClick={() => change({ slices: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
export function TopicLesson({
  state,
  lesson,
  patch,
}: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
}) {
  const v = state.visualState;
  if (v.kind !== 'topic') return null;
  const area = v.area,
    totals = area ? integralArea(area) : null;
  const yMax = area ? Math.max(4, area.slope * area.upper) : 4;
  return (
    <section className={s.topicLessonPanel} aria-label="Topic learning model">
      <div className={s.topicLessonHeading}>
        <span>{lesson.origin === 'generated' ? 'AI-GENERATED LESSON' : 'PREPARED LESSON'}</span>
      </div>
      {v.visual ? (
        <VisualEngine state={state} patch={patch} />
      ) : area && totals ? (
        <>
          <svg
            className={s.integralPlot}
            viewBox="0 0 720 225"
            role="img"
            aria-label={`Left rectangles for f(x) = ${area.slope}x from 0 to ${area.upper}. Left sum ${totals.left.toFixed(6)}, exact area ${totals.exact.toFixed(6)}.`}
          >
            <path d="M65 22V185H650" fill="none" stroke="#889d8d" strokeWidth="2" />
            {Array.from({ length: area.slices }, (_, i) => {
              const width = (510 * area.upper) / 4 / area.slices,
                height = (140 * ((area.slope * area.upper * i) / area.slices)) / yMax;
              return (
                <rect
                  key={i}
                  x={65 + i * width}
                  y={185 - height}
                  width={width}
                  height={height}
                  fill="#b9d2ae"
                  stroke="#6e9878"
                  strokeWidth="1"
                />
              );
            })}
            <path
              d={`M65 185L${65 + (510 * area.upper) / 4} ${185 - (140 * area.slope * area.upper) / yMax}`}
              stroke="#285f48"
              strokeWidth="3"
              fill="none"
            />
            <text x="615" y="207" fontSize="17" fill="#3b5a47">
              x
            </text>
            <text x="35" y="25" fontSize="17" fill="#3b5a47">
              f(x)
            </text>
            <text x="60" y="209" fontSize="15" fill="#3b5a47">
              0
            </text>
            <text x={60 + (510 * area.upper) / 4} y="209" fontSize="15" fill="#3b5a47">
              {area.upper}
            </text>
            <text x="25" y="50" fontSize="15" fill="#3b5a47">
              {yMax}
            </text>
            <text x="385" y="30" fontSize="18" fill="#285f48">
              f(x) = {area.slope === 1 ? 'x' : `${area.slope}x`}
            </text>
          </svg>
          <div className={s.integralTotals}>
            <span>
              Left sum <strong>{Number(totals.left.toFixed(6))}</strong>
            </span>
            <span>
              Exact integral <strong>{Number(totals.exact.toFixed(6))}</strong>
            </span>
            <span>
              Gap <strong>{Number((totals.exact - totals.left).toFixed(6))}</strong>
            </span>
          </div>
          <TopicControls state={state} patch={patch} />
        </>
      ) : (
        <p role="status">
          This saved lesson has no supported visual specification. Use the worked explanation and
          practice below, or reopen the topic from the learning shelf to create a visual lesson.
        </p>
      )}
      {state.learning?.stage !== 'test' && <p className={s.topicDiagramCaption}>{v.caption}</p>}
      {lesson.origin === 'generated' && (
        <small>
          AI-generated general knowledge. Check important facts against a trusted source.
        </small>
      )}
    </section>
  );
}
