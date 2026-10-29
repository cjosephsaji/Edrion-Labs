'use client';

import type { ReactNode } from 'react';
import { MessageCircle } from 'lucide-react';
import type { CanvasElement } from '@edrion/schemas';
import { useTeachingTarget } from '@/features/learning-studio/target-registry';
import type {
  PresentationController,
  PresentationState,
} from '../presentation-controller';
import { EquationBoard } from './equation-board';
import { DiagramEditor } from './diagram-editor';
import { GraphTable } from './graph-table';
import { CodeTrace } from './code-trace';
import styles from './teaching-canvas.module.css';

function Card({
  element,
  state,
  controller,
  progress,
  response,
  run,
  onAsk,
}: {
  element: CanvasElement;
  state: PresentationState;
  controller: PresentationController;
  progress: number;
  response?: ReactNode;
  run: (fn: () => void) => void;
  onAsk: () => void;
}) {
  const ref = useTeachingTarget(element.id);
  const editable = Boolean(
    state.canvas.invitation &&
    !state.canvas.invitation.submitted &&
    state.progress === 1 &&
    state.canvas.invitation.editableIds.includes(element.id),
  );
  return (
    <article
      ref={ref}
      className={styles.card}
      data-element-id={element.id}
      data-highlighted={state.canvas.highlightedIds.includes(element.id)}
      data-selected={state.selectedId === element.id}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('button, input, textarea, select, a'))
          controller.select(element.id);
      }}
    >
      <button
        className={styles.select}
        aria-label={`Select ${element.label}`}
        aria-pressed={state.selectedId === element.id}
        onClick={() => controller.select(element.id)}
      >
        <span>{element.label}</span>
        <span>↗</span>
      </button>
      {element.kind === 'equation' ? (
        <EquationBoard
          element={element}
          progress={progress}
          editable={editable}
          change={(text) =>
            run(() =>
              controller.edit([
                {
                  type: 'replace_content',
                  id: element.id,
                  expectedVersion: element.version,
                  text,
                },
              ]),
            )
          }
        />
      ) : element.kind === 'graph' || element.kind === 'table' ? (
        <GraphTable
          element={element}
          editable={
            editable &&
            !!state.canvas.invitation?.allowedOperations.includes('replace_cell')
          }
          edit={async (op) => run(() => controller.edit([op]))}
        />
      ) : element.kind === 'trace' ? (
        <CodeTrace elements={[element]} />
      ) : element.kind === 'text' ? (
        <p className={styles.text}>
          {element.text.slice(0, Math.ceil(element.text.length * progress))}
          <span className={styles.srOnly}>{progress < 1 ? element.text : ''}</span>
        </p>
      ) : null}
      {element.editable && element.kind === 'equation' && response}
      {state.selectedId === element.id && (
        <div className={styles.cardActions}>
          <button className={styles.cardAsk} onClick={onAsk}>
            <MessageCircle size={15} aria-hidden="true" />
            Ask Petros about this
          </button>
          <button className={styles.cardClear} onClick={() => controller.select(null)}>
            Clear selection
          </button>
        </div>
      )}
    </article>
  );
}
export function TeachingCanvas({
  state,
  controller,
  response,
  run,
  onAsk,
  reducedMotion,
}: {
  state: PresentationState;
  controller: PresentationController;
  response?: ReactNode;
  run: (fn: () => void) => void;
  onAsk: () => void;
  reducedMotion: boolean;
}) {
  const beat = controller.timeline.beats[state.index]!;
  const progressiveIds = beat.action.operations.flatMap((op) =>
    op.type === 'add' || op.type === 'connect_elements' ? [op.element.id] : [],
  );
  const cards = state.canvas.elements.filter(
    (e) => e.kind !== 'node' && e.kind !== 'edge',
  );
  const hasDiagram = state.canvas.elements.some((e) => e.kind === 'node');
  const hasSlot = cards.some((e) => e.kind === 'equation' && e.editable);
  return (
    <section
      className={styles.canvas}
      aria-label="Interactive learning canvas"
      tabIndex={-1}
      data-canvas-revision={state.canvas.revision}
      data-has-diagram={hasDiagram}
      data-reduced-motion={reducedMotion}
      onClick={(event) => {
        if (
          !(event.target as Element).closest(
            '[data-element-id], [data-edge-hit], [data-connect-handle], button, input, textarea, select, a, [role="toolbar"]',
          )
        ) {
          controller.select(null);
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
    >
      {!state.canvas.elements.length && (
        <div className={styles.empty}>
          <span>EXPLORE TOGETHER</span>
          <h2>A place to think out loud.</h2>
          <p>Start the example, or take it one step at a time.</p>
        </div>
      )}
      {hasDiagram && (
        <DiagramEditor
          state={state}
          controller={controller}
          onAsk={onAsk}
          reducedMotion={reducedMotion}
        />
      )}
      <div className={styles.cards}>
        {cards.map((element) => (
          <Card
            key={element.id}
            element={element}
            state={state}
            controller={controller}
            progress={
              !reducedMotion && progressiveIds.includes(element.id) ? state.progress : 1
            }
            response={response}
            run={run}
            onAsk={onAsk}
          />
        ))}
      </div>
      {!hasSlot && response}
    </section>
  );
}
