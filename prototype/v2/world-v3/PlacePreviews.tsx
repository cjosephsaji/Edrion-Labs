'use client';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Asset, firstGeometry } from './assets';
import { useWorld, places } from './store';
function PreviewCars() {
  const { geometry, material } = firstGeometry('car-proxy'),
    ref = useRef<THREE.InstancedMesh>(null),
    dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!ref.current) return;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      dummy.position.set(3.05 * Math.cos(a), 1.055, 3.05 * Math.sin(a));
      dummy.rotation.set(0, -a, 0);
      dummy.scale.setScalar(0.6);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, 20]} castShadow />;
}
export function PlacePreviews() {
  const place = useWorld((s) => s.place);
  return (
    <>
      {places
        .filter((p) => p.id !== place)
        .map((p) => (
          <group key={p.id} position={p.position}>
            {p.id === 'rocket' ? (
              <Asset name="rocket-proxy" position={[0, 0.8, 0]} />
            ) : p.id === 'traffic' ? (
              <PreviewCars />
            ) : p.id === 'relativity' ? (
              <>
                <Asset name="planet" position={[-1.5, 2, 0]} scale={0.85} />
                <Asset name="ship-proxy" position={[1.7, 2.1, 0]} scale={0.8} />
              </>
            ) : p.id === 'attention' ? (
              <>
                {[-2, -1, 0, 1, 2].map((x, i) => (
                  <Asset
                    key={i}
                    name="word"
                    position={[x, 2.6 + Math.sin(i) * 0.3, 0]}
                    scale={0.8}
                  />
                ))}
              </>
            ) : (
              <>
                {[-2, 0, 2].map((x, i) => (
                  <Asset
                    key={i}
                    name="node"
                    position={[x, 2.6, 0]}
                    scale={1.3}
                  />
                ))}
              </>
            )}
          </group>
        ))}
    </>
  );
}
