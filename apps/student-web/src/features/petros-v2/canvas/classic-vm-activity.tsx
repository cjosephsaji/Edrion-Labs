'use client';
import { useContext, useEffect, useRef, useState, type RefCallback, type ReactNode } from 'react';
import { ClassicPresentationContext } from '../companion/classic-companion';
import { AlertTriangle, ChevronDown, Plus, Server } from 'lucide-react';
import {
  allocationAttemptObservation,
  currentAllocationAttempt,
  type ResourceAllocation,
} from '@edrion/schemas';
import styles from './classic-vm-activity.module.css';
import {
  LearningStageIndicator,
  PrimaryLearningAction,
  LearningFeedback,
} from '../classic-learning';

/** Classic presentation of the existing per-operation reviewed activity. No solver,
 * response store or assessment policy lives in this component. */
export function ClassicVMActivity({
  resource: r,
  busy,
  canChange,
  editable,
  explanationEditable,
  textOnly,
  explanation,
  dirty,
  onExplanation,
  saveExplanation,
  predict,
  allocate,
  close,
  memoryRef,
  optionalTools,
}: {
  resource: ResourceAllocation;
  busy: boolean;
  canChange: boolean;
  editable: boolean;
  explanationEditable: boolean;
  textOnly: boolean;
  explanation: string;
  dirty: boolean;
  onExplanation: (text: string) => void;
  saveExplanation: () => Promise<unknown>;
  predict: (expectation: 'fits' | 'does_not_fit') => Promise<unknown>;
  allocate: (count: number) => Promise<unknown>;
  close: (disposition: 'next' | 'cancel') => unknown;
  memoryRef: RefCallback<HTMLDivElement>;
  optionalTools?: ReactNode;
}) {
  const attempt = currentAllocationAttempt(r),
    result = allocationAttemptObservation(r, attempt),
    model = r.model,
    quantities = r.observations.at(-1),
    predicted = attempt?.status === 'predicted',
    nextCount = predicted ? attempt.requestedCount : r.allocatedCount + 1;
  const [selection, setSelection] = useState<'fits' | 'does_not_fit' | null>(null);
  const [explaining, setExplaining] = useState(!!attempt?.explanation);
  const [pending, setPending] = useState(false);
  const refusedId = result && !result.admitted ? attempt?.id : undefined;
  const previousRefusal = useRef(refusedId);
  const [animatedRefusal, setAnimatedRefusal] = useState<string>();
  useEffect(() => {
    if (previousRefusal.current !== refusedId) {
      previousRefusal.current = refusedId;
      setAnimatedRefusal(refusedId);
    }
  }, [refusedId]);
  const requestedVMs = nextCount - r.allocatedCount;
  const refusedVMs = attempt ? attempt.requestedCount - attempt.initial.allocatedCount : 1;
  const flight = useRef(false);
  const presentation = useContext(ClassicPresentationContext);
  useEffect(() => {
    setSelection(null);
    setExplaining(!!attempt?.explanation);
  }, [attempt?.id, attempt?.explanation]);
  const stage = result && explaining ? 2 : predicted || result ? 1 : 0;
  const locked = busy || pending;
  const perform = async (action: () => Promise<unknown>) => {
    if (flight.current || busy) return;
    flight.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      flight.current = false;
      setPending(false);
    }
  };
  return (
    <section
      className={styles.activity}
      data-classic-vm
      data-vm-stage={stage}
      data-resource-count={r.allocatedCount}
      data-attempt-id={attempt?.id}
      data-experiment-state={locked ? 'saving' : (attempt?.status ?? 'ready')}
    >
      <LearningStageIndicator
        labels={['Predict', 'Try it', 'Explain']}
        current={stage}
        label="Experiment progress"
      />
      <h2>
        {stage === 0
          ? 'First, make a prediction'
          : stage === 1
            ? 'Let’s test it'
            : result?.admitted
              ? 'Why did this VM fit?'
              : 'Why didn’t another VM fit?'}
      </h2>
      <p className={styles.lead}>
        {stage === 0
          ? `The computer has ${model.totalGB} GB. The system uses ${model.reservedGB} GB. Each VM needs ${model.perVMGB} GB.`
          : stage === 1
            ? 'Add virtual machines and watch how much memory remains.'
            : `${result!.allocatedCount} VMs use ${result!.allocatedGB} GB. Another VM needs ${model.perVMGB} GB.`}
      </p>

      <div
        ref={memoryRef}
        className={styles.memory}
        aria-label="Memory allocation area"
        data-allocation-drop
      >
        <div className={styles.memoryHeading}>
          <strong>Computer memory</strong>
          <b>{model.totalGB} GB total</b>
        </div>
        {!textOnly && (
          <div
            key={result && !result.admitted ? attempt?.id : 'memory'}
            className={styles.bar}
            data-refused={!!result && !result.admitted}
            data-refusal-motion={!!refusedId && animatedRefusal === refusedId}
            aria-hidden="true"
          >
            {model.reservedGB > 0 && (
              <span className={styles.reserved} style={{ flexGrow: model.reservedGB }} />
            )}
            {!!quantities?.allocatedGB && (
              <span className={styles.used} style={{ flexGrow: quantities.allocatedGB }} />
            )}
            {!!quantities?.remainingGB && (
              <span className={styles.free} style={{ flexGrow: quantities.remainingGB }} />
            )}
            {refusedId && animatedRefusal === refusedId && (
              <span className={styles.ghost}>
                <Server size={22} />
              </span>
            )}
          </div>
        )}
        <div className={styles.legend}>
          <span>▧ {model.reservedGB} GB reserved</span>
          <span>
            {quantities?.availableGB ?? '—'} GB available · {model.perVMGB} GB per VM
          </span>
        </div>
        {!textOnly && stage !== 0 && (
          <div className={styles.tiles} aria-label="Accepted virtual machines">
            {Array.from(
              { length: Math.min(24, quantities?.capacity ?? r.allocatedCount) },
              (_, i) => (
                <span key={i} className={styles.tile} data-filled={i < r.allocatedCount}>
                  <Server size={21} aria-hidden="true" />
                  <strong>{i < r.allocatedCount ? `VM ${i + 1}` : 'Empty'}</strong>
                  <small>{model.perVMGB} GB</small>
                </span>
              ),
            )}
            {r.allocatedCount > 24 && <span>+{r.allocatedCount - 24} accepted VMs</span>}
          </div>
        )}
        <p className={styles.summary}>
          {r.allocatedCount} VMs · {quantities?.allocatedGB ?? '—'} GB used ·{' '}
          {quantities?.remainingGB ?? '—'} GB free
        </p>
      </div>

      {stage === 0 && editable && (
        <fieldset className={styles.prediction} disabled={!canChange || locked}>
          <legend>Will VM {nextCount} fit in the remaining memory?</legend>
          <p className={styles.policy}>This activity records a prediction before each test.</p>
          <div className={styles.choices}>
            {(['fits', 'does_not_fit'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="vm-prediction"
                  checked={selection === value}
                  onChange={() => setSelection(value)}
                />
                <span>{value === 'fits' ? 'It will fit' : 'It won’t fit'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {stage === 0 && editable && (
        <div className={styles.action}>
          <span>
            {selection ? 'Ready to save your prediction.' : 'Choose an answer to continue.'}
          </span>
          <PrimaryLearningAction
            className={styles.primary}
            disabled={!selection || !canChange || locked}
            onClick={() => selection && void perform(() => predict(selection))}
          >
            {locked ? 'Saving prediction…' : 'Try my prediction'}
          </PrimaryLearningAction>
        </div>
      )}
      {predicted && (
        <>
          <p className={styles.policy}>
            Your saved prediction:{' '}
            {attempt.prediction?.expectation === 'fits' ? 'it will fit' : 'it won’t fit'}.
          </p>
          <PrimaryLearningAction
            className={styles.primary}
            disabled={!canChange || locked}
            onClick={() => void perform(() => allocate(nextCount))}
          >
            <Plus size={18} aria-hidden="true" />
            {locked
              ? 'Testing…'
              : requestedVMs === 1
                ? `Add a VM (${model.perVMGB} GB)`
                : `Add ${requestedVMs} VMs (${requestedVMs * model.perVMGB} GB)`}
          </PrimaryLearningAction>
        </>
      )}
      <LearningFeedback
        kind={
          locked ? 'pending' : result ? (result.admitted ? 'accepted' : 'refused') : 'information'
        }
        label="Current experiment"
        className={styles.feedback}
      >
        {locked ? (
          <p>Waiting for your saved lesson…</p>
        ) : result ? (
          <>
            {!result.admitted && <AlertTriangle size={22} aria-hidden="true" />}
            <div>
              <strong>{result.admitted ? 'VM added' : 'Not enough room'}</strong>
              <p>
                {result.admitted
                  ? `${result.allocatedCount} VMs now use ${result.allocatedGB} GB; ${result.remainingGB} GB remain.`
                  : refusedVMs === 1
                    ? `There is ${result.remainingGB} GB left, but another VM needs ${model.perVMGB} GB.`
                    : `There is ${result.remainingGB} GB left, but this request needs ${refusedVMs * model.perVMGB} GB for ${refusedVMs} VMs.`}
              </p>
            </div>
          </>
        ) : (
          <p>
            {predicted
              ? 'Your prediction is saved. Try adding the VM.'
              : 'Make your prediction, then test it.'}
          </p>
        )}
      </LearningFeedback>
      {result && (
        <div className={styles.comparison}>
          <div>
            <small>Your prediction</small>
            <strong>
              {attempt?.prediction?.expectation === 'fits' ? 'It will fit' : 'It won’t fit'}
            </strong>
          </div>
          <div>
            <small>What happened</small>
            <strong>
              {result.admitted ? 'Accepted' : 'Refused'} · {result.allocatedCount} VMs
            </strong>
          </div>
        </div>
      )}
      {result && !explaining && (
        <div className={styles.action}>
          {result.admitted && editable && (
            <button
              className={styles.primary}
              disabled={!canChange || locked}
              onClick={() => close('next')}
            >
              Try another VM
            </button>
          )}
          {explanationEditable && (
            <button
              className={result.admitted ? undefined : styles.primary}
              onClick={() => {
                setExplaining(true);
                if (attempt) presentation.explain(attempt.id);
              }}
            >
              Explain what happened
            </button>
          )}
        </div>
      )}
      {result && explaining && explanationEditable && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(saveExplanation);
          }}
        >
          <label className={styles.field}>
            Explain it in your own words
            <textarea
              rows={4}
              maxLength={500}
              value={explanation}
              disabled={!editable || locked}
              placeholder="Another VM couldn’t fit because…"
              onChange={(event) => onExplanation(event.target.value)}
            />
          </label>
          <p role="status" className={styles.policy}>
            {dirty
              ? 'Unsaved changes · Save to keep your explanation.'
              : attempt?.explanation
                ? 'Saved · Not checked yet'
                : 'Your explanation has not been saved yet.'}
          </p>
          <PrimaryLearningAction
            className={styles.primary}
            disabled={
              !editable ||
              locked ||
              !explanation.trim() ||
              (!dirty && explanation === attempt?.explanation?.text)
            }
          >
            {locked ? 'Saving explanation…' : 'Save my explanation'}
          </PrimaryLearningAction>
        </form>
      )}
      <details className={styles.options}>
        <summary>
          More options <ChevronDown size={18} aria-hidden="true" />
        </summary>
        {optionalTools}
        <div className={styles.optionActions}>
          {editable && (
            <>
              <button
                disabled={!canChange || locked || r.allocatedCount === 0}
                onClick={() => void perform(() => allocate(r.allocatedCount - 1))}
              >
                Remove last VM
              </button>
              <button
                disabled={!canChange || locked || r.allocatedCount === 0}
                onClick={() => void perform(() => allocate(0))}
              >
                Reset experiment
              </button>
              {predicted && (
                <button disabled={!canChange || locked} onClick={() => close('cancel')}>
                  Cancel this test
                </button>
              )}
              {result && (
                <button disabled={!canChange || locked} onClick={() => close('next')}>
                  Start another test
                </button>
              )}
            </>
          )}
        </div>
        <p>
          Fixed system reservation · equal {model.perVMGB} GB VMs · memory only · no overcommit.
          Resetting keeps recorded history. An observation is not a grade.
        </p>
        <details>
          <summary>Earlier experiments</summary>
          <ol>
            {(r.attempts ?? [])
              .filter((a) => a.id !== attempt?.id)
              .slice()
              .reverse()
              .map((a) => {
                const observation = allocationAttemptObservation(r, a);
                return (
                  <li key={a.id} data-history-attempt={a.id}>
                    <strong>
                      {a.operation} · VM {a.requestedCount}
                    </strong>
                    <p>
                      {a.prediction
                        ? `Predicted: ${a.prediction.expectation === 'fits' ? 'will fit' : 'won’t fit'}. `
                        : ''}
                      {observation
                        ? `${observation.admitted ? 'Accepted' : 'Refused'} · ${observation.allocatedCount} VMs · ${observation.remainingGB} GB free.`
                        : 'No allocation was run.'}{' '}
                      {a.status}.
                    </p>
                    {a.explanation && <p>{a.explanation.text} · Saved, not checked.</p>}
                    <details>
                      <summary>Test provenance</summary>
                      <pre>{JSON.stringify(a, null, 2)}</pre>
                    </details>
                  </li>
                );
              })}
          </ol>
        </details>
        {attempt && (
          <details>
            <summary>Current test details</summary>
            <pre>{JSON.stringify(attempt, null, 2)}</pre>
          </details>
        )}
      </details>
    </section>
  );
}
