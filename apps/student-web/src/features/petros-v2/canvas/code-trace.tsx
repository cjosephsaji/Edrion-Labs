'use client';
import { useState } from 'react';
import type { CanvasElement } from '@edrion/schemas';
import { LearningFacts, learningLabel } from '../learning-format';
import { TextAlternative } from '../text-alternative';
import styles from '../learning-format.module.css';
export function CodeTrace({
  elements,
  textOnly = false,
}: {
  elements: CanvasElement[];
  textOnly?: boolean;
}) {
  const trace = elements.find(
    (e): e is Extract<CanvasElement, { kind: 'trace' }> => e.kind === 'trace',
  );
  const [step, setStep] = useState<number | null>(null);
  const current = trace ? Math.min(step ?? trace.currentLine, trace.lines.length - 1) : 0;
  if (!trace)
    return (
      <ol aria-label="Inert process trace">
        {elements
          .filter((e) => e.kind === 'text')
          .map((e) => (
            <li key={e.id}>
              <strong>{e.label}</strong>
              <pre>{e.kind === 'text' ? e.text : ''}</pre>
            </li>
          ))}
      </ol>
    );
  const line = trace.lines[current]!;
  return (
    <section aria-label="Process step navigator">
      {!textOnly && (
        <>
          <p className={styles.hint}>
            Inspect the supplied steps and their recorded values. These steps are
            displayed for learning; no code runs here.
          </p>
          <ol className={styles.timeline} aria-label="Process sequence">
            {trace.lines.map((entry, i) => (
              <li key={entry.id}>
                <button
                  aria-current={i === current ? 'step' : undefined}
                  aria-pressed={i === current}
                  aria-label={`Inspect process step ${i + 1}`}
                  onClick={() => setStep(i)}
                >
                  <span className={styles.stepNumber}>{i + 1}</span>
                  <code>{entry.text}</code>
                </button>
              </li>
            ))}
          </ol>
          <div className={styles.traceFocus} role="status">
            <p>Step {current + 1} · recorded state</p>
            <pre>{line.text}</pre>
            <LearningFacts
              values={Object.entries(line.state).map(([label, value]) => ({
                label: learningLabel(label),
                value,
              }))}
            />
          </div>
          <nav className={styles.nav} aria-label="Trace steps">
            <button disabled={current === 0} onClick={() => setStep(current - 1)}>
              Previous process step
            </button>
            <span>
              Step {current + 1} of {trace.lines.length}
            </span>
            <button
              disabled={current >= trace.lines.length - 1}
              onClick={() => setStep(current + 1)}
            >
              Next process step
            </button>
          </nav>
        </>
      )}
      <TextAlternative title="Process table and text alternative" primary={textOnly}>
        <div className={styles.tableScroll}>
          <table>
            <caption>{trace.label} · supplied trace</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Display</th>
                <th scope="col">Recorded state</th>
              </tr>
            </thead>
            <tbody>
              {trace.lines.map((entry, i) => (
                <tr key={entry.id} aria-current={i === current ? 'step' : undefined}>
                  <td>{i + 1}</td>
                  <td>
                    <code>{entry.text}</code>
                  </td>
                  <td>
                    {Object.entries(entry.state)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join('; ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TextAlternative>
    </section>
  );
}
