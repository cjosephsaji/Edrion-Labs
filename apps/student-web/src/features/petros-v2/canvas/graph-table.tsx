'use client';
import { useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { TextAlternative } from '../text-alternative';
import { LearningFacts } from '../learning-format';
import type { CanvasElement, CanvasOperation } from '@edrion/schemas';
import { LearningTable } from './learning-table';
import styles from '../learning-format.module.css';
export function GraphTable({
  element: e,
  textOnly = false,
  editable = false,
  busy = false,
  edit,
}: {
  textOnly?: boolean;
  element: Extract<CanvasElement, { kind: 'graph' | 'table' }>;
  editable?: boolean;
  busy?: boolean;
  edit?: (op: CanvasOperation) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState(0);
  if (e.kind === 'table')
    return <LearningTable element={e} editable={editable} busy={busy} edit={edit} />;
  const maxX = Math.max(1, ...e.points.map((p) => p.x)),
    maxY = Math.max(1, ...e.points.map((p) => p.y));
  const point = e.points[Math.min(selected, e.points.length - 1)]!;
  return (
    <>
      {!textOnly && (
        <figure className={styles.graph} aria-label={`${e.label} plot`}>
          <figcaption>
            <ChartNoAxesCombined size={18} aria-hidden="true" />
            Select a point to inspect its values
          </figcaption>
          <svg aria-hidden="true" viewBox="0 0 620 290">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <g key={ratio}>
                <line
                  x1="65"
                  x2="590"
                  y1={235 - ratio * 190}
                  y2={235 - ratio * 190}
                  stroke="#dce5dd"
                />
                <text
                  x="55"
                  y={240 - ratio * 190}
                  textAnchor="end"
                  fill="#506657"
                  fontSize="13"
                >
                  {Number((ratio * maxY).toPrecision(3))}
                </text>
                <text
                  x={65 + ratio * 525}
                  y="256"
                  textAnchor="middle"
                  fill="#506657"
                  fontSize="13"
                >
                  {Number((ratio * maxX).toPrecision(3))}
                </text>
              </g>
            ))}
            <path d="M65 30V235H590" stroke="#64806d" strokeWidth="2" fill="none" />
            <polyline
              points={e.points
                .map((p) => `${65 + (p.x / maxX) * 525},${235 - (p.y / maxY) * 190}`)
                .join(' ')}
              fill="none"
              stroke="#3f7157"
              strokeWidth="3"
            />
            {e.points.map((p, i) => (
              <circle
                key={i}
                cx={65 + (p.x / maxX) * 525}
                cy={235 - (p.y / maxY) * 190}
                r={i === selected ? 8 : 5}
                fill={i === selected ? '#3e5b7b' : '#fff'}
                stroke="#3f7157"
                strokeWidth="2"
              />
            ))}
            <text x="330" y="283" textAnchor="middle" fontSize="15" fill="#3d5b48">
              {e.xUnit}
            </text>
            <text x="65" y="20" fontSize="15" fill="#3d5b48">
              {e.yUnit}
            </text>
          </svg>
          <div className={styles.pointControls} aria-label="Graph observations">
            {e.points.map((p, i) => (
              <button
                key={i}
                aria-label={`Inspect point ${i + 1}: ${p.x} ${e.xUnit}, ${p.y} ${e.yUnit}`}
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
              >
                {p.x} → {p.y}
              </button>
            ))}
          </div>
        </figure>
      )}
      {!textOnly && (
        <div role="status">
          <LearningFacts
            values={[
              { label: `Selected ${e.xUnit}`, value: point.x },
              { label: `Recorded ${e.yUnit}`, value: point.y },
            ]}
          />
        </div>
      )}
      <TextAlternative title="Graph table and text alternative" primary={textOnly}>
        <div className={styles.tableScroll}>
          <table>
            <caption>{e.label} · equivalent graph data</caption>
            <thead>
              <tr>
                <th scope="col">{e.xUnit}</th>
                <th scope="col">{e.yUnit}</th>
              </tr>
            </thead>
            <tbody>
              {e.points.map((p) => (
                <tr key={p.x}>
                  <td>{p.x}</td>
                  <td>{p.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TextAlternative>
    </>
  );
}
