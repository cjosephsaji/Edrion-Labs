'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SpecimenProps } from './lesson';
import { defaultTrafficParams } from '../simulations/foundations/traffic';
import {
  roadLength,
  roadRadius,
  roadPosition,
  roadDelta,
  wrapRoad,
  speedAtOrdered,
  trafficColor,
  trafficSnapshotColor,
  trafficGapPoints,
  type TrafficStageState,
} from './traffic-logic';
import { StagePlinth } from './StagePlinth';
import { useStagePrint } from './print-texture';
import { palette } from './palette';
import { clamp } from './logic';
type Props = SpecimenProps<TrafficStageState>;
const metricScale = (s: TrafficStageState) =>
  Math.ceil(Math.max(35, s.max) / 10) * 10;
function interactions(id: string, props: Props, canvas: HTMLCanvasElement) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta < 4) props.onPart(id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      props.onHover(id);
      canvas.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      props.onHover(null);
      canvas.style.cursor = 'default';
    },
  };
}
function ringsGeometry(radii: number[], y: number, tube = 0.016) {
  const all = radii.map((r) => {
    const g = new T.TorusGeometry(r, tube, 8, 128).toNonIndexed();
    g.rotateX(Math.PI / 2);
    g.translate(0, y, 0);
    return g;
  });
  const g = mergeGeometries(all)!;
  all.forEach((x) => x.dispose());
  return g;
}
function Road({ props, mirror = false }: { props: Props; mirror?: boolean }) {
  const { gl } = useThree(),
    group = useRef<T.Group>(null),
    ribbon = useRef<T.Mesh>(null);
  const edges = useMemo(() => ringsGeometry([2.2, 2.76], 0.35, 0.025), []);
  const band = useMemo(() => {
    const g = new T.RingGeometry(2.87, 2.99, 256, 1).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    const a = new Float32Array(g.getAttribute('position').count * 3);
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    return g;
  }, []);
  const road = useMemo(() => {
    const shape = new T.Shape();
    shape.absarc(0, 0, 2.77, 0, Math.PI * 2, false);
    const hole = new T.Path();
    hole.absarc(0, 0, 2.19, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new T.ExtrudeGeometry(shape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 96,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.18, 0);
    return g;
  }, []);
  const roadMaterial = useMemo(
    () =>
      new T.MeshStandardMaterial({
        color: palette.dark,
        metalness: 0.85,
        roughness: 0.34,
        transparent: mirror,
        opacity: mirror ? 0.1 : 1,
        depthWrite: !mirror,
      }),
    [mirror],
  );
  const copper = useMemo(
    () =>
      new T.MeshStandardMaterial({
        color: palette.copper,
        metalness: 1,
        roughness: 0.24,
        transparent: mirror,
        opacity: mirror ? 0.08 : 1,
        depthWrite: !mirror,
      }),
    [mirror],
  );
  useEffect(
    () => () => {
      edges.dispose();
      band.dispose();
      road.dispose();
      roadMaterial.dispose();
      copper.dispose();
    },
    [edges, band, road, roadMaterial, copper],
  );
  useLayoutEffect(() => {
    if (mirror) return;
    const ordered = [...props.state.cars].sort(
      (a, b) => a.position - b.position,
    );
    const p = band.getAttribute('position'),
      colors = band.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getX(i), p.getZ(i)),
        position = wrapRoad((angle / (Math.PI * 2)) * roadLength),
        color = trafficSnapshotColor(
          speedAtOrdered(position, ordered),
          props.state,
        ).multiplyScalar(0.7);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }, [band, props.state.cars, props.state.desiredSpeed, mirror]);
  useFrame(() => {
    const a = clamp((props.intro.current - 0.35) / 1),
      k = 1 - (1 - a) ** 3;
    group.current?.scale.set(k, 1, k);
    if (group.current) group.current.position.y = (1 - k) * 0.5;
    const dim =
      !props.selected ||
      ['whole', 'ring', 'density', 'ribbon', 'jam-front', 'traces'].includes(
        props.selected,
      )
        ? 1
        : 0.35;
    roadMaterial.color.set(palette.dark).multiplyScalar(dim);
    copper.color.set(palette.copper).multiplyScalar(dim);
    if (ribbon.current)
      (ribbon.current.material as T.MeshBasicMaterial).opacity =
        (mirror
          ? 0.08
          : !props.selected ||
              ['whole', 'ring', 'ribbon', 'jam-front', 'traces'].includes(
                props.selected,
              )
            ? 0.7
            : 0.22) * clamp((props.intro.current - 1.1) / 0.5);
  });
  return (
    <group
      ref={group}
      {...(mirror ? {} : interactions('ring', props, gl.domElement))}
    >
      <mesh geometry={road} material={roadMaterial} receiveShadow={!mirror} />
      <mesh geometry={edges} material={copper} />
      {!mirror && (
        <mesh
          ref={ribbon}
          geometry={band}
          position={[0, 0.27, 0]}
          {...interactions('ribbon', props, gl.domElement)}
        >
          <meshBasicMaterial
            vertexColors
            fog={false}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      )}
      {!mirror && <Chevrons />}
    </group>
  );
}
function Chevrons() {
  const ref = useRef<T.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new T.Object3D();
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      d.position.set(...roadPosition((i / 24) * roadLength, 2.32, 0.368));
      d.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        new T.Vector3(Math.cos(angle), 0, -Math.sin(angle)),
      );
      d.scale.setScalar(0.06);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 24]}>
      <coneGeometry args={[1, 1.8, 3]} />
      <meshBasicMaterial color={palette.muted} transparent opacity={0.3} />
    </instancedMesh>
  );
}
function Cars({ props }: { props: Props }) {
  const { state, selected, hovered, reduced, intro } = props,
    { gl } = useThree(),
    body = useRef<T.InstancedMesh>(null),
    glass = useRef<T.InstancedMesh>(null),
    lamps = useRef<T.InstancedMesh>(null),
    brakes = useRef<T.InstancedMesh>(null);
  const carLength =
    (defaultTrafficParams.carLength / roadLength) * Math.PI * 2 * roadRadius;
  const shape = useMemo(
      () => new RoundedBoxGeometry(0.1, 0.065, carLength, 2, 0.027),
      [carLength],
    ),
    canopy = useMemo(
      () => new RoundedBoxGeometry(0.075, 0.035, carLength * 0.48, 2, 0.016),
      [carLength],
    );
  useEffect(
    () => () => {
      shape.dispose();
      canopy.dispose();
    },
    [shape, canopy],
  );
  useLayoutEffect(() => {
    for (const ref of [body, glass, lamps, brakes])
      ref.current?.instanceMatrix.setUsage(T.DynamicDrawUsage);
  }, []);
  const displayed = useRef(new Map<string, number>()),
    lastTime = useRef(state.time),
    previousSpeeds = useRef(new Map<string, number>()),
    braking = useRef(new Map<string, boolean>()),
    scratch = useMemo(() => new T.Object3D(), []),
    color = useMemo(() => new T.Color(), []),
    offset = useMemo(() => new T.Vector3(), []),
    direction = useMemo(() => new T.Vector3(), []);
  useEffect(() => {
    if (
      state.time < lastTime.current ||
      displayed.current.size !== state.count
    ) {
      displayed.current.clear();
      previousSpeeds.current.clear();
    }
    for (const car of state.cars) {
      braking.current.set(
        car.id,
        car.speed < (previousSpeeds.current.get(car.id) ?? car.speed) - 0.02,
      );
      previousSpeeds.current.set(car.id, car.speed);
    }
    lastTime.current = state.time;
  }, [state.cars, state.time, state.count]);
  useFrame((_, dt) => {
    const a = clamp((intro.current - 0.65) / 0.9),
      assemble = 1 - (1 - a) ** 3;
    state.cars.forEach((car, i) => {
      const previous = displayed.current.get(car.id) ?? car.position,
        pos = reduced
          ? car.position
          : wrapRoad(
              previous +
                roadDelta(previous, car.position) * Math.min(1, dt * 12),
            );
      displayed.current.set(car.id, pos);
      const angle = (pos / roadLength) * Math.PI * 2,
        anchor = roadPosition(pos, roadRadius, 0.403 + (1 - assemble) * 0.5),
        dim =
          !selected ||
          [
            'whole',
            'ring',
            'density',
            'jam-front',
            'traces',
            'ribbon',
            'gap',
          ].includes(selected) ||
          selected === car.id ||
          (selected === 'brake' && i === 0)
            ? 1
            : 0.35;
      scratch.position.set(...anchor);
      scratch.rotation.set(0, angle + Math.PI / 2, 0);
      scratch.scale.setScalar(assemble);
      scratch.updateMatrix();
      body.current?.setMatrixAt(i, scratch.matrix);
      color
        .set(i === 0 ? palette.copper : palette.steel)
        .multiplyScalar(dim * (hovered === car.id ? 1.4 : 1));
      body.current?.setColorAt(i, color);
      scratch.position.y += 0.046;
      scratch.updateMatrix();
      glass.current?.setMatrixAt(i, scratch.matrix);
      color.set(i === 0 ? palette.amber : palette.blue).multiplyScalar(dim);
      glass.current?.setColorAt(i, color);
      direction.set(Math.cos(angle), 0, -Math.sin(angle));
      offset.copy(direction).multiplyScalar(carLength * 0.43);
      scratch.position.set(
        anchor[0] + offset.x,
        anchor[1] + 0.025,
        anchor[2] + offset.z,
      );
      scratch.scale.set(0.065 * assemble, 0.018 * assemble, 0.018 * assemble);
      scratch.updateMatrix();
      lamps.current?.setMatrixAt(i, scratch.matrix);
      color
        .copy(
          i === 0
            ? new T.Color(palette.amber)
            : trafficSnapshotColor(car.speed, state),
        )
        .multiplyScalar(2.0 * dim * dim);
      lamps.current?.setColorAt(i, color);
      scratch.position.set(
        anchor[0] - offset.x,
        anchor[1] + 0.025,
        anchor[2] - offset.z,
      );
      scratch.updateMatrix();
      brakes.current?.setMatrixAt(i, scratch.matrix);
      color
        .set(palette.amber)
        .multiplyScalar((braking.current.get(car.id) ? 2.4 : 0.24) * dim * dim);
      brakes.current?.setColorAt(i, color);
    });
    for (const ref of [body, glass, lamps, brakes])
      if (ref.current) {
        ref.current.count = state.count;
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor) {
          ref.current.instanceColor.setUsage(T.DynamicDrawUsage);
          ref.current.instanceColor.needsUpdate = true;
        }
      }
  });
  const hit = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta < 4 && e.instanceId !== undefined)
        props.onPart(state.cars[e.instanceId].id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined)
        props.onHover(state.cars[e.instanceId].id);
      gl.domElement.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      props.onHover(null);
      gl.domElement.style.cursor = 'default';
    },
  };
  return (
    <>
      <instancedMesh
        ref={body}
        args={[shape, undefined, 45]}
        castShadow={props.quality !== 'low'}
        {...hit}
      >
        <meshStandardMaterial metalness={0.8} roughness={0.25} />
      </instancedMesh>
      <instancedMesh ref={glass} args={[canopy, undefined, 45]} {...hit}>
        <meshPhysicalMaterial
          transparent
          opacity={0.58}
          clearcoat={1}
          roughness={0.08}
          metalness={0.2}
        />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, 45]} {...hit}>
        <boxGeometry />
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={brakes} args={[undefined, undefined, 45]} {...hit}>
        <boxGeometry />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  );
}
function SpeedGauge({ props }: { props: Props }) {
  const { state, quality, selected, intro, reduced, hovered } = props,
    { gl, size } = useThree(),
    simple = quality !== 'high' || size.width < 900,
    group = useRef<T.Group>(null),
    core = useRef<T.Mesh>(null),
    target = useRef<T.Mesh>(null),
    max = metricScale(state),
    value = useRef(state.mean),
    focused = !selected || ['whole', 'gauge', 'ring'].includes(selected),
    dim = focused ? 1 : 0.35;
  const axis = useStagePrint(
    Array.from({ length: max / 10 + 1 }, (_, i) => ({
      text: String(i * 10),
      color: i === 0 ? palette.ink : palette.muted,
      size: 42,
      y: 256 - ((0.45 + ((i * 10) / max) * 1.35 - 1.125) / 1.45) * 512,
      mono: true,
    })),
  );
  const label = useStagePrint([
    { text: 'MEAN SPEED', color: palette.muted, size: 38, y: 140 },
    { text: 'm/s', color: palette.ink, size: 76, y: 270, mono: true },
    {
      text: state.front.exists ? 'WAVE MARKED' : 'NO MARKED FRONT',
      color: state.front.exists ? palette.blue : palette.muted,
      size: 29,
      y: 410,
    },
  ]);
  const material = useMemo(
    () =>
      new T.MeshPhysicalMaterial(
        simple
          ? {
              color: '#a5b5ff',
              transparent: true,
              opacity: 0.2,
              clearcoat: 1,
              roughness: 0.07,
              depthWrite: false,
            }
          : {
              color: '#ffffff',
              transmission: 1,
              thickness: 0.18,
              roughness: 0.035,
              ior: 1.45,
              clearcoat: 1,
              attenuationColor: new T.Color('#9db8ff'),
              attenuationDistance: 2.4,
            },
      ),
    [simple],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => {
    value.current +=
      (state.mean - value.current) * (reduced ? 1 : Math.min(1, dt * 8));
    const a = clamp((intro.current - 0.7) / 0.9);
    group.current?.scale.setScalar(0.3 + 0.7 * (1 - (1 - a) ** 3));
    if (core.current) {
      core.current.position.y = 0.45 + (value.current / max) * 1.35;
      (core.current.material as T.MeshBasicMaterial).color
        .copy(trafficColor(state.mean, state.desiredSpeed))
        .multiplyScalar((hovered === 'gauge' ? 2.3 : 1.8) * dim * dim);
    }
    if (target.current)
      target.current.position.y = 0.45 + (state.desiredSpeed / max) * 1.35;
    material.envMapIntensity = dim;
    material.color.set(simple ? '#a5b5ff' : '#ffffff').multiplyScalar(dim);
  });
  return (
    <group ref={group} {...interactions('gauge', props, gl.domElement)}>
      <mesh position={[0, 1.15, 0]} material={material}>
        <cylinderGeometry args={[0.48, 0.48, 1.95, 48]} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.58, 0.62, 0.28, 64]} />
        <meshStandardMaterial
          color={new T.Color(palette.dark).multiplyScalar(dim)}
          metalness={0.9}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 2.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.48, 0.025, 8, 64]} />
        <meshStandardMaterial
          color={new T.Color(palette.copper).multiplyScalar(dim)}
          metalness={1}
          roughness={0.24}
        />
      </mesh>
      <mesh position={[-0.13, 1.1, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.65, 12]} />
        <meshStandardMaterial
          color={new T.Color(palette.copper).multiplyScalar(dim)}
          metalness={1}
          roughness={0.24}
        />
      </mesh>
      <mesh ref={core} position={[-0.13, 0.45 + (state.mean / max) * 1.35, 0]}>
        <sphereGeometry args={[0.18, 28, 20]} />
        <meshBasicMaterial
          color={new T.Color(palette.mint).multiplyScalar(1.8 * dim)}
        />
      </mesh>
      <mesh
        ref={target}
        position={[0, 0.45 + (state.desiredSpeed / max) * 1.35, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.38, 0.008, 6, 48]} />
        <meshBasicMaterial
          color={palette.copper}
          transparent
          opacity={0.45 * dim}
        />
      </mesh>
      <mesh position={[0.31, 1.125, 0.03]}>
        <planeGeometry args={[0.22, 1.45]} />
        <meshBasicMaterial
          map={axis}
          transparent
          fog={false}
          opacity={dim}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.21, 0.59]}>
        <planeGeometry args={[0.6, 0.28]} />
        <meshBasicMaterial
          map={label}
          transparent
          fog={false}
          opacity={dim}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
function HeadwayDial({ props }: { props: Props }) {
  const { state, selected, intro, reduced, onAction, onDial, hovered } = props,
    { gl } = useThree(),
    group = useRef<T.Group>(null),
    pointer = useRef<T.Group>(null),
    value = useRef(state.headway),
    drag = useRef<{ x: number; value: number } | null>(null),
    callbacks = useRef({ onAction, onDial });
  callbacks.current = { onAction, onDial };
  const dim =
      !selected || ['whole', 'headway', 'ring'].includes(selected) ? 1 : 0.35,
    map = useStagePrint([
      { text: 'FOLLOWING', color: palette.muted, size: 32, y: 125 },
      {
        text: state.headway.toFixed(1) + ' s',
        color: palette.ink,
        size: 80,
        y: 280,
        mono: true,
      },
    ]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current)
        void callbacks.current.onAction('sim_set_params', {
          patch: {
            headway:
              Math.round(
                clamp(
                  drag.current.value + (e.clientX - drag.current.x) / 180,
                  0.5,
                  3,
                ) * 10,
              ) / 10,
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
  }, [gl]);
  useFrame((_, dt) => {
    value.current +=
      (state.headway - value.current) * (reduced ? 1 : Math.min(1, dt * 7));
    if (pointer.current)
      pointer.current.rotation.y =
        ((((value.current - 0.5) / 2.5) * 270 - 135) / 180) * Math.PI;
    const a = clamp((intro.current - 0.5) / 0.9);
    group.current?.scale.setScalar(0.3 + 0.7 * (1 - (1 - a) ** 3));
  });
  return (
    <group
      ref={group}
      position={[-1.25, 0.18, 0.65]}
      {...interactions('headway', props, gl.domElement)}
      onPointerDown={(e) => {
        e.stopPropagation();
        drag.current = { x: e.clientX, value: state.headway };
        onDial(true);
        gl.domElement.setPointerCapture(e.pointerId);
        gl.domElement.style.cursor = 'grabbing';
      }}
    >
      <mesh>
        <cylinderGeometry args={[0.41, 0.45, 0.22, 64]} />
        <meshStandardMaterial
          color={new T.Color(palette.steel).multiplyScalar(dim)}
          metalness={1}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.39, 0.022, 8, 64]} />
        <meshStandardMaterial
          color={new T.Color(palette.copper).multiplyScalar(dim)}
          metalness={1}
          roughness={0.24}
        />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.53, 0.53]} />
        <meshBasicMaterial
          map={map}
          transparent
          fog={false}
          opacity={dim}
          depthWrite={false}
        />
      </mesh>
      <group ref={pointer}>
        <mesh position={[0, 0.14, -0.34]}>
          <boxGeometry args={[0.04, 0.018, 0.12]} />
          <meshBasicMaterial
            color={new T.Color(palette.amber).multiplyScalar(
              (hovered === 'headway' ? 2.2 : 1.6) * dim * dim,
            )}
          />
        </mesh>
      </group>
    </group>
  );
}
function Gap({ props }: { props: Props }) {
  const { state, selected, hovered } = props,
    { gl } = useThree(),
    points = useMemo(() => {
      return trafficGapPoints(state).map((p) => new T.Vector3(...p));
    }, [state.hero.position, state.gap]);
  const geometry = useMemo(
    () => new T.BufferGeometry().setFromPoints(points),
    [points],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const visible =
      !selected || ['whole', 'gap', 'headway', 'car_0'].includes(selected),
    bright = selected === 'gap' || hovered === 'gap';
  return (
    <group
      {...(selected === 'gap' ? interactions('gap', props, gl.domElement) : {})}
    >
      <line>
        <primitive attach="geometry" object={geometry} />
        <lineBasicMaterial
          color={palette.copper}
          transparent
          opacity={visible ? (bright ? 1 : 0.4) : 0.12}
        />
      </line>
      {[points[0], points.at(-1)!].map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.03, 0.14, 0.03]} />
          <meshBasicMaterial
            color={palette.copper}
            transparent
            opacity={visible ? 0.7 : 0.2}
          />
        </mesh>
      ))}
    </group>
  );
}
function WaveMarker({ props }: { props: Props }) {
  const { state, selected, intro, reduced, hovered } = props,
    { gl } = useThree(),
    ref = useRef<T.Group>(null),
    pos = useRef(state.front.car.position),
    dim =
      !selected || ['whole', 'jam-front', 'ribbon', 'traces'].includes(selected)
        ? 1
        : 0.35;
  useFrame((_, dt) => {
    pos.current = reduced
      ? state.front.car.position
      : wrapRoad(
          pos.current +
            roadDelta(pos.current, state.front.car.position) *
              Math.min(1, dt * 10),
        );
    if (ref.current) {
      ref.current.position.set(...roadPosition(pos.current, 2.98, 0.65));
      ref.current.visible = state.front.exists && intro.current > 1.4;
    }
  });
  return (
    <group ref={ref} {...interactions('jam-front', props, gl.domElement)}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.12, 0.22, 4]} />
        <meshBasicMaterial
          color={new T.Color(palette.blue).multiplyScalar(
            (hovered === 'jam-front' ? 2.3 : 1.8) * dim * dim,
          )}
        />
      </mesh>
      <mesh position={[0, -0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.012, 6, 40]} />
        <meshBasicMaterial
          color={palette.blue}
          transparent
          opacity={0.75 * dim}
        />
      </mesh>
    </group>
  );
}
function Trails({ props }: { props: Props }) {
  const history = useRef<{ time: number; car: number; front: number | null }[]>(
      [],
    ),
    lastTime = useRef(-1),
    lastCount = useRef(props.state.count),
    last = useRef({
      hero: props.state.hero.position,
      front: props.state.front.car.position,
    });
  const geometry = useMemo(() => {
    const g = new T.BufferGeometry();
    g.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(240 * 3), 3),
    );
    g.setAttribute(
      'color',
      new T.BufferAttribute(new Float32Array(240 * 3), 3),
    );
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const s = props.state;
    if (
      s.time < lastTime.current ||
      s.count !== lastCount.current ||
      (s.time === lastTime.current && s.hero.position !== last.current.hero)
    ) {
      history.current = [];
      lastTime.current = -1;
    }
    if (s.time !== lastTime.current) {
      history.current.push({
        time: s.time,
        car: s.hero.position,
        front: s.front.exists ? s.front.car.position : null,
      });
      history.current = history.current
        .filter((h) => s.time - h.time <= 10)
        .slice(-120);
      lastTime.current = s.time;
      lastCount.current = s.count;
      last.current = { hero: s.hero.position, front: s.front.car.position };
    }
    const p = geometry.getAttribute('position'),
      colors = geometry.getAttribute('color');
    let k = 0;
    const dim =
      !props.selected ||
      ['whole', 'traces', 'jam-front', 'car_0'].includes(props.selected)
        ? 1
        : 0.3;
    for (const h of history.current) {
      const age = clamp(1 - (s.time - h.time) / 10);
      for (const kind of ['car', 'front'] as const) {
        const v = h[kind];
        if (v === null) continue;
        const a = roadPosition(
            v,
            kind === 'car' ? 2.48 : 3.01,
            kind === 'car' ? 0.39 : 0.29,
          ),
          c = new T.Color(
            kind === 'car' ? palette.amber : palette.blue,
          ).multiplyScalar(age * 0.7 * dim);
        p.setXYZ(k, ...a);
        colors.setXYZ(k, c.r, c.g, c.b);
        k++;
      }
    }
    geometry.setDrawRange(0, props.intro.current > 1.5 ? k : 0);
    p.needsUpdate = true;
    colors.needsUpdate = true;
  });
  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.65}
        depthWrite={false}
      />
    </points>
  );
}
function Witness({ props }: { props: Props }) {
  const { gl } = useThree(),
    ref = useRef<T.Mesh>(null),
    position = useRef(props.state.hero.position),
    last = useRef(props.state.time);
  useFrame((_, dt) => {
    if (props.state.time < last.current)
      position.current = props.state.hero.position;
    last.current = props.state.time;
    position.current = props.reduced
      ? props.state.hero.position
      : wrapRoad(
          position.current +
            roadDelta(position.current, props.state.hero.position) *
              Math.min(1, dt * 12),
        );
    if (ref.current) {
      ref.current.position.set(
        ...roadPosition(position.current, roadRadius, 0.385),
      );
      ref.current.visible = props.intro.current > 1;
    }
  });
  const dim =
    !props.selected ||
    ['whole', 'ring', 'car_0', 'brake', 'jam-front', 'traces'].includes(
      props.selected,
    )
      ? 1
      : 0.35;
  return (
    <mesh
      ref={ref}
      rotation={[Math.PI / 2, 0, 0]}
      {...interactions('car_0', props, gl.domElement)}
    >
      <torusGeometry args={[0.15, 0.012, 6, 40]} />
      <meshBasicMaterial
        color={new T.Color(palette.amber).multiplyScalar(1.4 * dim * dim)}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}
export function TrafficSpecimen(props: Props) {
  const dim = !props.selected || props.selected === 'whole' ? 1 : 0.35;
  return (
    <>
      <StagePlinth intro={props.intro} receiveShadow={false} dim={dim} />
      <Road props={props} />
      <Cars props={props} />
      <Witness props={props} />
      <SpeedGauge props={props} />
      <HeadwayDial props={props} />
      <Gap props={props} />
      <WaveMarker props={props} />
      <Trails props={props} />
      {props.quality !== 'low' && (
        <group scale={[1, -1, 1]} position={[0, -0.7, 0]}>
          <StagePlinth
            intro={props.intro}
            mirror
            receiveShadow={false}
            dim={dim}
          />
          <Road props={props} mirror />
        </group>
      )}
    </>
  );
}
