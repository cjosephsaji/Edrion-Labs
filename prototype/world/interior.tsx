'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SoftBox, Label, Rod, type V3 } from './primitives';
/** Original procedural materials and geometry. No external art or unlicensed model dependencies. */
function materialTexture(kind: 'oak' | 'plaster' | 'linen') {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle =
    kind === 'oak' ? '#c3aa80' : kind === 'plaster' ? '#e3dfd1' : '#8c9b83';
  x.fillRect(0, 0, 512, 512);
  let seed = 421;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 16000; i++) {
    const a = random() * (kind === 'oak' ? 0.055 : 0.022);
    x.fillStyle = `rgba(${kind === 'oak' ? '55,29,9' : '30,40,29'},${a})`;
    if (kind === 'oak') {
      const y = random() * 512;
      x.fillRect(random() * 512, y, random() * 140 + 20, 0.4 + random());
    } else
      x.fillRect(random() * 512, random() * 512, 1 + random(), 1 + random());
  }
  if (kind === 'linen') {
    x.strokeStyle = '#c2c8b31a';
    for (let i = 0; i < 512; i += 3) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 512);
      x.moveTo(0, i);
      x.lineTo(512, i);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function Panel({
  position,
  size,
  map,
  color = '#ffffff',
  roughness = 0.7,
}: {
  position: V3;
  size: V3;
  map?: THREE.Texture;
  color?: string;
  roughness?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial map={map} color={color} roughness={roughness} />
    </mesh>
  );
}
export function StudioTable({
  position,
  width = 2.5,
  depth = 1.25,
  height = 0.82,
  map,
}: {
  position: V3;
  width?: number;
  depth?: number;
  height?: number;
  map?: THREE.Texture;
}) {
  return (
    <group position={position}>
      <Panel
        position={[0, height - 0.035, 0]}
        size={[width, 0.075, depth]}
        map={map}
        color={map ? '#ffffff' : '#b99368'}
        roughness={0.48}
      />
      <SoftBox
        position={[0, height - 0.1, 0]}
        size={[width - 0.09, 0.08, depth - 0.1]}
        color="#5f715e"
        radius={0.014}
      />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={`${x}${z}`}>
            <Rod
              from={[x * (width / 2 - 0.1), 0.04, z * (depth / 2 - 0.12)]}
              to={[
                x * (width / 2 - 0.17),
                height - 0.1,
                z * (depth / 2 - 0.18),
              ]}
              width={0.035}
              color="#405347"
            />
            <SoftBox
              position={[x * (width / 2 - 0.1), 0.025, z * (depth / 2 - 0.12)]}
              size={[0.09, 0.04, 0.09]}
              color="#343f35"
              radius={0.015}
            />
          </group>
        )),
      )}
    </group>
  );
}
function Plant({ position, scale = 1 }: { position: V3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.14, 0.36, 24]} />
        <meshStandardMaterial color="#b78e65" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.365, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.012, 20]} />
        <meshStandardMaterial color="#423d2b" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const a = i * 2.4;
        return (
          <mesh
            key={i}
            position={[
              Math.sin(a) * 0.17,
              0.65 + (i % 3) * 0.08,
              Math.cos(a) * 0.17,
            ]}
            rotation={[0.4, a, 0.4]}
            scale={[0.36, 0.8, 0.19]}
            castShadow
          >
            <sphereGeometry args={[0.25, 12, 8]} />
            <meshStandardMaterial
              color={['#476247', '#617b50', '#819765'][i % 3]}
              roughness={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}
function DecorativeBooks() {
  const covers = useRef<THREE.InstancedMesh>(null),
    bands = useRef<THREE.InstancedMesh>(null);
  const books = useMemo(
    () =>
      Array.from({ length: 112 }, (_, i) => {
        const side = i >= 64;
        const j = side ? i - 64 : i;
        const row = Math.floor(j / 16),
          col = j % 16;
        return {
          p: side
            ? [-4.62, 0.28 + row * 0.57, 1.6 + col * 0.105]
            : [-4.7 + col * 0.126, 0.28 + row * 0.57, -3.36],
          h: 0.29 + (i % 5) * 0.026,
          w: 0.071 + (i % 3) * 0.009,
          side,
        };
      }).filter(
        (_, i) =>
          !(i < 64 && Math.floor(i / 16) === 2 && i % 16 >= 2 && i % 16 <= 9),
      ),
    [],
  );
  useEffect(() => {
    const o = new THREE.Object3D();
    books.forEach((b, i) => {
      o.position.set(...(b.p as V3));
      o.position.y += b.h / 2;
      o.scale.set(b.side ? 0.23 : b.w, b.h, b.side ? b.w : 0.23);
      o.rotation.y = b.side ? Math.PI / 2 : 0;
      o.updateMatrix();
      covers.current!.setMatrixAt(i, o.matrix);
      covers.current!.setColorAt(
        i,
        new THREE.Color(
          [
            '#3e5847',
            '#6c7964',
            '#9c784c',
            '#b6a17a',
            '#7d5c49',
            '#647873',
            '#b4b59a',
            '#485b68',
          ][i % 8]!,
        ),
      );
      o.position.z += b.side ? 0 : 0.12;
      o.position.x += b.side ? 0.12 : 0;
      o.scale.y = 0.012;
      o.updateMatrix();
      bands.current!.setMatrixAt(i, o.matrix);
    });
    covers.current!.instanceMatrix.needsUpdate = true;
    covers.current!.computeBoundingSphere();
    covers.current!.computeBoundingBox();
    bands.current!.computeBoundingSphere();
    bands.current!.computeBoundingBox();
    if (covers.current!.instanceColor)
      covers.current!.instanceColor.needsUpdate = true;
    bands.current!.instanceMatrix.needsUpdate = true;
  }, [books]);
  return (
    <group>
      <instancedMesh
        ref={covers}
        args={[undefined, undefined, books.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.77} />
      </instancedMesh>
      <instancedMesh ref={bands} args={[undefined, undefined, books.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#c4ad78"
          roughness={0.62}
          metalness={0.12}
        />
      </instancedMesh>
    </group>
  );
}
function Bookcase({
  position,
  rotation = 0,
  map,
}: {
  position: V3;
  rotation?: number;
  map: THREE.Texture;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Panel
        position={[0, 1.43, -0.2]}
        size={[2.25, 2.86, 0.07]}
        map={map}
        color="#b5baa0"
      />
      <Panel position={[-1.13, 1.45, 0]} size={[0.1, 2.9, 0.48]} map={map} />
      <Panel position={[1.13, 1.45, 0]} size={[0.1, 2.9, 0.48]} map={map} />
      {[0.24, 0.8, 1.37, 1.94, 2.51, 2.92].map((y) => (
        <group key={y}>
          <Panel position={[0, y, 0]} size={[2.38, 0.075, 0.5]} map={map} />
          <mesh position={[0, y - 0.05, 0.19]}>
            <boxGeometry args={[2.1, 0.012, 0.018]} />
            <meshStandardMaterial
              color="#e6cc87"
              emissive="#eecb7c"
              emissiveIntensity={0.25}
            />
          </mesh>
        </group>
      ))}
      <Panel position={[0, 0.12, 0]} size={[2.45, 0.16, 0.57]} map={map} />
      <Panel position={[0, 2.99, 0]} size={[2.46, 0.1, 0.57]} map={map} />
    </group>
  );
}
export function Interior() {
  const materials = useMemo(
    () => ({
      oak: materialTexture('oak'),
      plaster: materialTexture('plaster'),
      linen: materialTexture('linen'),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(materials).forEach((t) => t.dispose()),
    [materials],
  );
  return (
    <group>
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#e4eff1', '#7e8d70', 0.85]} />
      <directionalLight
        position={[-4, 5, 2]}
        intensity={2.0}
        color="#fff3da"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0003}
        shadow-radius={3}
      />
      <directionalLight
        position={[0, 2.4, 3]}
        intensity={0.8}
        color="#f5f3e2"
      />
      <pointLight
        position={[-3.9, 2.7, -2.8]}
        intensity={0.8}
        distance={4}
        color="#ffddb0"
      />
      <pointLight
        position={[-3.3, 1.5, 0.5]}
        intensity={0.7}
        distance={3}
        color="#ffe0a5"
      />
      <Panel position={[0, -0.09, 0]} size={[9.8, 0.18, 7.6]} color="#6c624e" />
      {Array.from({ length: 20 }, (_, i) => (
        <Panel
          key={i}
          position={[-4.65 + i * 0.49, 0.005, 0]}
          size={[0.477, 0.028, 7.6]}
          map={materials.oak}
          color={i % 3 === 0 ? '#d7c5a8' : i % 3 === 1 ? '#e8d5b4' : '#cab793'}
          roughness={0.62}
        />
      ))}
      <Panel
        position={[0, 1.6, -3.76]}
        size={[9.8, 3.2, 0.14]}
        map={materials.plaster}
      />
      <Panel
        position={[4.86, 1.6, 0]}
        size={[0.14, 3.2, 7.6]}
        map={materials.plaster}
        color="#c3cdbb"
      />
      <Panel
        position={[-4.86, 1.6, -2.65]}
        size={[0.14, 3.2, 2.3]}
        map={materials.plaster}
      />
      <Panel
        position={[-4.86, 1.6, 2.75]}
        size={[0.14, 3.2, 2.1]}
        map={materials.plaster}
      />
      <Panel
        position={[-4.86, 0.45, 0.05]}
        size={[0.14, 0.9, 3.25]}
        map={materials.plaster}
      />
      <Panel
        position={[-4.86, 3, 0.05]}
        size={[0.14, 0.4, 3.25]}
        map={materials.plaster}
      />
      <Panel position={[0, 3.23, 0]} size={[9.8, 0.12, 7.6]} color="#e8e6da" />
      {[-3.6, -1.2, 1.2, 3.6].map((x) => (
        <Panel
          key={x}
          position={[x, 3.11, 0]}
          size={[0.11, 0.16, 7.5]}
          color="#d1d2bf"
        />
      ))}
      {[
        [-4.7, 1.1, 3.74],
        [4.7, 1.1, 3.74],
      ].map((p, i) => (
        <Panel
          key={i}
          position={p as V3}
          size={[0.1, 2.2, 0.08]}
          map={materials.oak}
        />
      ))}
      <Panel
        position={[0, 0.09, -3.63]}
        size={[9.6, 0.18, 0.08]}
        color="#647762"
      />
      <Panel
        position={[4.75, 0.09, 0]}
        size={[0.08, 0.18, 7.4]}
        color="#647762"
      />
      <Panel
        position={[0, 3.07, -3.62]}
        size={[9.6, 0.13, 0.12]}
        color="#d0d3bf"
      />
      <Panel
        position={[-4.78, 1.87, 0.1]}
        size={[0.06, 1.95, 3.3]}
        color="#d3d7c9"
      />
      <mesh position={[-4.72, 1.87, 0.1]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.12, 1.78]} />
        <meshStandardMaterial
          color="#a4c3c8"
          roughness={0.2}
          metalness={0.12}
          emissive="#a9c5c7"
          emissiveIntensity={0.3}
        />
      </mesh>
      {[0, 1].map((i) => (
        <Panel
          key={i}
          position={[-4.65, 1.87, i ? -0.5 : 0.7]}
          size={[0.08, 1.86, 0.045]}
          color="#eee9d8"
        />
      ))}
      <Panel
        position={[-4.65, 1.88, 0.1]}
        size={[0.08, 0.045, 3.2]}
        color="#eee9d8"
      />
      <Panel
        position={[-4.54, 0.87, 0.1]}
        size={[0.5, 0.1, 3.5]}
        map={materials.oak}
      />
      <Bookcase position={[-3.72, 0, -3.42]} map={materials.oak} />
      <Bookcase
        position={[-4.61, 0, 2.4]}
        rotation={Math.PI / 2}
        map={materials.oak}
      />
      <DecorativeBooks />
      {[0, 1, 2, 3].map((i) => (
        <Panel
          key={'stack' + i}
          position={[-2.9, 0.31 + i * 0.04, -3.24]}
          size={[0.44, 0.035, 0.25]}
          map={materials.oak}
          color={['#9a8a61', '#66816c', '#b9b394', '#7c6753'][i]}
        />
      ))}
      <StudioTable
        position={[-3.15, 0, 0.6]}
        width={2.15}
        depth={1.05}
        height={0.76}
        map={materials.oak}
      />
      <SoftBox
        position={[-3.2, 0.8, 0.55]}
        size={[0.46, 0.04, 0.34]}
        color="#ebe3cc"
        rotation={[0, 0.13, 0]}
      />
      <SoftBox
        position={[-3.2, 0.83, 0.55]}
        size={[0.43, 0.025, 0.32]}
        color="#6a7c62"
        rotation={[0, -0.07, 0]}
      />
      <Rod
        from={[-3.45, 0.85, 0.65]}
        to={[-3.05, 0.85, 0.65]}
        width={0.008}
        color="#c6a471"
      />
      <mesh position={[-3.9, 0.79, 0.35]}>
        <cylinderGeometry args={[0.12, 0.13, 0.05, 24]} />
        <meshStandardMaterial color="#465b4b" metalness={0.4} roughness={0.3} />
      </mesh>
      <Rod
        from={[-3.9, 0.81, 0.35]}
        to={[-3.9, 1.26, 0.35]}
        width={0.015}
        color="#627362"
      />
      <Rod
        from={[-3.9, 1.26, 0.35]}
        to={[-3.7, 1.44, 0.35]}
        width={0.015}
        color="#627362"
      />
      <mesh position={[-3.64, 1.41, 0.35]} rotation={[0, 0, -0.5]}>
        <coneGeometry args={[0.16, 0.23, 24, 1, true]} />
        <meshStandardMaterial
          color="#52654e"
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[-2.5, 0.86, 0.6]}>
        <cylinderGeometry args={[0.065, 0.055, 0.17, 24]} />
        <meshStandardMaterial color="#d2c9b0" roughness={0.3} />
      </mesh>
      <mesh position={[-2.42, 0.88, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.045, 0.012, 8, 16]} />
        <meshStandardMaterial color="#d2c9b0" />
      </mesh>
      <group position={[-3.15, 0, 1.48]}>
        <SoftBox
          position={[0, 0.44, 0]}
          size={[0.5, 0.12, 0.49]}
          color="#60745d"
          radius={0.055}
        />
        <SoftBox
          position={[0, 0.73, 0.23]}
          size={[0.5, 0.56, 0.11]}
          color="#667b61"
          radius={0.055}
        />
        {[-0.18, 0.18].flatMap((x) =>
          [-0.17, 0.17].map((z) => (
            <Rod
              key={`${x}${z}`}
              from={[x, 0.03, z]}
              to={[x, 0.4, z]}
              width={0.02}
              color="#3b4c40"
            />
          )),
        )}
      </group>
      <StudioTable
        position={[2.3, 0, -0.1]}
        width={2.65}
        depth={1.65}
        map={materials.oak}
      />
      <Panel
        position={[2.3, 0.865, -0.1]}
        size={[2.48, 0.018, 1.47]}
        map={materials.linen}
        color="#d9ddcb"
      />
      <StudioTable
        position={[-3.2, 0, -1.4]}
        width={0.75}
        depth={0.55}
        height={0.87}
        map={materials.oak}
      />
      <SoftBox
        position={[-3.2, 0.91, -1.4]}
        size={[0.66, 0.045, 0.46]}
        color="#6d7f5e"
      />
      <Panel
        position={[0.1, 0.025, 0.75]}
        size={[3.2, 0.02, 2.15]}
        map={materials.linen}
        color="#b4beaa"
        roughness={1}
      />
      <Plant position={[4.15, 0, -3.05]} scale={1.5} />
      <Plant position={[-4.48, 0.94, 0.1]} scale={0.7} />
      {[-0.6, 2.8].map((x) => (
        <group key={x}>
          <mesh position={[x, 3.09, -0.3]}>
            <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
            <meshStandardMaterial color="#6b7664" metalness={0.4} />
          </mesh>
          <mesh position={[x, 3.05, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.14, 24]} />
            <meshBasicMaterial color="#fff2c9" />
          </mesh>
        </group>
      ))}
      <group position={[4.72, 1.65, 1.7]} rotation={[0, -Math.PI / 2, 0]}>
        <SoftBox size={[1.2, 1.0, 0.04]} color="#6e806c" radius={0.015} />
        <Label
          text="A little curiosity"
          position={[0, 0.14, 0.035]}
          size={[1, 0.2]}
          color="#f4ecd8"
        />
        <Label
          text="goes a long way."
          position={[0, -0.12, 0.035]}
          size={[1, 0.2]}
          color="#f4ecd8"
        />
      </group>
    </group>
  );
}
