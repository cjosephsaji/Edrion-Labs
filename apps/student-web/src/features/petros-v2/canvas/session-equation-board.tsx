'use client';
import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { MathExpression } from '@/components/petros/petros-math';
import type { CanvasElement, CanvasOperation, EquationStep } from '@edrion/schemas';
import { EquationModel } from './equation-model';
import styles from './equation-board.module.css';
export function EquationBoard({
  element: e,
  editable,
  busy,
  edit,
  step,
  textOnly = false,
  compactExample = false,
}: {
  element: Extract<CanvasElement, { kind: 'equation' }>;
  editable: boolean;
  busy: boolean;
  edit: (op: CanvasOperation) => Promise<unknown>;
  step?: EquationStep;
  textOnly?: boolean;
  compactExample?: boolean;
}) {
  const [value, setValue] = useState(e.value);
  const example = (
    <div className={step && !textOnly ? styles.example : undefined}>
      <div className={styles.calculation}>
        <span className={styles.exampleLabel}>
          <Calculator size={14} aria-hidden="true" /> Worked example
        </span>
        <div aria-label="Checked equation" className={styles.formula}>
          <MathExpression value={e.tex} display />
        </div>
        <p>{e.explanation}</p>
      </div>
      {step && !textOnly && <EquationModel step={step} />}
    </div>
  );
  return (
    <div className={styles.board}>
      {compactExample ? (
        <>
          <p className={styles.savedValue}>
            <span>Saved value</span>
            <strong>{e.value}</strong>
            {step && <span>{step.result.unit}</span>}
          </p>
          <details className={styles.workedExample}>
            <summary>See the worked example</summary>
            {example}
          </details>
        </>
      ) : (
        example
      )}
      {editable ? (
        <div className={styles.editArea}>
          <p>Change your answer, then save it before submitting.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void edit({
                type: 'replace_content',
                id: e.id,
                expectedVersion: e.version,
                text: value,
              });
            }}
          >
            <label>
              <span className={styles.fieldLabel}>Your answer</span>
              <input
                aria-label={e.label}
                inputMode={step ? 'decimal' : undefined}
                value={value}
                maxLength={120}
                onChange={(event) => setValue(event.target.value)}
                disabled={busy}
              />
              {step && <span className={styles.unit}>Unit: {step.result.unit}</span>}
            </label>
            <button aria-label={`Save ${e.label} step`} disabled={busy || value === e.value}>
              Save step
            </button>
          </form>
        </div>
      ) : !compactExample ? (
        <p className={styles.saved}>
          Your answer: <strong>{e.value}</strong>
        </p>
      ) : null}
      {!!step?.assumptions.length && (
        <details className={styles.assumptions}>
          <summary>What this example assumes</summary>
          <ul>
            {step.assumptions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
