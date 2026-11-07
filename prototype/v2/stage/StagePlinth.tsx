'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { palette } from './palette';
/** Shared procedural studio pedestal. Its surface is y=0. */
export function StagePlinth({
  intro,
  mirror = false,
  receiveShadow = true,
  dim = 1,
}: {
  intro: { current: number };
  mirror?: boolean;
  receiveShadow?: boolean;
  dim?: number;
}) {
  const group = useRef<T.Group>(null),
    ticks = useRef<T.InstancedMesh>(null);
  const materials = useMemo(
    () => ({
      body: new T.MeshStandardMaterial({
        color: palette.dark,
        metalness: 0.9,
        roughness: 0.36,
        transparent: mirror,
        opacity: mirror ? 0.12 : 1,
        depthWrite: !mirror,
      }),
      copper: new T.MeshStandardMaterial({
        color: palette.copper,
        metalness: 1,
        roughness: 0.24,
        transparent: mirror,
        opacity: mirror ? 0.12 : 1,
        depthWrite: !mirror,
      }),
    }),
    [mirror],
  );
  const rings = useMemo(() => {
    const geos = [
      [3.27, 0.026],
      [2.75, 0.007],
      [2.92, 0.005],
    ].map(([r, t]) => {
      const g = new T.TorusGeometry(r, t, 8, 96).toNonIndexed();
      g.rotateX(Math.PI / 2);
      return g;
    });
    const merged = mergeGeometries(geos)!;
    geos.forEach((g) => g.dispose());
    return merged;
  }, []);
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
      rings.dispose();
    },
    [materials, rings],
  );
  useLayoutEffect(() => {
    if (!ticks.current) return;
    const p = new T.Object3D();
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      p.position.set(Math.sin(a) * 3.05, 0.004, Math.cos(a) * 3.05);
      p.rotation.set(0, a, 0);
      p.scale.set(1, 1, i % 8 === 0 ? 2.1 : 1);
      p.updateMatrix();
      ticks.current.setMatrixAt(i, p.matrix);
    }
    ticks.current.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(() => {
    materials.body.color.set(palette.dark).multiplyScalar(dim);
    materials.copper.color.set(palette.copper).multiplyScalar(dim);
    const t = Math.min(1, intro.current / 0.8),
      k = 0.2 + 0.8 * (1 - (1 - t) ** 3);
    group.current?.scale.set(k, 1, k);
  });
  return (
    <group ref={group}>
      <mesh
        position={[0, -0.175, 0]}
        material={materials.body}
        receiveShadow={receiveShadow}
      >
        <cylinderGeometry args={[3.3, 3.3, 0.35, 96]} />
      </mesh>
      <mesh geometry={rings} material={materials.copper} />
      {!mirror && (
        <instancedMesh ref={ticks} args={[undefined, materials.copper, 96]}>
          <boxGeometry args={[0.03, 0.012, 0.16]} />
        </instancedMesh>
      )}
    </group>
  );
}
