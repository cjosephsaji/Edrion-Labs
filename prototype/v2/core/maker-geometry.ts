import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape as Outline,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  materials,
  worldMatrix,
  type Part,
  type Project,
  type Vec3,
} from './maker-project';

export function partGeometry(part: Part): BufferGeometry {
  let geometry: BufferGeometry;
  if (part.shape === 'box') geometry = new BoxGeometry(1, 1, 1);
  else if (part.shape === 'sphere') geometry = new SphereGeometry(0.5, 40, 24);
  else if (part.shape === 'cylinder' || part.shape === 'cone')
    geometry = new CylinderGeometry(
      part.shape === 'cone' ? 0 : 0.5,
      0.5,
      1,
      48,
    );
  else {
    const shape = new Outline();
    if (part.shape === 'tube') shape.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
    else {
      const n = part.teeth * 4;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2,
          r = i % 4 === 1 || i % 4 === 2 ? 0.5 : 0.43;
        const x = Math.cos(angle) * r,
          y = Math.sin(angle) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
    }
    const hole = new Path();
    hole.absarc(
      0,
      0,
      part.shape === 'tube' ? 0.35 : 0.14,
      0,
      Math.PI * 2,
      true,
    );
    shape.holes.push(hole);
    geometry = new ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: false,
      curveSegments: 40,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -0.5, 0);
  }
  geometry.scale(...part.size);
  return geometry;
}
export function meshVolume(geometry: BufferGeometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry,
    a = g.getAttribute('position');
  let sum = 0;
  const v1 = new Vector3(),
    v2 = new Vector3(),
    v3 = new Vector3();
  for (let i = 0; i < a.count; i += 3) {
    v1.fromBufferAttribute(a, i);
    v2.fromBufferAttribute(a, i + 1);
    v3.fromBufferAttribute(a, i + 2);
    sum += v1.dot(v2.cross(v3)) / 6;
  }
  if (g !== geometry) g.dispose();
  return Math.abs(sum);
}
export function geometryFacts(project: Project) {
  const rows = project.parts.map((part) => {
    const geometry = partGeometry(part),
      volume = meshVolume(geometry),
      box = (geometry.computeBoundingBox(), geometry.boundingBox!.clone());
    geometry.applyMatrix4(worldMatrix(project, part.id));
    geometry.computeBoundingBox();
    box.copy(geometry.boundingBox!);
    geometry.dispose();
    return {
      id: part.id,
      volume,
      mass: (volume / 1000) * materials[part.material].density,
      box,
      position: new Vector3(
        0,
        part.shape === 'cone' ? -part.size[1] / 4 : 0,
        0,
      ).applyMatrix4(worldMatrix(project, part.id)),
    };
  });
  const bounds = new Box3();
  rows.forEach((row) => bounds.union(row.box));
  const mass = rows.reduce((sum, r) => sum + r.mass, 0),
    center = new Vector3();
  rows.forEach((row) =>
    center.addScaledVector(row.position, row.mass / (mass || 1)),
  );
  return {
    rows,
    mass,
    volume: rows.reduce((sum, r) => sum + r.volume, 0),
    center: center.toArray() as Vec3,
    size: bounds.isEmpty()
      ? ([0, 0, 0] as Vec3)
      : (bounds.getSize(new Vector3()).toArray() as Vec3),
    bounds,
  };
}
/** Mesh export uses the exact geometry and hierarchical transforms from the editor. */
export function projectOBJ(project: Project) {
  const lines = [
    '# Petros workshop; units: millimetres; Y up; rest pose',
    ' # Separate parts, not a boolean-unioned manufacturing mesh',
  ];
  let offset = 1;
  for (const p of project.parts) {
    const geometry = partGeometry(p),
      g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.applyMatrix4(worldMatrix(project, p.id));
    const a = g.getAttribute('position');
    lines.push(`o ${p.id}`);
    for (let i = 0; i < a.count; i++)
      lines.push(`v ${a.getX(i)} ${a.getY(i)} ${a.getZ(i)}`);
    for (let i = 0; i < a.count; i += 3)
      lines.push(`f ${offset + i} ${offset + i + 1} ${offset + i + 2}`);
    offset += a.count;
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  return lines.join('\n');
}
export function applyWorldTransform(
  project: Project,
  id: string,
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
): Project {
  const part = project.parts.find((p) => p.id === id)!;
  const local = new Matrix4().makeRotationFromEuler(new Euler(...rotation));
  local.setPosition(...position);
  if (part.parent)
    local.premultiply(worldMatrix(project, part.parent).invert());
  const pos = new Vector3(),
    q = new Quaternion(),
    sc = new Vector3();
  local.decompose(pos, q, sc);
  const e = new Euler().setFromQuaternion(q);
  return {
    ...project,
    parts: project.parts.map((p) =>
      p.id !== id
        ? p
        : {
            ...p,
            position: pos.toArray() as Vec3,
            rotation: [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3,
            size: p.size.map((n, i) => n * Math.abs(scale[i])) as Vec3,
          },
    ),
  };
}
