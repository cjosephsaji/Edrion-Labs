'use client';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { attentionOf, observe } from '../simulations/runtime';
import type { Investigation } from '../core/investigation';
import { frameMeasurements } from '../core/investigation-playback';
import {
  composeVisual,
  reviewVisual,
  reviewGeometry,
  type Review,
  type VisualSpec,
} from '../core/visual-review';
import s from './learning-studio.module.css';

const ink = '#234b40',
  green = '#31725c',
  gold = '#b28236',
  faded = '#aeb8ac',
  orange = '#b95136';
const fmt = (n: number, places = 2) => Number(n.toFixed(places)).toString();
export function EvidenceTable({
  task,
  revealed,
  frameIndex,
}: {
  task: Investigation;
  revealed: boolean;
  frameIndex?: number;
}) {
  const index = revealed ? (frameIndex ?? task.frames.length - 1) : 0;
  const measurements = frameMeasurements(task, index);
  return (
    <div className={s.tableWrap}>
      <table className={s.dataTable}>
        <caption>
          {!revealed ? 'Reference starting measurements' : frameIndex === undefined
            ? 'Final experiment measurements' : 'Current snapshot measurements'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Measurement</th>
            <th scope="col">Reference</th>
            {revealed && <th scope="col">Changed</th>}
          </tr>
        </thead>
        <tbody>
          {measurements.map((m) => (
            <tr key={m.id}>
              <th scope="row">
                {m.label} {m.unit && <small>({m.unit})</small>}
              </th>
              <td>{fmt(m.reference, 3)}</td>
              {revealed && <td>{fmt(m.changed, 3)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvestigationVisual({
  task,
  frameIndex,
  revealed,
  onReview,
  draft,
}: {
  task: Investigation;
  frameIndex: number;
  revealed: boolean;
  onReview: (report: Review, layout: string[]) => void;
  draft?: VisualSpec;
}) {
  const root = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [compact, setCompact] = useState(false),
    [layoutIssues, setLayoutIssues] = useState<string[]>([]);
  const [availableWidth, setAvailableWidth] = useState(720);
  const unique = useId().replace(/:/g, ''),
    titleId = `${unique}-title`,
    descId = `${unique}-desc`;
  const spec = useMemo(() => draft ?? composeVisual(task), [draft, task]);
  const review = useMemo(() => reviewVisual(spec, task), [spec, task]);
  const currentDescription = useMemo(
    () =>
      frameMeasurements(task, frameIndex)
        .map(
          (m) =>
            `${m.label}: reference ${fmt(m.reference)}, changed ${fmt(m.changed)} ${m.unit}`,
        )
        .join('; '),
    [task, frameIndex],
  );
  const signature = JSON.stringify(review);
  const w = compact ? 360 : 720,
    h = 370;
  useEffect(() => {
    if (!root.current) return;
    const resize = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < 660);
      setAvailableWidth(entry.contentRect.width);
    });
    resize.observe(root.current);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    let live = true,
      handle = 0;
    const inspect = () => {
      if (!live) return;
      const element = svg.current;
      if (!review.ok || !element) {
        onReview(review, []);
        return;
      }
      const outer = element.getBoundingClientRect();
      if (!outer.width || !outer.height) return;
      const labels = Array.from(
        element.querySelectorAll<SVGTextElement>('text'),
      ).map((text, i) => {
        const box = text.getBoundingClientRect();
        return {
          id: `${i}:${text.textContent}`,
          x: box.x - outer.x,
          y: box.y - outer.y,
          width: box.width,
          height: box.height,
          fontPx:
            parseFloat(getComputedStyle(text).fontSize) *
            Math.min(outer.width / w, outer.height / h),
        };
      });
      const issues = reviewGeometry(labels, outer.width, outer.height);
      setLayoutIssues((old) =>
        JSON.stringify(old) === JSON.stringify(issues) ? old : issues,
      );
      onReview(review, issues);
    };
    const schedule = () => {
      cancelAnimationFrame(handle);
      handle = requestAnimationFrame(inspect);
    };
    const resize = new ResizeObserver(schedule);
    if (root.current) resize.observe(root.current);
    schedule();
    void document.fonts.ready.then(schedule);
    return () => {
      live = false;
      cancelAnimationFrame(handle);
      resize.disconnect();
    };
    // The report is deterministic for this task; a new callback must not cause measurement loops.
  }, [
    task.id,
    signature,
    frameIndex,
    revealed,
    compact,
    onReview,
    w,
    availableWidth,
  ]);

  const pair =
    task.frames[Math.min(task.frames.length - 1, Math.max(0, frameIndex))];
  const reference = pair.reference,
    changed = revealed ? pair.changed : pair.reference;
  const a = observe(reference),
    b = observe(changed);
  const text = (
    key: string,
    x: number,
    y: number,
    value: ReactNode,
    size = compact ? 13 : 16,
    color = ink,
    anchor: 'middle' | 'start' | 'end' = 'middle',
  ) => (
    <text
      key={key}
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={
        compact
          ? Math.max(size, (11.8 * 360) / Math.max(240, availableWidth))
          : size
      }
      fill={color}
    >
      {value}
    </text>
  );
  const scale = (id: string, value: number, start: number, end: number) => {
    const domain = spec.scales[id];
    return (
      start + ((value - domain.min) / (domain.max - domain.min)) * (end - start)
    );
  };
  let drawing: ReactNode;
  if (task.topic === 'neural' && review.ok) {
    const x = +reference.params.x1,
      weight = +changed.params.weight,
      target = +reference.params.target;
    const left = compact ? 30 : 60,
      right = w - left;
    const px = scale('prediction', +b.prediction, left, right),
      oldX = scale('prediction', +a.prediction, left, right),
      tx = scale('prediction', target, left, right);
    const positions = [compact ? 50 : 100, w / 2, w - (compact ? 50 : 100)];
    drawing = (
      <>
        <path
          d={`M${positions[0] + 28} 62 H${positions[2] - 34}`}
          stroke="#d4ded1"
          strokeWidth="3"
          fill="none"
          markerEnd={`url(#${unique}-arrow)`}
        />
        <circle
          cx={positions[0]}
          cy="62"
          r="29"
          fill="#edf0e5"
          stroke="#acbba7"
        />
        {text('input', positions[0], 69, fmt(x), 24)}
        <rect
          x={w / 2 - 51}
          y="38"
          width="102"
          height="48"
          rx="13"
          fill="#f3e8cd"
          stroke="#c7a466"
        />
        {text('weight', w / 2, 69, `× ${fmt(weight)}`, 23, '#815b23')}
        <circle cx={positions[2]} cy="62" r="30" fill={green} />
        {text('output', positions[2], 69, fmt(+b.prediction), 23, '#fffdf5')}
        {text('input-label', positions[0], 112, 'input')}
        {text('weight-label', w / 2, 112, 'weight')}
        {text('output-label', positions[2], 112, 'prediction')}
        <line
          x1={left}
          x2={right}
          y1="223"
          y2="223"
          stroke="#c8d1c3"
          strokeWidth="2"
        />
        <line
          x1={tx}
          x2={tx}
          y1="164"
          y2="277"
          stroke={gold}
          strokeWidth="1.5"
          strokeDasharray="4 5"
        />
        {text(
          'target',
          Math.max(62, Math.min(w - 62, tx)),
          153,
          `target ${target}`,
          compact ? 14 : 17,
          '#896029',
        )}
        <line
          x1={px}
          x2={tx}
          y1="195"
          y2="195"
          stroke={orange}
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".6"
        />
        <line x1={px} x2={px} y1="190" y2="203" stroke={orange} />
        <line x1={tx} x2={tx} y1="190" y2="203" stroke={orange} />
        {Array.from({ length: 5 }, (_, i) => {
          const value =
            spec.scales.prediction.min +
            ((spec.scales.prediction.max - spec.scales.prediction.min) * i) / 4;
          const at = left + ((right - left) * i) / 4;
          return (
            <g key={i}>
              <line x1={at} x2={at} y1="218" y2="230" stroke="#bdc9b7" />
              {text(
                `tick-${i}`,
                at,
                254,
                fmt(value, 1),
                compact ? 13 : 14,
                '#627362',
              )}
            </g>
          );
        })}
        {revealed && (
          <circle
            cx={oldX}
            cy="223"
            r="8"
            fill="#fffef7"
            stroke={faded}
            strokeWidth="2"
            strokeDasharray="3 2"
          />
        )}
        <circle
          cx={px}
          cy="223"
          r="9"
          fill={green}
          stroke="#fffef7"
          strokeWidth="3"
        />
        {text(
          'distance',
          w / 2,
          307,
          `distance to target  ${fmt(Math.abs(+b.prediction - target))}`,
          compact ? 17 : 22,
          orange,
        )}
        {text(
          'loss',
          w / 2,
          341,
          `loss = ½ × distance² = ${fmt(+b.loss, 3)}`,
          compact ? 13 : 16,
          '#667661',
        )}
      </>
    );
  } else if (task.topic === 'rocket' && review.ok) {
    const y = (altitude: number) => scale('altitude', altitude, 295, 40);
    drawing = (
      <>
        {text(
          'frame',
          w / 2,
          24,
          'HEIGHT IN METRES · UP IS POSITIVE',
          compact ? 13 : 14,
          '#677763',
        )}
        {[0, 40, 80, 120].map((n) => (
          <g key={n}>
            <line
              x1="44"
              x2={w - 26}
              y1={y(n)}
              y2={y(n)}
              stroke="#e1e5da"
              strokeDasharray={n ? '3 5' : undefined}
            />
            {text(
              `height-${n}`,
              34,
              y(n) + 5,
              `${n}`,
              compact ? 13 : 14,
              '#65765f',
              'end',
            )}
          </g>
        ))}
        {[
          {
            state: reference,
            x: w * 0.31,
            color: faded,
            name: 'Reference · 60%',
          },
          {
            state: changed,
            x: w * 0.74,
            color: green,
            name: revealed ? 'Changed · 100%' : 'Ready to test',
          },
        ].map(({ state, x, color, name }, i) => {
          const o = observe(state),
            py = y(+o.altitude),
            down = +o.velocity < 0;
          return (
            <g key={i}>
              <path
                d={`M${x} 55 V285`}
                stroke={color}
                opacity=".18"
                strokeDasharray="3 4"
              />
              <g transform={`translate(${x} ${py})`}>
                <path
                  d="M-14 21 V-15 Q-12 -30 0 -37 Q12 -30 14 -15 V21Z"
                  fill={i ? '#e3ebde' : '#f4f3ea'}
                  stroke={color}
                  strokeWidth="2"
                />
                <circle cy="-6" r="6" fill={color} />
                <path
                  d="M-14 9 L-24 26 L-14 21 M14 9 L24 26 L14 21"
                  fill={color}
                />
                <path
                  d={`M-7 24 Q0 ${35 + 25 * +state.params.throttle} 7 24`}
                  fill="#cc9b50"
                  opacity=".7"
                />
              </g>
              <path
                d={`M${x + 35} ${py - 10} v${down ? 48 : -48}`}
                stroke={orange}
                strokeWidth="2"
                markerEnd={`url(#${unique}-orange)`}
              />
              {text(`r-label-${i}`, x, 326, name, compact ? 13 : 16)}
              {text(
                `r-value-${i}`,
                x,
                351,
                `${fmt(+o.velocity)} m/s`,
                compact ? 17 : 21,
                i ? green : '#6b7866',
              )}
            </g>
          );
        })}
      </>
    );
  } else if (task.topic === 'attention') {
    const first = attentionOf(reference),
      next = attentionOf(changed),
      q = +reference.params.query;
    const left = compact ? 86 : 135,
      available = w - left - (compact ? 78 : 110);
    drawing = (
      <>
        {text(
          'query',
          w / 2,
          32,
          `Query: “${first.tokens[q]}” · position ${q + 1}`,
          compact ? 17 : 23,
        )}
        {first.tokens.map((token, i) => {
          const y = 83 + i * 48,
            future = i > q,
            blocked = future && !!changed.params.causal;
          return (
            <g key={i}>
              {i === q && (
                <rect
                  x="12"
                  y={y - 24}
                  width={w - 24}
                  height="44"
                  rx="8"
                  fill="#f4eacb"
                />
              )}
              {text(
                `token-${i}`,
                left - 14,
                y + 3,
                token,
                compact ? 14 : 19,
                ink,
                'end',
              )}
              <rect
                x={left}
                y={y - 14}
                width={available}
                height="10"
                fill="#eff1e8"
                rx="3"
              />
              <rect
                x={left}
                y={y - 14}
                width={available * first.weights[q][i]}
                height="10"
                fill="none"
                stroke={faded}
                strokeDasharray="3 2"
                rx="3"
              />
              <rect
                x={left}
                y={y + 1}
                width={available * next.weights[q][i]}
                height="10"
                fill={future ? orange : green}
                rx="3"
              />
              {text(
                `share-${i}`,
                w - 15,
                y + 5,
                blocked ? 'masked' : `${fmt(next.weights[q][i] * 100, 1)}%`,
                compact ? 13 : 16,
                blocked ? orange : ink,
                'end',
              )}
            </g>
          );
        })}
        {text(
          'eligibility',
          w / 2,
          338,
          compact
            ? 'Orange = later positions · gold = query'
            : 'Orange marks later positions. Gold marks the query.',
          compact ? 13 : 15,
          '#667661',
        )}
      </>
    );
  } else if (task.topic === 'traffic') {
    const count = +reference.params.count,
      focusId = task.caseIndex === 2 ? 'car_1' : `car_${count - 1}`,
      radius = compact ? 66 : 108;
    drawing = (
      <>
        {[reference, changed].map((state, index) => {
          const cx = w * (index ? 0.75 : 0.25),
            cy = compact ? 151 : 161;
          const marked = state.data.traffic!.cars.find(
            (c) => c.id === focusId,
          )!;
          return (
            <g key={index}>
              {text(
                `road-title-${index}`,
                cx,
                37,
                index
                  ? revealed
                    ? 'Brake tap'
                    : 'Ready to test'
                  : 'Untouched road',
                compact ? 13 : 18,
              )}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke="#e1e7db"
                strokeWidth="23"
              />
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke="#fffdf6"
                strokeWidth="1"
                strokeDasharray="5 5"
              />
              {state.data.traffic!.cars.map((car) => {
                const angle = (car.position / 350) * Math.PI * 2 - Math.PI / 2,
                  x = cx + radius * Math.cos(angle),
                  y = cy + radius * Math.sin(angle);
                return (
                  <g
                    key={car.id}
                    transform={`translate(${x} ${y}) rotate(${(angle * 180) / Math.PI + 90})`}
                  >
                    <rect
                      x="-5"
                      y="-9"
                      width="10"
                      height="18"
                      rx="3"
                      fill={
                        car.id === 'car_0'
                          ? gold
                          : car.id === focusId
                            ? orange
                            : index
                              ? green
                              : faded
                      }
                    />
                    {car.id === focusId && (
                      <rect
                        x="-9"
                        y="-13"
                        width="18"
                        height="26"
                        rx="6"
                        stroke={orange}
                        fill="none"
                        strokeWidth="2"
                      />
                    )}
                  </g>
                );
              })}
              {text(
                `speed-${index}`,
                cx,
                cy,
                `${fmt(marked.speed, 1)}`,
                compact ? 27 : 38,
                index ? orange : '#6e7c67',
              )}
              {text(
                `speed-unit-${index}`,
                cx,
                cy + 25,
                'm/s',
                compact ? 13 : 16,
                '#63735e',
              )}
              {text(
                `direction-${index}`,
                cx,
                cy + radius + 42,
                '↻ cars travel clockwise',
                compact ? 13 : 15,
                '#61725b',
              )}
            </g>
          );
        })}
        {text(
          'car-legend',
          w / 2,
          337,
          'Gold: car 1 · orange: measured driver',
          compact ? 13 : 16,
          '#6b6e4f',
        )}
      </>
    );
  } else {
    const duration = task.duration,
      earth = +b.earthClock;
    drawing = (
      <>
        {[reference, changed].map((state, i) => {
          const o = observe(state),
            x = w * (i ? 0.75 : 0.25),
            y = 156,
            r = compact ? 63 : 93,
            seconds = +o.shipClock;
          const angle = (seconds / duration) * Math.PI * 2 - Math.PI / 2;
          return (
            <g key={i}>
              {text(
                `clock-label-${i}`,
                x,
                34,
                `${i ? 'Changed' : 'Reference'} · ${state.params.beta}c`,
                compact ? 13 : 18,
              )}
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={i ? '#eaf0e4' : '#f4f3e9'}
                stroke={i ? '#a2b69a' : '#c4ccbb'}
                strokeWidth="1.5"
              />
              {Array.from({ length: 12 }, (_, n) => {
                const a = (n / 12) * Math.PI * 2;
                return (
                  <line
                    key={n}
                    x1={x + Math.sin(a) * (r - 6)}
                    y1={y - Math.cos(a) * (r - 6)}
                    x2={x + Math.sin(a) * (r - 12)}
                    y2={y - Math.cos(a) * (r - 12)}
                    stroke="#9daf94"
                  />
                );
              })}
              <line
                x1={x}
                y1={y}
                x2={x + Math.cos(angle) * (r - 16)}
                y2={y + Math.sin(angle) * (r - 16)}
                stroke={i ? green : faded}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={x} cy={y} r="5" fill={i ? green : faded} />
              {text(
                `clock-value-${i}`,
                x,
                y + r + 32,
                `${fmt(seconds)} s`,
                compact ? 23 : 28,
              )}
            </g>
          );
        })}
        <rect x="28" y="304" width={w - 56} height="8" rx="4" fill="#e1e5d9" />
        <rect
          x="28"
          y="304"
          width={(w - 56) * Math.min(1, earth / duration)}
          height="8"
          rx="4"
          fill={gold}
        />
        {text(
          'earth',
          w / 2,
          344,
          `Shared Earth interval: ${fmt(earth)} / ${duration} s`,
          compact ? 15 : 18,
          '#8b672b',
        )}
      </>
    );
  }
  const fallback = !review.ok || layoutIssues.length > 0;
  return (
    <div
      ref={root}
      className={s.visualRoot}
      data-visual-issues={JSON.stringify(layoutIssues)}
      data-visual-status={fallback ? 'fallback' : 'checked'}
    >
      {review.ok && (
        <svg
          ref={svg}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          className={s.diagram}
          style={
            layoutIssues.length
              ? {
                  position: 'absolute',
                  visibility: 'hidden',
                  pointerEvents: 'none',
                }
              : undefined
          }
        >
          <title id={titleId}>{task.title}</title>
          <desc id={descId}>
            {revealed
              ? `${task.objective} Current snapshot. ${currentDescription}.`
              : `${task.objective} Current reference model. Predict the effect of ${task.change} before revealing the comparison.`}
          </desc>
          <defs>
            <marker
              id={`${unique}-arrow`}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L6 3 L0 6" fill={green} />
            </marker>
            <marker
              id={`${unique}-orange`}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L6 3 L0 6" fill={orange} />
            </marker>
          </defs>
          {drawing}
        </svg>
      )}
      {fallback && (
        <div className={s.visualFallback} role="status">
          <strong>Let’s use the measurements.</strong>
          <p>
            This diagram did not pass its display checks. The computed
            comparison is available as a table.
          </p>
          <EvidenceTable task={task} revealed={revealed} frameIndex={frameIndex} />
        </div>
      )}
    </div>
  );
}
