'use client';
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Asset, WorldText, firstGeometry } from './assets';
import { Anchor, worldBounds } from './anchors';
import { Plume } from './Particles';
import {
  attentionOf,
  observe,
  trafficFront,
  type Simulation,
} from '../simulations/runtime';
import { neuralForward } from '../simulations/foundations/neural';
import { useWorld } from './store';
type V3 = [number, number, number];
type Props = {
  sim: Simulation;
  onTarget: (id: string) => void;
  onAction: (tool: any, args?: any) => void;
};
function Label({
  position,
  children,
  size = 0.25,
  color = '#294b3e',
  display = false,
}: {
  position: V3;
  children: React.ReactNode;
  size?: number;
  color?: string;
  display?: boolean;
}) {
  return (
    <Billboard position={position}>
      <WorldText
        fontSize={size}
        color={color}
        maxWidth={4.8}
        textAlign="center"
        display={display}
      >
        {children}
      </WorldText>
    </Billboard>
  );
}
function Energy({
  a,
  b,
  weight = 1,
  color = '#8bd8c5',
}: {
  a: V3;
  b: V3;
  weight?: number;
  color?: string;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(...a),
        new THREE.Vector3(...a)
          .lerp(new THREE.Vector3(...b), 0.5)
          .add(new THREE.Vector3(0, 0.23, 0)),
        new THREE.Vector3(...b),
      ]),
    [a.join(), b.join()],
  );
  const geo = useMemo(
    () =>
      new THREE.TubeGeometry(
        curve,
        24,
        0.012 + Math.min(2, Math.abs(weight)) * 0.038,
        6,
        false,
      ),
    [curve, weight],
  );
  const bead = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (bead.current)
      bead.current.position.copy(
        curve.getPointAt(
          ((useWorld.getState().reducedMotion ? 0 : clock.elapsedTime) * 0.35) %
            1,
        ),
      );
  });
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7 + Math.min(1, Math.abs(weight)) * 0.5}
          roughness={0.35}
        />
      </mesh>
      <mesh ref={bead}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </>
  );
}
export function NeuralHero({ sim, onTarget }: Props) {
  const o = observe(sim),
    linear = sim.params.model === 'linear',
    { geometry, material } = firstGeometry('node'),
    f = neuralForward(sim.data.neural!);
  const nodes: { id: string; p: V3; v: number; label: string }[] = linear
    ? [
        { id: 'input-0', p: [-2.1, 2.7, 0], v: +sim.params.x1, label: 'input' },
        {
          id: 'weight',
          p: [0, 2.7, 0],
          v: +sim.params.weight,
          label: 'weight',
        },
        {
          id: 'prediction',
          p: [2.1, 2.7, 0],
          v: +o.prediction,
          label: 'prediction',
        },
      ]
    : [
        { id: 'input-0', p: [-2.3, 2.3, 0], v: +sim.params.x1, label: 'x₁' },
        { id: 'input-1', p: [-2.3, 3.6, 0], v: +sim.params.x2, label: 'x₂' },
        ...f.hidden.map((v, i) => ({
          id: `hidden-${i}`,
          p: [0, 1.9 + i * 0.95, 0] as V3,
          v,
          label: `h${i + 1}`,
        })),
        {
          id: 'prediction',
          p: [2.3, 2.8, 0],
          v: +o.prediction,
          label: 'prediction',
        },
      ];
  const bright = 0.35 + 1 / (1 + Number(o.loss));
  return (
    <>
      {nodes.map((n) => (
        <Anchor key={n.id} id={n.id} onTarget={onTarget}>
          <group position={n.p}>
            <mesh
              geometry={geometry}
              material={material}
              scale={1.1}
              castShadow
            />
            <mesh scale={1.06}>
              <sphereGeometry args={[0.37, 24, 16]} />
              <meshStandardMaterial
                color={n.id === 'weight' ? '#cbb078' : '#7fbdac'}
                emissive={n.id === 'weight' ? '#a78b4b' : '#77d1ba'}
                emissiveIntensity={bright}
                transparent
                opacity={0.7}
                roughness={0.3}
              />
            </mesh>
            <Label position={[0, 0.65, 0.1]} size={0.36}>
              {n.v.toFixed(2)}
            </Label>
            <Label position={[0, -0.66, 0.1]} size={0.22}>
              {n.label}
            </Label>
          </group>
        </Anchor>
      ))}
      {linear ? (
        <>
          <Energy a={nodes[0].p} b={nodes[1].p} weight={+sim.params.weight} />
          <Energy a={nodes[1].p} b={nodes[2].p} weight={+sim.params.weight} />
        </>
      ) : (
        <>
          {nodes
            .filter((n) => n.id.startsWith('input'))
            .flatMap((a, j) =>
              nodes
                .filter((n) => n.id.startsWith('hidden'))
                .map((b, i) => (
                  <Energy
                    key={a.id + b.id}
                    a={a.p}
                    b={b.p}
                    weight={sim.data.neural!.w1[i][j]}
                    color={
                      sim.data.neural!.w1[i][j] < 0 ? '#dea181' : '#8bd8c5'
                    }
                  />
                )),
            )}
          {nodes
            .filter((n) => n.id.startsWith('hidden'))
            .map((a, i) => (
              <Energy
                key={a.id}
                a={a.p}
                b={nodes.at(-1)!.p}
                weight={sim.data.neural!.w2[i]}
              />
            ))}
        </>
      )}
      <Anchor id="loss" onTarget={onTarget}>
        <RoundedBox
          args={[3, 0.13, 0.28]}
          radius={0.06}
          position={[0, 1.31, 0.35]}
        >
          <meshStandardMaterial color="#496c5b" roughness={0.8} />
        </RoundedBox>
        <RoundedBox
          args={[
            Math.max(0.05, (2.8 * Number(o.loss)) / (1 + Number(o.loss))),
            0.08,
            0.3,
          ]}
          radius={0.035}
          position={[
            -1.4 + (1.4 * Number(o.loss)) / (1 + Number(o.loss)),
            1.4,
            0.35,
          ]}
        >
          <meshStandardMaterial color="#c5af72" roughness={0.7} />
        </RoundedBox>
        <Label
          position={[0, 1.65, 1.2]}
          size={0.28}
        >{`Loss  ${Number(o.loss).toFixed(3)}`}</Label>
      </Anchor>
      <Anchor id="target" onTarget={onTarget}>
        <Label
          position={[0, 4.5, 0]}
          size={0.27}
        >{`Learning toward ${Number(sim.params.target).toFixed(1)}`}</Label>
      </Anchor>
    </>
  );
}
export function RocketHero({ sim, onTarget }: Props) {
  const q = useWorld((s) => s.quality),
    r = sim.data.rocket!,
    rocket = useRef<THREE.Group>(null),
    height = 0.74 + (3 * r.altitude) / (r.altitude + 90),
    o = observe(sim),
    gravity = (+sim.params.dryMass + r.fuelMass) * +sim.params.gravity,
    thrust = Number(o.thrust),
    forceScale = 2 / 24000;
  useFrame((_, dt) => {
    if (rocket.current)
      rocket.current.position.y = THREE.MathUtils.damp(
        rocket.current.position.y,
        height,
        10,
        dt,
      );
  });
  return (
    <>
      <Anchor id="rocket" onTarget={onTarget}>
        <group ref={rocket} position={[0, height, 0]}>
          <Asset name={q === 'low' ? 'rocket-low' : 'rocket'} />
          <group position={[0, 0, 0]}>
            <Plume
              throttle={+sim.params.throttle}
              enabled={
                r.fuelMass > 0 &&
                r.status === 'flying' &&
                +sim.params.throttle > 0
              }
            />
          </group>
          <group position={[0, 1.7, 0]}>
            <Line
              points={[
                [-1.1, 0, 0],
                [-1.1, thrust * forceScale, 0],
              ]}
              lineWidth={4}
              color="#edb46c"
            />
            <mesh position={[-1.1, thrust * forceScale, 0]}>
              <coneGeometry args={[0.12, 0.3, 12]} />
              <meshStandardMaterial color="#e4a660" roughness={0.7} />
            </mesh>
            <Label
              position={[-2.0, 0.5, 0]}
              size={0.16}
            >{`Thrust ${thrust.toFixed(0)} N`}</Label>
            <Line
              points={[
                [1.1, 0, 0],
                [1.1, -gravity * forceScale, 0],
              ]}
              lineWidth={4}
              color="#c77761"
            />
            <mesh
              position={[1.1, -gravity * forceScale, 0]}
              rotation={[0, 0, Math.PI]}
            >
              <coneGeometry args={[0.12, 0.3, 12]} />
              <meshStandardMaterial color="#c77761" roughness={0.7} />
            </mesh>
            <Label
              position={[2.1, -0.5, 0]}
              size={0.16}
            >{`Gravity ${gravity.toFixed(0)} N`}</Label>
          </group>
        </group>
      </Anchor>
      <Anchor id="ground" onTarget={onTarget}>
        <Label position={[0, 0.9, 2.2]} size={0.3}>
          {r.status === 'landed'
            ? 'A gentle touchdown'
            : r.status === 'crashed'
              ? 'Try a different burn'
              : 'The landing target'}
        </Label>
      </Anchor>
      <Anchor id="altitude" onTarget={onTarget}>
        <Label
          position={[-2.25, 4.3, 0]}
          size={0.38}
        >{`${r.altitude.toFixed(1)} m`}</Label>
        <Label position={[-2.25, 3.85, 0]} size={0.18}>
          ALTITUDE
        </Label>
      </Anchor>
      <Anchor id="velocity" onTarget={onTarget}>
        <Label
          position={[2.35, 4.3, 0]}
          size={0.38}
        >{`${r.velocity.toFixed(1)} m/s`}</Label>
        <Label position={[2.35, 3.85, 0]} size={0.18}>
          VELOCITY
        </Label>
      </Anchor>
      <Anchor id="fuel" onTarget={onTarget}>
        <Label
          position={[-2.25, 5.1, 0]}
          size={0.2}
        >{`${r.fuelMass.toFixed(0)} kg fuel remaining`}</Label>
      </Anchor>
    </>
  );
}
export function AttentionHero({ sim, onTarget, onAction }: Props) {
  const a = attentionOf(sim),
    q = +sim.params.query,
    n = a.tokens.length;
  const pos = (i: number): V3 => {
    if (i === q) return [0, 4.3, 0];
    const slot = i < q ? i : i - 1,
      cols = Math.min(4, n - 1),
      x = ((slot % cols) - (cols - 1) / 2) * 2.15;
    return [x * 0.85, 2.65 - Math.floor(slot / cols) * 1.1, -x * 0.53 + 0.5];
  };
  return (
    <>
      {a.tokens.map((token, i) => {
        const p = pos(i),
          w = a.weights[q][i];
        return (
          <group key={i}>
            <Anchor
              id={`token-${i}`}
              onTarget={(id) => {
                onTarget(id);
                onAction('sim_set_params', { patch: { query: i } });
              }}
            >
              <group position={p}>
                <Billboard>
                  <Asset
                    name="word"
                    scale={i === q ? 1.12 : 0.88}
                    tint={i === q ? '#e8cc87' : '#d8c3e6'}
                  />
                  <WorldText
                    position={[0, 0, 0.145]}
                    fontSize={0.28}
                    color={i === q ? '#6b477b' : '#38574b'}
                    maxWidth={1.5}
                  >
                    {token}
                  </WorldText>
                  <WorldText
                    position={[0, -0.55, 0.14]}
                    fontSize={0.15}
                    color="#79638a"
                  >
                    {w === 0 ? 'masked' : `${(w * 100).toFixed(1)}%`}
                  </WorldText>
                </Billboard>
              </group>
            </Anchor>
            {i !== q && w > 0 && (
              <Energy a={pos(q)} b={p} weight={w * 3} color="#c3a2e0" />
            )}
          </group>
        );
      })}
      <Anchor id="context" onTarget={onTarget}>
        <Label
          position={[0, 5.3, 0]}
          size={0.21}
        >{`A context for “${a.tokens[q]}”`}</Label>
      </Anchor>
      <Label position={[0, 1.3, 2]} size={0.17}>
        Toy Q = K = V · computed shares, not hidden LLM internals
      </Label>
    </>
  );
}
export function TrafficHero({ sim, onTarget }: Props) {
  const quality = useWorld((s) => s.quality),
    car = firstGeometry(quality === 'low' ? 'car-low' : 'car'),
    ref = useRef<THREE.InstancedMesh>(null),
    heat = useRef<THREE.InstancedMesh>(null),
    dummy = useMemo(() => new THREE.Object3D(), []),
    color = useMemo(() => new THREE.Color(), []),
    box = useMemo(() => new THREE.Box3(), []);
  const cars = sim.data.traffic!.cars;
  const heatGeo = useMemo(
      () =>
        new THREE.RingGeometry(
          3.28,
          3.49,
          4,
          1,
          0,
          ((Math.PI * 2) / 72) * 0.94,
        ),
      [],
    ),
    front = trafficFront(sim);
  const heatMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ead4a0',
        emissive: '#dba24e',
        emissiveIntensity: 0.2,
        roughness: 0.6,
      }),
    [],
  );
  const carMat = useMemo(
    () => (car.material as THREE.MeshStandardMaterial).clone(),
    [car.material],
  );
  useEffect(() => {
    car.geometry.computeBoundingBox();
    return () => {
      for (const c of cars) worldBounds.delete(c.id);
      worldBounds.delete('ring');
      worldBounds.delete('jam-front');
    };
  }, [car.geometry, cars.length]);
  useFrame((state) => {
    if (!ref.current || !heat.current) return;
    const group = ref.current.parent!;
    group.updateWorldMatrix(true, false);
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i],
        a = (c.position / 350) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 3.05, 1.055, Math.sin(a) * 3.05);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.setScalar(Math.min(0.62, 15 / cars.length));
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      color.set(
        c.id === 'car_0' ? '#e9c256' : c.speed < 6 ? '#d27b59' : '#c9d9b9',
      );
      ref.current.setColorAt(i, color);
      box
        .copy(car.geometry.boundingBox!)
        .applyMatrix4(dummy.matrix)
        .applyMatrix4(group.matrixWorld);
      worldBounds.set(c.id, box.clone());
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2,
        pos = (i / 72) * 350;
      const nearest = cars.reduce(
        (best, c) => {
          const d = Math.abs(((c.position - pos + 525) % 350) - 175);
          return d < best.d ? { d, c } : best;
        },
        { d: Infinity, c: cars[0] },
      ).c;
      dummy.position.set(0, 0.99, 0);
      dummy.rotation.set(-Math.PI / 2, 0, a);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      heat.current.setMatrixAt(i, dummy.matrix);
      color
        .set('#d57a54')
        .lerp(
          new THREE.Color('#b7c992'),
          Math.min(1, nearest.speed / +sim.params.desiredSpeed),
        );
      heat.current.setColorAt(i, color);
    }
    heat.current.instanceMatrix.needsUpdate = true;
    if (heat.current.instanceColor)
      heat.current.instanceColor.needsUpdate = true;
    const b = new THREE.Box3(
      new THREE.Vector3(-3.6, 0.9, -3.6),
      new THREE.Vector3(3.6, 1.08, 3.6),
    );
    b.applyMatrix4(group.matrixWorld);
    worldBounds.set('ring', b);
    const a = (front.car.position / 350) * Math.PI * 2;
    const bb = new THREE.Box3()
      .setFromCenterAndSize(
        new THREE.Vector3(Math.cos(a) * 3.05, 1.1, Math.sin(a) * 3.05),
        new THREE.Vector3(0.6, 0.25, 0.6),
      )
      .applyMatrix4(group.matrixWorld);
    worldBounds.set('jam-front', bb);
  });
  useEffect(
    () => () => {
      heatGeo.dispose();
      heatMat.dispose();
      carMat.dispose();
    },
    [heatGeo, heatMat, carMat],
  );
  return (
    <>
      <instancedMesh
        ref={ref}
        args={[car.geometry, carMat, cars.length]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onTarget(cars[e.instanceId].id);
        }}
      />
      <instancedMesh ref={heat} args={[heatGeo, heatMat, 72]} />
      <Label
        position={[0, 3.8, 0]}
        size={0.38}
      >{`${Number(observe(sim).meanSpeed).toFixed(1)} m/s`}</Label>
      <Label position={[0, 3.3, 0]} size={0.17}>
        CLEAR ROAD. ONE SMALL BRAKE.
      </Label>
      <Label position={[0, 0.7, 4.35]} size={0.16}>
        Gold car · amber/red speed ribbon · 350 m one-lane model
      </Label>
    </>
  );
}
export function RelativityHero({ sim, onTarget }: Props) {
  const quality = useWorld((s) => s.quality),
    o = observe(sim),
    visual = useRef(sim.time),
    earth = useRef<THREE.Mesh>(null),
    ship = useRef<THREE.Mesh>(null),
    photonGeometry = useMemo(() => new THREE.SphereGeometry(0.075, 16, 12), []);
  const gamma = +o.gamma,
    dx = Math.min(2.3, 1.64 * Number(sim.params.beta) * gamma);
  useFrame((_, dt) => {
    visual.current = THREE.MathUtils.damp(visual.current, sim.time, 5, dt);
    const phase = (v: number) => 1 - Math.abs((v % 2) - 1);
    if (earth.current)
      earth.current.position.y = 1.25 + phase(visual.current) * 1.64;
    if (ship.current) {
      ship.current.position.y = 1.25 + phase(visual.current / gamma) * 1.64;
      ship.current.position.x =
        2.1 + (phase(visual.current / gamma) - 0.5) * dx;
    }
  });
  const sceneTime = sim.time;
  return (
    <>
      <group position={[-2, 1.6, -0.25]}>
        <Asset name="planet" scale={0.8} />
      </group>
      <Asset
        name={quality === 'low' ? 'ship-low' : 'ship'}
        position={[
          2.1 + Math.min(1, sim.time / +sim.params.duration) * 0.65,
          1.8,
          -0.2,
        ]}
        scale={0.85}
      />
      <Anchor id="earth-clock" onTarget={onTarget}>
        <group position={[-2.1, 1.05, 1.1]}>
          <Asset name="light-clock" scale={0.8} />
          <Label
            position={[0, 2.5, 0]}
            size={0.33}
          >{`${sceneTime.toFixed(2)} s`}</Label>
          <Label position={[0, 2.95, 0]} size={0.18}>
            EARTH
          </Label>
        </group>
      </Anchor>
      <Anchor id="ship-clock" onTarget={onTarget}>
        <group position={[2.1, 1.05, 1.1]}>
          <Asset name="light-clock" scale={0.8} />
          <Label
            position={[0, 2.5, 0]}
            size={0.33}
          >{`${(sceneTime / gamma).toFixed(2)} s`}</Label>
          <Label position={[0, 2.95, 0]} size={0.18}>
            SHIP PROPER TIME
          </Label>
        </group>
      </Anchor>
      <mesh ref={earth} position={[-2.1, 1.25, 1.12]} geometry={photonGeometry}>
        <meshBasicMaterial color="#b7f3ed" toneMapped={false} />
      </mesh>
      <mesh ref={ship} position={[2.1, 1.25, 1.12]} geometry={photonGeometry}>
        <meshBasicMaterial color="#a3dcec" toneMapped={false} />
      </mesh>
      <Anchor id="light-cone" onTarget={onTarget}>
        <Line
          points={[
            [-2.1, 1.25, 1.12],
            [-2.1, 2.89, 1.12],
            [-2.1, 1.25, 1.12],
          ]}
          color="#9ed9d1"
          lineWidth={2}
        />
      </Anchor>
      <Anchor id="worldline" onTarget={onTarget}>
        <Line
          points={[
            [2.1 - dx / 2, 1.25, 1.12],
            [2.1 + dx / 2, 2.89, 1.12],
            [2.1 - dx / 2, 1.25, 1.12],
          ]}
          color="#9ccbe2"
          lineWidth={2.5}
        />
      </Anchor>
      <Anchor id="gamma" onTarget={onTarget}>
        <Label
          position={[0, 5.1, 0]}
          size={0.3}
        >{`gamma ${gamma.toFixed(4)}  ·  ${Number(sim.params.beta).toFixed(3)}c`}</Label>
      </Anchor>
      <Label position={[0, 0.65, 4]} size={0.16}>
        Earth frame · constant velocity · spatial distances compressed
      </Label>
    </>
  );
}
