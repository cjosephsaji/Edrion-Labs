'use client';
import { useMemo, useState } from 'react';
import type { ConceptMapContent, GraphSpec } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';

const VIEW_W = 400;
const VIEW_H = 280;

function nodePosition(node: GraphSpec['nodes'][number], index: number) {
  const x = node.x ?? 20 + (index % 3) * 30;
  const y = node.y ?? 20 + Math.floor(index / 3) * 28;
  return { x: (x / 100) * VIEW_W, y: (y / 100) * VIEW_H };
}

function nodeById(spec: GraphSpec, id: string) {
  return spec.nodes.find((n) => n.id === id);
}

export function GraphCanvas({ spec }: { spec: GraphSpec }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (selectedId ? spec.nodes.find((n) => n.id === selectedId) : null),
    [selectedId, spec.nodes],
  );

  if (spec.layout === 'diagram') {
    return (
      <div className="space-y-3">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full max-h-80 rounded-xl bg-st-surface2"
          role="img"
          aria-label="Labeled diagram"
        >
          {spec.edges.map((edge, i) => {
            const from = nodeById(spec, edge.from);
            const to = nodeById(spec, edge.to);
            if (!from || !to) return null;
            const fi = spec.nodes.indexOf(from);
            const ti = spec.nodes.indexOf(to);
            const fp = nodePosition(from, fi);
            const tp = nodePosition(to, ti);
            return (
              <line
                key={`${edge.from}-${edge.to}-${i}`}
                x1={fp.x}
                y1={fp.y}
                x2={tp.x}
                y2={tp.y}
                stroke="var(--st-muted)"
                strokeWidth={1.5}
              />
            );
          })}
          {spec.nodes.map((node, i) => {
            const { x, y } = nodePosition(node, i);
            const active = selectedId === node.id;
            const w = 88;
            const h = 44;
            const isEllipse = node.shape === 'ellipse';
            return (
              <g key={node.id}>
                {isEllipse ? (
                  <ellipse
                    cx={x}
                    cy={y}
                    rx={w / 2}
                    ry={h / 2}
                    fill={active ? 'var(--st-violetSoft)' : 'var(--st-card)'}
                    stroke={active ? 'var(--st-violet)' : 'var(--st-bd1)'}
                    strokeWidth={active ? 2 : 1}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(node.id)}
                  />
                ) : (
                  <rect
                    x={x - w / 2}
                    y={y - h / 2}
                    width={w}
                    height={h}
                    rx={8}
                    fill={active ? 'var(--st-violetSoft)' : 'var(--st-card)'}
                    stroke={active ? 'var(--st-violet)' : 'var(--st-bd1)'}
                    strokeWidth={active ? 2 : 1}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(node.id)}
                  />
                )}
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--st-ink)"
                  className="pointer-events-none"
                >
                  {node.label.slice(0, 16)}
                </text>
              </g>
            );
          })}
        </svg>
        {selected && (
          <div className="rounded-xl border border-st-violet/30 bg-st-violetSoft/40 px-4 py-3">
            <p className="text-sm font-semibold text-st-ink">{selected.label}</p>
            <p className="mt-1 text-sm text-st-muted">{selected.detail ?? 'No description.'}</p>
          </div>
        )}
        {!selected && (
          <p className="text-xs text-st-faint">Tap a part to see its role.</p>
        )}
      </div>
    );
  }

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

function conceptNodePosition(node: ConceptMapContent['nodes'][number], index: number, layout: ConceptMapContent['layout']) {
  if (layout === 'flowchart') {
    return { x: VIEW_W / 2, y: 40 + index * 56 };
  }
  const x = node.x ?? 20 + (index % 3) * 30;
  const y = node.y ?? 20 + Math.floor(index / 3) * 28;
  return { x: (x / 100) * VIEW_W, y: (y / 100) * VIEW_H };
}

export function ConceptMapCanvas({
  content,
  onLearnThis,
  flaggedIds,
  onFlagShaky,
}: {
  content: ConceptMapContent;
  onLearnThis?: (label: string) => void;
  flaggedIds?: Set<string>;
  onFlagShaky?: (nodeId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (selectedId ? content.nodes.find((n) => n.id === selectedId) : null),
    [selectedId, content.nodes],
  );

  const highlightedEdges = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return new Set(
      content.edges
        .filter((e) => e.from === selectedId || e.to === selectedId)
        .map((e) => `${e.from}-${e.to}`),
    );
  }, [content.edges, selectedId]);

  const viewH = content.layout === 'flowchart' ? Math.max(VIEW_H, content.nodes.length * 56 + 40) : VIEW_H;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        className="h-auto w-full max-h-[28rem] rounded-xl bg-st-surface2"
        role="img"
        aria-label="Concept map"
      >
        {content.edges.map((edge, i) => {
          const from = content.nodes.find((n) => n.id === edge.from);
          const to = content.nodes.find((n) => n.id === edge.to);
          if (!from || !to) return null;
          const fi = content.nodes.indexOf(from);
          const ti = content.nodes.indexOf(to);
          const fp = conceptNodePosition(from, fi, content.layout);
          const tp = conceptNodePosition(to, ti, content.layout);
          const key = `${edge.from}-${edge.to}`;
          const active = highlightedEdges.has(key);
          return (
            <line
              key={`${key}-${i}`}
              x1={fp.x}
              y1={fp.y}
              x2={tp.x}
              y2={tp.y}
              stroke={active ? 'var(--st-violet)' : 'var(--st-muted)'}
              strokeWidth={active ? 2 : 1.5}
            />
          );
        })}
        {content.nodes.map((node, i) => {
          const { x, y } = conceptNodePosition(node, i, content.layout);
          const active = selectedId === node.id;
          const flagged = flaggedIds?.has(node.id);
          const w = 96;
          const h = 44;
          return (
            <g key={node.id}>
              <rect
                x={x - w / 2}
                y={y - h / 2}
                width={w}
                height={h}
                rx={8}
                fill={active ? 'var(--st-violetSoft)' : flagged ? 'var(--st-goldSoftBg)' : 'var(--st-card)'}
                stroke={active ? 'var(--st-violet)' : 'var(--st-bd1)'}
                strokeWidth={active ? 2 : 1}
                className="cursor-pointer"
                onClick={() => setSelectedId(node.id)}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--st-ink)"
                className="pointer-events-none"
              >
                {node.label.slice(0, 18)}
              </text>
            </g>
          );
        })}
      </svg>

      {selected ? (
        <div className="rounded-xl border border-st-violet/30 bg-st-violetSoft/40 px-4 py-3">
          <p className="text-xs font-medium text-st-violet">✦ AI-generated · FROM — {selected.sourceLocation}</p>
          <p className="mt-1 text-sm font-semibold text-st-ink">{selected.label}</p>
          <p className="mt-1 text-sm text-st-muted">{selected.miniDefinition}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onLearnThis && (
              <PillButton variant="soft" onClick={() => onLearnThis(selected.label)}>
                Learn this
              </PillButton>
            )}
            {onFlagShaky && (
              <PillButton
                variant="ghost"
                disabled={flaggedIds?.has(selected.id)}
                onClick={() => onFlagShaky(selected.id)}
              >
                {flaggedIds?.has(selected.id) ? "Flagged — I'm shaky here" : "I'm shaky here"}
              </PillButton>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-st-faint">Tap a node to see its definition and connections.</p>
      )}
    </div>
  );
}
