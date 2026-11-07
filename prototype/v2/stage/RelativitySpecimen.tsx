'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SpecimenProps, V3 } from './lesson';
import {
  clockAngle,
  clockRuler,
  clockX,
  spacetimeDiagram,
  type RelativityStageState,
} from './relativity-logic';
import { StagePlinth } from './StagePlinth';
import { useStagePrint, type PrintLine } from './print-texture';
import { palette } from './palette';
import { clamp, format } from './logic';

type Props = SpecimenProps<RelativityStageState>;
const tint = (color: string, dim: number) =>
  new T.Color(color).multiplyScalar(dim);
const emphasis = (id: string, props: Props) =>
  !props.selected || props.selected === 'whole' || props.selected === id
    ? 1
    : 0.3;
function usePart(id: string, props: Props) {
  const { gl } = useThree();
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta < 4) props.onPart(id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      props.onHover(id);
      gl.domElement.style.cursor = id === 'speed' ? 'grab' : 'pointer';
    },
    onPointerOut: () => {
      props.onHover(null);
      gl.domElement.style.cursor = 'default';
    },
  };
}
const rounded = (w: number, h: number, d: number, radius = 0.03) =>
  new RoundedBoxGeometry(w, h, d, 2, radius);
function combine(geometries: T.BufferGeometry[]) {
  const source = geometries.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  });
  const merged = mergeGeometries(source)!;
  new Set([...source, ...geometries]).forEach((g) => g.dispose());
  return merged;
}
function clockGeometry() {
  const seat = new T.CylinderGeometry(0.5, 0.57, 0.18, 64).translate(
      0,
      0.09,
      -0.35,
    ),
    stem = new T.CylinderGeometry(0.065, 0.09, 0.8, 20).translate(
      0,
      0.58,
      -0.35,
    ),
    body = new T.CylinderGeometry(0.82, 0.82, 0.25, 80)
      .rotateX(Math.PI / 2)
      .translate(0, 1.75, -0.35),
    face = new T.CircleGeometry(0.745, 80).translate(0, 1.75, -0.212),
    rings: T.BufferGeometry[] = [-0.206, -0.485].map((z) =>
      new T.TorusGeometry(0.795, 0.033, 8, 80).translate(0, 1.75, z),
    );
  for (let i = 0; i <= 60; i++) {
    const a = ((-135 + (i / 60) * 270) * Math.PI) / 180;
    rings.push(
      new T.BoxGeometry(0.013, i % 15 === 0 ? 0.083 : 0.038, 0.012)
        .rotateZ(-a)
        .translate(Math.sin(a) * 0.695, 1.75 + Math.cos(a) * 0.695, -0.191),
    );
  }
  return { body: combine([seat, stem, body]), copper: combine(rings), face };
}
function Chronometer({
  props,
  side,
  mirror = false,
}: {
  props: Props;
  side: 'earth' | 'ship';
  mirror?: boolean;
}) {
  const id = side === 'earth' ? 'earth-clock' : 'ship-clock',
    x = side === 'earth' ? -1.65 : 1.65,
    group = useRef<T.Group>(null),
    needle = useRef<T.Group>(null),
    value = useRef(
      side === 'earth' ? props.state.earthClock : props.state.shipClock,
    ),
    dim = emphasis(id, props),
    color = side === 'earth' ? palette.mint : palette.amber,
    geometry = useMemo(clockGeometry, []),
    events = usePart(id, props),
    max = clockRuler(props.state).max;
  const printing: PrintLine[] = Array.from({ length: 5 }, (_, i) => {
    const a = ((-135 + (i / 4) * 270) * Math.PI) / 180;
    return {
      text: format(
        (i / 4) * max,
        Number.isInteger(max / 4)
          ? 0
          : Number.isInteger((max / 4) * 10)
            ? 1
            : 2,
      ),
      color: palette.muted,
      size: 30,
      x: 256 + Math.sin(a) * 202,
      y: 256 - Math.cos(a) * 202,
      mono: true,
    };
  });
  printing.push(
    { text: side.toUpperCase(), color: palette.ink, size: 30, y: 342 },
    { text: 'ELAPSED · SECONDS', color: palette.muted, size: 18, y: 374 },
  );
  const print = useStagePrint(printing),
    glass = useMemo(
      () =>
        new T.MeshPhysicalMaterial(
          props.quality !== 'high' || mirror
            ? {
                color: '#a5b5ff',
                transparent: true,
                opacity: mirror ? 0.04 : 0.13,
                roughness: 0.08,
                clearcoat: 1,
                depthWrite: false,
              }
            : {
                color: '#ffffff',
                transmission: 1,
                roughness: 0.035,
                thickness: 0.14,
                ior: 1.45,
                clearcoat: 1,
                attenuationColor: new T.Color('#9db8ff'),
                attenuationDistance: 2.5,
              },
        ),
      [props.quality, mirror],
    );
  useEffect(
    () => () => {
      Object.values(geometry).forEach((g) => g.dispose());
    },
    [geometry],
  );
  useEffect(() => () => glass.dispose(), [glass]);
  useFrame((_, dt) => {
    const elapsed =
      side === 'earth' ? props.state.earthClock : props.state.shipClock;
    value.current +=
      (elapsed - value.current) * (props.reduced ? 1 : Math.min(1, dt * 9));
    if (needle.current)
      needle.current.rotation.z = -clockAngle(value.current, props.state);
    const t = clamp(
        (props.intro.current - (side === 'earth' ? 0.35 : 0.65)) / 1,
      ),
      k = 1 - (1 - t) ** 3;
    if (group.current) {
      group.current.scale.setScalar(0.05 + k * 0.95);
      group.current.position.y = (1 - k) * 0.65;
    }
    glass.envMapIntensity = dim;
    glass.color
      .set(props.quality === 'high' ? '#ffffff' : '#a5b5ff')
      .multiplyScalar(dim);
  });
  return (
    <group ref={group} position={[x, 0, 0]} {...(mirror ? {} : events)}>
      <mesh
        geometry={geometry.body}
        castShadow={!mirror}
        receiveShadow={!mirror}
      >
        <meshStandardMaterial
          color={tint(palette.dark, dim)}
          metalness={0.9}
          roughness={0.32}
          transparent={mirror}
          opacity={mirror ? 0.11 : 1}
          depthWrite={!mirror}
        />
      </mesh>
      <mesh geometry={geometry.copper}>
        <meshStandardMaterial
          color={tint(palette.copper, dim)}
          metalness={1}
          roughness={0.24}
          transparent={mirror}
          opacity={mirror ? 0.1 : 1}
          depthWrite={!mirror}
        />
      </mesh>
      <mesh geometry={geometry.face}>
        <meshStandardMaterial
          color={tint(palette.dark, dim)}
          metalness={0.75}
          roughness={0.42}
          transparent={mirror}
          opacity={mirror ? 0.06 : 1}
          depthWrite={!mirror}
        />
      </mesh>
      {!mirror && (
        <mesh position={[0, 1.75, -0.18]}>
          <planeGeometry args={[1.48, 1.48]} />
          <meshBasicMaterial
            map={print}
            transparent
            depthWrite={false}
            opacity={dim}
          />
        </mesh>
      )}
      <group ref={needle} position={[0, 1.75, -0.13]}>
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.56, 10]} />
          <meshBasicMaterial
            color={tint(color, 1.8 * dim * dim)}
            transparent={mirror}
            opacity={mirror ? 0.08 : 1}
          />
        </mesh>
        <mesh position={[0, 0.56, 0]}>
          {side === 'earth' ? (
            <sphereGeometry args={[0.052, 20, 14]} />
          ) : (
            <octahedronGeometry args={[0.065]} />
          )}
          <meshBasicMaterial
            color={tint(color, 1.9 * dim * dim)}
            transparent={mirror}
            opacity={mirror ? 0.08 : 1}
          />
        </mesh>
      </group>
      <mesh position={[0, 1.75, -0.07]}>
        <sphereGeometry args={[0.075, 24, 16]} />
        <meshStandardMaterial
          color={tint(palette.copper, dim)}
          metalness={1}
          roughness={0.24}
          transparent={mirror}
          opacity={mirror ? 0.1 : 1}
        />
      </mesh>
      {!mirror && (
        <mesh position={[0, 1.75, -0.16]} scale={[1, 1, 0.16]} material={glass}>
          <sphereGeometry args={[0.75, 48, 24]} />
        </mesh>
      )}
    </group>
  );
}
function Beam({
  a,
  b,
  color,
  radius = 0.012,
  opacity = 1,
}: {
  a: V3;
  b: V3;
  color: T.Color;
  radius?: number;
  opacity?: number;
}) {
  const start = new T.Vector3(...a),
    end = new T.Vector3(...b),
    delta = end.clone().sub(start),
    length = delta.length(),
    rotation = new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      delta.normalize(),
    );
  return (
    <mesh position={start.add(end).multiplyScalar(0.5)} quaternion={rotation}>
      <cylinderGeometry args={[radius, radius, Math.max(0.0001, length), 8]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
function Timeline({ props }: { props: Props }) {
  const events = usePart('timeline', props),
    dim = emphasis('timeline', props),
    earth = useRef<T.Group>(null),
    ship = useRef<T.Group>(null),
    earthBar = useRef<T.Mesh>(null),
    shipBar = useRef<T.Mesh>(null),
    group = useRef<T.Group>(null),
    values = useRef({
      earth: props.state.earthClock,
      ship: props.state.shipClock,
    });
  const marks = useStagePrint(
    [
      {
        text: 'EARTH: ROUND  ·  SHIP: DIAMOND',
        y: 58,
        color: palette.muted,
        size: 40,
      },
      {
        text: 'SECONDS · BRIGHT = ELAPSED · FAINT = SELECTED SPAN',
        y: 132,
        color: palette.muted,
        size: 34,
      },
    ],
    { width: 1536, height: 192 },
  );
  useFrame((_, dt) => {
    const k = props.reduced ? 1 : Math.min(1, dt * 9);
    values.current.earth += (props.state.earthClock - values.current.earth) * k;
    values.current.ship += (props.state.shipClock - values.current.ship) * k;
    for (const [v, marker, bar] of [
      [values.current.earth, earth, earthBar],
      [values.current.ship, ship, shipBar],
    ] as const) {
      const x = clockX(v, props.state);
      if (marker.current) marker.current.position.x = x;
      if (bar.current) {
        bar.current.scale.x = Math.max(0.0001, x + 2.45);
        bar.current.position.x = -2.45 + (x + 2.45) / 2;
      }
    }
    const a = clamp((props.intro.current - 1) / 0.8);
    if (group.current)
      group.current.scale.x = Math.max(0.001, 1 - (1 - a) ** 3);
  });
  return (
    <group ref={group} {...events}>
      {(
        [
          ['earth', 1.62, palette.mint, earthBar, earth],
          ['ship', 1.91, palette.amber, shipBar, ship],
        ] as const
      ).map(([side, z, color, bar, marker]) => (
        <group key={side}>
          <mesh position={[0, 0.115, z]}>
            <boxGeometry args={[4.9, 0.018, 0.026]} />
            <meshStandardMaterial
              color={tint(palette.copper, dim)}
              metalness={1}
              roughness={0.3}
            />
          </mesh>
          <mesh ref={bar} position={[-2.45, 0.15, z]}>
            <boxGeometry args={[1, 0.035, 0.036]} />
            <meshBasicMaterial color={tint(color, 1.3 * dim * dim)} />
          </mesh>
          <group ref={marker} position={[-2.45, 0.22, z]}>
            <mesh>
              {side === 'earth' ? (
                <sphereGeometry args={[0.067, 20, 14]} />
              ) : (
                <octahedronGeometry args={[0.085]} />
              )}
              <meshBasicMaterial color={tint(color, 1.9 * dim * dim)} />
            </mesh>
          </group>
          <mesh
            position={[
              clockX(
                side === 'earth'
                  ? props.state.earthInterval
                  : props.state.shipInterval,
                props.state,
              ),
              0.22,
              z,
            ]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[0.1, 0.009, 6, 32]} />
            <meshBasicMaterial
              color={tint(color, dim)}
              transparent
              opacity={0.32}
            />
          </mesh>
        </group>
      ))}
      {clockRuler(props.state).ticks.map((v) => (
        <mesh key={v} position={[clockX(v, props.state), 0.12, 1.77]}>
          <boxGeometry args={[v === 0 ? 0.025 : 0.01, 0.022, 0.48]} />
          <meshStandardMaterial
            color={tint(v === 0 ? palette.ink : palette.copper, dim)}
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.13, 2.43]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.5, 0.45]} />
        <meshBasicMaterial
          map={marks}
          transparent
          depthWrite={false}
          opacity={dim}
        />
      </mesh>
    </group>
  );
}
function CoordinatePlate({ props }: { props: Props }) {
  const lines = spacetimeDiagram(props.state),
    dim =
      !props.selected ||
      ['whole', 'light-cone', 'worldline'].includes(props.selected)
        ? 1
        : 0.25,
    events = usePart(
      props.selected === 'worldline' ? 'worldline' : 'light-cone',
      props,
    ),
    earthDot = useRef<T.Mesh>(null),
    shipDot = useRef<T.Mesh>(null),
    rayLeft = useRef<T.Mesh>(null),
    rayRight = useRef<T.Mesh>(null),
    group = useRef<T.Group>(null);
  const plate = useMemo(() => {
    const g = new T.BufferGeometry().setFromPoints([
      new T.Vector3(0, 0.07, 0.15),
      new T.Vector3(-1.18, 0.07, -1.03),
      new T.Vector3(1.18, 0.07, -1.03),
    ]);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => plate.dispose(), [plate]);
  const text = useStagePrint(
    [
      {
        text:
          props.state.frame === 'earth'
            ? 'EARTH COORDINATES'
            : 'SHIP COORDINATES',
        color: palette.ink,
        size: 58,
        y: 68,
      },
      {
        text: 'x · light-seconds     t · seconds',
        color: palette.muted,
        size: 34,
        y: 142,
      },
      { text: 'SAME ENDPOINT EVENTS', color: palette.muted, size: 28, y: 212 },
    ],
    { width: 1024, height: 256 },
  );
  useFrame(() => {
    earthDot.current?.position.set(...lines.earthNow);
    shipDot.current?.position.set(...lines.shipNow);
    const showing = props.demo?.id === 'light',
      phase = showing
        ? props.reduced
          ? 1
          : clamp((performance.now() - props.demo!.at) / 2600)
        : 0;
    for (const [ray, end] of [
      [rayLeft, lines.left],
      [rayRight, lines.right],
    ] as const)
      if (ray.current) {
        ray.current.visible = showing;
        ray.current.position.lerpVectors(
          new T.Vector3(...lines.origin),
          new T.Vector3(...end),
          phase,
        );
      }
    if (group.current)
      group.current.scale.setScalar(
        Math.max(0.001, clamp((props.intro.current - 0.9) / 0.9)),
      );
  });
  return (
    <group ref={group} {...events}>
      <mesh geometry={plate}>
        <meshPhysicalMaterial
          color="#a5b5ff"
          transparent
          opacity={0.1 * dim}
          clearcoat={1}
          roughness={0.16}
          depthWrite={false}
          side={T.DoubleSide}
        />
      </mesh>
      <Beam
        a={lines.origin}
        b={lines.left}
        color={tint(palette.blue, 1.5 * dim * dim)}
        radius={0.012}
        opacity={0.7}
      />
      <Beam
        a={lines.origin}
        b={lines.right}
        color={tint(palette.blue, 1.5 * dim * dim)}
        radius={0.012}
        opacity={0.7}
      />
      <Beam
        a={lines.origin}
        b={lines.earth}
        color={tint(palette.mint, 1.3 * dim * dim)}
        radius={0.014}
      />
      <Beam
        a={lines.origin}
        b={lines.ship}
        color={tint(palette.amber, 1.3 * dim * dim)}
        radius={0.014}
      />
      <mesh ref={earthDot}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshBasicMaterial color={tint(palette.mint, 1.8 * dim * dim)} />
      </mesh>
      <mesh ref={shipDot}>
        <octahedronGeometry args={[0.06]} />
        <meshBasicMaterial color={tint(palette.amber, 1.8 * dim * dim)} />
      </mesh>
      {[rayLeft, rayRight].map((ref, i) => (
        <mesh key={i} ref={ref} visible={false}>
          <sphereGeometry args={[0.06, 20, 12]} />
          <meshBasicMaterial color={tint(palette.blue, 2)} />
        </mesh>
      ))}
      <mesh position={[0, 0.11, -1.22]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.6, 0.45]} />
        <meshBasicMaterial
          map={text}
          transparent
          depthWrite={false}
          opacity={dim}
        />
      </mesh>
    </group>
  );
}
function GammaPlaque({ props }: { props: Props }) {
  const events = usePart('gamma', props),
    dim = emphasis('gamma', props),
    g = useMemo(() => rounded(1.5, 0.085, 0.37, 0.025), []),
    print = useStagePrint(
      [
        {
          text: 'γ = ' + format(props.state.gamma, 4),
          color: palette.ink,
          size: 94,
          y: 128,
          mono: true,
        },
      ],
      { width: 1024, height: 256 },
    );
  useEffect(() => () => g.dispose(), [g]);
  return (
    <group position={[0, 0.13, -1.65]} {...events}>
      <mesh geometry={g}>
        <meshStandardMaterial
          color={tint(palette.steel, dim)}
          metalness={1}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 0.33]} />
        <meshBasicMaterial
          map={print}
          transparent
          depthWrite={false}
          opacity={dim}
        />
      </mesh>
    </group>
  );
}
function SpeedDial({ props }: { props: Props }) {
  const { gl } = useThree(),
    events = usePart('speed', props),
    dim = emphasis('speed', props),
    pointer = useRef<T.Group>(null),
    group = useRef<T.Group>(null),
    value = useRef(props.state.beta),
    drag = useRef<{ x: number; beta: number } | null>(null),
    callbacks = useRef(props);
  callbacks.current = props;
  const print = useStagePrint([
      { text: 'SHIP SPEED', color: palette.muted, size: 30, y: 145 },
      {
        text: format(props.state.beta, 3) + 'c',
        color: palette.ink,
        size: 74,
        y: 300,
        mono: true,
      },
    ]),
    ridges = useMemo(
      () =>
        combine(
          Array.from({ length: 44 }, (_, i) => {
            const a = (i / 44) * Math.PI * 2;
            return new T.BoxGeometry(0.032, 0.17, 0.045)
              .rotateY(a)
              .translate(Math.sin(a) * 0.505, 0, Math.cos(a) * 0.505);
          }),
        ),
      [],
    );
  useEffect(() => () => ridges.dispose(), [ridges]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
        if (drag.current)
          void callbacks.current.onAction('sim_set_params', {
            patch: {
              beta:
                Math.round(
                  clamp(
                    drag.current.beta + (e.clientX - drag.current.x) / 480,
                    0,
                    0.999,
                  ) * 1000,
                ) / 1000,
            },
          });
      },
      end = () => {
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
  }, [gl]);
  useFrame((_, dt) => {
    value.current +=
      (props.state.beta - value.current) *
      (props.reduced ? 1 : Math.min(1, dt * 7));
    if (pointer.current)
      pointer.current.rotation.y =
        ((-135 + (value.current / 0.999) * 270) * Math.PI) / 180;
    const t = clamp((props.intro.current - 0.55) / 0.9);
    group.current?.scale.setScalar(0.05 + 0.95 * (1 - (1 - t) ** 3));
  });
  return (
    <group
      ref={group}
      position={[0, 0.28, 0.8]}
      {...events}
      onPointerDown={(e) => {
        e.stopPropagation();
        drag.current = { x: e.clientX, beta: props.state.beta };
        props.onDial(true);
        gl.domElement.setPointerCapture(e.pointerId);
        gl.domElement.style.cursor = 'grabbing';
      }}
    >
      <mesh>
        <cylinderGeometry args={[0.51, 0.55, 0.22, 64]} />
        <meshStandardMaterial
          color={tint(palette.steel, dim)}
          metalness={1}
          roughness={0.28}
        />
      </mesh>
      <mesh geometry={ridges}>
        <meshStandardMaterial
          color={tint(palette.steel, dim)}
          metalness={1}
          roughness={0.28}
        />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.495, 0.022, 8, 64]} />
        <meshStandardMaterial
          color={tint(palette.copper, dim)}
          metalness={1}
          roughness={0.24}
        />
      </mesh>
      <mesh position={[0, 0.118, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.78, 0.78]} />
        <meshBasicMaterial
          map={print}
          transparent
          opacity={dim}
          depthWrite={false}
        />
      </mesh>
      <group ref={pointer} position={[0, 0.15, 0]}>
        <mesh position={[0, 0, 0.435]}>
          <boxGeometry args={[0.055, 0.025, 0.13]} />
          <meshBasicMaterial color={tint(palette.amber, 1.7 * dim * dim)} />
        </mesh>
      </group>
    </group>
  );
}
export function RelativitySpecimen(props: Props) {
  const dim = !props.selected || props.selected === 'whole' ? 1 : 0.3;
  return (
    <>
      <StagePlinth intro={props.intro} receiveShadow={false} dim={dim} />
      <Chronometer props={props} side="earth" />
      <Chronometer props={props} side="ship" />
      <CoordinatePlate props={props} />
      <GammaPlaque props={props} />
      <SpeedDial props={props} />
      <Timeline props={props} />
      <pointLight
        color={palette.amber}
        intensity={0.25 * emphasis('ship-clock', props)}
        position={[1.65, 2.3, 0.4]}
        distance={4}
      />
      {props.quality !== 'low' && (
        <group scale={[1, -1, 1]} position={[0, -0.7, 0]}>
          <StagePlinth
            intro={props.intro}
            mirror
            receiveShadow={false}
            dim={dim}
          />
          <Chronometer props={props} side="earth" mirror />
          <Chronometer props={props} side="ship" mirror />
        </group>
      )}
    </>
  );
}
