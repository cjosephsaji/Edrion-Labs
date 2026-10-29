'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Server, Target } from 'lucide-react';
import { simulationRequestSchema, type SimulationRequest } from '@edrion/schemas';
import { LearningCard, LearningFacts, learningLabel } from '../learning-format';
import { experimentUI } from './experiment-ui';
import styles from '../learning-format.module.css';
import mathStyles from '../canvas/equation-board.module.css';
type Result = {
  values: Record<string, number>;
  summary: string;
  input?: SimulationRequest;
};
/** Only a server receipt supplies model outputs. Draft edits never run a solver. */
function ObservationModel({ result }: { result: Result }) {
  const input = result.input;
  if (!input) return null;
  if (input.kernel === 'resource-capacity.v1') {
    const capacity = result.values.capacity,
      available = result.values.availableGB;
    if (!Number.isSafeInteger(capacity) || capacity! < 0 || available === undefined)
      return null;
    const shown = Math.min(capacity!, 12);
    return (
      <figure
        className={styles.graph}
        aria-label={`Checked memory model: ${capacity} whole VMs, ${available} GB available`}
      >
        <figcaption>Memory allocation for the checked inputs</figcaption>
        <div className={mathStyles.barHeading}>
          <span>Total memory</span>
          <strong>{input.totalGB} GB</strong>
        </div>
        {input.totalGB > 0 ? (
          <div className={mathStyles.memoryBar} aria-hidden="true">
            {input.reservedGB > 0 && (
              <div className={mathStyles.reserved} style={{ flexGrow: input.reservedGB }}>
                <strong>{input.reservedGB} GB</strong>
              </div>
            )}
            {available > 0 && (
              <div className={mathStyles.available} style={{ flexGrow: available }}>
                <strong>{available} GB</strong>
              </div>
            )}
          </div>
        ) : (
          <p className={styles.hint}>No memory is available in these checked inputs.</p>
        )}
        <p className={styles.hint}>
          {input.reservedGB} GB set aside · {available} GB available
        </p>
        <div className={mathStyles.vmGroups} aria-hidden="true">
          {Array.from({ length: shown }, (_, i) => (
            <div key={i} className={mathStyles.vm}>
              <Server size={18} />
              <strong>VM {i + 1}</strong>
              <span>{input.perVMGB} GB</span>
            </div>
          ))}
          {capacity! > shown && (
            <span className={mathStyles.moreGroups}>+{capacity! - shown} more VMs</span>
          )}
        </div>
        <figcaption>
          {capacity} whole VMs · {input.perVMGB} GB each. Checked observation.
        </figcaption>
      </figure>
    );
  }
  if (input.kernel === 'linear-rate.v1')
    return (
      <figure className={styles.graph} aria-label="Checked rate observation">
        <figcaption>Rate and time for this checked observation</figcaption>
        <div className={mathStyles.quantityFlow}>
          <LearningFacts
            values={[
              { label: 'Rate', value: `${input.rate} requests/second` },
              { label: 'Time', value: `${input.seconds} seconds` },
            ]}
          />
          <ArrowRight size={24} aria-hidden="true" />
          <LearningFacts
            values={[{ label: 'Checked requests', value: result.values.requests }]}
          />
        </div>
      </figure>
    );
  const x = result.values.x,
    y = result.values.y;
  if (x === undefined || y === undefined) return null;
  const scale = Math.min(230 / Math.max(1, Math.abs(x)), 100 / Math.max(1, Math.abs(y)));
  return (
    <figure className={styles.graph} aria-label="Checked position at the selected time">
      <figcaption>
        <Target size={18} aria-hidden="true" />
        Position at {input.seconds} seconds · checked point
      </figcaption>
      <svg viewBox="0 0 600 300" aria-hidden="true">
        <path d="M40 150H560M300 30V270" stroke="#9ab4a3" />
        <line
          x1="300"
          y1="150"
          x2={300 + x * scale}
          y2={150 - y * scale}
          stroke="#7b91a8"
          strokeDasharray="5 4"
        />
        <circle cx={300 + x * scale} cy={150 - y * scale} r="9" fill="#3c6c52" />
        <text x="540" y="172" fontSize="15" fill="#3c5a48">
          x (m)
        </text>
        <text x="312" y="35" fontSize="15" fill="#3c5a48">
          y (m)
        </text>
      </svg>
      <figcaption>
        x: {x} m · y: {y} m. Values from the checked result.
      </figcaption>
    </figure>
  );
}
export function PredictionExplanation({
  initial,
  busy,
  result,
  run,
}: {
  initial: SimulationRequest;
  busy: boolean;
  result?: Result | null;
  run: (input: SimulationRequest) => Promise<unknown>;
}) {
  const definition = experimentUI[initial.kernel];
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initial)
        .filter(([key]) => key !== 'kernel')
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const [prediction, setPrediction] = useState(''),
    [needsRun, setNeedsRun] = useState(false),
    [explanation, setExplanation] = useState('');
  const runner = useRef(run);
  runner.current = run;
  const parsed = simulationRequestSchema.safeParse({
    kernel: initial.kernel,
    ...Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [
        key,
        value.trim() ? Number(value) : NaN,
      ]),
    ),
  });
  const reservationInvalid =
    parsed.success &&
    parsed.data.kernel === 'resource-capacity.v1' &&
    parsed.data.reservedGB > parsed.data.totalGB;
  const requestKey =
    parsed.success && !reservationInvalid ? JSON.stringify(parsed.data) : '';
  useEffect(() => {
    if (!needsRun || busy || !prediction.trim() || !requestKey) return;
    const timer = setTimeout(() => {
      setNeedsRun(false);
      void runner.current(JSON.parse(requestKey) as SimulationRequest);
    }, 450);
    return () => clearTimeout(timer);
  }, [requestKey, needsRun, busy, prediction]);
  const changed =
    !!result && (!result.input || JSON.stringify(result.input) !== requestKey);
  const currentStage = !prediction.trim()
    ? 0
    : explanation.trim() && result && !changed
      ? 3
      : result && !changed
        ? 2
        : 1;
  const outputLabels: Record<string, string> = result?.input
    ? experimentUI[result.input.kernel].outputs
    : {};
  return (
    <LearningCard
      family="experiment"
      title={`${definition.name} · predict, then compare`}
      badge="Exploration"
    >
      <p className={styles.hint}>
        {definition.scope} Your prediction and reflection are not assessed submissions.
      </p>
      <ol className={styles.stages} aria-label="Experiment stages">
        {['Predict', 'Change', 'Observe', 'Explain'].map((label, i) => (
          <li key={label} aria-current={i === currentStage ? 'step' : undefined}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!requestKey || !prediction.trim()) return;
          setNeedsRun(false);
          void run(JSON.parse(requestKey) as SimulationRequest);
        }}
      >
        <label>
          Your prediction and reason
          <textarea
            value={prediction}
            onChange={(event) => setPrediction(event.target.value)}
            maxLength={500}
            rows={2}
          />
        </label>
        <div className={styles.parameterGrid}>
          {definition.fields.map((field) => (
            <label key={field.key}>
              {field.label} ({field.unit})
              <input
                type="number"
                step="any"
                aria-label={`${field.label} (${field.unit})`}
                min={field.min}
                max={field.max}
                value={draft[field.key] ?? ''}
                disabled={busy}
                onChange={(event) => {
                  setDraft({ ...draft, [field.key]: event.target.value });
                  setNeedsRun(true);
                }}
              />
            </label>
          ))}
        </div>
        {needsRun && !requestKey && (
          <p role="alert">
            {reservationInvalid
              ? 'The memory set aside cannot exceed the total memory.'
              : 'Enter a valid number within each input’s stated range.'}
          </p>
        )}
        <button disabled={busy || !prediction.trim() || !requestKey}>
          Run bounded experiment
        </button>
      </form>
      <p role="status" className={styles.hint}>
        {busy
          ? 'Checking the model…'
          : result && !result.input
            ? 'The saved observation has no recorded inputs, so it cannot be matched to the current settings.'
            : changed
              ? 'Inputs changed. The observation below uses the last checked inputs.'
              : needsRun
                ? 'Parameters changed. A checked update follows your prediction.'
                : result
                  ? 'Checked observation ready. Compare it with your prediction.'
                  : 'Make a prediction, then run the model.'}
      </p>
      {result && (
        <section
          className={styles.observation}
          aria-label="Checked experiment observation"
        >
          <h4>{changed ? 'Last checked observation' : 'Checked observation'}</h4>
          <ObservationModel result={result} />
          <LearningFacts
            values={Object.entries(result.values).map(([key, value]) => ({
              label: outputLabels[key] ?? learningLabel(key),
              value,
            }))}
          />
          <p className={styles.hint}>{result.summary}</p>
          <label>
            Compare the observation with your prediction
            <textarea
              rows={3}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              maxLength={1000}
            />
          </label>
          <p className={styles.hint}>
            Your comparison is a local reflection, not an assessed submission.
          </p>
        </section>
      )}
    </LearningCard>
  );
}
