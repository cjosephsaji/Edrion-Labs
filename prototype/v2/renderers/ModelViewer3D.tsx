'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { neuralForward } from '../simulations/foundations/neural';
import {
  attentionOf,
  trafficFront,
  type Simulation,
} from '../simulations/runtime';
type Props = { sim: Simulation; onTarget: (id: string) => void };
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="status">
        3D is unavailable here. The measured 2D view below remains interactive.
      </p>
    ) : (
      this.props.children
    );
  }
}
function Projected({
  id,
  position,
  children,
  root,
  onTarget,
}: {
  id: string;
  position: [number, number, number];
  children: ReactNode;
  root: React.RefObject<HTMLDivElement | null>;
  onTarget: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null),
    box = useRef(new THREE.Box3()),
    v = useRef(new THREE.Vector3());
  useFrame(({ camera, size }) => {
    if (!ref.current || !root.current) return;
    box.current.setFromObject(ref.current);
    if (box.current.isEmpty()) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const x of [box.current.min.x, box.current.max.x])
      for (const y of [box.current.min.y, box.current.max.y])
        for (const z of [box.current.min.z, box.current.max.z]) {
          v.current.set(x, y, z).project(camera);
          const px = ((v.current.x + 1) * size.width) / 2,
            py = ((1 - v.current.y) * size.height) / 2;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
    let el = root.current.querySelector<HTMLElement>(
      `[data-world-anchor="${id}"]`,
    );
    if (!el) {
      el = document.createElement('span');
      el.dataset.worldAnchor = id;
      el.dataset.petrosId = id;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      root.current.appendChild(el);
    }
    Object.assign(el.style, {
      left: `${minX}px`,
      top: `${minY}px`,
      width: `${maxX - minX}px`,
      height: `${maxY - minY}px`,
    });
  });
  useEffect(
    () => () =>
      root.current?.querySelector(`[data-world-anchor="${id}"]`)?.remove(),
    [id, root],
  );
  return (
    <group
      ref={ref}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onTarget(id);
      }}
    >
      {children}
    </group>
  );
}
function Camera({ sim }: { sim: Simulation }) {
  const { camera } = useThree();
  useFrame(() => {
    const y = sim.id === 'rocket' ? sim.data.rocket!.altitude / 30 : 0;
    camera.position.lerp(
      new THREE.Vector3(
        sim.id === 'rocket' ? 4 : 7,
        (sim.id === 'rocket' ? 2.8 : 4) + y,
        sim.id === 'rocket' ? 7 : 10,
      ),
      0.09,
    );
    camera.lookAt(0, y, 0);
  });
  return null;
}
const material = (
  <meshStandardMaterial color="#ebede0" roughness={0.35} metalness={0.2} />
);
function Models({
  sim,
  root,
  onTarget,
}: Props & { root: React.RefObject<HTMLDivElement | null> }) {
  const p = (
    id: string,
    position: [number, number, number],
    children: ReactNode,
  ) => (
    <Projected
      key={id}
      id={id}
      position={position}
      root={root}
      onTarget={onTarget}
    >
      {children}
    </Projected>
  );
  if (sim.id === 'rocket') {
    const r = sim.data.rocket!;
    return (
      <>
        {p(
          'rocket',
          [0, r.altitude / 30 + 0.9, 0],
          <>
            <mesh castShadow>
              <cylinderGeometry args={[0.28, 0.28, 1.45, 32]} />
              {material}
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
              <coneGeometry args={[0.28, 0.5, 32]} />
              <meshStandardMaterial color="#51725a" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.2, 0.265]}>
              <sphereGeometry args={[0.13, 20, 20]} />
              <meshStandardMaterial
                color="#9bc9ce"
                metalness={0.4}
                roughness={0.15}
              />
            </mesh>
            {[0, 1, 2, 3].map((i) => (
              <mesh
                key={i}
                position={[
                  Math.cos((i * Math.PI) / 2) * 0.3,
                  -0.6,
                  Math.sin((i * Math.PI) / 2) * 0.3,
                ]}
                rotation={[0, (-i * Math.PI) / 2, 0]}
                castShadow
              >
                <boxGeometry args={[0.5, 0.4, 0.07]} />
                <meshStandardMaterial color="#45634e" />
              </mesh>
            ))}
            {r.fuelMass > 0 &&
              r.status === 'flying' &&
              +sim.params.throttle > 0 && (
                <mesh position={[0, -1, 0]} rotation={[Math.PI, 0, 0]}>
                  <coneGeometry
                    args={[0.18, +sim.params.throttle * 0.85, 20]}
                  />
                  <meshBasicMaterial color="#e9b251" />
                </mesh>
              )}
          </>,
        )}
        {p(
          'ground',
          [0, -0.25, 0],
          <mesh receiveShadow>
            <cylinderGeometry args={[3.7, 3.9, 0.3, 64]} />
            <meshStandardMaterial color="#b6bda0" roughness={1} />
          </mesh>,
        )}
      </>
    );
  }
  if (sim.id === 'traffic') {
    const cars = sim.data.traffic!.cars,
      slow = trafficFront(sim).car;
    return (
      <>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[2.7, 3.45, 80]} />
          <meshStandardMaterial color="#bac0ac" side={THREE.DoubleSide} />
        </mesh>
        {cars.map((c) => {
          const a = (c.position / 350) * 2 * Math.PI;
          return p(
            c.id,
            [3.05 * Math.cos(a), 0.18, 3.05 * Math.sin(a)],
            <group rotation={[0, -a, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.21, 0.23, 0.43]} />
                <meshStandardMaterial
                  color={
                    c.speed < 6
                      ? '#c38e68'
                      : c.id === 'car_0'
                        ? '#cfb05e'
                        : '#507b5c'
                  }
                />
              </mesh>
              <mesh position={[0, 0.13, 0]}>
                <boxGeometry args={[0.17, 0.05, 0.2]} />
                <meshStandardMaterial color="#dce8e3" />
              </mesh>
            </group>,
          );
        })}
        {p(
          'jam-front',
          [
            3.05 * Math.cos((slow.position / 350) * 2 * Math.PI),
            0.03,
            3.05 * Math.sin((slow.position / 350) * 2 * Math.PI),
          ],
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.26, 0.3, 32]} />
            <meshBasicMaterial color="#c38e68" side={THREE.DoubleSide} />
          </mesh>,
        )}
      </>
    );
  }
  if (sim.id === 'neural') {
    const f = neuralForward(sim.data.neural!),
      nodes = [
        ...sim.data.neural!.input.map((v, i) => ({
          id: `input-${i}`,
          v,
          pos: [-3, (i - 0.5) * 2.5, 0] as [number, number, number],
        })),
        ...f.hidden.map((v, i) => ({
          id: `hidden-${i}`,
          v,
          pos: [0, (i - 1) * 2, 0] as [number, number, number],
        })),
        {
          id: 'prediction',
          v: f.prediction,
          pos: [3, 0, 0] as [number, number, number],
        },
      ];
    return (
      <>
        {nodes.map((n) =>
          p(
            n.id,
            n.pos,
            <mesh castShadow>
              <sphereGeometry
                args={[0.35 + Math.min(0.25, Math.abs(n.v) * 0.1), 32, 32]}
              />
              <meshStandardMaterial
                color={n.v < 0 ? '#c69979' : '#729a70'}
                roughness={0.3}
                metalness={0.15}
              />
            </mesh>,
          ),
        )}
        {nodes
          .filter((n) => n.id.startsWith('input'))
          .flatMap((a) =>
            nodes
              .filter((n) => n.id.startsWith('hidden'))
              .map((b) => <Connection key={a.id + b.id} a={a.pos} b={b.pos} />),
          )}
        {nodes
          .filter((n) => n.id.startsWith('hidden'))
          .map((a) => (
            <Connection key={a.id} a={a.pos} b={[3, 0, 0]} />
          ))}
      </>
    );
  }
  if (sim.id === 'attention') {
    const a = attentionOf(sim);
    return (
      <>
        {a.tokens.map((_, i) =>
          p(
            `token-${i}`,
            [(i - (a.tokens.length - 1) / 2) * 0.9, 0, 0],
            <mesh castShadow>
              <boxGeometry args={[0.64, 0.64, 0.64]} />
              <meshStandardMaterial
                color={i === +sim.params.query ? '#ccad59' : '#739673'}
                roughness={0.4}
              />
            </mesh>,
          ),
        )}
      </>
    );
  }
  return (
    <>
      {['earth-clock', 'ship-clock'].map((id, i) =>
        p(
          id,
          [i ? 2 : -2, 0, 0],
          <group>
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[1, 1, 0.18, 64]} />
              <meshStandardMaterial
                color={i ? '#ccb271' : '#739673'}
                roughness={0.4}
              />
            </mesh>
            <ClockHand
              time={
                sim.params.frame === 'ship'
                  ? i
                    ? sim.time
                    : sim.time * Math.sqrt(1 - (+sim.params.beta) ** 2)
                  : i
                    ? sim.time * Math.sqrt(1 - (+sim.params.beta) ** 2)
                    : sim.time
              }
            />
          </group>,
        ),
      )}
    </>
  );
}
function ClockHand({ time }: { time: number }) {
  return (
    <mesh
      position={[Math.sin(time * 0.6) * 0.3, Math.cos(time * 0.6) * 0.3, 0.15]}
      rotation={[0, 0, -time * 0.6]}
    >
      <boxGeometry args={[0.035, 0.65, 0.025]} />
      <meshStandardMaterial color="#f8f6ec" />
    </mesh>
  );
}
function Connection({
  a,
  b,
}: {
  a: [number, number, number];
  b: [number, number, number];
}) {
  const center = new THREE.Vector3(...a)
      .add(new THREE.Vector3(...b))
      .multiplyScalar(0.5),
    dir = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),
    q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
  return (
    <mesh position={center} quaternion={q}>
      <cylinderGeometry args={[0.018, 0.018, dir.length(), 8]} />
      <meshStandardMaterial color="#b2c2a6" />
    </mesh>
  );
}
export default function ModelViewer3D(props: Props) {
  const root = useRef<HTMLDivElement>(null),
    [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    setSupported(!!gl);
    (gl as WebGLRenderingContext | null)
      ?.getExtension('WEBGL_lose_context')
      ?.loseContext();
  }, []);
  return (
    <Boundary>
      <div
        style={{
          position: 'relative',
          height: 350,
          borderRadius: 20,
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at center,#f4f0de,#e4e6d5)',
        }}
      >
        <div
          ref={root}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        {supported ? (
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [7, 4, 10], fov: 43 }}
            gl={{ antialias: true, alpha: true }}
          >
            <ambientLight intensity={1.4} />
            <directionalLight
              castShadow
              position={[3, 8, 5]}
              intensity={3}
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight
              position={[-4, 2, -2]}
              intensity={1}
              color="#d7ddb5"
            />
            <Camera sim={props.sim} />
            <Models {...props} root={root} />
            <mesh
              receiveShadow
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -1.3, 0]}
            >
              <planeGeometry args={[200, 200]} />
              <shadowMaterial transparent opacity={0.1} />
            </mesh>
          </Canvas>
        ) : (
          <p style={{ padding: 32 }}>
            {supported === false
              ? '3D is unavailable here. Use the interactive 2D model below.'
              : 'Preparing the model…'}
          </p>
        )}
      </div>
    </Boundary>
  );
}
