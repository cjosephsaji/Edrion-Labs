import { emptyScene, type Scene, type TeachingCommand } from './scene-ir';
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/.test(v);
const label = (v: unknown, max = 80): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max;
const layouts = [
  'flow',
  'compare',
  'graph',
  'timeline',
  'matrix',
  'annotated',
  'plot',
];
export function compile(
  previous: Scene,
  raw: unknown,
  anchors: string[],
):
  | { ok: true; scene: Scene }
  | {
      ok: false;
      scene: Scene;
      error: { code: 'INVALID_SCENE'; message: string; targets: string[] };
    } {
  try {
    if (!Array.isArray(raw) || raw.length > 30)
      throw Error('Use at most 30 semantic commands.');
    let s = structuredClone(previous);
    const known = (target: unknown) =>
      id(target) &&
      (anchors.includes(target) || s.objects.some((o) => o.id === target));
    for (const c of raw as TeachingCommand[]) {
      if (!c || typeof c !== 'object')
        throw Error('Command must be an object.');
      switch (c.op) {
        case 'create_scene':
          if (!id(c.sceneId) || !layouts.includes(c.layout))
            throw Error('Invalid scene ID/layout.');
          s = { ...emptyScene(), id: c.sceneId, layout: c.layout };
          break;
        case 'add':
          if (
            c.sceneId !== s.id ||
            !c.object ||
            !id(c.object.id) ||
            known(c.object.id) ||
            !['node', 'equation', 'label', 'plot', 'model'].includes(
              c.object.kind,
            ) ||
            !label(c.object.content) ||
            s.objects.length >= 12
          )
            throw Error('Invalid/duplicate object, scene, or label.');
          s.objects.push({ ...c.object, revealed: true });
          // A new explanatory diagram defaults to its first semantic object.
          // Explicit focus commands can always choose a different target.
          if (!s.focus) s.focus = c.object.id;
          break;
        case 'connect':
          if (
            !s.objects.some((o) => o.id === c.fromId) ||
            !s.objects.some((o) => o.id === c.toId) ||
            c.fromId === c.toId ||
            !['flows_to', 'compares', 'causes', 'part_of'].includes(
              c.relation,
            ) ||
            s.edges.length >= 24
          )
            throw Error(
              'Dangling/invalid connector. Connect scene nodes only.',
            );
          s.edges.push({ ...c });
          break;
        case 'focus_target':
          if (!known(c.targetId)) throw Error(`Unknown target: ${c.targetId}.`);
          s.focus = c.targetId;
          break;
        case 'highlight':
          if (
            !known(c.targetId) ||
            !['circle', 'underline', 'focus', 'dim_others'].includes(c.mode)
          )
            throw Error('Invalid highlight.');
          s.marks = [
            ...s.marks.filter((m) => m.targetId !== c.targetId),
            { targetId: c.targetId, mode: c.mode },
          ].slice(-12);
          break;
        case 'annotate':
          if (
            !known(c.targetId) ||
            !label(c.text, 100) ||
            c.placement !== 'auto'
          )
            throw Error('Invalid annotation.');
          s.annotations = [
            ...s.annotations.filter((a) => a.targetId !== c.targetId),
            { targetId: c.targetId, text: c.text },
          ].slice(-6);
          break;
        case 'reveal':
          if (!Array.isArray(c.objectIds) || c.objectIds.some((t) => !known(t)))
            throw Error('Unknown reveal object.');
          s.objects = s.objects.map((o) => ({
            ...o,
            revealed: o.revealed || c.objectIds.includes(o.id),
          }));
          break;
        default:
          throw Error(
            'Unsupported visual operation. Model parameters use sim_set_params.',
          );
      }
    }
    return { ok: true, scene: s };
  } catch (e) {
    return {
      ok: false,
      scene: previous,
      error: {
        code: 'INVALID_SCENE',
        message: e instanceof Error ? e.message : 'Invalid scene',
        targets: [...anchors, ...previous.objects.map((o) => o.id)],
      },
    };
  }
}
export function layoutScene(s: Scene, width = 720, compact = false) {
  const count = s.objects.length,
    cols = compact
      ? 1
      : s.layout === 'compare'
        ? 2
        : s.layout === 'timeline'
          ? Math.min(3, count)
          : Math.min(3, Math.max(1, count));
  return s.objects.map((o, i) => ({
    ...o,
    x: 20 + (i % cols) * ((width - 40) / cols),
    y: 20 + Math.floor(i / cols) * 130,
    width: (width - 40) / cols - 20,
    height: 94,
  }));
}
export function restoreScene(raw: unknown, anchors: string[]): Scene {
  const s = raw as Scene;
  if (
    !s ||
    s.version !== 1 ||
    !id(s.id) ||
    !layouts.includes(s.layout) ||
    !Array.isArray(s.objects) ||
    !Array.isArray(s.edges) ||
    !Array.isArray(s.marks) ||
    !Array.isArray(s.annotations)
  )
    throw Error('Invalid saved scene.');
  const cmds: TeachingCommand[] = [
    { op: 'create_scene', sceneId: s.id, layout: s.layout },
    ...s.objects.map(({ revealed, ...object }) => ({
      op: 'add' as const,
      sceneId: s.id,
      object,
    })),
    ...s.edges.map((e) => ({
      op: 'connect' as const,
      ...e,
      relation: e.relation as 'flows_to',
    })),
    ...s.marks.map((m) => ({ op: 'highlight' as const, ...m })),
    ...s.annotations.map((a) => ({
      op: 'annotate' as const,
      ...a,
      placement: 'auto' as const,
    })),
    ...(s.focus ? [{ op: 'focus_target' as const, targetId: s.focus }] : []),
  ];
  const result = compile(emptyScene(), cmds, anchors);
  if (!result.ok) throw Error(result.error.message);
  return result.scene;
}
