'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SpecimenProps } from './lesson';
import {
  beamPoints,
  contextPosition,
  queryPosition,
  shareWidth,
  tokenPosition,
  type AttentionStageState,
} from './attention-logic';
import { palette } from './palette';
import { clamp } from './logic';
import { StagePlinth } from './StagePlinth';
type Props = SpecimenProps<AttentionStageState>;
function printed(
  lines: { text: string; color: string; size: number; y: number; x?: number }[],
  subtle = false,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of lines) {
    ctx.fillStyle = l.color;
    ctx.font = `${subtle ? 400 : 500} ${l.size}px "Stage UI", sans-serif`;
    ctx.fillText(l.text, l.x ?? 256, l.y, 452);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function usePrint(
  lines: { text: string; color: string; size: number; y: number; x?: number }[],
) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const key = JSON.stringify(lines),
    texture = useMemo(() => printed(lines), [key, ready]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
function useHit(id: string, props: Props, action?: () => void) {
  const { gl } = useThree();
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta < 4) {
        if (action) action();
        else props.onPart(id);
      }
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      props.onHover(id);
      gl.domElement.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      props.onHover(null);
      gl.domElement.style.cursor = 'default';
    },
  };
}
function seatGeometry(height: number) {
  const all: T.BufferGeometry[] = [];
  const base = new RoundedBoxGeometry(0.94, 0.1, 0.36, 2, 0.035);
  base.translate(0, -0.55, 0);
  all.push(base);
  const g = new T.CylinderGeometry(
    0.035,
    0.055,
    Math.max(0.08, height - 0.72),
    12,
  ).toNonIndexed();
  g.translate(0, -height / 2 - 0.24, 0);
  all.push(g);
  const result = mergeGeometries(all)!;
  all.forEach((x) => x.dispose());
  return result;
}
function Token({ index, props }: { index: number; props: Props }) {
  const { state, selected, hovered, intro, reduced } = props,
    word = state.tokens[index],
    active = index === state.query,
    blocked = state.causal && index > state.query;
  const group = useRef<T.Group>(null),
    bars = useRef<T.InstancedMesh>(null),
    pose = tokenPosition(index, state.tokens.length),
    isFocused =
      !selected ||
      selected === 'whole' ||
      selected === 'tokens' ||
      selected === 'attention-matrix' ||
      selected === `token-${index}` ||
      ((selected === 'query' ||
        selected === 'vectors' ||
        selected === 'next-query') &&
        active);
  const dim = isFocused ? 1 : 0.35;
  const map = usePrint([
    {
      text: `${String(index + 1).padStart(2, '0')} / ${active ? 'QUERY' : blocked ? 'LOCKED' : 'KEY · VALUE'}`,
      color: active ? palette.amber : palette.muted,
      size: 29,
      y: 88,
    },
    {
      text: word.length > 10 ? word.slice(0, 9) + '…' : word,
      color: palette.ink,
      size: word.length > 7 ? 86 : 126,
      y: 215,
    },
    {
      text: blocked
        ? '0.0% · MASKED'
        : (state.row[index] * 100).toFixed(1) + '%',
      color: blocked ? palette.muted : active ? palette.amber : palette.mint,
      size: 76,
      y: 365,
    },
  ]);
  const geometry = useMemo(
      () => new RoundedBoxGeometry(0.86, 0.98, 0.24, 3, 0.065),
      [],
    ),
    seat = useMemo(() => seatGeometry(pose[1]), [pose[1]]);
  const material = useMemo(
    () =>
      new T.MeshPhysicalMaterial({
        color: palette.blue,
        transparent: true,
        opacity: 0.27,
        metalness: 0.12,
        roughness: 0.13,
        clearcoat: 1,
        depthWrite: false,
      }),
    [],
  );
  const copper = useMemo(
    () =>
      new T.MeshStandardMaterial({
        color: palette.copper,
        metalness: 1,
        roughness: 0.25,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      seat.dispose();
      material.dispose();
      copper.dispose();
    },
    [geometry, seat, material, copper],
  );
  const scratch = useMemo(() => new T.Object3D(), []);
  useLayoutEffect(() => {
    if (!bars.current) return;
    const values = state.values[index];
    values.forEach((v, d) => {
      scratch.position.set((d - 1.5) * 0.14, v * 0.11, -0.05);
      scratch.scale.set(0.055, Math.max(0.012, Math.abs(v) * 0.22), 0.035);
      scratch.updateMatrix();
      bars.current!.setMatrixAt(d, scratch.matrix);
      bars.current!.setColorAt(
        d,
        new T.Color(v < 0 ? palette.amber : palette.mint).multiplyScalar(0.7),
      );
    });
    bars.current.instanceMatrix.needsUpdate = true;
    if (bars.current.instanceColor)
      bars.current.instanceColor.needsUpdate = true;
  }, [state.values, index, scratch]);
  useFrame((_, dt) => {
    const a = clamp((intro.current - 0.25 - index * 0.1) / 0.85),
      k = 1 - (1 - a) ** 3;
    if (group.current) {
      const y = pose[1] + (1 - k) * 0.7;
      group.current.position.lerp(
        new T.Vector3(pose[0], y, pose[2]),
        reduced ? 1 : Math.min(1, dt * 12),
      );
      group.current.scale.setScalar(0.4 + 0.6 * k);
    }
    material.color
      .set(active ? palette.amber : palette.blue)
      .multiplyScalar(dim);
    material.opacity = (blocked ? 0.12 : 0.29) * dim;
    material.envMapIntensity = dim;
    copper.color
      .set(active ? palette.amber : palette.copper)
      .multiplyScalar(dim);
    copper.emissive.set(active ? palette.amber : palette.copper);
    copper.emissiveIntensity =
      (active ? 0.4 : 0) + (hovered === `token-${index}` ? 0.25 : 0);
  });
  const hit = useHit(`token-${index}`, props, () => {
    void props
      .onAction('sim_set_params', { patch: { query: index } })
      .then(() => props.onPart(`token-${index}`));
  });
  return (
    <group ref={group} position={pose} {...hit}>
      <mesh
        geometry={geometry}
        material={material}
        castShadow={props.quality !== 'low'}
      />
      <mesh geometry={seat} material={copper} />
      <instancedMesh
        ref={bars}
        args={[undefined, undefined, 4]}
        visible={selected === 'vectors' || props.demo?.id === 'numbers'}
      >
        <boxGeometry />
        <meshBasicMaterial transparent opacity={0.3 * dim} />
      </instancedMesh>
      <mesh position={[0, 0, 0.127]}>
        <planeGeometry args={[0.81, 0.92]} />
        <meshBasicMaterial
          map={map}
          fog={false}
          transparent
          opacity={(blocked ? 0.45 : 1) * dim}
          depthWrite={false}
        />
      </mesh>
      {blocked && (
        <mesh position={[0, 0, 0.135]} rotation={[0, 0, -0.7]}>
          <boxGeometry args={[0.018, 0.9, 0.012]} />
          <meshBasicMaterial
            color={palette.copper}
            transparent
            opacity={0.38}
          />
        </mesh>
      )}
    </group>
  );
}
function Beams({ props }: { props: Props }) {
  const { state, selected, intro, reduced } = props;
  const curves = useMemo(
    () =>
      state.tokens.map(
        (_, i) =>
          new T.CatmullRomCurve3(
            beamPoints(i, state).map((v) => new T.Vector3(...v)),
          ),
      ),
    [state.tokens.join(' '), state.query],
  );
  const merged = useMemo(() => {
    const geos: T.BufferGeometry[] = [];
    state.row.forEach((w, i) => {
      if (w <= 0) return;
      const g = new T.TubeGeometry(
          curves[i],
          48,
          shareWidth(w),
          8,
          false,
        ).toNonIndexed(),
        color = new T.Color(
          i === state.query ? palette.amber : palette.mint,
        ).multiplyScalar(1.35),
        a = new Float32Array(g.getAttribute('position').count * 3);
      for (let j = 0; j < a.length; j += 3) {
        a[j] = color.r;
        a[j + 1] = color.g;
        a[j + 2] = color.b;
      }
      g.setAttribute('color', new T.BufferAttribute(a, 3));
      geos.push(g);
    });
    const result = geos.length
      ? mergeGeometries(geos)!
      : new T.BufferGeometry();
    geos.forEach((g) => g.dispose());
    return result;
  }, [curves, state.row.join(',')]);
  useEffect(() => () => merged.dispose(), [merged]);
  const mesh = useRef<T.Mesh>(null),
    pulse = useRef<T.InstancedMesh>(null),
    arrows = useRef<T.InstancedMesh>(null),
    scratch = useMemo(() => new T.Object3D(), []),
    material = useMemo(
      () =>
        new T.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      [],
    );
  useEffect(() => () => material.dispose(), [material]);
  const focus =
    !selected ||
    ['whole', 'attention-matrix', 'query', 'weights'].includes(selected) ||
    selected.startsWith('token-');
  const point = useMemo(() => new T.Vector3(), []),
    direction = useMemo(() => new T.Vector3(), []),
    up = useMemo(() => new T.Vector3(0, 1, 0), []);
  useFrame(({ clock }) => {
    material.opacity = (focus ? 0.62 : 0.18) * clamp((intro.current - 1) / 0.7);
    let k = 0;
    state.row.forEach((w, i) => {
      if (w <= 0) return;
      for (let j = 0; j < 2; j++) {
        const t = reduced
          ? 0.55
          : (clock.elapsedTime * 0.3 + j * 0.5 + i * 0.12) % 1;
        curves[i].getPointAt(t, point);
        scratch.position.copy(point);
        scratch.scale.setScalar(
          (0.035 + Math.sqrt(w) * 0.055) * (intro.current > 1.3 ? 1 : 0),
        );
        scratch.quaternion.identity();
        scratch.updateMatrix();
        pulse.current?.setMatrixAt(k++, scratch.matrix);
      }
    });
    if (pulse.current) {
      pulse.current.count = k;
      pulse.current.instanceMatrix.needsUpdate = true;
    }
    k = 0;
    state.row.forEach((w, i) => {
      if (w <= 0) return;
      curves[i].getPointAt(0.84, point);
      curves[i].getTangentAt(0.84, direction);
      scratch.position.copy(point);
      scratch.quaternion.setFromUnitVectors(up, direction.normalize());
      scratch.scale.setScalar(0.7 + Math.sqrt(w) * 0.5);
      scratch.updateMatrix();
      arrows.current?.setMatrixAt(k++, scratch.matrix);
    });
    if (arrows.current) {
      arrows.current.count = intro.current > 1.5 ? k : 0;
      arrows.current.instanceMatrix.needsUpdate = true;
    }
  });
  const hit = useHit('attention-matrix', props);
  return (
    <group {...hit}>
      <mesh ref={mesh} geometry={merged} material={material} />
      <instancedMesh ref={pulse} args={[undefined, undefined, 24]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial
          color={new T.Color(palette.mint).multiplyScalar(focus ? 2 : 0.45)}
        />
      </instancedMesh>
      <instancedMesh ref={arrows} args={[undefined, undefined, 12]}>
        <coneGeometry args={[0.05, 0.14, 10]} />
        <meshBasicMaterial
          color={new T.Color(palette.mint).multiplyScalar(focus ? 1.4 : 0.35)}
          transparent
          opacity={0.7}
        />
      </instancedMesh>
    </group>
  );
}
function Context({ props }: { props: Props }) {
  const { state, quality, selected, intro } = props,
    { size } = useThree(),
    simple = quality === 'low' || size.width < 900,
    group = useRef<T.Group>(null),
    bars = useRef<T.InstancedMesh>(null),
    scratch = useMemo(() => new T.Object3D(), []),
    dim =
      !selected ||
      ['whole', 'context', 'weights', 'attention-matrix'].includes(selected)
        ? 1
        : 0.35;
  const glass = useMemo(
    () =>
      new T.MeshPhysicalMaterial(
        simple
          ? {
              color: '#a5b5ff',
              transparent: true,
              opacity: 0.25,
              roughness: 0.04,
              clearcoat: 1,
              depthWrite: false,
            }
          : {
              color: '#ffffff',
              transmission: 1,
              thickness: 0.16,
              roughness: 0.03,
              ior: 1.45,
              clearcoat: 1,
              attenuationColor: new T.Color('#9db8ff'),
              attenuationDistance: 2.4,
            },
      ),
    [simple],
  );
  useEffect(() => () => glass.dispose(), [glass]);
  const ring = useMemo(() => {
    let angle = 0;
    const all: T.BufferGeometry[] = [];
    state.row.forEach((w, i) => {
      if (!w) return;
      const g = new T.TorusGeometry(
        0.68,
        0.03,
        8,
        Math.max(8, Math.ceil(w * 96)),
        Math.max(0.0001, w * Math.PI * 2 - 0.008),
      ).toNonIndexed();
      g.rotateZ(angle);
      g.rotateX(Math.PI / 2);
      g.translate(0, -0.61, 0);
      const color = new T.Color(
          i === state.query ? palette.amber : palette.mint,
        ).multiplyScalar(1.2),
        c = new Float32Array(g.getAttribute('position').count * 3);
      for (let j = 0; j < c.length; j += 3) {
        c[j] = color.r;
        c[j + 1] = color.g;
        c[j + 2] = color.b;
      }
      g.setAttribute('color', new T.BufferAttribute(c, 3));
      all.push(g);
      angle += w * Math.PI * 2;
    });
    const out = mergeGeometries(all)!;
    all.forEach((g) => g.dispose());
    return out;
  }, [state.row.join(','), state.query]);
  useEffect(() => () => ring.dispose(), [ring]);
  const text = usePrint([
    { text: 'CONTEXT', color: palette.muted, size: 32, y: 425 },
    { text: '4 NUMBER MIX', color: palette.ink, size: 24, y: 464 },
    { text: '0', color: palette.ink, size: 38, y: 256, x: 32 },
  ]);
  useLayoutEffect(() => {
    if (!bars.current) return;
    state.context.forEach((v, i) => {
      scratch.position.set((i - 1.5) * 0.19, v * 0.23, 0);
      scratch.scale.set(0.11, Math.max(0.012, Math.abs(v) * 0.46), 0.11);
      scratch.quaternion.identity();
      scratch.updateMatrix();
      bars.current!.setMatrixAt(i, scratch.matrix);
      bars.current!.setColorAt(
        i,
        new T.Color(v < 0 ? palette.amber : palette.mint).multiplyScalar(
          1.6 * dim,
        ),
      );
    });
    bars.current.instanceMatrix.needsUpdate = true;
    if (bars.current.instanceColor)
      bars.current.instanceColor.needsUpdate = true;
  }, [state.context.join(','), dim, scratch]);
  useFrame(() => {
    const p = clamp((intro.current - 0.9) / 0.8);
    group.current?.scale.setScalar(0.3 + 0.7 * (1 - (1 - p) ** 3));
    glass.envMapIntensity = dim;
    glass.color.set(simple ? '#a5b5ff' : '#ffffff').multiplyScalar(dim);
  });
  const hit = useHit('context', props),
    weightHit = useHit('weights', props);
  return (
    <group ref={group} position={contextPosition} {...hit}>
      <mesh material={glass}>
        <cylinderGeometry args={[0.48, 0.48, 1.14, 48]} />
      </mesh>
      <instancedMesh ref={bars} args={[undefined, undefined, 4]}>
        <capsuleGeometry args={[0.5, 0, 3, 12]} />
        <meshBasicMaterial />
      </instancedMesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.85, 0.012, 0.035]} />
        <meshStandardMaterial
          color={palette.copper}
          metalness={1}
          roughness={0.24}
        />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.53, 0.56, 0.12, 48]} />
        <meshStandardMaterial
          color={palette.dark}
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>
      <mesh geometry={ring} {...weightHit}>
        <meshBasicMaterial vertexColors transparent opacity={dim} />
      </mesh>
      <mesh position={[0, 0, 0.49]}>
        <planeGeometry args={[0.85, 1]} />
        <meshBasicMaterial
          map={text}
          fog={false}
          transparent
          depthWrite={false}
          opacity={dim}
        />
      </mesh>
    </group>
  );
}
function Mask({ props }: { props: Props }) {
  const { state, selected, hovered } = props,
    dim = !selected || ['whole', 'mask'].includes(selected) ? 1 : 0.35;
  const map = usePrint([
    {
      text: state.causal ? 'MASK ON' : 'MASK OFF',
      color: state.causal ? palette.amber : palette.mint,
      size: 55,
      y: 180,
    },
    {
      text: state.causal ? 'NO PEEKING' : 'ALL ALLOWED',
      color: palette.ink,
      size: 33,
      y: 330,
    },
  ]);
  const hit = useHit('mask', props);
  return (
    <group position={[-2.55, 0.65, 1.25]} {...hit}>
      <mesh>
        <boxGeometry args={[0.62, 0.7, 0.09]} />
        <meshStandardMaterial
          color={palette.dark}
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <planeGeometry args={[0.58, 0.66]} />
        <meshBasicMaterial
          map={map}
          fog={false}
          transparent
          opacity={dim}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[0, 0.3, 0.08]}
        rotation={[0, 0, state.causal ? 0 : Math.PI * 0.25]}
      >
        <torusGeometry args={[0.16, 0.018, 8, 32, Math.PI]} />
        <meshStandardMaterial
          color={palette.copper}
          metalness={1}
          roughness={0.24}
          emissive={palette.amber}
          emissiveIntensity={(hovered === 'mask' ? 0.6 : 0.1) * dim}
        />
      </mesh>
    </group>
  );
}
function VectorPeek({ props }: { props: Props }) {
  const { state, selected, demo } = props,
    visible = selected === 'vectors' || demo?.id === 'numbers',
    p = queryPosition(state);
  const lines = [
    `Q  ${state.queries[state.query].map((v) => v.toFixed(1)).join('  ')}`,
    `K  ${state.keys[state.query].map((v) => v.toFixed(1)).join('  ')}`,
    `V  ${state.values[state.query].map((v) => v.toFixed(1)).join('  ')}`,
  ];
  const map = usePrint(
    lines.map((text, i) => ({
      text,
      color: i === 0 ? palette.amber : i === 1 ? palette.blue : palette.mint,
      size: 42,
      y: 130 + i * 125,
    })),
  );
  return (
    <group visible={visible} position={[p[0], p[1] + 0.9, p[2] + 0.2]}>
      <mesh>
        <boxGeometry args={[1.35, 0.86, 0.035]} />
        <meshStandardMaterial
          color={palette.dark}
          metalness={0.8}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[1.3, 0.82]} />
        <meshBasicMaterial
          map={map}
          fog={false}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
function ManyHeads({ props }: { props: Props }) {
  return (
    <group visible={props.demo?.id === 'many'}>
      {[-1, 0, 1].map((x, i) => (
        <mesh
          key={x}
          position={[x * 0.9, 2.9, -1.6]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.34, 0.015, 8, 40]} />
          <meshBasicMaterial
            color={
              i === 0 ? palette.amber : i === 1 ? palette.mint : palette.blue
            }
            transparent
            opacity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}
export function AttentionSpecimen(props: Props) {
  const { state } = props;
  return (
    <>
      <StagePlinth intro={props.intro} />
      {state.tokens.map((word, i) => (
        <Token key={`${i}:${word}`} index={i} props={props} />
      ))}
      <Beams props={props} />
      <Context props={props} />
      <Mask props={props} />
      <VectorPeek props={props} />
      <ManyHeads props={props} />
      {props.quality !== 'low' && (
        <group scale={[1, -1, 1]} position={[0, -0.7, 0]}>
          <StagePlinth intro={props.intro} mirror />
          {state.tokens.map((_, i) => (
            <mesh key={i} position={tokenPosition(i, state.tokens.length)}>
              <boxGeometry args={[0.84, 0.98, 0.22]} />
              <meshStandardMaterial
                color={palette.blue}
                metalness={0.3}
                roughness={0.3}
                transparent
                opacity={0.08}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      )}
    </>
  );
}
