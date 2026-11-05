import { attentionOf, observe, type Simulation } from '../simulations/runtime';
import type { Investigation, Measurement } from './investigation';

const f = (n: number) => Number(n.toFixed(2)).toString();
export function frameMeasurements(
  task: Investigation,
  index: number,
): Measurement[] {
  const pair =
    task.frames[
      Math.max(0, Math.min(task.frames.length - 1, Math.round(index)))
    ];
  const values = (state: Simulation): number[] => {
    const o = observe(state);
    switch (task.topic) {
      case 'neural':
        return [
          +o.prediction,
          Math.abs(+o.prediction - +state.params.target),
          +o.loss,
        ];
      case 'rocket':
        return [+o.velocity, +o.altitude, +o.acceleration];
      case 'attention': {
        const q = +state.params.query,
          row = attentionOf(state).weights[q];
        return [
          100 * row.slice(q + 1).reduce((s, n) => s + n, 0),
          100 * row[q],
          100 * row.reduce((s, n) => s + n, 0),
        ];
      }
      case 'traffic': {
        const id =
          task.caseIndex === 2 ? 'car_1' : `car_${+state.params.count - 1}`;
        return [
          state.data.traffic!.cars.find((c) => c.id === id)!.speed,
          +o.meanSpeed,
          +o.minSpeed,
        ];
      }
      case 'relativity':
        return [+o.shipClock, +o.earthClock, +o.gamma];
    }
  };
  const a = values(pair.reference),
    b = values(pair.changed);
  return task.measures.map((m, i) => ({
    ...m,
    reference: a[i],
    changed: b[i],
  }));
}

export function frameInsight(task: Investigation, index: number) {
  const at = Math.max(0, Math.min(task.frames.length - 1, index));
  const pair = task.frames[at],
    measurements = frameMeasurements(task, at),
    m = measurements[0];
  const a = observe(pair.reference),
    b = observe(pair.changed);
  if (task.topic === 'neural')
    return {
      title: 'Trace the distance, not just the direction.',
      text: `At weight ${f(+pair.changed.params.weight)}, ${f(+pair.changed.params.x1)} × ${f(+pair.changed.params.weight)} = ${f(+b.prediction)}. The distance to ${f(+pair.changed.params.target)} is ${f(measurements[1].changed)}, compared with ${f(measurements[1].reference)} in the reference.`,
    };
  if (task.topic === 'rocket')
    return {
      title:
        +b.velocity < 0
          ? 'The rocket is still falling.'
          : 'The velocity has crossed zero.',
      text: `Velocity is ${f(+b.velocity)} m/s; acceleration is ${f(+b.acceleration)} m/s². ${+b.velocity < 0 && +b.acceleration > 0 ? 'Opposite signs: it is moving down while its fall slows.' : +b.velocity < 0 ? 'Both are negative: it is moving down and gaining downward speed.' : 'Positive velocity means upward motion. Compare how long the thrust has acted.'}`,
    };
  if (task.topic === 'attention')
    return {
      title: pair.changed.params.causal
        ? 'Eligibility comes before strength.'
        : 'The later words are eligible.',
      text: `Later positions receive ${f(m.changed)}% of the query’s attention; the reference gives them ${f(m.reference)}%. ${+pair.changed.params.query === 4 ? 'This query is already last: no future positions exist.' : 'Watch which positions are blocked, then how the remaining shares change.'}`,
    };
  if (task.topic === 'traffic')
    return {
      title:
        task.caseIndex === 2
          ? 'Look ahead of the disturbance.'
          : 'Follow the orange driver.',
      text: `The measured driver travels at ${f(m.changed)} m/s, versus ${f(m.reference)} m/s on the untouched road. ${Math.abs(m.reference - m.changed) < 0.001 ? 'There is no measured difference at this snapshot. Follow who reacts to whom.' : 'The same driver, at the same elapsed time, responds differently after the brake tap.'}`,
    };
  return {
    title: 'Keep Earth time fixed in the comparison.',
    text: `After ${f(+b.earthClock)} Earth seconds, the ship clocks read ${f(+a.shipClock)} s and ${f(+b.shipClock)} s. Each uses Earth time ÷ γ; both clocks behave normally locally.`,
  };
}

export function checkpoints(task: Investigation) {
  const last = task.frames.length - 1;
  return task.topic === 'attention'
    ? [
        { index: 0, label: 'Before the mask change' },
        { index: last, label: 'After the mask change' },
      ]
    : [
        { index: 0, label: 'Starting conditions' },
        { index: Math.floor(last / 2), label: 'Watch the change' },
        { index: last, label: 'Compare the outcome' },
      ];
}
