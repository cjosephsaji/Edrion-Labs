'use client';
import { BoardSurface } from './board-surface';
import { BoardFixture } from './asset-interior';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HAZARDS, POLLUTION } from '../teaching/algorithms';
import type { ShowcaseState } from '../teaching/types';
import {
  ButtonNode,
  Label,
  Rod,
  SoftBox,
  type Pick,
  type V3,
} from './primitives';
export function SpatialBoard({
  state,
  reveal,
  onPick,
  visible = true,
  caption = '',
  progress = 1,
  onOpen,
}: {
  state: ShowcaseState;
  reveal: number;
  onPick: Pick;
  visible?: boolean;
  animateValues?: boolean;
  caption?: string;
  progress?: number;
  onOpen?: () => void;
}) {
  return (
    <group>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
      >
        <BoardFixture />
      </group>
      <BoardSurface
        state={state}
        frame={{ reveal, visible, caption, progress }}
        onPick={onPick}
        onOpen={onOpen}
      />
    </group>
  );
}
export function ConstructionModel({
  state,
  angle,
  onPick,
  reduced = false,
}: {
  state: ShowcaseState;
  angle: number;
  onPick: Pick;
  reduced?: boolean;
}) {
  const v = state.visualState;
  if (v.kind !== 'hazards') return null;
  if (state.questionId === 'EHS3-Q11')
    return (
      <group position={[3, 1.36, 0.75]} rotation={[0, angle, 0]}>
        <SoftBox size={[2.8, 0.14, 1.9]} color="#ac8f61" />
        {[-0.85, 0.85].map((x) => (
          <group key={x}>
            <SoftBox
              position={[x, 0.4, 0]}
              size={[0.9, 0.7, 1.5]}
              color="#b79b70"
            />
            <SoftBox
              position={[x, 0.77, 0]}
              size={[0.95, 0.06, 1.5]}
              color="#98ad7c"
            />
          </group>
        ))}
        <Label
          text="UNSUPPORTED SIDEWALL"
          position={[0, 1.2, 0.4]}
          size={[2.8, 0.26]}
          color="#856334"
        />
        <ButtonNode
          position={[0.4, 0.58, 0.82]}
          label="Inspect"
          size={[0.8, 0.3]}
          selected={state.highlightTargetId === 'excavation'}
          onClick={() =>
            onPick('excavation', 'Unsupported sidewall / collapse risk')
          }
        />
      </group>
    );
  const hot = (id: string, p: V3, n: number) => {
    const hazard = HAZARDS.find((h) => h.id === id)!;
    return (
      <group key={id} position={p}>
        <ButtonNode
          position={[0, 0, 0]}
          label={String(n)}
          selected={v.selected === id}
          onClick={() => onPick(id, hazard.label)}
          size={[0.32, 0.3]}
        />
      </group>
    );
  };
  return (
    <group position={[3, 1.36, 0.75]} rotation={[0, angle, 0]}>
      <SoftBox position={[0, 0, 0]} size={[2.8, 0.12, 1.9]} color="#c4c3a0" />
      <SoftBox
        position={[-0.25, 0.83, 0]}
        size={[1.65, 0.13, 0.8]}
        color="#ba9c6e"
      />
      {[-1, 0.5].flatMap((x) =>
        [-0.3, 0.3].map((z) => (
          <Rod
            key={`${x}${z}`}
            from={[x, 0.12, z]}
            to={[x, 1.27, z]}
            color="#71936e"
            width={0.03}
          />
        )),
      )}
      <Rod from={[-1, 0.18, 0.32]} to={[0.5, 0.78, 0.32]} color="#91a884" />
      <Rod from={[-1, 0.78, 0.32]} to={[0.5, 0.18, 0.32]} color="#91a884" />
      <Rod from={[-1, 1.25, -0.3]} to={[0.5, 1.25, -0.3]} color="#71936e" />
      <GuardRails safer={v.safer} reduced={reduced} paused={state.paused} />
      {v.selected && <HazardOutline id={v.selected} safer={v.safer} />}
      {v.safer ? (
        <SoftBox
          position={[-0.5, 0.95, 0.12]}
          size={[0.32, 0.16, 0.21]}
          color="#64875d"
        />
      ) : (
        <>
          <Rod
            from={[0.18, 0.95, 0.2]}
            to={[0.65, 0.95, 0.2]}
            color="#b59047"
            width={0.035}
          />
          <Rod
            from={[0.56, 0.95, 0.06]}
            to={[0.56, 0.95, 0.36]}
            color="#66756b"
            width={0.045}
          />
        </>
      )}
      {[-1, 0.5].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.15, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
            <meshStandardMaterial color="#576d52" />
          </mesh>
          {v.safer && (
            <SoftBox
              position={[x, 0.22, 0.38]}
              size={[0.23, 0.04, 0.06]}
              color="#6b925c"
            />
          )}
        </group>
      ))}
      <group
        position={[
          v.safer ? -1.24 : -0.48,
          v.safer ? 0.42 : 1.18,
          v.safer ? 0.48 : 0,
        ]}
        rotation={[0, 0, v.safer ? -0.26 : 0.24]}
      >
        {[-0.11, 0.11].map((x) => (
          <Rod
            key={x}
            from={[x, -0.3, 0]}
            to={[x, 0.75, 0]}
            color="#b18d51"
            width={0.025}
          />
        ))}
        {[0, 0.2, 0.4, 0.6].map((y) => (
          <Rod
            key={y}
            from={[-0.1, y, 0]}
            to={[0.1, y, 0]}
            color="#b18d51"
            width={0.02}
          />
        ))}
      </group>
      <Rod
        from={[v.safer ? 1.25 : 0.9, 0, -0.6]}
        to={[v.safer ? 1.25 : 0.9, 1.75, -0.6]}
        color="#ad8d57"
        width={0.035}
      />
      <Rod
        from={[v.safer ? 0.85 : 0.5, 1.62, -0.6]}
        to={[v.safer ? 1.5 : 1.3, 1.62, -0.6]}
        color="#65745a"
        width={0.018}
      />
      {hot('edge', [-0.2, 1.25, 0.37], 1)}
      {hot('tools', [0.5, 1.24, 0.38], 2)}
      {hot('ladder', [-0.48, 0.6, 0.55], 3)}
      {hot('wheel', [0.62, 0.19, 0.4], 4)}
      {hot('power', [v.safer ? 1.3 : 1, 1.55, -0.48], 5)}
      <Label
        text={v.safer ? 'SAFER ILLUSTRATION' : 'INSPECT THE VISIBLE HAZARDS'}
        position={[0, 0.05, 1.02]}
        size={[2.8, 0.2]}
        fontSize={28}
      />
    </group>
  );
}
function GuardRails({
  safer,
  reduced,
  paused,
}: {
  safer: boolean;
  reduced: boolean;
  paused: boolean;
}) {
  const ref = useRef<THREE.Group>(null),
    progress = useRef(safer ? 1 : 0);
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
  }, [safer, reduced, paused, invalidate]);
  useFrame((_, d) => {
    if (!ref.current) return;
    const target = safer ? 1 : 0;
    if (!paused)
      progress.current = reduced
        ? target
        : THREE.MathUtils.clamp(
            progress.current + ((target ? 1 : -1) * d) / 0.8,
            0,
            1,
          );
    ref.current.scale.y = Math.max(0.001, progress.current);
    ref.current.visible = progress.current > 0.005;
    (window as any).__PETROS_MODEL__ = {
      safer,
      railScale: progress.current,
      stationaryBase: [3, 1.36, 0.75],
    };
    if (progress.current !== target && !paused) invalidate();
  });
  return (
    <group ref={ref} position={[-0.25, 0.88, 0.3]}>
      <Rod
        from={[-0.75, 0.37, 0]}
        to={[0.75, 0.37, 0]}
        color="#608355"
        width={0.035}
      />
      <Rod
        from={[-0.75, 0.17, 0]}
        to={[0.75, 0.17, 0]}
        color="#608355"
        width={0.03}
      />
    </group>
  );
}
function HazardOutline({ id, safer }: { id: string; safer: boolean }) {
  const items: Record<string, { p: V3; s: V3 }> = {
    edge: { p: [-0.25, 1.2, 0.31], s: [1.65, 0.19, 0.15] },
    tools: {
      p: safer ? [-0.5, 0.95, 0.12] : [0.43, 0.96, 0.2],
      s: [0.55, 0.25, 0.42],
    },
    ladder: {
      p: safer ? [-1.24, 0.65, 0.48] : [-0.48, 1.4, 0],
      s: [0.34, 1.2, 0.18],
    },
    wheel: { p: [0.5, 0.17, 0.32], s: [0.32, 0.31, 0.28] },
    power: { p: [safer ? 1.25 : 0.9, 1.62, -0.6], s: [0.9, 0.18, 0.16] },
  };
  const h = items[id];
  return h ? (
    <mesh position={h.p}>
      <boxGeometry args={h.s} />
      <meshBasicMaterial
        color="#ca9343"
        wireframe
        transparent
        opacity={0.95}
        depthWrite={false}
      />
    </mesh>
  ) : null;
}
export function RiverModel({
  state,
  angle,
  onPick,
}: {
  state: ShowcaseState;
  angle: number;
  onPick: Pick;
}) {
  const v = state.visualState;
  if (v.kind !== 'river') return null;
  const controlled = (id: string) => v.controls.includes(id);
  return (
    <group position={[3, 1.37, 0.75]} rotation={[0, angle, 0]}>
      <SoftBox size={[3.2, 0.15, 2.1]} color="#aec19a" />
      <RiverRibbon />
      <mesh position={[-1.25, 0.72, -0.65]} castShadow>
        <cylinderGeometry args={[0.065, 0.085, 0.75, 12]} />
        <meshStandardMaterial color="#b6ad89" />
      </mesh>
      {[-1.1, -0.7].map((x, i) => (
        <group key={x}>
          <SoftBox
            position={[x, 0.35, -0.55]}
            size={[0.32, 0.5, 0.4]}
            color="#d3c6a2"
          />
          <SoftBox
            position={[x, 0.65, -0.55]}
            size={[0.4, 0.1, 0.45]}
            color={i ? '#879e70' : '#af9a75'}
          />
        </group>
      ))}
      <Rod
        from={[-0.75, 0.2, -0.45]}
        to={[-0.75, 0.12, 0.25]}
        width={0.055}
        color={controlled('sewage') ? '#75a68e' : '#988351'}
      />
      {controlled('sewage') && (
        <SoftBox
          position={[-0.75, 0.3, -0.05]}
          size={[0.45, 0.3, 0.35]}
          color="#648e72"
        />
      )}
      <SoftBox
        position={[0.4, 0.14, -0.6]}
        size={[1.2, 0.07, 0.65]}
        color="#b3c082"
      />
      {[-0.05, 0.2, 0.45, 0.7].map((x) => (
        <Rod
          key={x}
          from={[x, 0.2, -0.86]}
          to={[x, 0.2, -0.35]}
          width={0.025}
          color="#e1d9a8"
        />
      ))}
      {!controlled('runoff') &&
        [0.1, 0.5, 0.8].map((x) => (
          <Rod
            key={x}
            from={[x, 0.2, -0.2]}
            to={[x, 0.14, 0.18]}
            color="#a5a459"
            width={0.025}
          />
        ))}
      <SoftBox
        position={[1.05, 0.23, 0.8]}
        size={[0.35, 0.3, 0.28]}
        color={controlled('waste') ? '#749366' : '#bca96c'}
      />
      {!controlled('waste') && (
        <SoftBox
          position={[0.95, 0.17, 0.35]}
          size={[0.16, 0.06, 0.12]}
          color="#bca96c"
        />
      )}
      <SoftBox
        position={[-1, 0.17, 0.8]}
        size={[0.35, 0.08, 0.3]}
        color="#899780"
      />
      {!controlled('oil') && (
        <Rod
          from={[-1, 0.17, 0.7]}
          to={[-1, 0.15, 0.3]}
          color="#696a4b"
          width={0.055}
        />
      )}
      {POLLUTION.map((p, i) => {
        const points: V3[] = [
          [-0.75, 0.5, -0.05],
          [0.5, 0.4, -0.5],
          [1.1, 0.5, 0.8],
          [-1, 0.45, 0.8],
        ];
        return (
          <ButtonNode
            key={p.id}
            position={points[i]!}
            label={controlled(p.id) ? '✓' : String(i + 1)}
            selected={v.selected === p.id}
            size={[0.33, 0.3]}
            onClick={() => onPick(p.id, p.label)}
          />
        );
      })}
      <Label
        text="TOWN → FARM → RIVER"
        position={[0, 0.08, 1.16]}
        size={[2.7, 0.21]}
      />
    </group>
  );
}

function RiverRibbon() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 28; i++) {
      const x = -1.55 + (3.1 * i) / 28;
      const y = 0.11 * Math.sin(x * 3) + 0.2;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    for (let i = 28; i >= 0; i--) {
      const x = -1.55 + (3.1 * i) / 28;
      shape.lineTo(x, 0.11 * Math.sin(x * 3) - 0.2);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={[0, 0.13, 0.3]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <meshStandardMaterial color="#79b5b0" roughness={0.42} />
    </mesh>
  );
}
