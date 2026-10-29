'use client';
import { useTeachingTarget } from '@/features/learning-studio/target-registry';
import { useRef, useState } from 'react';
import type { CanvasElement, M4Snapshot, LearningUIPlan } from '@edrion/schemas';
import { BookOpen } from 'lucide-react';
import type {
  PresentationController,
  PresentationState,
} from './presentation-controller';
import { studioExcerpt } from './studio-presentation';
import { TextAlternative } from './text-alternative';
import styles from './petros-v2.module.css';
import { LearningIntro } from './learning-format';
import formatStyles from './learning-format.module.css';

type Lesson = NonNullable<M4Snapshot['lesson']>;
function SourceTable({
  payload,
  select,
  citation,
}: {
  payload: NonNullable<NonNullable<Lesson['excerpts']>[number]['table']>;
  select: () => void;
  citation: string;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  if (payload.kind !== 'table') return null;
  return (
    <div className={styles.sourceTable}>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Source comparison table"
        tabIndex={0}
      >
        <table>
          <caption>{payload.caption || 'Comparison from the reviewed source'}</caption>
          <tbody>
            {payload.rows.map((row, rowIndex) => (
              <tr key={row} data-focused={focused === row}>
                {payload.cells
                  .filter((cell) => cell.row === row)
                  .map((cell, column) => {
                    const Tag = cell.header ? 'th' : 'td';
                    return (
                      <Tag
                        key={cell.id}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.columnSpan}
                        scope={cell.header ? (rowIndex === 0 ? 'col' : 'row') : undefined}
                      >
                        {column === 0 && rowIndex > 0 ? (
                          <button
                            aria-pressed={focused === row}
                            aria-label={`Focus ${cell.value}`}
                            onClick={() => {
                              setFocused(row);
                              select();
                            }}
                          >
                            {cell.value}
                          </button>
                        ) : (
                          cell.value
                        )}
                      </Tag>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {focused && (
        <div
          className={styles.sourceFocus}
          aria-label="Focused source comparison"
          role="region"
        >
          <strong>{payload.cells.find((cell) => cell.row === focused)?.value}</strong>
          <dl>
            {payload.cells
              .filter((cell) => cell.row === focused)
              .slice(1)
              .map((cell) => (
                <div key={cell.id}>
                  <dt>
                    {payload.cells.find(
                      (header) =>
                        header.row === payload.rows[0] && header.column === cell.column,
                    )?.value ?? 'Source value'}
                  </dt>
                  <dd>{cell.value}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
      <TextAlternative onOpen={select}>
        <p>
          {process.env.NEXT_PUBLIC_PETROS_M4_DEMO === '1'
            ? 'Sample teaching material · simulated review records'
            : citation}
        </p>
        <p>{payload.cells.map((cell) => cell.value).join('\n')}</p>
      </TextAlternative>
    </div>
  );
}
function Excerpt({
  element,
  selected,
  active,
  select,
  lesson,
  progress,
}: {
  element: CanvasElement;
  selected: boolean;
  active: boolean;
  select: () => void;
  lesson: Lesson;
  progress: number | null;
}) {
  const ref = useTeachingTarget(element.id);
  const source = element.kind === 'text' ? studioExcerpt(lesson, element.id) : undefined;
  return (
    <article
      ref={ref}
      className={styles.excerpt}
      data-selected={selected}
      data-active={active}
      data-element-id={element.id}
      aria-label={element.label}
    >
      <div className={formatStyles.cardHeading}>
        <span className={formatStyles.formatIcon}>
          <BookOpen size={19} aria-hidden="true" />
        </span>
        <h3>{source?.table ? 'Compare the source details' : element.label}</h3>
      </div>
      {source?.table ? (
        <SourceTable payload={source.table} select={select} citation={lesson.citation} />
      ) : (
        'text' in element && (
          <p>
            {progress === null ? (
              element.text
            ) : (
              <>
                <mark>
                  {element.text.slice(0, Math.floor(element.text.length * progress))}
                </mark>
                {element.text.slice(Math.floor(element.text.length * progress))}
              </>
            )}
          </p>
        )
      )}
    </article>
  );
}
export function LearningStage({
  controller,
  state,
  textOnly,
  busy,
  next,
  ask,
  lesson,
  canParticipate,
  ui,
}: {
  controller: PresentationController;
  state: PresentationState;
  textOnly: boolean;
  busy: boolean;
  next: () => void;
  ask: () => void;
  lesson: Lesson;
  canParticipate: boolean;
  ui?: LearningUIPlan;
}) {
  const stage = useRef<HTMLElement>(null);
  const current =
    state.canvas.elements.find((element) => element.id === state.selectedId) ??
    state.canvas.elements.at(-1);
  const visible = textOnly ? state.canvas.elements : current ? [current] : [];
  const table = current ? studioExcerpt(lesson, current.id)?.table : undefined;
  return (
    <section
      ref={stage}
      aria-label="Source-backed learning stage"
      className={styles.readingStage}
    >
      <div className={styles.stageHeading}>
        <div>
          <h2>{table ? 'Compare the source' : 'Explore the idea'}</h2>
        </div>
        <span className={styles.folio}>
          {String(state.index + 1).padStart(2, '0')} /{' '}
          {String(controller.timeline.beats.length).padStart(2, '0')}
        </span>
      </div>
      <LearningIntro
        objective={lesson.objective.label}
        reason={
          ui?.reason ??
          'Starting with the source gives you the context and evidence you’ll use in the next activity.'
        }
        instruction={
          ui?.instruction ??
          'Read the supplied passage. Pick an idea to examine, then explain it in your own words.'
        }
      />
      <nav className={styles.sourceTrail} aria-label="Revealed source excerpts">
        {state.canvas.elements.map((element, i) => (
          <button
            key={element.id}
            aria-current={current?.id === element.id ? 'step' : undefined}
            onClick={() => {
              controller.interrupt();
              controller.select(element.id);
            }}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            {studioExcerpt(lesson, element.id)?.table ? 'Comparison' : element.label}
          </button>
        ))}
      </nav>
      <div className={styles.excerpts} data-text-only={textOnly} data-focused-stage>
        {visible.map((element) => (
          <Excerpt
            key={element.id}
            element={element}
            lesson={lesson}
            selected={state.selectedId === element.id}
            active={state.canvas.highlightedIds.includes(element.id)}
            progress={state.status === 'playing' && !textOnly ? state.progress : null}
            select={() => {
              controller.interrupt();
              controller.select(element.id);
            }}
          />
        ))}
      </div>
      <div className={styles.stageControls}>
        <div className={styles.actions}>
          {state.status === 'playing' ? (
            <button onClick={controller.pause}>Pause explanation</button>
          ) : state.status !== 'complete' ? (
            <button onClick={controller.play} disabled={busy || textOnly}>
              Explore with Petros <span aria-hidden="true">↗</span>
            </button>
          ) : null}
          {state.status !== 'complete' && (
            <button onClick={controller.step} disabled={busy}>
              Show next excerpt <span aria-hidden="true">→</span>
            </button>
          )}
          {state.selectedId && (
            <button onClick={ask} disabled={busy}>
              Ask about this excerpt
            </button>
          )}
        </div>
        <button
          className={styles.primary}
          onClick={next}
          disabled={busy || !canParticipate}
        >
          Try a question <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className={styles.hint}>
        Exact reviewed wording. Exploring these excerpts is not an assessment.
      </p>
    </section>
  );
}

/** Exact authorized text remains usable when the bounded presentation subset
 * cannot represent it. This fallback issues no new content or task modality. */
export function TextLearningStage({
  lesson,
  next,
  busy,
  canParticipate,
  ui,
}: {
  lesson: Lesson;
  next: () => void;
  busy: boolean;
  canParticipate: boolean;
  ui?: LearningUIPlan;
}) {
  const hasText =
    !!lesson.explanation.trim() || lesson.excerpts?.some((e) => e.text.trim());
  return (
    <section className={styles.readingStage} aria-label="Source-backed text stage">
      <p className={styles.eyebrow}>Read at your own pace</p>
      <h2>
        {hasText
          ? 'The source, in its own words.'
          : 'This source has no displayable passage.'}
      </h2>
      {hasText ? (
        <>
          <LearningIntro
            objective={lesson.objective.label}
            reason={
              ui?.reason ??
              'Starting with the source gives you the context and evidence you’ll use in the next activity.'
            }
            instruction={
              ui?.instruction ??
              'Read the supplied passage. Pick an idea to examine, then explain it in your own words.'
            }
          />
          <p className={styles.hint}>
            This source is available in text. Your learning actions stay the same.
          </p>
          <div className={styles.excerpts} data-text-only="true">
            {lesson.explanation.trim() && (
              <blockquote className={styles.excerpt}>{lesson.explanation}</blockquote>
            )}
            {lesson.excerpts?.map((excerpt, i) => (
              <blockquote className={styles.excerpt} key={i}>
                {excerpt.text}
              </blockquote>
            ))}
          </div>
          <button
            className={styles.primary}
            disabled={busy || !canParticipate}
            onClick={next}
          >
            Try a question →
          </button>
        </>
      ) : (
        <p>
          Your saved work is preserved. Return to your lessons to choose another source.
        </p>
      )}
    </section>
  );
}
