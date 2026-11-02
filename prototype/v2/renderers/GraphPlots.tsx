import type { Sample } from '../simulations/runtime';
export function GraphPlots({
  samples,
  label,
  unit,
  secondary = false,
}: {
  samples: Sample[];
  label: string;
  unit: string;
  secondary?: boolean;
}) {
  const data = samples.length ? samples : [{ t: 0, a: 0, b: 0 }],
    max = Math.max(
      1e-6,
      ...data.map((s) =>
        Math.max(Math.abs(s.a), secondary ? Math.abs(s.b) : 0),
      ),
    ),
    min = Math.min(0, ...data.map((s) => s.a));
  const span = max - min || 1;
  const point = (s: Sample, i: number) =>
    `${32 + (i / Math.max(1, data.length - 1)) * 628},${108 - ((s.a - min) / span) * 82}`;
  return (
    <figure style={{ margin: 0 }} aria-label={`${label} history`}>
      <figcaption
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <span>{label}</span>
        <span>{unit} / simulation time →</span>
      </figcaption>
      <svg
        viewBox="0 0 700 130"
        role="img"
        aria-label={`${label} computed trace`}
        style={{ width: '100%', display: 'block', maxHeight: 130 }}
      >
        <path d="M32 16 V108 H674" fill="none" stroke="var(--line)" />
        <path d="M32 65 H674" stroke="var(--line)" strokeDasharray="3 6" />
        <text x="0" y="27" fill="var(--muted)" fontSize="13">
          {max.toFixed(max < 1 ? 3 : 0)}
        </text>
        <text x="2" y="111" fill="var(--muted)" fontSize="13">
          {min.toFixed(0)}
        </text>
        {data.length > 1 ? (
          <polyline
            points={data.map(point).join(' ')}
            fill="none"
            stroke="var(--green)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        ) : (
          <text
            x="350"
            y="72"
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="16"
          >
            Run an experiment to draw its trace
          </text>
        )}
        {secondary && data.length > 1 && (
          <polyline
            points={data.map((s, i) => point({ ...s, a: s.b }, i)).join(' ')}
            fill="none"
            stroke="#be9550"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        )}
      </svg>
    </figure>
  );
}
