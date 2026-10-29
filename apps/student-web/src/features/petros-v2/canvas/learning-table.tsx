'use client';
import { useState } from 'react';
import type { CanvasElement, CanvasOperation } from '@edrion/schemas';
import styles from '../learning-format.module.css';

export function LearningTable({
  element: e,
  editable = false,
  busy = false,
  edit,
}: {
  element: Extract<CanvasElement, { kind: 'table' }>;
  editable?: boolean;
  busy?: boolean;
  edit?: (op: CanvasOperation) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <div>
      <p className={styles.hint}>
        Select up to two rows to compare their details side by side.
      </p>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label={`${e.label} data`}
        tabIndex={0}
      >
        <table>
          <caption>{e.label}</caption>
          <thead>
            <tr>
              {e.columns.map((name, i) => (
                <th scope="col" key={i}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {e.rows.map((row, r) => (
              <tr key={r} data-selected={selected.includes(r)}>
                {row.map((value, c) => {
                  const key = `${r}:${c}`,
                    writable =
                      editable &&
                      e.editable &&
                      e.editableCells.some((cell) => cell.row === r && cell.column === c);
                  return (
                    <td key={c}>
                      {writable ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void edit?.({
                              type: 'replace_cell',
                              id: e.id,
                              expectedVersion: e.version,
                              row: r,
                              column: c,
                              value: draft[key] ?? value,
                            });
                          }}
                        >
                          <label>
                            {e.columns[c]} · row {r + 1}
                            <input
                              aria-label={`${e.columns[c]}, row ${r + 1}`}
                              value={draft[key] ?? value}
                              maxLength={120}
                              disabled={busy}
                              onChange={(event) =>
                                setDraft({ ...draft, [key]: event.target.value })
                              }
                            />
                          </label>
                          <button
                            disabled={
                              busy || draft[key] === undefined || draft[key] === value
                            }
                          >
                            Save cell
                          </button>
                        </form>
                      ) : c === 0 ? (
                        <button
                          aria-pressed={selected.includes(r)}
                          aria-label={`Compare row ${r + 1}: ${value}`}
                          onClick={() =>
                            setSelected(
                              selected.includes(r)
                                ? selected.filter((index) => index !== r)
                                : [...selected.slice(-1), r],
                            )
                          }
                        >
                          {value || `Row ${r + 1}`}
                        </button>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.length > 0 && (
        <section className={styles.compareRows} aria-label="Selected row comparison">
          {selected.map((r) => (
            <article className={styles.comparison} key={r}>
              <h4>{e.rows[r]?.[0] || `Row ${r + 1}`}</h4>
              <dl>
                {e.columns.map((name, c) => (
                  <div key={c}>
                    <dt>{name}</dt>
                    <dd>{e.rows[r]?.[c]}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
