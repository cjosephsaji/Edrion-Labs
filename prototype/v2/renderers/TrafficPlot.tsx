import type { Simulation } from '../simulations/runtime';
export function TrafficPlot({ sim }: { sim: Simulation }) {
  const cars = [...sim.data.traffic!.cars].sort(
      (a, b) => a.position - b.position,
    ),
    max = +sim.params.desiredSpeed;
  return (
    <figure aria-label="Measured speed by position" style={{ margin: 0 }}>
      <figcaption
        style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}
      >
        Speed along the ring · a low-speed region is a wave
      </figcaption>
      <svg
        viewBox="0 0 700 150"
        role="img"
        aria-label="Speed versus distance plot"
        style={{ width: '100%', maxHeight: 150 }}
      >
        <path d="M35 12 V118 H675" fill="none" stroke="var(--line)" />
        <text x="0" y="18" fontSize="12" fill="var(--muted)">
          {max} m/s
        </text>
        <text x="35" y="140" fontSize="12" fill="var(--muted)">
          0 m
        </text>
        <text x="630" y="140" fontSize="12" fill="var(--muted)">
          350 m
        </text>
        <polyline
          points={cars
            .map(
              (c) =>
                `${35 + (c.position / 350) * 640},${118 - (c.speed / max) * 100}`,
            )
            .join(' ')}
          fill="none"
          stroke="#758f6c"
          strokeWidth="2"
        />
        {cars.map((c) => (
          <circle
            key={c.id}
            cx={35 + (c.position / 350) * 640}
            cy={118 - (c.speed / max) * 100}
            r="3"
            fill={c.speed < 6 ? '#ba815c' : '#42684b'}
          />
        ))}
      </svg>
    </figure>
  );
}
