import type { GraphSpec } from '@edrion/schemas';

export function GraphCanvas({ spec }: { spec: GraphSpec }) {
  const cx = 200;
  const cy = 120;
  const radius = 80;

  if (spec.layout === 'mind_map' && spec.center) {
    const nodes = spec.nodes.filter((n) => n.id !== 'center');
    return (
      <svg viewBox="0 0 400 240" className="h-auto w-full max-h-72 rounded-xl bg-st-surface2" role="img">
        <circle cx={cx} cy={cy} r={36} fill="var(--st-accent)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={11}>
          {spec.center.label.slice(0, 12)}
        </text>
        {nodes.map((node, i) => {
          const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const nx = cx + Math.cos(angle) * radius;
          const ny = cy + Math.sin(angle) * radius;
          return (
            <g key={node.id}>
              <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--st-bd1)" />
              <circle cx={nx} cy={ny} r={24} fill="var(--st-accentSoft)" stroke="var(--st-accent)" />
              <text x={nx} y={ny + 4} textAnchor="middle" fontSize={9} fill="var(--st-ink)">
                {node.label.slice(0, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 400 240" className="h-auto w-full max-h-72 rounded-xl bg-st-surface2" role="img">
      {spec.nodes.map((node, i) => (
        <g key={node.id}>
          <rect
            x={40 + (i % 3) * 110}
            y={40 + Math.floor(i / 3) * 70}
            width={90}
            height={40}
            rx={8}
            fill="var(--st-card)"
            stroke="var(--st-bd1)"
          />
          <text
            x={85 + (i % 3) * 110}
            y={65 + Math.floor(i / 3) * 70}
            textAnchor="middle"
            fontSize={10}
            fill="var(--st-ink)"
          >
            {node.label.slice(0, 14)}
          </text>
        </g>
      ))}
      {spec.edges.map((_edge, i) => (
        <line key={i} x1={100} y1={60} x2={150} y2={60} stroke="var(--st-muted)" strokeWidth={1} />
      ))}
    </svg>
  );
}
