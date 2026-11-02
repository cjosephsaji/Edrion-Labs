'use client';
import { useRef, useState, useEffect } from 'react';
import { layoutScene } from '../core/scene-compiler';
import type { Scene } from '../core/scene-ir';
export function SvgScene({
  scene,
  onTarget,
}: {
  scene: Scene;
  onTarget: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    [compact, setCompact] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setCompact(entry.contentRect.width < 500),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [scene.objects.length]);
  const width = compact ? 360 : 720,
    objects = layoutScene(scene, width, compact);
  if (!objects.length) return null;
  const height = Math.max(...objects.map((o) => o.y + o.height)) + 20;
  return (
    <div
      ref={root}
      style={{ marginTop: 20 }}
      aria-label="Petros explanation diagram"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="Semantic explanation"
      >
        <defs>
          <marker
            id="scene-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 L6 3 L0 6" fill="none" stroke="var(--green)" />
          </marker>
        </defs>
        {scene.edges.map((e, i) => {
          const a = objects.find((o) => o.id === e.fromId)!,
            b = objects.find((o) => o.id === e.toId)!;
          const forward = a.y === b.y;
          const x1 = forward ? a.x + a.width : a.x + a.width / 2,
            y1 = forward ? a.y + a.height / 2 : a.y + a.height,
            x2 = forward ? b.x : b.x + b.width / 2,
            y2 = forward ? b.y + b.height / 2 : b.y;
          return (
            <path
              key={i}
              data-edge-from={a.id}
              data-edge-to={b.id}
              d={`M${x1} ${y1} C${x1 + 18} ${y1 + 10},${x2 - 18} ${y2 - 10},${x2} ${y2}`}
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.5"
              markerEnd="url(#scene-arrow)"
            />
          );
        })}
        {objects.map((o) => (
          <g
            key={o.id}
            data-petros-id={o.id}
            role="button"
            tabIndex={0}
            aria-label={o.content}
            onClick={() => onTarget(o.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onTarget(o.id);
            }}
          >
            <rect
              x={o.x}
              y={o.y}
              width={o.width}
              height={o.height}
              rx="16"
              fill="var(--paper)"
              stroke="var(--line)"
            />
            <foreignObject
              x={o.x + 12}
              y={o.y + 8}
              width={o.width - 24}
              height={o.height - 16}
            >
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.25,
                  height: '100%',
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                  color: 'var(--ink)',
                  overflowWrap: 'anywhere',
                }}
              >
                {o.content}
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
    </div>
  );
}
