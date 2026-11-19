import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

export type Vec3 = [number, number, number];
export const shapes = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'tube',
  'gear',
] as const;
export type Shape = (typeof shapes)[number];
export const materials = {
  polymer: { density: 1.24, color: '#d9e6da' },
  aluminium: { density: 2.7, color: '#9eb4bf' },
  steel: { density: 7.85, color: '#718491' },
  wood: { density: 0.65, color: '#cba36a' },
};
export type Material = keyof typeof materials;
export type Part = {
  id: string;
  shape: Shape;
  size: Vec3;
  position: Vec3;
  rotation: Vec3;
  color: string;
  material: Material;
  parent: string | null;
  motion: 'none' | 'spin' | 'swing';
  axis: 'x' | 'y' | 'z';
  rpm: number;
  amplitude: number;
  teeth: number;
};
export type Project = {
  version: 1;
  title: string;
  parts: Part[];
  note: string;
};
export type Proposal = {
  project: Project;
  summary: string;
  explanation: string;
  question: string;
  source: 'command' | 'ai' | 'script';
};
export const PROJECT_STORAGE = 'petros.maker.project.v1';
export const idPattern = /^[a-z][a-z0-9_-]{0,39}$/;
export const cloneProject = (p: Project): Project => structuredClone(p);
export function newPart(shape: Shape, id: string): Part {
  return {
    id,
    shape,
    size: [40, 40, 40],
    position: [0, 20, 0],
    rotation: [0, 0, 0],
    color: '#d9e6da',
    material: 'polymer',
    parent: null,
    motion: 'none',
    axis: 'y',
    rpm: 30,
    amplitude: 35,
    teeth: 16,
  };
}
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object')
    throw Error('Project must be an object.');
  const p = value as Project;
  if (
    p.version !== 1 ||
    typeof p.title !== 'string' ||
    p.title.length > 100 ||
    typeof p.note !== 'string' ||
    p.note.length > 4000 ||
    !Array.isArray(p.parts) ||
    p.parts.length > 64
  )
    throw Error(
      'Use a version 1 project with a title, note and at most 64 parts.',
    );
  const ids = new Set<string>();
  for (const part of p.parts) {
    if (
      !part ||
      typeof part.id !== 'string' ||
      part.id === 'world' ||
      !idPattern.test(part.id) ||
      ids.has(part.id)
    )
      throw Error(
        'Every part needs a unique lowercase identifier (up to 40 characters).',
      );
    ids.add(part.id);
    if (
      !shapes.includes(part.shape) ||
      !Object.hasOwn(materials, part.material) ||
      !/^#[0-9a-f]{6}$/i.test(part.color)
    )
      throw Error(`Invalid shape, material or colour on ${part.id}.`);
    for (const [key, min, max] of [
      ['size', 1, 500],
      ['position', -1000, 1000],
      ['rotation', -360, 360],
    ] as const) {
      if (
        !Array.isArray(part[key]) ||
        part[key].length !== 3 ||
        part[key].some((n) => !Number.isFinite(n) || n < min || n > max)
      )
        throw Error(
          `${part.id}: ${key} needs three numbers from ${min} to ${max}.`,
        );
    }
    if (
      !['none', 'spin', 'swing'].includes(part.motion) ||
      !['x', 'y', 'z'].includes(part.axis) ||
      !Number.isFinite(part.rpm) ||
      Math.abs(part.rpm) > 180 ||
      !Number.isFinite(part.amplitude) ||
      part.amplitude < 0 ||
      part.amplitude > 180 ||
      !Number.isInteger(part.teeth) ||
      part.teeth < 6 ||
      part.teeth > 40
    )
      throw Error(`${part.id}: invalid motion or gear settings.`);
    if (part.parent !== null && typeof part.parent !== 'string')
      throw Error(`${part.id}: invalid parent.`);
  }
  for (const part of p.parts) {
    const visited = new Set([part.id]);
    let parent = part.parent;
    while (parent !== null) {
      const next = p.parts.find((q) => q.id === parent);
      if (!next || visited.has(parent))
        throw Error(`${part.id}: missing parent or circular attachment.`);
      visited.add(parent);
      parent = next.parent;
    }
  }
  return {
    version: 1,
    title: p.title,
    note: p.note,
    parts: p.parts.map((part) => ({
      id: part.id,
      shape: part.shape,
      size: [...part.size],
      position: [...part.position],
      rotation: [...part.rotation],
      color: part.color,
      material: part.material,
      parent: part.parent,
      motion: part.motion,
      axis: part.axis,
      rpm: part.rpm,
      amplitude: part.amplitude,
      teeth: part.teeth,
    })),
  };
}
export const findPart = (p: Project, id: string) => {
  const part = p.parts.find((q) => q.id === id);
  if (!part)
    throw Error(`No part named “${id}”. Select a part or use its identifier.`);
  return part;
};
export const uniqueId = (p: Project, base: string) => {
  let id = base,
    i = 2;
  while (p.parts.some((q) => q.id === id)) id = `${base.slice(0, 33)}_${i++}`;
  return id;
};
export function localMatrix(part: Part, seconds = 0) {
  const rotation = [...part.rotation] as Vec3,
    index = ['x', 'y', 'z'].indexOf(part.axis);
  if (part.motion === 'spin') rotation[index] += seconds * part.rpm * 6;
  if (part.motion === 'swing')
    rotation[index] +=
      part.amplitude * Math.sin(((seconds * part.rpm) / 60) * 2 * Math.PI);
  return new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(
      new Euler(...(rotation.map((n) => (n * Math.PI) / 180) as Vec3)),
    ),
    new Vector3(1, 1, 1),
  );
}
export function worldMatrix(
  project: Project,
  id: string,
  seconds = 0,
): Matrix4 {
  const p = findPart(project, id),
    local = localMatrix(p, seconds);
  return p.parent
    ? worldMatrix(project, p.parent, seconds).multiply(local)
    : local;
}
export function reparent(
  project: Project,
  id: string,
  parent: string | null,
): Project {
  const next = cloneProject(project),
    part = findPart(next, id),
    world = worldMatrix(project, id);
  part.parent = parent;
  validateProject(next);
  const local = parent
    ? worldMatrix(project, parent).invert().multiply(world)
    : world;
  const pos = new Vector3(),
    scale = new Vector3(),
    q = new Quaternion();
  local.decompose(pos, q, scale);
  const e = new Euler().setFromQuaternion(q);
  part.position = pos.toArray() as Vec3;
  part.rotation = [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3;
  return validateProject(next);
}
export function deletePart(project: Project, id: string) {
  findPart(project, id);
  let p = cloneProject(project);
  for (const child of p.parts.filter((q) => q.parent === id))
    p = reparent(p, child.id, findPart(p, id).parent);
  p.parts = p.parts.filter((q) => q.id !== id);
  return validateProject(p);
}
export function duplicatePart(project: Project, id: string) {
  const p = cloneProject(project),
    part = structuredClone(findPart(p, id));
  part.id = uniqueId(p, `${id.slice(0, 30)}_copy`);
  const gap = part.size[0] + 10;
  part.position[0] += part.position[0] + gap > 1000 ? -gap : gap;
  p.parts.push(part);
  return validateProject(p);
}
const fmt = (n: number) => String(Math.round(n * 10000) / 10000);
export function projectScript(project: Project) {
  return [
    `# Dimensions and positions in millimetres. Rotations in degrees.`,
    ...project.parts.map(
      (p) =>
        `${p.shape} ${p.id} size ${p.size.map(fmt).join(' ')} at ${p.position.map(fmt).join(' ')} rotate ${p.rotation.map(fmt).join(' ')} color ${p.color} material ${p.material}${p.shape === 'gear' ? ` teeth ${p.teeth}` : ''}`,
    ),
    ...project.parts
      .filter((p) => p.parent)
      .map((p) => `attach ${p.id} to ${p.parent}`),
    ...project.parts
      .filter((p) => p.motion !== 'none')
      .map(
        (p) =>
          `${p.motion} ${p.id} ${p.axis} ${fmt(p.rpm)}${p.motion === 'swing' ? ` ${fmt(p.amplitude)}` : ''}`,
      ),
  ].join('\n');
}
/** A bounded construction language. Never evaluates JavaScript or arbitrary code. */
export function compileScript(
  source: string,
  title = 'Untitled invention',
): Project {
  if (source.length > 30000)
    throw Error('Build scripts are limited to 30,000 characters.');
  const p: Project = { version: 1, title, note: '', parts: [] },
    variables = new Map<string, number>();
  const num = (text: string | undefined) => {
    const n = text?.startsWith('$')
      ? variables.get(text.slice(1))
      : Number(text);
    if (text === undefined || !Number.isFinite(n))
      throw Error(`Expected a number, got ${text ?? 'end of line'}.`);
    return n!;
  };
  for (const [lineIndex, line] of source.split('\n').entries()) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    try {
      const t = clean.split(/\s+/),
        op = t.shift()!;
      if (op === 'let') {
        if (t.length !== 3 || !idPattern.test(t[0]) || t[1] !== '=')
          throw Error('Use: let width = 120');
        variables.set(t[0], num(t[2]));
        continue;
      }
      if ((shapes as readonly string[]).includes(op)) {
        const part = newPart(op as Shape, t.shift() ?? '');
        if (p.parts.some((q) => q.id === part.id))
          throw Error(`Duplicate part ${part.id}.`);
        while (t.length) {
          const key = t.shift();
          if (['size', 'at', 'rotate'].includes(key!)) {
            const vector = [
              num(t.shift()),
              num(t.shift()),
              num(t.shift()),
            ] as Vec3;
            if (key === 'size') part.size = vector;
            if (key === 'at') part.position = vector;
            if (key === 'rotate') part.rotation = vector;
          } else if (key === 'color') part.color = t.shift() ?? '';
          else if (key === 'material') part.material = t.shift() as Material;
          else if (key === 'teeth') part.teeth = num(t.shift());
          else throw Error(`Unknown property ${key}.`);
        }
        p.parts.push(part);
      } else if (op === 'attach') {
        if (t.length !== 3 || t[1] !== 'to')
          throw Error('Use: attach blade to rotor');
        findPart(p, t[0]).parent = t[2] === 'world' ? null : t[2];
      } else if (op === 'spin' || op === 'swing') {
        if (t.length !== (op === 'spin' ? 3 : 4))
          throw Error(`Use: ${op} rotor z 30${op === 'swing' ? ' 45' : ''}`);
        const part = findPart(p, t[0]);
        part.motion = op;
        part.axis = t[1] as Part['axis'];
        part.rpm = num(t[2]);
        if (op === 'swing') part.amplitude = num(t[3]);
      } else if (op === 'radial') {
        if (t.length !== 6 || t[2] !== 'around')
          throw Error('Use: radial blade 4 around rotor z 60');
        const sourcePart = structuredClone(findPart(p, t[0])),
          count = num(t[1]),
          parent = findPart(p, t[3]),
          axis = t[4],
          radius = num(t[5]);
        if (
          !Number.isInteger(count) ||
          count < 2 ||
          count > 24 ||
          !['x', 'y', 'z'].includes(axis) ||
          radius < 0 ||
          radius > 500
        )
          throw Error(
            'Radial arrays need 2–24 copies, axis x/y/z and radius 0–500 mm.',
          );
        for (let i = 0; i < count; i++) {
          const part =
              i === 0
                ? findPart(p, sourcePart.id)
                : structuredClone(sourcePart),
            angle = (i / count) * Math.PI * 2;
          if (i)
            part.id = uniqueId(p, `${sourcePart.id.slice(0, 28)}_${i + 1}`);
          part.parent = parent.id;
          part.position =
            axis === 'z'
              ? [Math.cos(angle) * radius, Math.sin(angle) * radius, 0]
              : axis === 'y'
                ? [Math.cos(angle) * radius, 0, -Math.sin(angle) * radius]
                : [0, Math.cos(angle) * radius, Math.sin(angle) * radius];
          part.rotation = [...sourcePart.rotation];
          part.rotation[['x', 'y', 'z'].indexOf(axis)] = (i / count) * 360;
          if (i) p.parts.push(part);
        }
      } else throw Error(`Unknown instruction “${op}”.`);
      if (p.parts.length > 64)
        throw Error('A project can contain at most 64 parts.');
    } catch (error) {
      throw Error(
        `Line ${lineIndex + 1}: ${error instanceof Error ? error.message : 'Invalid instruction.'}`,
      );
    }
  }
  return validateProject(p);
}
export const starterScripts = {
  fan: `let reach = 48
box base size 110 12 85 at 0 6 0 color #77958b material aluminium
cylinder mast size 13 120 13 at 0 72 0 color #c2d3ca material aluminium
cylinder motor size 36 38 36 at 0 142 -8 rotate 90 0 0 color #68868e material steel
sphere rotor size 22 22 22 at 0 142 20 color #e5b778
box blade size 68 18 5 at 0 0 0 rotate 12 0 0 color #c6dfd4
radial blade 4 around rotor z $reach
spin rotor z 24`,
  arm: `box base size 100 12 90 at 0 6 0 color #77958b material steel
cylinder pivot size 28 20 28 at 0 27 0 color #d9b176
box lower_arm size 15 95 15 at 0 50 0 color #a4c7ba material aluminium
attach lower_arm to pivot
sphere elbow size 25 25 25 at 0 100 0 color #d9b176
attach elbow to pivot
box upper_arm size 15 80 15 at 0 42 0 color #a4c7ba material aluminium
attach upper_arm to elbow
box tool size 40 12 30 at 0 88 0 color #d9b176
attach tool to elbow
swing elbow z 12 40`,
  blank: '# Start with a part, then assemble your own mechanism.\n',
};
export function initialProject() {
  return compileScript(starterScripts.fan, 'Kinetic desk fan');
}
export function changesBetween(before: Project, after: Project) {
  const lines: string[] = [];
  for (const p of after.parts) {
    const old = before.parts.find((q) => q.id === p.id);
    if (!old) lines.push(`Add ${p.shape} “${p.id}”`);
    else {
      const changes = (
        [
          'size',
          'position',
          'rotation',
          'parent',
          'motion',
          'rpm',
          'axis',
          'color',
          'material',
          'amplitude',
          'teeth',
        ] as const
      ).filter((key) => JSON.stringify(old[key]) !== JSON.stringify(p[key]));
      if (changes.length) lines.push(`${p.id}: ${changes.join(', ')}`);
    }
  }
  for (const p of before.parts)
    if (!after.parts.some((q) => q.id === p.id)) lines.push(`Remove ${p.id}`);
  return lines;
}
