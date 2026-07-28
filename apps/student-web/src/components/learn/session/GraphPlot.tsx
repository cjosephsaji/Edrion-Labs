'use client';

import { useMemo, useState } from 'react';

type GraphPlotProps = {
  expression: string;
  param: { name: string; min: number; max: number; value: number };
  caption?: string;
};

/** Hand-rolled SVG plotter — no chart library. */
export function GraphPlot({ expression, param, caption }: GraphPlotProps) {
  const [k, setK] = useState(param.value);

  const path = useMemo(() => {
    const w = 560;
    const h = 280;
    const xMin = -4;
    const xMax = 4;
    const yMin = -2;
    const yMax = 8;
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const x = xMin + ((xMax - xMin) * i) / 120;
      const y = evalExpression(expression, x, param.name, k);
      const px = ((x - xMin) / (xMax - xMin)) * w;
      const py = h - ((y - yMin) / (yMax - yMin)) * h;
      pts.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [expression, k, param.name]);

  return (
    <figure className="animate-st-block-in -mx-1 overflow-hidden rounded-[18px] border border-st-bd1 bg-st-card">
      <svg viewBox="0 0 560 280" className="h-auto w-full bg-[linear-gradient(180deg,#FBFAF4,#F3F0E7)]">
        <g stroke="#E6E2D4" strokeWidth="1">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`v${i}`} x1={i * 70} y1={0} x2={i * 70} y2={280} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 70} x2={560} y2={i * 70} />
          ))}
        </g>
        <line x1={280} y1={0} x2={280} y2={280} stroke="#8A968F" strokeWidth="1.25" />
        <line x1={0} y1={224} x2={560} y2={224} stroke="#8A968F" strokeWidth="1.25" />
        <path d={path} fill="none" stroke="#1E7A5E" strokeWidth="2.5" />
      </svg>
      <figcaption className="flex flex-wrap items-center gap-4 border-t border-st-divider px-4 py-3">
        <p className="text-sm text-st-muted">{caption ?? `f(x) with ${param.name}`}</p>
        <label className="ml-auto flex items-center gap-2 text-sm text-st-inkSoft">
          <span className="font-mono-ui text-xs text-st-faint">
            {param.name}={k.toFixed(1)}
          </span>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={0.1}
            value={k}
            onChange={(e) => setK(Number(e.target.value))}
            className="w-40 accent-[#1E7A5E]"
          />
        </label>
      </figcaption>
    </figure>
  );
}

function evalExpression(expr: string, x: number, paramName: string, paramValue: number): number {
  // Supported forms for Learn fixtures: x^2+k, x^2, etc.
  const normalized = expr.replace(/\^/g, '**').replace(new RegExp(paramName, 'g'), String(paramValue));
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', `return (${normalized});`);
    const y = Number(fn(x));
    return Number.isFinite(y) ? y : 0;
  } catch {
    return x * x + paramValue;
  }
}
