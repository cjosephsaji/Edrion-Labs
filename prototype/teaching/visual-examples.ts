import type { ModelState, VisualBase, VisualSpec } from './visual-spec';
export function modelState(
  values: Record<string, number> = {},
  boundary: ModelState['boundary'] = 'divergent',
  highlights: string[] = [],
): ModelState {
  return {
    values: Object.entries(values).map(([id, value]) => ({ id, value })),
    boundary,
    highlights,
    selected: null,
    reveal: false,
  };
}
export function visualBase(objective: string, initial: ModelState): VisualBase {
  return {
    version: 1,
    objective,
    rationale:
      'Make the mechanism visible and let the learner compare predictions with an explicit model.',
    initial,
    demonstration: { ...structuredClone(initial), reveal: true },
    apply: structuredClone(initial),
    transfer: structuredClone(initial),
    feedback: { correct: [], incorrect: [] },
  };
}
/** Reference specifications also serve as contract fixtures, not alternate renderers. */
export function plateVisual(
  view: 'layers' | 'movement' | 'boundaries',
  boundary: ModelState['boundary'] = 'divergent',
): VisualSpec {
  const s = modelState({ progress: 0.15, rate: 3 }, boundary);
  return {
    ...visualBase(
      view === 'layers'
        ? 'Locate the crust and rigid mantle that form a lithospheric plate.'
        : 'Infer the geological process from relative plate motion.',
      s,
    ),
    type: 'plate-tectonics',
    view,
    demonstration: {
      ...s,
      values: [
        { id: 'progress', value: 0.7 },
        { id: 'rate', value: 3 },
      ],
      highlights: view === 'layers' ? ['crust', 'mantle', 'plate-right'] : ['motion'],
      reveal: true,
    },
    transfer: modelState({ progress: 0.4, rate: 5 }, 'transform'),
    feedback: {
      correct: ['motion'],
      incorrect: view === 'layers' ? ['crust', 'mantle', 'asthenosphere'] : ['motion', 'boundary'],
    },
  };
}
export function quadraticVisual(): VisualSpec {
  return {
    ...visualBase(
      'Predict how coefficients change the graph of a quadratic.',
      modelState({ a: 1, b: 0, c: 0 }),
    ),
    type: 'function-graph',
    transfer: modelState({ a: -1, b: 2, c: 1 }),
    feedback: { correct: ['curve'], incorrect: ['curve', 'axes'] },
  };
}
export function forceVisual(): VisualSpec {
  return {
    ...visualBase(
      'Use vector direction and length to combine applied forces.',
      modelState({ fx: 4, fy: 3 }),
    ),
    type: 'force-vectors',
    transfer: modelState({ fx: -3, fy: 4 }),
    feedback: { correct: ['resultant'], incorrect: ['force-x', 'force-y'] },
  };
}
export function marketVisual(): VisualSpec {
  return {
    ...visualBase(
      'Find the intersection of supply and demand.',
      modelState({ demand: 8, supply: 2 }),
    ),
    type: 'supply-demand',
    transfer: modelState({ demand: 10, supply: 2 }),
    feedback: { correct: ['equilibrium'], incorrect: ['supply', 'demand', 'equilibrium'] },
  };
}
export function logicVisual(): VisualSpec {
  return {
    ...visualBase(
      'Derive only conclusions supported by supplied facts and one-way rules.',
      modelState(),
    ),
    type: 'relationships',
    layout: 'logic',
    nodes: [
      { id: 'fact', label: 'Bird(Rio)', role: 'fact' },
      { id: 'rule', label: 'Bird(x) → HasWings(x)', role: 'rule' },
      { id: 'conclusion', label: 'HasWings(Rio)', role: 'conclusion' },
    ],
    edges: [
      { from: 'fact', to: 'rule', label: 'matches premise' },
      { from: 'rule', to: 'conclusion', label: 'supports' },
    ],
    feedback: { correct: ['conclusion'], incorrect: ['fact', 'rule'] },
  };
}
