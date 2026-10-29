import type { CanvasElement } from '@edrion/schemas';
import { MathExpression, readableMathText } from '@/components/petros/petros-math';
import styles from './teaching-canvas.module.css';

export function EquationBoard({
  element,
  progress,
  editable,
  change,
}: {
  element: Extract<CanvasElement, { kind: 'equation' }>;
  progress: number;
  editable: boolean;
  change: (value: string) => void;
}) {
  return (
    <div className={styles.equation}>
      {element.editable ? (
        <div className={styles.inlineEquation}>
          <MathExpression value={element.tex} display />
          <input
            aria-label="Final value"
            inputMode="decimal"
            autoComplete="off"
            maxLength={120}
            value={element.value}
            disabled={!editable}
            placeholder="?"
            onChange={(e) => change(e.target.value)}
          />
          <span className={styles.srOnly}>
            Complete {element.label} using the displayed equation.
          </span>
        </div>
      ) : progress < 1 ? (
        <span aria-hidden="true" className={styles.progressive}>
          {readableMathText(element.tex).slice(
            0,
            Math.ceil(readableMathText(element.tex).length * progress),
          )}
          <span className={styles.cursor}>▏</span>
        </span>
      ) : (
        <MathExpression value={element.tex} display />
      )}
      {progress < 1 && <span className={styles.srOnly}>{element.explanation}</span>}
      <p className={styles.detail}>{element.explanation}</p>
    </div>
  );
}
