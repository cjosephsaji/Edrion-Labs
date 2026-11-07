import { Color } from 'three';
import { observe, specs, type Simulation } from '../simulations/runtime';
import { lessonModel, transfers } from '../core/teaching';
import type { StageState } from './lesson';
import { palette } from './palette';
export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));
export function neuralStageState(sim: Simulation): StageState {
  const o = observe(sim);
  return {
    input: +sim.params.x1,
    weight: +sim.params.weight,
    target: +sim.params.target,
    learningRate: +sim.params.learningRate,
    prediction: +o.prediction,
    loss: +o.loss,
    steps: +o.steps,
    history: sim.history.map((s) => s.a),
  };
}
export const neuralExamples = [
  lessonModel('neural').params,
  transfers.neural.patch,
  { ...transfers.neural.patch, weight: 0.7 },
];
/** Include every prepared example, zero, signed side, target, and current output. Never clip a value. */
export function numberLineRange(state: StageState) {
  const values = [
    0,
    state.target,
    state.prediction,
    ...neuralExamples.flatMap((p) => [+p.x1 * +p.weight, +p.target]),
  ];
  const low = Math.min(-1, ...values),
    high = Math.max(1, ...values);
  const step = Math.max(1, 2 ** Math.floor(Math.log2((high - low) / 6)));
  const min = Math.floor((low - 0.3) / (2 * step)) * 2 * step;
  const max = Math.ceil((high + 0.3) / (2 * step)) * 2 * step;
  return {
    min,
    max,
    step,
    ticks: Array.from(
      { length: Math.round((max - min) / step) + 1 },
      (_, i) => min + i * step,
    ),
  };
}
export function numberY(v: number, range: ReturnType<typeof numberLineRange>) {
  return 0.45 + ((v - range.min) / (range.max - range.min)) * 4.35;
}
export function closeness(prediction: number, target: number, range = 4) {
  return (
    1 - clamp(Math.abs(target - prediction) / Math.max(1, Math.abs(range)))
  );
}
export function closenessColor(prediction: number, target: number) {
  return new Color(palette.amber).lerp(
    new Color(palette.mint),
    closeness(prediction, target, Math.max(4, Math.abs(target))),
  );
}
export const weightLimits: [number, number] = [
  specs.neural.weight.min!,
  specs.neural.weight.max!,
];
export const format = (v: number, digits = 2) =>
  (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits).replace('-', '−');
