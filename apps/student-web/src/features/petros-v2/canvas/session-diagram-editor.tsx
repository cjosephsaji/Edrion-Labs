'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type {
  CanvasOperation,
  SharedCanvasState,
  M4Snapshot,
  CanvasElement,
} from '@edrion/schemas';
import {
  DiagramEditor as SharedDiagramEditor,
  type DiagramControls,
} from './diagram-editor';
import { CriterionFeedback } from '../feedback';
import { criteriaFor, criterionState } from '../feedback-state';
import type { PresentationState } from '../presentation-controller';
import formatStyles from '../learning-format.module.css';
function AnnotationEditor({
  element,
  busy,
  edit,
}: {
  element: CanvasElement;
  busy: boolean;
  edit: (op: CanvasOperation) => Promise<unknown>;
}) {
  const [text, setText] = useState(element.annotation ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void edit({
          type: 'annotate',
          id: element.id,
          expectedVersion: element.version,
          text,
        });
      }}
    >
      <label>
        Explain or annotate {element.label}
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          disabled={busy}
        />
      </label>
      <button disabled={busy || !text.trim() || text === element.annotation}>
        Save annotation
      </button>
    </form>
  );
}
export function DiagramEditor({
  canvas,
  snapshot,
  busy,
  edit,
  textOnly = false,
  undo,
  redo,
}: {
  snapshot: M4Snapshot;
  undo: () => void;
  redo: () => void;
  canvas: SharedCanvasState;
  busy: boolean;
  textOnly?: boolean;
  edit: (op: CanvasOperation | CanvasOperation[]) => Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodes = canvas.elements.filter((e) => e.kind === 'node'),
    edges = canvas.elements.filter((e) => e.kind === 'edge');
  const editable = nodes.filter(
    (e) => !canvas.invitation?.submitted && canvas.invitation?.editableIds.includes(e.id),
  );
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [relation, setRelation] = useState<'supports' | 'connects' | 'provides'>('connects');
  if (!nodes.length) return null;
  const selected = canvas.elements.find((e) => e.id === selectedId);
  const state: PresentationState = {
    canvas: {
      ...canvas,
      highlightedIds:
        snapshot.submission && !snapshot.teaching ? [] : canvas.highlightedIds,
      ...(busy ? { invitation: null } : {}),
    },
    index: 0,
    progress: 1,
    status: 'awaiting_response',
    epoch: 0,
    selectedId,
    explanation: '',
    feedback: null,
    speech: { phase: 'text', currentTime: 0, duration: null, reason: null },
  };
  const controller: DiagramControls = {
    edit: (operations) => {
      // The reviewed invitation may allow link replacement only through its
      // existing disconnect + connect operations. Never broaden permissions.
      const changes = operations.flatMap((op) => {
        const old =
          op.type === 'replace_content' ? edges.find((e) => e.id === op.id) : null;
        if (!old || canvas.invitation?.allowedOperations.includes('replace_content'))
          return [op];
        if (
          !canvas.invitation?.allowedOperations.includes('disconnect') ||
          !canvas.invitation.allowedOperations.includes('connect_elements') ||
          op.type !== 'replace_content' ||
          !['connects', 'supports', 'provides'].includes(op.text)
        )
          throw new Error('This relationship change is outside the current invitation.');
        return [
          { type: 'disconnect' as const, id: old.id, expectedVersion: old.version },
          {
            type: 'connect_elements' as const,
            element: {
              ...old,
              id: `link-${crypto.randomUUID()}`,
              version: 1,
              relation: op.text as 'connects' | 'supports' | 'provides',
              text: op.text,
            },
          },
        ];
      });
      void edit(changes).then(() => {
        const connected = changes.find((op) => op.type === 'connect_elements');
        if (connected?.type === 'connect_elements') setSelectedId(connected.element.id);
      });
    },
    select: setSelectedId,
    getSnapshot: () => state,
    undo,
    redo,
    canUndo: () => !canvas.invitation?.submitted && canvas.draftRevision > 0,
    canRedo: () => !canvas.invitation?.submitted && canvas.draftRevision > 0,
    timeline: {
      schemaVersion: 'petros.v2.timeline.v1',
      mode: 'public_fixture',
      id: 'session-view',
      activityId: canvas.activityId,
      branchId: canvas.branchId,
      beats: [],
    },
  };
  return (
    <div>
      {!textOnly && (
        <SharedDiagramEditor
          state={state}
          controller={controller}
          onAsk={() => setSelectedId(null)}
          reducedMotion={true}
          feedback={Object.fromEntries(
            edges.map((e) => [
              e.id,
              criteriaFor(snapshot, { elementId: e.id }).map((c) =>
                criterionState(snapshot, c),
              )[0] ?? (e.editable ? 'saved' : 'not-selected'),
            ]),
          )}
        />
      )}
      {textOnly && (
        <ul aria-label="Diagram elements">
          {nodes.map((node) => (
            <li key={node.id}>
              <button
                aria-pressed={selectedId === node.id}
                onClick={() => setSelectedId(node.id)}
              >
                {node.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={formatStyles.hint}>
        Read each connection as a sentence, from its starting idea to its destination.
      </p>
      <ul className={formatStyles.connections} aria-label="Diagram relationships">
        {edges.length ? (
          edges.map((e) => (
            <li
              key={e.id}
              data-feedback={
                criteriaFor(snapshot, { elementId: e.id }).map((c) =>
                  criterionState(snapshot, c),
                )[0] ?? 'saved'
              }
            >
              <strong>{nodes.find((n) => n.id === e.from)?.text}</strong>
              <span className={formatStyles.connectionLabel}>
                <ArrowRight size={15} aria-hidden="true" />
                {e.relation}
                <ArrowRight size={15} aria-hidden="true" />
              </span>
              <strong>{nodes.find((n) => n.id === e.to)?.text}</strong>
              {criteriaFor(snapshot, { elementId: e.id }).map((c) => (
                <CriterionFeedback
                  key={c.criterionId}
                  snapshot={snapshot}
                  criterion={c}
                />
              ))}
              {!canvas.invitation?.submitted &&
                canvas.invitation?.allowedOperations.includes('disconnect') &&
                canvas.invitation.editableIds.includes(e.id) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void edit({
                        type: 'disconnect',
                        id: e.id,
                        expectedVersion: e.version,
                      })
                    }
                  >
                    Remove relationship
                  </button>
                )}
            </li>
          ))
        ) : (
          <li>No relationships yet.</li>
        )}
      </ul>
      {editable.length > 1 &&
        canvas.invitation?.allowedOperations.includes('connect_elements') && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const a = editable.find((e) => e.id === from);
              if (!a || !to || from === to) return;
              void edit({
                type: 'connect_elements',
                element: {
                  id: `link-${crypto.randomUUID()}`,
                  version: 1,
                  kind: 'edge',
                  label: 'Student relationship',
                  editable: true,
                  sourceId: a.sourceId,
                  from,
                  to,
                  relation,
                  text: relation,
                },
              });
            }}
          >
            <label>
              From{' '}
              <select
                aria-label="From"
                value={from}
                required
                disabled={busy}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">Choose an element</option>
                {editable.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.text}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Relationship{' '}
              <select
                aria-label="Relationship"
                value={relation}
                disabled={busy}
                onChange={(e) => setRelation(e.target.value as typeof relation)}
              >
                <option value="connects">connects</option>
                <option value="supports">supports</option>
                <option value="provides">provides</option>
              </select>
            </label>
            <label>
              To{' '}
              <select
                aria-label="To"
                value={to}
                required
                disabled={busy}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Choose an element</option>
                {editable.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.text}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || !from || !to || from === to}>
              Save relationship
            </button>
          </form>
        )}
      {selected &&
        canvas.invitation?.allowedOperations.includes('annotate') &&
        !canvas.invitation.submitted &&
        canvas.invitation.editableIds.includes(selected.id) && (
          <AnnotationEditor
            key={`${selected.id}:${selected.version}`}
            element={selected}
            busy={busy}
            edit={edit}
          />
        )}
    </div>
  );
}
