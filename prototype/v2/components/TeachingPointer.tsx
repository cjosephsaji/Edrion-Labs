'use client';
import { useEffect, useState } from 'react';
import type { Scene } from '../core/scene-ir';
import { targetBounds } from '../core/target-registry';
type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function TeachingPointer({
  scene,
  spatial = false,
}: {
  scene: Scene;
  spatial?: boolean;
}) {
  const [rects, setRects] = useState<Record<string, Rect>>({});
  useEffect(() => {
    // The 3D guide already points at world anchors. A screen-space box around
    // those bounds also encloses readouts and vectors, producing a giant halo.
    if (spatial) return;
    let frame = 0;
    let old = '';
    const tick = () => {
      const map: Record<string, Rect> = {};
      const surface = targetBounds('teaching-surface');
      if (surface) map.__surface = surface;
      for (const id of new Set([
        scene.focus,
        ...scene.marks.map((m) => m.targetId),
        ...scene.annotations.map((a) => a.targetId),
      ])) {
        if (id) {
          const rect = targetBounds(id);
          if (rect) map[id] = rect;
        }
      }
      const json = JSON.stringify(map);
      if (json !== old) {
        old = json;
        setRects(map);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, spatial]);
  if (spatial) return null;
  const focus = scene.focus ? rects[scene.focus] : null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
        overflow: 'hidden',
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0 }}
      >
        {scene.marks.map((m) => {
          const r = rects[m.targetId];
          if (!r) return null;
          if (m.mode === 'dim_others' && rects.__surface) {
            const b = rects.__surface;
            return (
              <path
                key={m.targetId}
                fillRule="evenodd"
                d={`M${b.x} ${b.y}h${b.width}v${b.height}h-${b.width}Z M${r.x - 8} ${r.y - 8}v${r.height + 16}h${r.width + 16}v-${r.height + 16}Z`}
                fill="#f5f4e9"
                opacity=".74"
              />
            );
          }
          return m.mode === 'underline' ? (
            <path
              key={m.targetId}
              d={`M${r.x} ${r.y + r.height + 5} Q${r.x + r.width / 2} ${r.y + r.height + 10} ${r.x + r.width} ${r.y + r.height + 4}`}
              fill="none"
              stroke="#be9141"
              strokeWidth="3"
            />
          ) : (
            <rect
              key={m.targetId}
              x={r.x - 7}
              y={r.y - 7}
              width={r.width + 14}
              height={r.height + 14}
              rx={m.mode === 'circle' ? Math.min(r.width, r.height) / 2 : 12}
              fill="none"
              stroke="#bd9148"
              strokeWidth="2"
            />
          );
        })}
      </svg>
      {focus && (
        <svg
          data-testid="teaching-pointer"
          data-target={scene.focus}
          viewBox="0 0 40 46"
          style={{
            position: 'absolute',
            left: Math.min(window.innerWidth - 34, focus.x + focus.width - 4),
            top: Math.min(window.innerHeight - 40, focus.y + focus.height - 2),
            width: 30,
            height: 37,
            filter: 'drop-shadow(0 3px 3px #253a2525)',
          }}
        >
          <circle
            cx="26"
            cy="32"
            r="11"
            fill="#375d45"
            stroke="#fffaf0"
            strokeWidth="1.5"
          />
          <text
            x="26"
            y="37"
            textAnchor="middle"
            fill="#fff9e9"
            fontFamily="Georgia"
            fontStyle="italic"
            fontSize="17"
          >
            p
          </text>
          <path
            d="M3 2 L29 23 L17 24 L12 35 Z"
            fill="#d8b257"
            stroke="#fffaf0"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  );
}
