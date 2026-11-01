/** Data only. Both the model boundary and recovered sessions use this contract. */
export interface ModelState {
  values: { id: string; value: number }[];
  boundary: 'divergent' | 'convergent' | 'transform';
  highlights: string[];
  selected: string | null;
  reveal: boolean;
}
export interface VisualRuntime extends ModelState {
  playing: boolean;
}
export interface VisualBase {
  version: 1;
  objective: string;
  rationale: string;
  initial: ModelState;
  demonstration: ModelState;
  apply: ModelState;
  transfer: ModelState;
  feedback: { correct: string[]; incorrect: string[] };
}
export interface VisualNode {
  id: string;
  label: string;
  role: 'fact' | 'rule' | 'conclusion' | 'item';
}
export interface VisualEdge {
  from: string;
  to: string;
  label: string;
}
export type VisualSpec = VisualBase &
  (
    | { type: 'plate-tectonics'; view: 'layers' | 'movement' | 'boundaries' }
    | { type: 'function-graph' | 'force-vectors' | 'supply-demand' }
    | { type: 'cross-section'; layers: { id: string; label: string; thickness: number }[] }
    | {
        type: 'structure';
        shapes: {
          id: string;
          label: string;
          shape: 'ellipse' | 'polygon';
          points: { x: number; y: number }[];
        }[];
      }
    | {
        type: 'relationships';
        layout: 'process' | 'cycle' | 'causal' | 'comparison' | 'concept-map' | 'logic';
        nodes: VisualNode[];
        edges: VisualEdge[];
      }
    | { type: 'unsupported' | 'none'; reason: string }
  );
type Schema = Record<string, any>;
const str = (max = 180): Schema => ({ type: 'string', minLength: 1, maxLength: max });
const id: Schema = { ...str(48), pattern: '^[a-z][a-z0-9-]*$' };
const num = (min: number, max: number): Schema => ({ type: 'number', minimum: min, maximum: max });
const arr = (items: Schema, min = 0, max = 12): Schema => ({
  type: 'array',
  items,
  minItems: min,
  maxItems: max,
});
const obj = (properties: Schema): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const en = (...values: string[]): Schema => ({ type: 'string', enum: values });
export const modelStateSchema = obj({
  values: arr(obj({ id, value: num(-100, 100) }), 0, 5),
  boundary: en('divergent', 'convergent', 'transform'),
  highlights: arr(id),
  selected: { anyOf: [id, { type: 'null' }] },
  reveal: { type: 'boolean' },
});
const base = {
  version: { type: 'integer', enum: [1] },
  objective: str(240),
  rationale: str(360),
  initial: modelStateSchema,
  demonstration: modelStateSchema,
  apply: modelStateSchema,
  transfer: modelStateSchema,
  feedback: obj({ correct: arr(id), incorrect: arr(id) }),
};
export const visualSpecSchema: Schema = {
  anyOf: [
    obj({ ...base, type: en('plate-tectonics'), view: en('layers', 'movement', 'boundaries') }),
    ...['function-graph', 'force-vectors', 'supply-demand'].map((type) =>
      obj({ ...base, type: en(type) }),
    ),
    obj({
      ...base,
      type: en('cross-section'),
      layers: arr(obj({ id, label: str(42), thickness: num(1, 100) }), 2, 5),
    }),
    obj({
      ...base,
      type: en('structure'),
      shapes: arr(
        obj({
          id,
          label: str(42),
          shape: en('ellipse', 'polygon'),
          points: arr(obj({ x: num(1, 660), y: num(1, 285) }), 2, 12),
        }),
        1,
        6,
      ),
    }),
    obj({
      ...base,
      type: en('relationships'),
      layout: en('process', 'cycle', 'causal', 'comparison', 'concept-map', 'logic'),
      nodes: arr(obj({ id, label: str(42), role: en('fact', 'rule', 'conclusion', 'item') }), 2, 6),
      edges: arr(obj({ from: id, to: id, label: str(32) }), 0, 10),
    }),
    ...['unsupported', 'none'].map((type) => obj({ ...base, type: en(type), reason: str(360) })),
  ],
};
/** A deliberately small schema interpreter; no eval, markup, URL or executable payload. */
function matches(s: Schema, v: any): boolean {
  if (s.anyOf) return s.anyOf.some((a: Schema) => matches(a, v));
  if (s.enum && !s.enum.includes(v)) return false;
  switch (s.type) {
    case 'null':
      return v === null;
    case 'boolean':
      return typeof v === 'boolean';
    case 'number':
    case 'integer':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        (s.type !== 'integer' || Number.isInteger(v)) &&
        (s.minimum === undefined || v >= s.minimum) &&
        (s.maximum === undefined || v <= s.maximum)
      );
    case 'string':
      return (
        typeof v === 'string' &&
        v.trim().length >= (s.minLength ?? 0) &&
        v.length <= (s.maxLength ?? 1000) &&
        !/[<>\u0000-\u001f]/.test(v) &&
        (!s.pattern || new RegExp(s.pattern).test(v))
      );
    case 'array':
      return (
        Array.isArray(v) &&
        v.length >= s.minItems &&
        v.length <= s.maxItems &&
        v.every((x) => matches(s.items, x))
      );
    case 'object':
      return (
        !!v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        s.required.every((k: string) => Object.hasOwn(v, k)) &&
        Object.keys(v).every(
          (k) => Object.hasOwn(s.properties, k) && matches(s.properties[k], v[k]),
        )
      );
    default:
      return false;
  }
}
export interface Parameter {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
}
export function parameters(spec: Pick<VisualSpec, 'type'>): Parameter[] {
  const p = (id: string, label: string, min: number, max: number, step = 1) => ({
    id,
    label,
    min,
    max,
    step,
  });
  switch (spec.type) {
    case 'plate-tectonics':
      return [
        p('progress', 'Movement progress', 0, 1, 0.01),
        p('rate', 'Relative speed (cm/year)', 1, 10),
      ];
    case 'function-graph':
      return [
        p('a', 'Quadratic coefficient a', -3, 3, 0.5),
        p('b', 'Linear coefficient b', -4, 4),
        p('c', 'Vertical offset c', -4, 4),
      ];
    case 'force-vectors':
      return [p('fx', 'Horizontal force (N)', -8, 8), p('fy', 'Vertical force (N)', -8, 8)];
    case 'supply-demand':
      return [p('demand', 'Demand intercept', 6, 10), p('supply', 'Supply intercept', 0, 4)];
    default:
      return [];
  }
}
export function featureIds(spec: VisualSpec): string[] {
  switch (spec.type) {
    case 'plate-tectonics':
      return [
        'crust',
        'mantle',
        'plate-left',
        'plate-right',
        'asthenosphere',
        'motion',
        'boundary',
        'upwelling',
        'slab',
        'volcano',
        'earthquakes',
      ];
    case 'function-graph':
      return ['axes', 'curve', 'vertex'];
    case 'force-vectors':
      return ['object', 'force-x', 'force-y', 'resultant'];
    case 'supply-demand':
      return ['axes', 'demand', 'supply', 'equilibrium'];
    case 'cross-section':
      return spec.layers.map((x) => x.id);
    case 'structure':
      return spec.shapes.map((x) => x.id);
    case 'relationships':
      return spec.nodes.map((x) => x.id);
    default:
      return [];
  }
}
export function validModelState(spec: VisualSpec, value: unknown): value is ModelState {
  if (!matches(modelStateSchema, value)) return false;
  const s = value as ModelState,
    ps = parameters(spec),
    ids = featureIds(spec);
  return (
    s.values.length === ps.length &&
    new Set(s.values.map((x) => x.id)).size === ps.length &&
    ps.every((p) =>
      s.values.some(
        (x) =>
          x.id === p.id &&
          x.value >= p.min &&
          x.value <= p.max &&
          Math.abs((x.value - p.min) / p.step - Math.round((x.value - p.min) / p.step)) < 0.00001,
      ),
    ) &&
    s.highlights.every((x) => ids.includes(x)) &&
    (s.selected === null || ids.includes(s.selected))
  );
}
export function validVisualSpec(value: unknown): value is VisualSpec {
  if (!matches(visualSpecSchema, value)) return false;
  const s = value as VisualSpec,
    ids = featureIds(s);
  if (
    new Set(ids).size !== ids.length ||
    ![s.initial, s.demonstration, s.apply, s.transfer].every((x) => validModelState(s, x)) ||
    ![...s.feedback.correct, ...s.feedback.incorrect].every((x) => ids.includes(x))
  )
    return false;
  if (
    s.type === 'relationships' &&
    (s.edges.some((e) => !ids.includes(e.from) || !ids.includes(e.to) || e.from === e.to) ||
      (s.layout !== 'comparison' && s.edges.length === 0))
  )
    return false;
  if (
    s.type === 'structure' &&
    s.shapes.some((x) => {
      if (x.shape === 'polygon')
        return (
          x.points.length < 3 ||
          x.points.some((p) => p.x < 50 || p.x > 470 || p.y < 45 || p.y > 285)
        );
      if (x.points.length !== 2) return true;
      const [c, r] = x.points;
      return c!.x - r!.x < 50 || c!.x + r!.x > 470 || c!.y - r!.y < 45 || c!.y + r!.y > 285;
    })
  )
    return false;
  return true;
}
export function validRuntime(spec: VisualSpec, value: unknown): value is VisualRuntime {
  if (!value || typeof value !== 'object') return false;
  const { playing, ...state } = value as VisualRuntime;
  return typeof playing === 'boolean' && validModelState(spec, state);
}
export function runtime(state: ModelState): VisualRuntime {
  return { ...structuredClone(state), playing: false };
}
export function valueOf(state: ModelState, id: string) {
  return state.values.find((x) => x.id === id)?.value ?? 0;
}
export type VisualAction =
  | { type: 'parameter'; id: string; value: number }
  | { type: 'boundary'; value: ModelState['boundary'] }
  | { type: 'select'; id: string }
  | { type: 'play' | 'pause' | 'tick' | 'reveal' };
export function transitionVisual(
  spec: VisualSpec,
  state: VisualRuntime,
  action: VisualAction,
): VisualRuntime {
  let next = state;
  if (action.type === 'parameter')
    next = {
      ...state,
      values: state.values.map((x) => (x.id === action.id ? { ...x, value: action.value } : x)),
      playing: false,
    };
  if (action.type === 'boundary' && spec.type === 'plate-tectonics')
    next = {
      ...state,
      boundary: action.value,
      values: state.values.map((x) => (x.id === 'progress' ? { ...x, value: 0 } : x)),
      playing: false,
      highlights: [],
    };
  if (action.type === 'select') next = { ...state, selected: action.id, highlights: [action.id] };
  if (action.type === 'play' && spec.type === 'plate-tectonics')
    next = {
      ...state,
      playing: true,
      values: state.values.map((x) =>
        x.id === 'progress' && x.value === 1 ? { ...x, value: 0 } : x,
      ),
    };
  if (action.type === 'pause') next = { ...state, playing: false };
  if (action.type === 'tick' && state.playing) {
    const progress = Math.min(1, Math.round((valueOf(state, 'progress') + 0.02) * 100) / 100);
    next = {
      ...state,
      values: state.values.map((x) => (x.id === 'progress' ? { ...x, value: progress } : x)),
      playing: progress < 1,
    };
  }
  if (action.type === 'reveal') next = { ...state, reveal: true };
  return validRuntime(spec, next) ? next : state;
}
