import { invariants, observe } from '../simulations/runtime';
import type { Investigation, Measurement } from './investigation';

export type VisualSpec = {
  version: 1;
  caseId: string;
  kind: Investigation['topic'];
  objective: string;
  focus: string;
  alt: string;
  marks: Measurement[];
  scales: Record<string, { min: number; max: number; unit: string }>;
};
export type Review = {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};
const same = (a: number, b: number) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));

/** Structured output only. No generated SVG strings, code, external links or foreignObject. */
export function composeVisual(task: Investigation): VisualSpec {
  const scales = Object.fromEntries(
    task.measures.map((m) => {
      const extra =
        task.topic === 'neural' && m.id === 'prediction'
          ? [+task.frames[0].reference.params.target]
          : [];
      let lo = Math.min(0, m.reference, m.changed, ...extra),
        hi = Math.max(0, m.reference, m.changed, ...extra);
      if (task.topic === 'rocket' && m.id === 'altitude')
        hi = Math.max(hi, 120);
      if (task.topic === 'traffic')
        hi = Math.max(
          hi,
          ...task.frames.flatMap((p) =>
            [p.reference, p.changed].flatMap((s) =>
              s.data.traffic!.cars.map((c) => c.speed),
            ),
          ),
        );
      const padding = Math.max(1, hi - lo) * 0.15;
      if (lo < 0) lo -= padding;
      hi += padding;
      return [m.id, { min: lo, max: hi, unit: m.unit }];
    }),
  );
  return {
    version: 1,
    caseId: task.id,
    kind: task.topic,
    objective: task.objective,
    focus: task.measures[0].id,
    alt: `${task.title} ${task.change}. Compare reference and changed runs. ${task.measures.map((m) => `${m.label}: ${m.reference.toFixed(2)} versus ${m.changed.toFixed(2)} ${m.unit}`).join('; ')}.`,
    marks: task.measures.map((m) => ({ ...m })),
    scales,
  };
}

/** Hard publication gate: validity is necessary, not proof of pedagogical effectiveness. */
export function reviewVisual(spec: VisualSpec, task: Investigation): Review {
  const checks: Review['checks'] = [];
  const check = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail });
  try {
    check(
      'Learning objective',
      spec.version === 1 &&
        spec.caseId === task.id &&
        spec.kind === task.topic &&
        spec.objective === task.objective &&
        spec.focus === task.measures[0].id &&
        spec.alt.length > 30,
      'The diagram names the current investigation and its measured learning target.',
    );
    check(
      'Numerical grounding',
      Array.isArray(spec.marks) &&
        spec.marks.length === task.measures.length &&
        task.measures.every((expected) => {
          const mark = spec.marks.find((m) => m.id === expected.id);
          return (
            !!mark &&
            mark.label === expected.label &&
            mark.unit === expected.unit &&
            same(mark.reference, expected.reference) &&
            same(mark.changed, expected.changed)
          );
        }) &&
        new Set(spec.marks.map((m) => m.id)).size === task.measures.length,
      'Every displayed comparison matches the simulation, including units.',
    );
    check(
      'Honest comparison scale',
      task.measures.every((m) => {
        const scale = spec.scales[m.id];
        const target =
          task.topic === 'neural' && m.id === 'prediction'
            ? +task.frames[0].reference.params.target
            : 0;
        return (
          !!scale &&
          scale.unit === m.unit &&
          Number.isFinite(scale.min) &&
          Number.isFinite(scale.max) &&
          scale.max > scale.min &&
          scale.min <= Math.min(0, m.reference, m.changed, target) &&
          scale.max >= Math.max(0, m.reference, m.changed, target)
        );
      }),
      'Both runs share a scale; zero and relevant targets stay visible.',
    );
    const allowed: Record<Investigation['topic'], string[]> = {
      neural: ['weight'],
      rocket: ['throttle'],
      attention: ['causal'],
      traffic: [],
      relativity: ['beta'],
    };
    check(
      'Controlled intervention',
      task.frames.every(
        ({ reference, changed }) =>
          reference.id === task.topic &&
          changed.id === task.topic &&
          Object.keys(reference.params).every(
            (key) =>
              allowed[task.topic].includes(key) ||
              reference.params[key] === changed.params[key],
          ),
      ),
      'Only the intended input changes between reference and intervention.',
    );
    check(
      'Simulation integrity',
      task.frames.length >= 2 &&
        task.frames.every((pair, i) => {
          const { reference, changed } = pair;
          return (
            invariants(reference).ok &&
            invariants(changed).ok &&
            same(reference.time, changed.time) &&
            (!i || reference.time >= task.frames[i - 1].reference.time) &&
            Object.values(observe(reference)).every(
              (v) => typeof v !== 'number' || Number.isFinite(v),
            ) &&
            Object.values(observe(changed)).every(
              (v) => typeof v !== 'number' || Number.isFinite(v),
            )
          );
        }),
      'Replay uses finite computed snapshots at matched times; no invented intermediate measurements.',
    );
  } catch {
    check(
      'Readable specification',
      false,
      'The visual specification is incomplete or malformed.',
    );
  }
  return { ok: checks.every((c) => c.ok), checks };
}
export type LabelBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontPx: number;
};
/** Runs on actual SVG text bounds, again after fonts load and on container resize. */
export function reviewGeometry(
  labels: LabelBox[],
  width: number,
  height: number,
): string[] {
  const issues: string[] = [];
  for (const a of labels) {
    if (
      ![a.x, a.y, a.width, a.height, a.fontPx].every(Number.isFinite) ||
      a.width <= 0 ||
      a.height <= 0
    )
      issues.push(`Missing label: ${a.id}`);
    if (a.fontPx < 11.5) issues.push(`Small label: ${a.id}`);
    if (
      a.x < -1 ||
      a.y < -1 ||
      a.x + a.width > width + 1 ||
      a.y + a.height > height + 1
    )
      issues.push(`Clipped label: ${a.id}`);
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i],
        b = labels[j];
      if (
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2
      )
        issues.push(`Overlapping labels: ${a.id}, ${b.id}`);
    }
  return issues;
}
