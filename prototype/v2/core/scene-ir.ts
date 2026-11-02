export type Layout =
  | 'flow'
  | 'compare'
  | 'graph'
  | 'timeline'
  | 'matrix'
  | 'annotated'
  | 'plot';
export type Mark = 'circle' | 'underline' | 'focus' | 'dim_others';
export interface SceneObject {
  id: string;
  kind: 'node' | 'equation' | 'label' | 'plot' | 'model';
  content: string;
  revealed: boolean;
}
export interface Scene {
  version: 1;
  id: string;
  layout: Layout;
  objects: SceneObject[];
  edges: { fromId: string; toId: string; relation: string }[];
  marks: { targetId: string; mode: Mark }[];
  annotations: { targetId: string; text: string }[];
  focus: string | null;
}
export type TeachingCommand =
  | { op: 'create_scene'; sceneId: string; layout: Layout }
  | { op: 'add'; sceneId: string; object: Omit<SceneObject, 'revealed'> }
  | {
      op: 'connect';
      fromId: string;
      toId: string;
      relation: 'flows_to' | 'compares' | 'causes' | 'part_of';
    }
  | { op: 'highlight'; targetId: string; mode: Mark }
  | { op: 'annotate'; targetId: string; text: string; placement: 'auto' }
  | { op: 'focus_target'; targetId: string }
  | { op: 'reveal'; objectIds: string[] };
export const emptyScene = (): Scene => ({
  version: 1,
  id: 'lesson',
  layout: 'flow',
  objects: [],
  edges: [],
  marks: [],
  annotations: [],
  focus: null,
});
export const sceneSchema = {
  type: 'object',
  required: [
    'version',
    'id',
    'layout',
    'objects',
    'edges',
    'marks',
    'annotations',
    'focus',
  ],
  properties: {
    version: { const: 1 },
    id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$' },
    layout: {
      enum: [
        'flow',
        'compare',
        'graph',
        'timeline',
        'matrix',
        'annotated',
        'plot',
      ],
    },
    objects: { type: 'array', maxItems: 12 },
    edges: { type: 'array', maxItems: 24 },
    marks: { type: 'array', maxItems: 12 },
    annotations: { type: 'array', maxItems: 6 },
    focus: { type: ['string', 'null'] },
  },
  additionalProperties: false,
} as const;
