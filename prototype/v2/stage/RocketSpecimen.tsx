'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SpecimenProps, V3 } from './lesson';
import {
  altitudeY,
  rocketPose,
  rocketRuler,
  type RocketStageState,
} from './rocket-logic';
import { clamp } from './logic';
import { palette } from './palette';
import { Glow } from './Studio';
type Metal = 'ceramic' | 'dark' | 'steel' | 'copper';
/** Static construction is merged by material: detailed legs/panels without per-part draw calls. */
function landerGeometry() {
  const parts: Record<Metal, T.BufferGeometry[]> = {
    ceramic: [],
    dark: [],
    steel: [],
    copper: [],
  };
  const d = new T.Object3D();
  const add = (
    g: T.BufferGeometry,
    material: Metal,
    p: V3,
    scale: V3 = [1, 1, 1],
    rotation: V3 = [0, 0, 0],
  ) => {
    d.position.set(...p);
    d.scale.set(...scale);
    d.rotation.set(...rotation);
    d.updateMatrix();
    const baked = g.index ? g.toNonIndexed() : g.clone();
    baked.applyMatrix4(d.matrix);
    parts[material].push(baked);
    g.dispose();
  };
  const cylinder = (r: number, h: number, m: Metal, p: V3) =>
    add(new T.CylinderGeometry(r, r, h, 40), m, p);
  const ring = (
    r: number,
    t: number,
    m: Metal,
    p: V3,
    rotation: V3 = [Math.PI / 2, 0, 0],
  ) => add(new T.TorusGeometry(r, t, 8, 72), m, p, [1, 1, 1], rotation);
  const rod = (a: V3, b: V3, r: number, m: Metal) => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      direction = end.clone().sub(start),
      g = new T.CylinderGeometry(r, r, direction.length(), 12);
    const matrix = new T.Matrix4().compose(
      start.add(end).multiplyScalar(0.5),
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        direction.normalize(),
      ),
      new T.Vector3(1, 1, 1),
    );
    const baked = g.toNonIndexed().applyMatrix4(matrix);
    parts[m].push(baked);
    g.dispose();
  };
  add(
    new T.SphereGeometry(0.56, 36, 24),
    'ceramic',
    [0, 1.06, 0],
    [1, 0.82, 1],
  );
  cylinder(0.47, 0.43, 'ceramic', [0, 0.79, 0]);
  ring(0.47, 0.027, 'copper', [0, 0.61, 0]);
  ring(0.48, 0.024, 'copper', [0, 0.98, 0]);
  cylinder(0.25, 0.08, 'steel', [0, 1.52, 0]);
  ring(0.25, 0.016, 'copper', [0, 1.56, 0]);
  cylinder(0.018, 0.25, 'steel', [0.17, 1.7, -0.12]);
  add(new T.SphereGeometry(0.04, 12, 8), 'copper', [0.17, 1.84, -0.12]);
  add(new T.CylinderGeometry(0.22, 0.32, 0.32, 40), 'dark', [0, 0.42, 0]);
  ring(0.32, 0.025, 'copper', [0, 0.26, 0]);
  cylinder(0.19, 0.045, 'copper', [0, 0.27, 0]);
  ring(0.23, 0.03, 'copper', [0, 1.13, 0.55], [0, 0, 0]);
  ring(0.19, 0.012, 'steel', [0, 1.13, 0.585], [0, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2,
      x = Math.sin(a),
      z = Math.cos(a);
    const foot: V3 = [x * 1.03, 0.07, z * 1.03];
    rod([x * 0.43, 0.98, z * 0.43], foot, 0.042, 'steel');
    rod(
      [x * 0.36, 0.64, z * 0.36],
      [x * 0.88, 0.18, z * 0.88],
      0.025,
      'copper',
    );
    cylinder(0.17, 0.055, 'dark', [foot[0], 0.0275, foot[2]]);
    ring(0.16, 0.015, 'copper', [foot[0], 0.057, foot[2]]);
    add(new T.SphereGeometry(0.07, 12, 8), 'copper', [
      x * 0.43,
      0.98,
      z * 0.43,
    ]);
    add(
      new RoundedBoxGeometry(0.15, 0.28, 0.055, 2, 0.02),
      'dark',
      [x * 0.44, 0.85, z * 0.44],
      [1, 1, 1],
      [0, a, 0],
    );
  }
  for (const sign of [-1, 1]) {
    cylinder(0.12, 0.55, 'ceramic', [sign * 0.5, 1, 0.04]);
    ring(0.12, 0.015, 'copper', [sign * 0.5, 0.76, 0.04]);
    ring(0.12, 0.015, 'copper', [sign * 0.5, 1.25, 0.04]);
  }
  const result = {} as Record<Metal, T.BufferGeometry>;
  for (const key of Object.keys(parts) as Metal[]) {
    result[key] = mergeGeometries(parts[key])!;
    parts[key].forEach((g) => g.dispose());
  }
  return result;
}
function PlinthTicks({ material }: { material: T.Material }) {
  const ref = useRef<T.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new T.Object3D();
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      d.position.set(Math.sin(a) * 3.05, 0.004, Math.cos(a) * 3.05);
      d.rotation.set(0, a, 0);
      d.scale.set(1, 1, i % 8 === 0 ? 2.1 : 1);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, material, 96]}>
      <boxGeometry args={[0.03, 0.012, 0.16]} />
    </instancedMesh>
  );
}
function Rod({
  a,
  b,
  r,
  material,
}: {
  a: V3;
  b: V3;
  r: number;
  material: T.Material;
}) {
  const transform = useMemo(() => {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    return {
      position: start.add(end).multiplyScalar(0.5),
      rotation: new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.clone().normalize(),
      ),
      length: delta.length(),
    };
  }, [a.join(), b.join()]);
  return (
    <mesh
      position={transform.position}
      quaternion={transform.rotation}
      material={material}
    >
      <cylinderGeometry args={[r, r, transform.length, 12]} />
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
function ForceArrow({
  length,
  color,
  down = false,
  hit,
  dim = false,
  hovered = false,
}: {
  length: number;
  color: string;
  down?: boolean;
  hit: ReturnType<typeof interactions>;
  dim?: boolean;
  hovered?: boolean;
}) {
  const magnitude = Math.max(0.001, length),
    h = Math.min(0.17, magnitude * 0.45);
  return (
    <group rotation={down ? [Math.PI, 0, 0] : [0, 0, 0]} {...hit}>
      <mesh position={[0, (magnitude - h) / 2, 0]}>
        <cylinderGeometry
          args={[0.027, 0.027, Math.max(0.001, magnitude - h), 12]}
        />
        <meshBasicMaterial
          color={new T.Color(color).multiplyScalar(
            dim ? 0.45 : hovered ? 2.3 : 1.8,
          )}
        />
      </mesh>
      <mesh position={[0, magnitude - h / 2, 0]}>
        <coneGeometry args={[0.1, h, 20]} />
        <meshBasicMaterial
          color={new T.Color(color).multiplyScalar(
            dim ? 0.45 : hovered ? 2.3 : 1.8,
          )}
        />
      </mesh>
      <mesh position={[0, magnitude / 2, 0]}>
        <cylinderGeometry args={[0.14, 0.14, magnitude, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
function interactions(
  id: string,
  onPart: (id: string) => void,
  onHover: (id: string | null) => void,
  canvas: HTMLCanvasElement,
  mirror: boolean,
) {
  return mirror
    ? {}
    : {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta < 4) onPart(id);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(id);
          canvas.style.cursor = id === 'throttle' ? 'grab' : 'pointer';
        },
        onPointerOut: () => {
          onHover(null);
          canvas.style.cursor = 'default';
        },
      };
}
export function RocketSpecimen(props: SpecimenProps<RocketStageState>) {
  return (
    <>
      <RocketObject {...props} />
      {props.quality !== 'low' && (
        <group scale={[1, -1, 1]} position={[0, -0.7, 0]}>
          <RocketObject {...props} mirror />
        </group>
      )}
    </>
  );
}
function RocketObject({
  state,
  quality,
  reduced,
  selected,
  hovered,
  intro,
  onPart,
  onHover,
  onAction,
  onDial,
  mirror = false,
}: SpecimenProps<RocketStageState> & { mirror?: boolean }) {
  const { gl, size } = useThree(),
    simple = mirror || quality === 'low' || size.width < 900;
  const geometries = useMemo(landerGeometry, []),
    materials = useMemo(() => {
      const standard = (color: string, metalness: number, roughness: number) =>
        new T.MeshStandardMaterial({
          color,
          metalness,
          roughness,
          transparent: mirror,
          opacity: mirror ? 0.16 : 1,
          depthWrite: !mirror,
        });
      return {
        ceramic: standard(palette.ink, 0.32, 0.28),
        dark: standard(palette.dark, 0.9, 0.36),
        steel: standard(palette.steel, 1, 0.27),
        copper: standard(palette.copper, 1, 0.24),
        pad: standard(palette.dark, 0.9, 0.4),
        rail: standard(palette.copper, 1, 0.24),
        control: standard(palette.copper, 1, 0.24),
        marker: new T.MeshStandardMaterial({
          color: palette.copper,
          metalness: 1,
          roughness: 0.24,
          emissive: palette.amber,
          emissiveIntensity: 1.8,
        }),
        rim: new T.MeshStandardMaterial({
          color: palette.copper,
          metalness: 1,
          roughness: 0.24,
          emissive: palette.amber,
          emissiveIntensity: 1.6,
          transparent: mirror,
          opacity: mirror ? 0.15 : 1,
        }),
        glass: new T.MeshPhysicalMaterial(
          simple
            ? {
                color: '#c9d8ff',
                transparent: true,
                opacity: 0.3,
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
        core: new T.MeshBasicMaterial({
          color: new T.Color(palette.blue).multiplyScalar(1.5),
          transparent: mirror,
          opacity: mirror ? 0.12 : 1,
        }),
        tank: new T.MeshPhysicalMaterial({
          color: '#c9d8ff',
          transparent: true,
          opacity: 0.22,
          roughness: 0.1,
          clearcoat: 1,
          depthWrite: false,
        }),
        liquid: new T.MeshBasicMaterial({
          color: new T.Color(palette.mint).multiplyScalar(1.35),
        }),
      };
    }, [mirror, simple]);
  const body = useRef<T.Group>(null),
    plinth = useRef<T.Group>(null),
    rail = useRef<T.Group>(null),
    carriage = useRef<T.Group>(null),
    arrows = useRef<T.Group>(null),
    fuel = useRef<T.Mesh>(null),
    flame = useRef<T.Group>(null),
    lever = useRef<T.Group>(null);
  const displayed = useRef({
      y: rocketPose(state).y,
      throttle: state.throttle,
      fuel: state.fuel,
    }),
    drag = useRef<{ y: number; throttle: number } | null>(null),
    callbacks = useRef({ onAction, onDial });
  callbacks.current = { onAction, onDial };
  const ranges = rocketRuler(state),
    pose = rocketPose(state),
    flying = state.status === 'flying';
  const hit = (id: string) =>
    interactions(id, onPart, onHover, gl.domElement, mirror);
  useEffect(
    () => () => {
      Object.values(geometries).forEach((g) => g.dispose());
    },
    [geometries],
  );
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials],
  );
  useEffect(() => {
    if (mirror) return;
    const move = (e: PointerEvent) => {
      if (drag.current)
        void callbacks.current.onAction('sim_set_params', {
          patch: {
            throttle: clamp(
              drag.current.throttle - (e.clientY - drag.current.y) / 180,
            ),
          },
        });
    };
    const end = () => {
      if (drag.current) {
        drag.current = null;
        callbacks.current.onDial(false);
        gl.domElement.style.cursor = 'grab';
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      callbacks.current.onDial(false);
    };
  }, [gl, mirror]);
  const plumeMaterial = useMemo(
    () =>
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
        uniforms: { time: { value: 0 } },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec2 vUv;uniform float time;void main(){float a=pow(clamp(vUv.y,0.,1.),.8)*.65*(.92+.08*sin(time*17.+vUv.y*23.));vec3 c=mix(vec3(1.,.28,.05),vec3(.4,.75,1.8),pow(vUv.y,3.));gl_FragColor=vec4(c*2.,a);#include <tonemapping_fragment>\n#include <colorspace_fragment>}'.replace(
            ';#include',
            ';\n#include',
          ),
      }),
    [],
  );
  useEffect(() => () => plumeMaterial.dispose(), [plumeMaterial]);
  const visible = (id: string) =>
    !selected ||
    selected === 'whole' ||
    selected === id ||
    ((selected === 'rocket' ||
      selected === 'mass' ||
      selected === 'ground' ||
      selected === 'flight-step') &&
      id === 'rocket');
  useFrame(({ clock }, dt) => {
    const smooth = reduced ? 1 : Math.min(1, dt * 8),
      d = displayed.current;
    d.y += (pose.y - d.y) * smooth;
    d.throttle += (state.throttle - d.throttle) * smooth;
    d.fuel += (state.fuel - d.fuel) * smooth;
    const ap = (delay: number, duration = 0.9) =>
        1 - (1 - clamp((intro.current - delay) / duration)) ** 3,
      assembly = ap(0.4);
    if (plinth.current)
      plinth.current.scale.set(
        0.35 + 0.65 * ap(0, 0.8),
        1,
        0.35 + 0.65 * ap(0, 0.8),
      );
    if (body.current) {
      body.current.position.y = d.y + (1 - assembly) * 1.6;
      body.current.scale.setScalar(0.4 + 0.6 * assembly);
    }
    if (rail.current) rail.current.scale.y = Math.max(0.001, ap(0.7));
    if (carriage.current) carriage.current.position.y = d.y;
    if (arrows.current) arrows.current.position.y = d.y;
    if (lever.current) lever.current.position.y = 0.25 + d.throttle * 0.75;
    if (fuel.current) {
      fuel.current.scale.y = Math.max(
        0.002,
        clamp(d.fuel / Math.max(1, state.initialFuel)),
      );
      fuel.current.position.y = 0.73 + 0.255 * fuel.current.scale.y;
      fuel.current.visible = state.fuel > 0;
    }
    if (flame.current) {
      flame.current.visible =
        flying && state.thrust > 0 && assembly > 0.95 && !mirror;
      flame.current.scale.set(
        0.55 + 0.45 * d.throttle,
        0.35 + 0.65 * d.throttle,
        0.55 + 0.45 * d.throttle,
      );
    }
    plumeMaterial.uniforms.time.value = reduced ? 0 : clock.elapsedTime;
    const dim = (visible('rocket') ? 1 : 0.35) * (mirror ? 0.4 : 1),
      boost = hovered === 'rocket' ? 1.15 : 1;
    materials.ceramic.color.set(palette.ink).multiplyScalar(dim * boost);
    materials.dark.color.set(palette.dark).multiplyScalar(dim);
    materials.steel.color.set(palette.steel).multiplyScalar(dim);
    materials.copper.color.set(palette.copper).multiplyScalar(dim);
    materials.core.color.set(palette.blue).multiplyScalar(1.5 * dim);
    materials.glass.color
      .set(simple ? '#c9d8ff' : '#ffffff')
      .multiplyScalar(dim);
    materials.glass.envMapIntensity = 1.3 * dim;
    materials.pad.color
      .set(palette.dark)
      .multiplyScalar(visible('ground') ? 1 : 0.35);
    materials.rail.color
      .set(palette.copper)
      .multiplyScalar(
        visible('altitude') || visible('altitude-line') ? 1 : 0.35,
      );
    materials.rail.emissive.set(palette.copper);
    materials.rail.emissiveIntensity =
      selected === 'altitude' ||
      selected === 'altitude-line' ||
      hovered === 'altitude'
        ? 0.6
        : 0;
    materials.marker.emissiveIntensity =
      visible('altitude') || visible('altitude-line') ? 1.8 : 0.3;
    materials.control.color
      .set(palette.copper)
      .multiplyScalar(visible('throttle') ? 1 : 0.35);
    materials.control.emissive.set(palette.amber);
    materials.control.emissiveIntensity =
      selected === 'throttle' || hovered === 'throttle' ? 0.8 : 0;
    materials.liquid.color
      .set(palette.mint)
      .multiplyScalar(
        (hovered === 'fuel' ? 1.7 : 1.35) *
          (visible('fuel') ? 1 : !selected ? 1 : 0.35),
      );
    materials.rim.emissive.set(
      state.status === 'landed' ? palette.mint : palette.amber,
    );
    materials.rim.emissiveIntensity =
      (visible('ground') ? (hovered === 'ground' ? 2.1 : 1.8) : 0.3) *
      (mirror ? 0.25 : 1);
  });
  return (
    <group>
      <group ref={plinth} {...hit('ground')}>
        <mesh position={[0, -0.175, 0]} material={materials.pad} receiveShadow>
          <cylinderGeometry args={[3.3, 3.3, 0.35, 96]} />
        </mesh>
        <Ring r={3.27} t={0.026} material={materials.copper} />
        {!mirror && (
          <>
            <Ring r={2.75} t={0.007} y={0.003} material={materials.copper} />
            <PlinthTicks material={materials.copper} />
          </>
        )}
        <mesh position={[0, 0.065, 0]} material={materials.pad} receiveShadow>
          <cylinderGeometry args={[1.48, 1.55, 0.13, 72]} />
        </mesh>
        <Ring r={1.43} t={0.022} y={0.14} material={materials.rim} />
        <Ring r={1.15} t={0.008} y={0.14} material={materials.copper} />
        {!mirror && (
          <>
            <Rod
              a={[-0.34, 0.143, 0]}
              b={[0.34, 0.143, 0]}
              r={0.012}
              material={materials.copper}
            />
            <Rod
              a={[0, 0.143, -0.34]}
              b={[0, 0.143, 0.34]}
              r={0.012}
              material={materials.copper}
            />
            <Glow
              position={[0, 0.145, 0]}
              scale={[3.8, 3.8, 1]}
              color={state.status === 'landed' ? palette.mint : palette.amber}
              opacity={0.16}
              flat
            />
          </>
        )}
      </group>
      <group ref={body} position={[0, pose.y, 0]} {...hit('rocket')}>
        {(Object.keys(geometries) as Metal[]).map((key) => (
          <mesh
            key={key}
            geometry={geometries[key]}
            material={materials[key]}
            castShadow={!mirror}
            receiveShadow
          />
        ))}
        <mesh
          position={[0, 1.13, 0.61]}
          scale={[1, 1, 0.38]}
          material={materials.glass}
        >
          <sphereGeometry args={[0.197, 32, 24]} />
        </mesh>
        <mesh position={[0, 1.13, 0.63]} material={materials.core}>
          <sphereGeometry args={[0.128, 24, 16]} />
        </mesh>
        {!mirror && (
          <group {...hit('fuel')}>
            <mesh position={[-0.5, 1, 0.42]} material={materials.tank}>
              <boxGeometry args={[0.15, 0.6, 0.12]} />
            </mesh>
            <mesh
              ref={fuel}
              position={[-0.5, 0.985, 0.42]}
              material={materials.liquid}
            >
              <boxGeometry args={[0.085, 0.51, 0.055]} />
            </mesh>
          </group>
        )}
        {!mirror && (
          <group ref={flame} position={[0, 0.25, 0]}>
            <mesh position={[0, -0.46, 0]} material={plumeMaterial}>
              <coneGeometry args={[0.4, 0.9, 24, 1, true]} />
            </mesh>
            <mesh position={[0, -0.23, 0]}>
              <coneGeometry args={[0.13, 0.48, 20, 1, true]} />
              <meshBasicMaterial
                color={new T.Color('#b7e8ff').multiplyScalar(2)}
                transparent
                opacity={0.65}
                depthWrite={false}
                blending={T.AdditiveBlending}
              />
            </mesh>
          </group>
        )}
      </group>
      {!mirror && (
        <>
          <group ref={rail} position={[2.45, 0, 0]} {...hit('altitude')}>
            <mesh position={[0, 0.09, 0]} material={materials.pad}>
              <cylinderGeometry args={[0.19, 0.22, 0.18, 32]} />
            </mesh>
            <mesh position={[0, 2.04, 0]} material={materials.rail}>
              <cylinderGeometry args={[0.023, 0.023, 3.8, 24]} />
            </mesh>
            <mesh position={[0, 2.04, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 3.8, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {ranges.ticks.map((v) => (
              <mesh
                key={v}
                position={[0, altitudeY(v, state), 0]}
                material={v === 0 ? materials.marker : materials.rail}
              >
                <boxGeometry args={[v === 0 ? 0.42 : 0.25, 0.015, 0.015]} />
              </mesh>
            ))}
            <group ref={carriage} {...hit('altitude')}>
              <Ring r={0.16} t={0.018} material={materials.marker} />
              <mesh material={materials.marker}>
                <sphereGeometry args={[0.045, 12, 8]} />
              </mesh>
            </group>
          </group>
          <group ref={arrows} position={[0, pose.y, 0]} visible={flying}>
            <group position={[-1.3, 0.25, 0]}>
              <ForceArrow
                length={pose.thrustLength}
                color={palette.mint}
                dim={!visible('thrust')}
                hovered={hovered === 'thrust'}
                hit={hit('thrust')}
              />
            </group>
            <group position={[1.3, 1.35, 0]}>
              <ForceArrow
                length={pose.gravityLength}
                color={palette.amber}
                down
                dim={!visible('gravity')}
                hovered={hovered === 'gravity'}
                hit={hit('gravity')}
              />
            </group>
            <group position={[-2.2, 0.8, 0]}>
              <ForceArrow
                length={Math.min(1.3, Math.abs(state.velocity) / 20)}
                color={palette.blue}
                down={state.velocity < 0}
                dim={!visible('velocity')}
                hovered={hovered === 'velocity'}
                hit={hit('velocity')}
              />
            </group>
          </group>
          <group
            position={[-2.3, 0, 1]}
            {...hit('throttle')}
            onPointerDown={(e) => {
              e.stopPropagation();
              drag.current = { y: e.clientY, throttle: state.throttle };
              onDial(true);
              gl.domElement.setPointerCapture(e.pointerId);
              gl.domElement.style.cursor = 'grabbing';
            }}
          >
            <mesh position={[0, 0.07, 0]} material={materials.pad}>
              <cylinderGeometry args={[0.35, 0.39, 0.14, 48]} />
            </mesh>
            <Ring r={0.34} t={0.018} y={0.14} material={materials.control} />
            <Rod
              a={[0, 0.18, 0]}
              b={[0, 1.12, 0]}
              r={0.035}
              material={materials.steel}
            />
            <group ref={lever} position={[0, 0.25 + state.throttle * 0.75, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.control}>
                <capsuleGeometry args={[0.1, 0.26, 4, 16]} />
              </mesh>
              <mesh position={[0, 0, 0.16]} material={materials.core}>
                <sphereGeometry args={[0.04, 12, 8]} />
              </mesh>
            </group>
          </group>
        </>
      )}
    </group>
  );
}
