import { attentionOf, type Simulation } from '../simulations/runtime';
import type { AttentionResult } from '../simulations/foundations/attention';
import type { V3 } from './lesson';
export interface AttentionStageState extends AttentionResult {
  query: number;
  row: number[];
  context: number[];
  rowSum: number;
  eligible: number;
  strongest: number;
}
/** Only observations and layout. All vectors, softmax and context come from the existing engine. */
export function attentionStageState(sim: Simulation): AttentionStageState {
  if (sim.id !== 'attention')
    throw Error('Attention Stage requires the Attention engine');
  const a = attentionOf(sim),
    query = Math.min(+sim.params.query, a.tokens.length - 1),
    row = a.weights[query];
  return {
    ...a,
    query,
    row,
    context: a.contexts[query],
    rowSum: row.reduce((n, v) => n + v, 0),
    eligible: row.filter((v) => v > 0).length,
    strongest: row.indexOf(Math.max(...row)),
  };
}
export function tokenPosition(index: number, count: number): V3 {
  const columns = count <= 6 ? count : Math.ceil(count / 2),
    row = Math.floor(index / columns),
    col = index % columns;
  const spacing = Math.min(1.16, 5.5 / Math.max(1, columns - 1));
  return [
    (col - (columns - 1) / 2) * spacing,
    count <= 6 ? 1.1 : row === 0 ? 1.5 : 0.95,
    count <= 6 ? -0.55 : row === 0 ? -1.05 : 0.5,
  ];
}
export function queryPosition(s: AttentionStageState): V3 {
  return tokenPosition(s.query, s.tokens.length);
}
export const contextPosition: V3 = [0, 0.85, 1.65];
export function beamPoints(index: number, s: AttentionStageState): V3[] {
  const a = tokenPosition(index, s.tokens.length),
    b = queryPosition(s);
  const start: V3 = [a[0], a[1] + 0.58, a[2]],
    end: V3 = [b[0], b[1] + 0.58, b[2]];
  if (index === s.query)
    return [
      start,
      [a[0] - 0.5, a[1] + 1.15, a[2] - 0.3],
      [a[0], a[1] + 1.55, a[2] - 0.5],
      [a[0] + 0.5, a[1] + 1.15, a[2] - 0.3],
      end,
    ];
  const rise = 0.7 + Math.abs(a[0] - b[0]) * 0.16;
  return [
    start,
    [a[0], Math.max(a[1], b[1]) + 0.58 + rise, -1.1],
    [b[0], Math.max(a[1], b[1]) + 0.58 + rise, -1.1],
    end,
  ];
}
export const shareWidth = (share: number) =>
  share <= 0 ? 0 : 0.018 + Math.sqrt(share) * 0.085;
export const nextAttentionQuery = (s: AttentionStageState) =>
  (s.query + 1) % s.tokens.length;
export const vectorText = (v: number[]) =>
  '[' +
  v.map((x) => (Math.abs(x) < 0.005 ? '0.00' : x.toFixed(2))).join(', ') +
  ']';
