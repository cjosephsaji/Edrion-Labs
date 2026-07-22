'use client';
import type { SvgElement } from '@edrion/schemas';

function renderElement(el: SvgElement, key: string) {
  const common = { key, transform: el.transform };
  switch (el.type) {
    case 'rect':
      return (
        <rect
          {...common}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      );
    case 'circle':
      return (
        <circle
          {...common}
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      );
    case 'line':
      return (
        <line
          {...common}
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      );
    case 'path':
      return (
        <path
          {...common}
          d={el.d}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      );
    case 'text':
      return (
        <text
          {...common}
          x={el.x}
          y={el.y}
          fill={el.fill}
          fontSize={el.fontSize}
        >
          {el.text}
        </text>
      );
    case 'group':
      return (
        <g {...common}>
          {el.children?.map((child, i) => renderElement(child, `${key}-${i}`))}
        </g>
      );
    default:
      return null;
  }
}

export function GraphCanvas({ viewBox, elements }: { viewBox: string; elements: SvgElement[] }) {
  return (
    <svg viewBox={viewBox} className="h-auto w-full" role="img" aria-hidden>
      {elements.map((el, i) => renderElement(el, String(i)))}
    </svg>
  );
}
