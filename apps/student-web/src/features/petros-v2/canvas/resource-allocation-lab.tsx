'use client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Server, Plus, Minus, RotateCcw } from 'lucide-react';
import {
  currentAllocationAttempt,
  allocationAttemptObservation,
  type CanvasElement,
  type CanvasOperation,
  type ResourceAllocation,
} from '@edrion/schemas';
import styles from './resource-allocation-lab.module.css';
import { ClassicVMActivity } from './classic-vm-activity';
type ExplanationDraft = {
  key: string;
  value: string;
  change: (value: string) => void;
  save: () => Promise<unknown>;
};
function restoreExplanation(draft: ExplanationDraft | undefined, key: string, fallback: string) {
  try {
    const saved = JSON.parse(draft?.value ?? '');
    if (
      saved.kind === 'resource-explanation.v1' &&
      saved.key === key &&
      typeof saved.text === 'string' &&
      saved.text.length <= 500
    )
      return saved.text as string;
  } catch {
    /* Another response format owns that draft. */
  }
  return fallback;
}
export function allocationChallenge(r: ResourceAllocation) {
  const a = currentAllocationAttempt(r);
  return !a
    ? `Can VM ${r.allocatedCount + 1} fit in the remaining memory?`
    : a.status === 'predicted'
      ? `Test your prediction for VM ${a.requestedCount}`
      : `What happened when you tried VM ${a.requestedCount}?`;
}
/** A current attempt joins only its own acknowledged observation. Older operations
 * remain in bounded checkpoint-backed history and never answer the next question. */
export function ResourceAllocationLab({
  element,
  editable,
  busy,
  edit,
  textOnly = false,
  draft,
  explanationEditable = true,
  activityMode = 'explore',
  onDraftDirty,
  memoryTargetRef,
  classic = false,
  moreOptions,
}: {
  element: Extract<CanvasElement, { kind: 'allocation' }>;
  editable: boolean;
  busy: boolean;
  edit: (op: CanvasOperation) => Promise<unknown>;
  textOnly?: boolean;
  draft?: ExplanationDraft;
  explanationEditable?: boolean;
  activityMode?: 'explore' | 'practice';
  onDraftDirty?: (dirty: boolean) => void;
  memoryTargetRef?: RefCallback<HTMLElement>;
  classic?: boolean;
  moreOptions?: ReactNode;
}) {
  const r = element.resource,
    m = r.model,
    allocation = r.observations.at(-1);
  const attempt = currentAllocationAttempt(r),
    observation = allocationAttemptObservation(r, attempt);
  const scope = `${draft?.key ?? element.id}:${attempt?.id ?? 'ready'}`;
  const [explanation, setExplanation] = useState(() =>
    restoreExplanation(draft, scope, attempt?.explanation?.text ?? ''),
  );
  const [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false);
  const previousScope = useRef(scope);
  // Reset an accepted attempt before paint so a fast new input cannot be
  // overwritten by the previous attempt’s passive scope synchronization.
  useLayoutEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      dirtyRef.current = false;
      setDirty(false);
      setExplanation(restoreExplanation(draft, scope, attempt?.explanation?.text ?? ''));
    } else if (!dirtyRef.current)
      setExplanation(restoreExplanation(draft, scope, attempt?.explanation?.text ?? ''));
  }, [scope, draft, attempt?.explanation?.text]);
  useEffect(() => {
    onDraftDirty?.(dirty);
  }, [dirty, onDraftDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const [dragPreview, setDragPreview] = useState<{
    x: number;
    y: number;
    overMemory: boolean;
  } | null>(null);
  const dragging = dragPreview !== null;
  const drag = useRef<{ x: number; y: number; moved: boolean; pointerId: number } | null>(null),
    drop = useRef<HTMLDivElement | null>(null);
  const cancelDrag = useCallback(() => {
    drag.current = null;
    setDragPreview(null);
  }, []);
  const memoryRef = useCallback(
    (node: HTMLDivElement | null) => {
      drop.current = node;
      memoryTargetRef?.(node);
    },
    [memoryTargetRef],
  );
  const unlocked = editable && !busy,
    canChange = unlocked && !dirty;
  const predicted = attempt?.status === 'predicted',
    hasResult = !!observation;
  useEffect(cancelDrag, [cancelDrag, canChange, scope, element.version, textOnly]);
  useEffect(() => {
    if (!dragging) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelDrag();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [dragging, cancelDrag]);
  const nextCount = predicted ? attempt.requestedCount : r.allocatedCount + 1;
  const change = (requestedCount: number) =>
    edit({
      type: 'change_allocation',
      id: element.id,
      expectedVersion: element.version,
      requestedCount,
      ...(predicted ? { attemptId: attempt.id } : {}),
    });
  const predict = (expectation: 'fits' | 'does_not_fit') =>
    edit({
      type: 'predict_allocation',
      id: element.id,
      expectedVersion: element.version,
      prediction: { requestedCount: nextCount, expectation },
    });
  const close = (disposition: 'next' | 'cancel') =>
    attempt &&
    edit({
      type: 'close_allocation_attempt',
      id: element.id,
      expectedVersion: element.version,
      attemptId: attempt.id,
      disposition,
    });
  const history = (r.attempts ?? [])
    .filter((a) => a.id !== attempt?.id)
    .slice()
    .reverse();
  const support =
    attempt?.prediction &&
    observation &&
    (attempt.prediction.expectation === 'fits') === observation.admitted;
  const changeExplanation = (text: string) => {
    dirtyRef.current = true;
    setDirty(true);
    setExplanation(text);
    draft?.change(JSON.stringify({ kind: 'resource-explanation.v1', key: scope, text }));
  };
  const saveExplanation = async () => {
    const receipt = await edit({
      type: 'annotate',
      id: element.id,
      expectedVersion: element.version,
      text: explanation,
    });
    if (receipt && (receipt as { status?: string }).status === 'committed') {
      dirtyRef.current = false;
      setDirty(false);
      await draft?.save();
    }
    return receipt;
  };
  const dragHandle = editable && predicted && !textOnly && (
    <button
      type="button"
      className={styles.dragHandle}
      disabled={!canChange}
      aria-label="Drag a VM into memory, or press Enter to add one"
      data-allocation-drag-source
      onClick={(event) => {
        if (event.detail === 0) void change(nextCount);
      }}
      onPointerDown={(event) => {
        if (!canChange || event.button !== 0 || event.isPrimary === false) return;
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          moved: false,
          pointerId: event.pointerId,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (
          canChange &&
          drag.current &&
          drag.current.pointerId === event.pointerId &&
          Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 6
        ) {
          drag.current.moved = true;
          const rect = drop.current?.getBoundingClientRect();
          setDragPreview({
            x: Math.max(8, Math.min(event.clientX - 60, window.innerWidth - 132)),
            y: Math.max(8, event.clientY - 84),
            overMemory:
              !!rect &&
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom,
          });
          event.preventDefault();
        }
      }}
      onPointerUp={(event) => {
        const moved = drag.current?.moved && drag.current.pointerId === event.pointerId,
          rect = drop.current?.getBoundingClientRect();
        cancelDrag();
        if (
          canChange &&
          moved &&
          rect &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        )
          void change(nextCount);
      }}
      onPointerCancel={cancelDrag}
      onLostPointerCapture={cancelDrag}
    >
      <Server size={24} aria-hidden="true" />
      <span>
        <strong>New VM</strong>
        <small>{m.perVMGB} GB memory</small>
      </span>
      <span className={styles.dragHint}>Drag into memory</span>
    </button>
  );
  const dragOverlay =
    dragPreview &&
    canChange &&
    predicted &&
    !textOnly &&
    createPortal(
      <div
        className={`${styles.vm} ${styles.dragPreview}`}
        style={{ transform: `translate(${dragPreview.x}px, ${dragPreview.y}px)` }}
        aria-hidden="true"
        data-allocation-drag-preview
      >
        <Server size={18} />
        <strong>New VM</strong>
        <small>{m.perVMGB} GB memory</small>
      </div>,
      document.body,
    );
  if (classic)
    return (
      <>
        <ClassicVMActivity
          resource={r}
          busy={busy}
          canChange={canChange}
          editable={editable}
          explanationEditable={explanationEditable}
          textOnly={textOnly}
          explanation={explanation}
          dirty={dirty}
          onExplanation={changeExplanation}
          saveExplanation={saveExplanation}
          predict={predict}
          allocate={change}
          close={close}
          memoryRef={memoryRef}
          optionalTools={
            <>
              <div className={styles.controls}>{dragHandle}</div>
              {moreOptions}
            </>
          }
        />
        {dragOverlay}
      </>
    );
  return (
    <div
      className={styles.lab}
      data-resource-count={r.allocatedCount}
      data-attempt-id={attempt?.id}
      data-experiment-state={busy && predicted ? 'running' : (attempt?.status ?? 'ready')}
    >
      <div className={styles.overview}>
        <span>
          Total <strong>{m.totalGB} GB</strong>
        </span>
        <span>
          Host reservation <strong>{m.reservedGB} GB</strong>
        </span>
        <span>
          Each whole VM <strong>{m.perVMGB} GB</strong>
        </span>
        {allocation && (
          <span>
            Available for VMs <strong>{allocation.availableGB} GB</strong>
          </span>
        )}
      </div>
      <div
        ref={memoryRef}
        className={`${styles.memory} ${dragging ? styles.dropActive : ''} ${dragPreview?.overMemory ? styles.dropReady : ''}`}
        aria-label="Memory allocation area"
        data-allocation-drop
      >
        {!textOnly && (
          <>
            <div className={styles.bar} aria-hidden="true">
              <span className={styles.reserved} style={{ flexGrow: m.reservedGB }} />
              {allocation && (
                <>
                  <span className={styles.allocated} style={{ flexGrow: allocation.allocatedGB }} />
                  <span className={styles.remaining} style={{ flexGrow: allocation.remainingGB }} />
                </>
              )}
            </div>
            <div className={styles.legend}>
              <span>▧ Reserved</span>
              <span>▣ VM allocations</span>
              <span>□ Remaining</span>
            </div>
            {editable && predicted && (
              <p className={styles.dropHint} aria-hidden="true">
                {dragPreview?.overMemory
                  ? 'Release to test this VM'
                  : 'Drop the new VM into this memory area'}
              </p>
            )}
            <div className={styles.blocks} aria-hidden="true">
              {Array.from({ length: Math.min(12, r.allocatedCount) }, (_, i) => (
                <span className={styles.vm} key={i}>
                  <Server size={18} />
                  <b>VM {i + 1}</b>
                  <small>{m.perVMGB} GB</small>
                </span>
              ))}
              {r.allocatedCount > 12 && <span>+ {r.allocatedCount - 12} VMs</span>}
              {r.allocatedCount === 0 && (
                <span className={styles.empty}>No VM memory allocated</span>
              )}
            </div>
          </>
        )}
        <dl className={styles.readout}>
          <div>
            <dt>Allocated VMs</dt>
            <dd>{r.allocatedCount}</dd>
          </div>
          {allocation && (
            <>
              <div>
                <dt>VM memory used</dt>
                <dd>{allocation.allocatedGB} GB</dd>
              </div>
              <div>
                <dt>Remaining for VMs</dt>
                <dd>{allocation.remainingGB} GB</dd>
              </div>
              <div>
                <dt>Utilization of available memory</dt>
                <dd>{allocation.utilizationPercent.toFixed(1)}%</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className={styles.experiment}>
        {editable && !hasResult && (
          <fieldset className={styles.prediction} disabled={!canChange}>
            <legend>Your prediction · VM {nextCount}</legend>
            <button
              type="button"
              aria-pressed={predicted && attempt.prediction?.expectation === 'fits'}
              onClick={() => void predict('fits')}
            >
              It will fit
            </button>
            <button
              type="button"
              aria-pressed={predicted && attempt.prediction?.expectation === 'does_not_fit'}
              onClick={() => void predict('does_not_fit')}
            >
              It won’t fit
            </button>
          </fieldset>
        )}
        {predicted && (
          <p className={styles.saved}>
            Your prediction:{' '}
            {attempt.prediction?.expectation === 'fits'
              ? 'another VM will fit'
              : 'another VM won’t fit'}
            . Test it when you’re ready.
          </p>
        )}
        {editable && predicted && (
          <div className={styles.controls}>
            <button type="button" disabled={!canChange} onClick={() => void change(nextCount)}>
              <Plus size={16} /> Add one VM
            </button>
            {dragHandle}
            <button type="button" disabled={!canChange} onClick={() => void close('cancel')}>
              Cancel this test
            </button>
          </div>
        )}
        <section
          className={styles.observation}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Current experiment"
        >
          {busy ? (
            <p>{predicted ? 'Testing your prediction…' : 'Saving your change…'}</p>
          ) : hasResult && attempt ? (
            <>
              <strong>What happened · VM {attempt.requestedCount}</strong>
              <p>
                Your prediction:{' '}
                {attempt.prediction?.expectation === 'fits' ? 'it will fit' : 'it won’t fit'}.
              </p>
              <p>
                Observed:{' '}
                {observation.admitted
                  ? `the allocation was accepted. ${observation.allocatedCount} VMs now use ${observation.allocatedGB} GB; ${observation.remainingGB} GB remain.`
                  : `the allocation was refused. ${attempt.initial.remainingGB} GB were available, and a whole VM needs ${m.perVMGB} GB. The allocation stays at ${observation.allocatedCount} VMs.`}
              </p>
              <p>
                {support
                  ? 'This test supported your prediction.'
                  : 'This test did not support your prediction.'}{' '}
                It is an observation, not a grade.
              </p>
            </>
          ) : (
            <p>
              {predicted
                ? 'Your prediction is recorded. Add or drag one VM to find out what happens.'
                : 'Make a prediction to begin a new test. Earlier results are in your test history.'}
            </p>
          )}
        </section>
        {hasResult && attempt && (
          <details className={styles.comparison}>
            <summary>Compare this test</summary>
            <table>
              <caption>Before and after this attempt</caption>
              <thead>
                <tr>
                  <th>State</th>
                  <th>VMs</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Before</th>
                  <td>{attempt.initial.allocatedCount}</td>
                  <td>{attempt.initial.remainingGB} GB</td>
                </tr>
                <tr>
                  <th>After</th>
                  <td>{observation.allocatedCount}</td>
                  <td>{observation.remainingGB} GB</td>
                </tr>
              </tbody>
            </table>
          </details>
        )}
        {editable && explanationEditable && hasResult && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveExplanation();
            }}
          >
            <label>
              What happened, and why?
              <textarea
                rows={2}
                maxLength={500}
                value={explanation}
                disabled={busy}
                onChange={(event) => {
                  changeExplanation(event.target.value);
                }}
              />
            </label>
            <button
              disabled={
                !unlocked || !explanation.trim() || explanation === attempt?.explanation?.text
              }
            >
              Save explanation
            </button>
          </form>
        )}
        {attempt?.explanation && (
          <p className={styles.saved}>
            Explanation saved. It hasn’t been checked.
            <br />
            {attempt.explanation.text}
          </p>
        )}
        {editable && hasResult && (
          <button type="button" disabled={!canChange} onClick={() => void close('next')}>
            Try another VM
          </button>
        )}
        {dirty && <p className={styles.saved}>Save your explanation before changing the test.</p>}
      </div>
      {editable && (
        <details className={styles.tools}>
          <summary>Change the allocation</summary>
          <div className={styles.controls}>
            <button
              type="button"
              disabled={!canChange || r.allocatedCount === 0}
              onClick={() => void change(r.allocatedCount - 1)}
            >
              <Minus size={16} /> Remove one VM
            </button>
            <button
              type="button"
              disabled={!canChange || r.allocatedCount === 0}
              onClick={() => void change(0)}
            >
              <RotateCcw size={16} /> Reset allocation
            </button>
          </div>
        </details>
      )}
      <p className={styles.assumptions}>
        GB · fixed host reservation · whole {m.perVMGB} GB VMs · no overcommit.{' '}
        {activityMode === 'practice' ? 'Assisted practice' : 'Exploration'}.
      </p>
      <details className={styles.history}>
        <summary>Earlier tests ({history.length})</summary>
        <p className={styles.assumptions}>
          These are previous attempts. They do not answer your current question. Earlier checkpoints
          retain older records.
        </p>
        <ol>
          {history.map((a) => {
            const o = allocationAttemptObservation(r, a);
            return (
              <li key={a.id} data-history-attempt={a.id}>
                <strong>
                  {a.operation === 'demonstration'
                    ? 'Petros demonstration'
                    : a.operation === 'restore'
                      ? 'Restored allocation'
                      : a.operation === 'reset'
                        ? 'Reset'
                        : a.operation === 'release'
                          ? 'Released a VM'
                          : `Test: VM ${a.requestedCount}`}
                </strong>
                <p>
                  {a.prediction
                    ? `Predicted: ${a.prediction.expectation === 'fits' ? 'will fit' : 'won’t fit'}.`
                    : 'No prediction for this operation.'}{' '}
                  {o
                    ? `Observed: ${o.admitted ? 'accepted' : 'refused'}; ${o.allocatedCount} VMs; ${o.remainingGB} GB remain.`
                    : 'No allocation was run.'}{' '}
                  {a.status === 'cancelled'
                    ? 'Cancelled.'
                    : a.status === 'superseded'
                      ? 'Superseded.'
                      : ''}
                </p>
                {a.explanation && <p>Explanation: {a.explanation.text} · hasn’t been checked.</p>}
                <details>
                  <summary>Inspect test details</summary>
                  <dl className={styles.inspection}>
                    {Object.entries({
                      Attempt: a.id,
                      Session: a.sessionId,
                      Activity: a.activityId,
                      Source: a.sourceId,
                      'Source revision': a.sourceRevisionId,
                      'Source hash': a.sourceHash,
                      Kernel: a.kernel,
                      'Model revision': a.modelRevision,
                      'Initial VMs': a.initial.allocatedCount,
                      'Initial remaining GB': a.initial.remainingGB,
                      'Requested VMs': a.requestedCount,
                      Prediction: a.prediction?.expectation ?? 'none',
                      'Prediction time': a.predictedAt ?? 'none',
                      'Observed time': a.observedAt ?? 'none',
                      'Canvas revision': a.canvasRevision,
                      Status: a.status,
                    }).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </li>
            );
          })}
        </ol>
        {r.observations.some((o) => !o.attemptId) && (
          <p>
            Earlier allocations without an attempt link are retained in saved checkpoints; they are
            not used as the current result.
          </p>
        )}
      </details>
      {attempt && (
        <details className={styles.inspectionPanel}>
          <summary>Current test details</summary>
          <dl className={styles.inspection}>
            {Object.entries({
              Attempt: attempt.id,
              Session: attempt.sessionId,
              Activity: attempt.activityId,
              'Source revision': attempt.sourceRevisionId,
              'Source hash': attempt.sourceHash,
              Kernel: attempt.kernel,
              'Model revision': attempt.modelRevision,
              'Prediction time': attempt.predictedAt ?? 'none',
              'Observation time': attempt.observedAt ?? 'not run',
              'Canvas revision': attempt.canvasRevision,
              Status: attempt.status,
            }).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <details className={styles.assumptions}>
        <summary>About this memory model</summary>
        <p>
          This educational model ignores CPU, storage and hypervisor overhead. Predictions and
          explanations do not establish independent mastery.
        </p>
      </details>
      {dragOverlay}
    </div>
  );
}
