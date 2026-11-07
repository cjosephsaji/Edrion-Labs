'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as T from 'three';
import type { SpecimenProps } from './lesson';
import { clamp, closenessColor, numberLineRange, numberY } from './logic';
import { palette } from './palette';
import { Glow } from './Studio';
const c1 = new T.CatmullRomCurve3([
  new T.Vector3(-2.1, 0.62, 0),
  new T.Vector3(-1.5, 1, 0.1),
  new T.Vector3(-0.9, 0.64, 0.2),
  new T.Vector3(-0.5, 0.36, 0.2),
]);
const c2 = new T.CatmullRomCurve3([
  new T.Vector3(0.5, 0.36, 0.2),
  new T.Vector3(1.1, 0.88, 0.2),
  new T.Vector3(1.8, 0.7, 0.1),
  new T.Vector3(2.4, 0.2, 0),
]);
const ease = (t: number, delay: number, duration = 0.9) =>
  1 - (1 - clamp((t - delay) / duration)) ** 3;
function Cylinder({
  r,
  h,
  y,
  material,
  shadow = true,
}: {
  r: number;
  h: number;
  y: number;
  material: T.Material;
  shadow?: boolean;
}) {
  return (
    <mesh
      position={[0, y, 0]}
      material={material}
      castShadow={shadow}
      receiveShadow
    >
      <cylinderGeometry args={[r, r, h, 48]} />
    </mesh>
  );
}
function Ring({
  r,
  t = 0.02,
  y = 0,
  material,
}: {
  r: number;
  t?: number;
  y?: number;
  material: T.Material;
}) {
  return (
    <mesh
      position={[0, y, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      material={material}
    >
      <torusGeometry args={[r, t, 8, 96]} />
    </mesh>
  );
}
function TickInstances({
  kind,
  material,
}: {
  kind: 'plinth' | 'dial';
  material: T.Material;
}) {
  const ref = useRef<T.InstancedMesh>(null),
    n = kind === 'plinth' ? 96 : 44;
  useLayoutEffect(() => {
    const d = new T.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      d.position.set(
        Math.sin(a) * (kind === 'plinth' ? 3.05 : 0.5),
        kind === 'plinth' ? 0.004 : 0.35,
        Math.cos(a) * (kind === 'plinth' ? 3.05 : 0.5),
      );
      d.rotation.set(0, a, 0);
      d.scale.set(1, 1, kind === 'plinth' && i % 8 === 0 ? 2.1 : 1);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [n, kind]);
  return (
    <instancedMesh ref={ref} args={[undefined, material, n]}>
      <boxGeometry
        args={kind === 'plinth' ? [0.03, 0.012, 0.16] : [0.028, 0.34, 0.05]}
      />
    </instancedMesh>
  );
}
function HourToken({ label, wide }: { label: string; wide: boolean }) {
  const map = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#d8eaff';
    ctx.font = '48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 64);
    return new T.CanvasTexture(c);
  }, [label]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <>
      <RoundedBox
        args={[wide ? 0.48 : 0.26, 0.3, 0.16]}
        radius={0.04}
        smoothness={2}
      >
        <meshPhysicalMaterial
          color="#a5caff"
          transparent
          opacity={0.35}
          clearcoat={1}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.085]}>
        <planeGeometry args={[wide ? 0.46 : 0.24, 0.13]} />
        <meshBasicMaterial map={map} transparent depthWrite={false} />
      </mesh>
    </>
  );
}
export function NeuralSpecimen(props: SpecimenProps) {
  return (
    <>
      <NeuralObject {...props} />
      {props.quality !== 'low' && (
        <group scale={[1, -1, 1]} position={[0, -0.7, 0]}>
          <NeuralObject {...props} mirror />
        </group>
      )}
    </>
  );
}
function NeuralObject({
  state,
  quality,
  reduced,
  story,
  selected,
  hovered,
  demo,
  intro,
  onPart,
  onHover,
  onAction,
  onDial,
  mirror = false,
}: SpecimenProps & { mirror?: boolean }) {
  const root = useRef<T.Group>(null);
  useLayoutEffect(() => {
    if (mirror)
      root.current?.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
      });
  }, [mirror]);
  const { gl, size } = useThree(),
    simple = quality === 'low' || size.width < 900 || mirror,
    range = useMemo(
      () => numberLineRange(state),
      [state.input, state.target, state.prediction],
    );
  const input = useRef<T.Group>(null),
    dial = useRef<T.Group>(null),
    rail = useRef<T.Group>(null),
    plinth = useRef<T.Group>(null),
    prediction = useRef<T.Group>(null),
    target = useRef<T.Group>(null),
    pointer = useRef<T.Group>(null),
    beam = useRef<T.Mesh>(null),
    beamHit = useRef<T.Mesh>(null),
    pulses = useRef<T.InstancedMesh>(null),
    tokens = useRef<T.Group>(null),
    ghosts = useRef<T.Group>(null),
    fill = useRef<T.PointLight>(null);
  const pulseDummy = useMemo(() => new T.Object3D(), []),
    pulsePoint = useMemo(() => new T.Vector3(), []);
  const display = useRef(state.weight),
    drag = useRef<{ x: number; w: number } | null>(null);
  const current = useRef({ state, onAction, onDial });
  current.current = { state, onAction, onDial };
  const materials = useMemo(() => {
    const std = (color: string, metalness: number, roughness: number) =>
      new T.MeshStandardMaterial({ color, metalness, roughness });
    const make = () => ({
      dark: std(palette.dark, 0.9, 0.36),
      steel: std(palette.steel, 1, 0.27),
      copper: std(palette.copper, 1, 0.24),
      glass: new T.MeshPhysicalMaterial(
        simple
          ? {
              color: '#c9d8ff',
              roughness: 0.04,
              transparent: true,
              opacity: mirror ? 0.2 : 0.3,
              clearcoat: 1,
              depthWrite: false,
            }
          : {
              color: '#ffffff',
              roughness: 0.03,
              transmission: 1,
              thickness: 0.9,
              ior: 1.45,
              attenuationColor: new T.Color('#9db8ff'),
              attenuationDistance: 2.4,
              clearcoat: 1,
              clearcoatRoughness: 0.04,
              envMapIntensity: 1.3,
            },
      ),
      core: new T.MeshBasicMaterial({
        color: new T.Color(palette.blue).multiplyScalar(1.9),
      }),
      glow: new T.MeshStandardMaterial({
        color: palette.amber,
        emissive: palette.amber,
        emissiveIntensity: 2.2,
        metalness: 1,
        roughness: 0.2,
      }),
    });
    const parts = {
      input: make(),
      weight: make(),
      prediction: make(),
      target: make(),
      rail: make(),
      base: make(),
    };
    parts.input.glass.thickness = 0.45;
    parts.prediction.glass.thickness = 0.396;
    return {
      ...parts,
      tube: new T.MeshStandardMaterial({
        color: '#a5b5ff',
        roughness: 0.2,
        emissive: '#4f63ff',
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.55,
      }),
      beam: new T.MeshBasicMaterial({
        color: palette.amber,
        transparent: true,
        opacity: 0.85,
      }),
      pulse: new T.MeshBasicMaterial({
        color: new T.Color('#8fc4ff').multiplyScalar(3),
      }),
    };
  }, [simple, mirror]);
  const tubes = useMemo(
    () => [
      new T.TubeGeometry(c1, 64, 0.03, 6, false),
      new T.TubeGeometry(c2, 64, 0.03, 6, false),
    ],
    [],
  );
  useEffect(
    () => () => {
      for (const p of [
        materials.input,
        materials.weight,
        materials.prediction,
        materials.target,
        materials.rail,
        materials.base,
      ])
        Object.values(p).forEach((m) => m.dispose());
      materials.tube.dispose();
      materials.beam.dispose();
      materials.pulse.dispose();
      tubes.forEach((t) => t.dispose());
    },
    [materials, tubes],
  );
  useEffect(() => {
    if (mirror) return;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      void current.current.onAction('sim_set_params', {
        patch: { weight: clamp(drag.current.w + dx / 180, -10, 10) },
      });
    };
    const end = () => {
      if (!drag.current) return;
      drag.current = null;
      current.current.onDial(false);
      gl.domElement.style.cursor = 'grab';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      current.current.onDial(false);
    };
  }, [gl, mirror]);
  const handlers = (id: string) =>
    mirror
      ? {}
      : {
          onClick: (e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (e.delta > 4) {
              return;
            }
            onPart(id);
          },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover(id);
            gl.domElement.style.cursor = id === 'weight' ? 'grab' : 'pointer';
          },
          onPointerOut: () => {
            onHover(null);
            if (!drag.current) gl.domElement.style.cursor = 'default';
          },
        };
  useFrame(({ clock }, dt) => {
    if (
      !plinth.current ||
      !input.current ||
      !dial.current ||
      !rail.current ||
      !prediction.current ||
      !target.current ||
      !pointer.current ||
      !beam.current ||
      !pulses.current
    )
      return;
    display.current +=
      (state.weight - display.current) * (reduced ? 1 : Math.min(1, dt * 7));
    const pred = state.input * display.current,
      py = numberY(pred, range),
      ty = numberY(state.target, range),
      t = intro.current;
    const color = closenessColor(pred, state.target),
      inp = ease(t, 0.3),
      kn = ease(t, 0.5),
      rl = ease(t, 0.7),
      pr = ease(t, 0.95),
      tr = ease(t, 1.05, 0.8),
      tu = ease(t, 1.25, 0.8);
    plinth.current.scale.set(
      0.35 + 0.65 * ease(t, 0, 0.8),
      1,
      0.35 + 0.65 * ease(t, 0, 0.8),
    );
    input.current.position.y = (1 - inp) * 2.6;
    input.current.scale.setScalar(0.45 + 0.55 * inp);
    dial.current.position.y = (1 - kn) * 2.6;
    dial.current.scale.setScalar(0.45 + 0.55 * kn);
    rail.current.scale.y = Math.max(0.001, rl);
    prediction.current.position.y = py + (1 - pr) * 3;
    prediction.current.scale.setScalar(0.45 + 0.55 * pr);
    target.current.position.y = ty + (1 - tr) * 2.6;
    pointer.current.rotation.y = -T.MathUtils.degToRad(
      -135 + ((display.current + 10) / 20) * 270,
    );
    beam.current.position.set(0.12, (py + ty) / 2, 0.12);
    beam.current.scale.set(0.012, Math.max(0.001, Math.abs(ty - py)), 0.012);
    beam.current.visible = Math.abs(ty - py) > 0.025 && pr > 0.99;
    if (beamHit.current) {
      beamHit.current.position.copy(beam.current.position);
      beamHit.current.scale.set(0.14, Math.max(0.001, Math.abs(ty - py)), 0.14);
      beamHit.current.visible = beam.current.visible;
    }
    materials.prediction.core.color.copy(color).multiplyScalar(1.9);
    materials.beam.color
      .copy(color)
      .multiplyScalar(
        selected &&
          !['loss', 'error-beam', 'target', 'prediction', 'whole'].includes(
            selected,
          )
          ? 0.7
          : 2,
      );
    const demoAge = demo ? (performance.now() - demo.at) / 1000 : 99;
    const sequencePart =
      demo?.id === 'equation' && demoAge < 2.55
        ? ['input-0', 'weight', 'prediction'][
            Math.min(2, Math.floor(demoAge / 0.85))
          ]
        : null;
    const active = (id: string) =>
      sequencePart
        ? sequencePart === id
        : !selected ||
          selected === 'whole' ||
          selected === id ||
          ((selected === 'loss' || selected === 'error-beam') &&
            ['prediction', 'target', 'rail'].includes(id)) ||
          (selected === 'train-step' && id === 'weight');
    for (const [key, id] of [
      ['input', 'input-0'],
      ['weight', 'weight'],
      ['prediction', 'prediction'],
      ['target', 'target'],
      ['rail', 'number-line'],
      ['base', 'plinth'],
    ] as const) {
      const m = materials[key],
        dim = (active(id) ? 1 : 0.35) * (mirror ? 0.4 : 1),
        hover = hovered === id ? 1.22 : 1;
      m.dark.color.set(palette.dark).multiplyScalar(dim * hover);
      m.steel.color.set(palette.steel).multiplyScalar(dim * hover);
      m.copper.color.set(palette.copper).multiplyScalar(dim * hover);
      m.core.color.multiplyScalar(dim * hover);
      if (key === 'input')
        m.core.color.set(palette.blue).multiplyScalar(1.9 * dim * hover);
      m.glow.emissiveIntensity = 2.2 * dim * hover;
      m.glass.color.set(simple ? '#c9d8ff' : '#ffffff').multiplyScalar(dim);
      m.glass.envMapIntensity = 1.3 * dim;
      m.glass.transparent = simple;
      m.core.transparent = mirror;
      m.core.opacity = mirror ? 0.16 : 1;
      m.glass.opacity = (simple ? 0.3 : 1) * (active(id) ? 1 : 0.35);
    }
    materials.tube.emissiveIntensity = selected ? 0.25 : 0.7;
    materials.tube.opacity = selected ? 0.2 : 0.55;
    materials.pulse.color.set('#8fc4ff').multiplyScalar(selected ? 0.7 : 3);
    if (mirror) {
      for (const m of [
        materials.input,
        materials.weight,
        materials.prediction,
        materials.target,
        materials.rail,
        materials.base,
      ]) {
        m.core.transparent = true;
        m.core.opacity = 0.16;
        m.glow.transparent = true;
        m.glow.opacity = 0.2;
      }
    }
    const demoElapsed = demo ? (performance.now() - demo.at) / 1000 : 99;
    if (demo?.id === 'target' && demoElapsed < 2 && !reduced)
      target.current.scale.setScalar(1 + Math.sin(demoElapsed * 8) * 0.07);
    else target.current.scale.setScalar(1);
    tubes.forEach((g) => g.setDrawRange(0, Math.floor(tu * 64) * 6 * 6));
    const d = pulseDummy,
      v = pulsePoint;
    for (let i = 0; i < 12; i++) {
      const second = i >= 6,
        phase = ((i % 6) / 6 + (reduced ? 0 : clock.elapsedTime) * 0.2) % 1;
      (second ? c2 : c1).getPointAt(phase, v);
      d.position.copy(v);
      d.scale.setScalar(
        tu > 0.98
          ? second
            ? 0.03 + 0.035 * clamp((Math.abs(display.current) / 2.7) * 1.4)
            : 0.045
          : 0,
      );
      d.updateMatrix();
      pulses.current.setMatrixAt(i, d.matrix);
    }
    pulses.current.instanceMatrix.needsUpdate = true;
    if (tokens.current) {
      tokens.current.visible = story;
      tokens.current.children.forEach((token, i) => {
        const flow =
          demo?.id === 'tokens' && demoElapsed < 2
            ? reduced
              ? 1
              : clamp(demoElapsed / 1.5 - i * 0.14)
            : 0;
        token.position.y =
          1.6 -
          (flow > 0.98 ? 0 : flow * 0.94) +
          (reduced ? 0 : Math.sin(clock.elapsedTime * 0.7 + i) * 0.04);
        token.scale.setScalar(flow > 0.98 ? 0.01 : 1);
      });
    }
    if (ghosts.current)
      ghosts.current.visible = demo?.id === 'many' && demoElapsed < 5;
    if (fill.current) {
      fill.current.color.copy(color);
      fill.current.position.set(1.7, py + 0.2, 1.4);
    }
  });
  const tokenCount =
    state.input > 0 && Number.isInteger(state.input) && state.input <= 5
      ? state.input
      : 1;
  return (
    <group ref={root}>
      {!mirror && (
        <pointLight ref={fill} intensity={6} distance={6} decay={2} />
      )}
      <group ref={plinth} {...handlers('whole')}>
        <Cylinder r={3.3} h={0.35} y={-0.175} material={materials.base.dark} />
        <Ring r={3.27} t={0.026} material={materials.base.copper} />
        {!mirror &&
          [2.75, 1.5].map((r) => (
            <Ring
              key={r}
              r={r}
              t={0.007}
              y={0.003}
              material={materials.base.copper}
            />
          ))}
        {!mirror && (
          <TickInstances kind="plinth" material={materials.base.copper} />
        )}
      </group>
      <group ref={input} position={[-2.6, 0, 0]} {...handlers('input-0')}>
        <Ring r={0.56} t={0.03} y={0.04} material={materials.input.copper} />
        <Cylinder r={0.5} h={0.06} y={0.03} material={materials.input.steel} />
        <mesh
          position={[0, 0.66, 0]}
          material={materials.input.glass}
          castShadow={!mirror}
        >
          <sphereGeometry args={[0.5, 40, 28]} />
        </mesh>
        <mesh position={[0, 0.66, 0]} material={materials.input.core}>
          <sphereGeometry args={[0.2, 24, 16]} />
        </mesh>
        {!mirror && (
          <Glow
            position={[0, 0.012, 0]}
            scale={[2.6, 2.6, 1]}
            color={palette.blue}
            opacity={selected && selected !== 'input-0' ? 0.15 : 0.55}
            flat
          />
        )}
        {!mirror && (
          <group ref={tokens}>
            {Array.from({ length: tokenCount }, (_, i) => (
              <group
                key={i}
                position={[(i - (tokenCount - 1) / 2) * 0.32, 1.6, 0]}
              >
                <HourToken
                  label={tokenCount > 1 ? '1h' : `${state.input}h`}
                  wide={tokenCount === 1}
                />
              </group>
            ))}
          </group>
        )}
      </group>
      <group
        ref={dial}
        position={[0, 0, 0.2]}
        {...handlers('weight')}
        onPointerDown={
          mirror
            ? undefined
            : (e) => {
                e.stopPropagation();
                drag.current = { x: e.clientX, w: state.weight };
                onDial(true);
                gl.domElement.setPointerCapture(e.pointerId);
                gl.domElement.style.cursor = 'grabbing';
              }
        }
      >
        <Cylinder r={0.66} h={0.14} y={0.07} material={materials.weight.dark} />
        <Cylinder r={0.5} h={0.42} y={0.35} material={materials.weight.steel} />
        <Ring r={0.66} t={0.012} y={0.14} material={materials.weight.copper} />
        {!mirror && (
          <TickInstances kind="dial" material={materials.weight.dark} />
        )}
        <Cylinder
          r={0.43}
          h={0.025}
          y={0.572}
          material={materials.weight.copper}
        />
        <Ring r={0.43} t={0.014} y={0.572} material={materials.weight.copper} />
        <group ref={pointer} position={[0, 0.595, 0]}>
          <mesh position={[0, 0, -0.16]} material={materials.weight.glow}>
            <boxGeometry args={[0.05, 0.02, 0.3]} />
          </mesh>
          <mesh position={[0, 0, -0.32]} material={materials.weight.glow}>
            <sphereGeometry args={[0.035, 12, 8]} />
          </mesh>
        </group>
      </group>
      {!mirror && (
        <>
          <mesh geometry={tubes[0]} material={materials.tube} />
          <mesh geometry={tubes[1]} material={materials.tube} />
        </>
      )}
      <instancedMesh
        ref={pulses}
        visible={!mirror}
        args={[undefined, materials.pulse, 12]}
      >
        <sphereGeometry args={[1, 12, 8]} />
      </instancedMesh>
      <group ref={rail} position={[2.6, 0, 0]}>
        <group {...handlers('number-line')}>
          <Cylinder r={0.24} h={0.16} y={0.08} material={materials.rail.dark} />
          <Ring r={0.24} t={0.012} y={0.16} material={materials.rail.copper} />
          <Cylinder
            r={0.028}
            h={4.7}
            y={2.5}
            material={materials.rail.copper}
          />
          {!mirror && (
            <mesh position={[0, 2.5, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 4.7, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
          {!mirror &&
            range.ticks.map((v) => (
              <group key={v} position={[0, numberY(v, range), 0]}>
                <mesh
                  material={
                    v === 0 ? materials.rail.glow : materials.rail.copper
                  }
                >
                  <boxGeometry
                    args={[
                      v === 0 ? 0.5 : v % (range.step * 2) === 0 ? 0.34 : 0.2,
                      0.014,
                      0.014,
                    ]}
                  />
                </mesh>
              </group>
            ))}
        </group>
        <group ref={target} {...handlers('target')}>
          <Ring r={0.64} t={0.024} material={materials.target.glow} />
        </group>
        <group ref={prediction} {...handlers('prediction')}>
          <mesh material={materials.prediction.glass} castShadow={!mirror}>
            <sphereGeometry args={[0.44, 40, 28]} />
          </mesh>
          <mesh material={materials.prediction.core}>
            <sphereGeometry args={[0.2, 24, 16]} />
          </mesh>
        </group>
        <mesh ref={beam} material={materials.beam} {...handlers('error-beam')}>
          <cylinderGeometry args={[1, 1, 1, 12]} />
        </mesh>
        {!mirror && (
          <mesh ref={beamHit} {...handlers('error-beam')}>
            <cylinderGeometry args={[1, 1, 1, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        {!mirror && (
          <Glow
            position={[0, 0.012, 0]}
            scale={[2.4, 2.4, 1]}
            color={closenessColor(state.prediction, state.target).getStyle()}
            opacity={0.45}
            flat
          />
        )}
      </group>
      {!mirror && (
        <group ref={ghosts} visible={false}>
          {[-1, 0, 1].map((x) => (
            <group key={x} position={[x * 1.15, 0.5, -1.6]}>
              <Cylinder
                r={0.35}
                h={0.3}
                y={0.15}
                shadow={false}
                material={materials.base.steel}
              />
              <Ring
                r={0.35}
                t={0.012}
                y={0.32}
                material={materials.base.copper}
              />
            </group>
          ))}
        </group>
      )}
    </group>
  );
}
