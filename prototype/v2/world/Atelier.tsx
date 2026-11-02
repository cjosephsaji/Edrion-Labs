'use client';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  TOPICS,
  attentionOf,
  observe,
  trafficFront,
  type SimTool,
  type Topic,
  type Simulation,
} from '../simulations/runtime';
import s from './atelier.module.css';
type V3 = [number, number, number];
const zones: Record<
  Topic,
  { name: string; sub: string; pos: V3; color: string }
> = {
  neural: {
    name: 'Neural Learning Lab',
    sub: 'A mistake becomes a lesson',
    pos: [-9, 0, -6],
    color: '#8eae83',
  },
  rocket: {
    name: 'Rocket Launch Bay',
    sub: 'Find the gentle landing',
    pos: [-3.5, 0, -7.2],
    color: '#d8aa6b',
  },
  attention: {
    name: 'Language Studio',
    sub: 'Follow a word’s connections',
    pos: [3, 0, -7.2],
    color: '#b29cb8',
  },
  traffic: {
    name: 'Traffic Control Table',
    sub: 'See the wave between cars',
    pos: [9, 0, -5.5],
    color: '#82a8a6',
  },
  relativity: {
    name: 'Relativity Observatory',
    sub: 'Two frames. One spacetime.',
    pos: [8.5, 0, 3.7],
    color: '#879eb9',
  },
};
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className={s.fallback} role="alert">
        The atelier could not render on this device. Switch to Focus for the
        same model and teaching actions.
      </p>
    ) : (
      this.props.children
    );
  }
}
function useGLB(file: string) {
  return useLoader(GLTFLoader, `/atelier/${file}.glb`, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    const draco = new DRACOLoader();
    draco.setDecoderPath('/atelier/draco/');
    loader.setDRACOLoader(draco);
  });
}
/** Shared PBR maps/geometry; each instance has independent transforms. Normalize actual imported bounds. */
function Model({
  file,
  position = [0, 0, 0],
  size = 1,
  rotation = 0,
  axis,
  onClick,
}: {
  file: string;
  position?: V3;
  size?: number;
  rotation?: number;
  axis?: 'vertical' | 'horizontal';
  onClick?: () => void;
}) {
  const gltf = useGLB(file);
  const object = useMemo(() => {
    const group = new THREE.Group(),
      copy = gltf.scene.clone(true);
    group.add(copy);
    let bounds = new THREE.Box3().setFromObject(group),
      dim = bounds.getSize(new THREE.Vector3());
    if (axis === 'vertical' && dim.z > dim.y && dim.z > dim.x)
      copy.rotation.x = -Math.PI / 2;
    if (axis === 'vertical' && dim.x > dim.y && dim.x > dim.z)
      copy.rotation.z = Math.PI / 2;
    if (axis === 'horizontal' && dim.y > dim.x && dim.y > dim.z)
      copy.rotation.z = Math.PI / 2;
    if (axis === 'horizontal' && dim.z > dim.x && dim.z > dim.y)
      copy.rotation.y = Math.PI / 2;
    group.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(group);
    dim = bounds.getSize(new THREE.Vector3());
    const scale = size / Math.max(dim.x, dim.y, dim.z),
      center = bounds.getCenter(new THREE.Vector3());
    copy.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    group.scale.setScalar(scale);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.receiveShadow = true;
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m.map) m.map.anisotropy = 4;
      }
    });
    return group;
  }, [gltf, size, axis]);
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <primitive object={object} dispose={null} />
    </group>
  );
}
function Block({
  p,
  size,
  color = '#e6ded0',
  metal = 0,
}: {
  p: V3;
  size: V3;
  color?: string;
  metal?: number;
}) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={metal ? 0.32 : 0.82}
        metalness={metal}
      />
    </mesh>
  );
}
function Sign({
  text,
  sub = '',
  position,
  width = 4,
  height = 0.75,
  dark = false,
  rotation = 0,
}: {
  text: string;
  sub?: string;
  position: V3;
  width?: number;
  height?: number;
  dark?: boolean;
  rotation?: number;
}) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = Math.round((1024 * height) / width);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = dark ? '#233b3a' : '#f5f0e3';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = dark ? '#f0e5c9' : '#375a45';
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(c.height * (sub ? 0.31 : 0.47))}px Georgia`;
    ctx.fillText(text, 512, sub ? c.height * 0.44 : c.height * 0.62, 970);
    if (sub) {
      ctx.fillStyle = dark ? '#acc4b7' : '#8b8e76';
      ctx.font = `${Math.round(c.height * 0.16)}px sans-serif`;
      ctx.fillText(sub, 512, c.height * 0.8, 950);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, sub, width, height, dark]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={[0, rotation, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
function Lighting() {
  const hdr = useLoader(RGBELoader, '/atelier/studio_small_03.hdr');
  const { scene, gl } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl),
      env = pmrem.fromEquirectangular(hdr);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.4;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [hdr, gl, scene]);
  return (
    <>
      <hemisphereLight args={['#fff7df', '#9fae9c', 0.8]} />
      <directionalLight
        position={[3, 12, 5]}
        intensity={2.0}
        color="#ffe9c6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-normalBias={0.035}
      />
      <directionalLight
        position={[-8, 5, -4]}
        intensity={0.65}
        color="#d8e6f2"
      />
    </>
  );
}
function Architecture() {
  const textures = useLoader(THREE.TextureLoader, [
    '/atelier/floor-color.jpg',
    '/atelier/floor-normal.jpg',
    '/atelier/floor-roughness.jpg',
  ]);
  const floorMat = useMemo(() => {
    const maps = textures.map((t) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(5, 4);
      c.anisotropy = 8;
      return c;
    });
    maps[0].colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: maps[0],
      normalMap: maps[1],
      roughnessMap: maps[2],
      roughness: 0.85,
      color: '#d5c4ad',
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
  }, [textures]);
  useEffect(
    () => () => {
      floorMat.map?.dispose();
      floorMat.normalMap?.dispose();
      floorMat.roughnessMap?.dispose();
      floorMat.dispose();
    },
    [floorMat],
  );
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[29, 24]} />
        <primitive attach="material" object={floorMat} />
      </mesh>
      <Block p={[0, -0.15, 0]} size={[29, 0.25, 24]} color="#a69880" />
      <Block p={[0, 3.6, -10]} size={[29, 7.2, 0.3]} color="#e9e4d8" />
      <Block p={[-14.3, 3.6, 0]} size={[0.3, 7.2, 20]} color="#d8ddcb" />
      <Block p={[14.3, 0.6, 0]} size={[0.3, 1.2, 24]} />
      <Block p={[14.3, 6.3, 0]} size={[0.3, 1.8, 24]} />
      {[-9, -4, 1, 6, 11].map((z) => (
        <group key={z}>
          <Block
            p={[14.25, 3.4, z]}
            size={[0.35, 4.4, 0.14]}
            color="#6b7e6d"
            metal={0.4}
          />
          <Block
            p={[14.25, 3.4, z - 2.5]}
            size={[0.28, 0.06, 4.9]}
            color="#6b7e6d"
            metal={0.4}
          />
          <mesh
            position={[14.32, 3.4, z - 2.5]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[4.8, 4.3]} />
            <meshPhysicalMaterial
              color="#cde7df"
              transparent
              opacity={0.17}
              roughness={0.15}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {[-12, -6, 0, 6, 12].map((x) => (
        <group key={x}>
          <Block p={[x, 6.4, 0]} size={[0.18, 0.45, 21]} color="#607765" />
          <Block
            p={[x, 6.15, -9.65]}
            size={[0.2, 0.18, 0.7]}
            color="#ae9470"
            metal={0.3}
          />
          <Block p={[x, 0.15, -9.6]} size={[0.16, 0.3, 0.2]} color="#8b795f" />
        </group>
      ))}
      {[-7, -1, 5, 11].map((z) => (
        <Block
          key={z}
          p={[0, 6.25, z]}
          size={[28.5, 0.18, 0.12]}
          color="#c3b297"
        />
      ))}
      <Block p={[0, 0.13, -9.75]} size={[28, 0.26, 0.22]} color="#5a6c59" />
      <Sign
        text="PETROS LEARNING ATELIER"
        sub="A home for questions, experiments and unexpected discoveries"
        position={[0, 5.25, -9.78]}
        width={10}
        height={1.15}
      />
      {/* A continuous gallery rug and brass inlay make the route through the stations visible. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 3]}
        receiveShadow
      >
        <planeGeometry args={[5.8, 15]} />
        <meshStandardMaterial color="#e1d5b8" roughness={1} />
      </mesh>
      {[-2.8, 2.8].map((x) => (
        <Block
          key={x}
          p={[x, 0.018, 3]}
          size={[0.025, 0.015, 15]}
          color="#ba9a5e"
          metal={0.6}
        />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, 4]}>
        <ringGeometry args={[2.1, 2.13, 96]} />
        <meshStandardMaterial color="#a68c54" metalness={0.5} />
      </mesh>
    </group>
  );
}
function Library() {
  const books = useGLB('book_encyclopedia_set_01');
  const row = useMemo(() => {
    const g = books.scene.clone(true),
      b = new THREE.Box3().setFromObject(g),
      d = b.getSize(new THREE.Vector3()),
      center = b.getCenter(new THREE.Vector3());
    g.position.sub(new THREE.Vector3(center.x, b.min.y, center.z));
    const wrapper = new THREE.Group();
    wrapper.add(g);
    wrapper.scale.setScalar(1.9 / Math.max(d.x, d.y, d.z));
    return wrapper;
  }, [books]);
  return (
    <group>
      {[-6.5, -2, 2.5, 7].map((z, k) => (
        <group key={z} position={[-13.65, 0, z]} rotation={[0, Math.PI / 2, 0]}>
          <Model
            file="wooden_display_shelves_01"
            size={3.5}
            rotation={-Math.PI / 2}
          />
          {[0.6, 1.25, 1.9].map((y, i) => (
            <group key={i} position={[0, y, 0.05]}>
              <primitive object={row.clone(true)} dispose={null} />
            </group>
          ))}
        </group>
      ))}
      <Sign
        text="THE CENTRAL LIBRARY"
        sub="Pick a question. There is a place for it here."
        position={[-13.35, 4.5, 0]}
        rotation={Math.PI / 2}
        width={5}
        height={0.9}
      />
      <Model
        file="mid_century_lounge_chair"
        position={[-8, 0, 5]}
        rotation={0.4}
        size={1.9}
      />
      <Model
        file="mid_century_lounge_chair"
        position={[-5, 0, 6]}
        rotation={-0.8}
        size={1.9}
      />
      <Model file="WoodenTable_01" position={[-6.4, 0, 4.6]} size={1.9} />
      <Model file="desk_lamp_arm_01" position={[-6.6, 1.05, 4.6]} size={0.7} />
      {[
        [12.6, 0, -8.4],
        [-12, 0, 9],
        [12.4, 0, 9],
        [-0.5, 0, -9],
      ].map((p, i) => (
        <Model
          key={i}
          file="potted_plant_02"
          position={p as V3}
          size={i % 2 ? 2.3 : 1.8}
        />
      ))}
    </group>
  );
}
function Connection({
  a,
  b,
  color = '#a9be9c',
  radius = 0.02,
}: {
  a: V3;
  b: V3;
  color?: string;
  radius?: number;
}) {
  const dir = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),
    center = new THREE.Vector3(...a)
      .add(new THREE.Vector3(...b))
      .multiplyScalar(0.5),
    q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
  return (
    <mesh position={center} quaternion={q}>
      <cylinderGeometry args={[radius, radius, dir.length(), 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.18}
        metalness={0.4}
        roughness={0.3}
      />
    </mesh>
  );
}
/** Camera projections are recomputed each frame, including travel and animated model bounds. */
function Anchor({
  id,
  children,
  root,
  enabled,
  onTarget,
}: {
  id: string;
  children: ReactNode;
  root: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onTarget: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null),
    box = useMemo(() => new THREE.Box3(), []),
    point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!root.current || !ref.current || !enabled) return;
    box.setFromObject(ref.current);
    if (box.isEmpty()) return;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity,
      visible = false;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          point.set(x, y, z).project(camera);
          if (point.z > -1 && point.z < 1) visible = true;
          const px = ((point.x + 1) * size.width) / 2,
            py = ((1 - point.y) * size.height) / 2;
          left = Math.min(left, px);
          top = Math.min(top, py);
          right = Math.max(right, px);
          bottom = Math.max(bottom, py);
        }
    let el = root.current.querySelector<HTMLElement>(
      `[data-world-anchor="${id}"]`,
    );
    if (!el) {
      el = document.createElement('span');
      el.dataset.worldAnchor = id;
      el.dataset.petrosId = id;
      root.current.appendChild(el);
    }
    Object.assign(el.style, {
      display:
        visible &&
        right > 0 &&
        left < size.width &&
        bottom > 0 &&
        top < size.height
          ? 'block'
          : 'none',
      position: 'absolute',
      left: `${Math.max(0, left)}px`,
      top: `${Math.max(0, top)}px`,
      width: `${Math.max(0, Math.min(size.width, right) - Math.max(0, left))}px`,
      height: `${Math.max(0, Math.min(size.height, bottom) - Math.max(0, top))}px`,
      pointerEvents: 'none',
    });
  });
  useEffect(
    () => () => {
      root.current?.querySelector(`[data-world-anchor="${id}"]`)?.remove();
    },
    [id, enabled, root],
  );
  return (
    <group
      ref={ref}
      onClick={(e) => {
        if (enabled) {
          e.stopPropagation();
          onTarget(id);
        }
      }}
    >
      {children}
    </group>
  );
}
function Earth() {
  const map = useLoader(THREE.TextureLoader, '/atelier/earth.jpg');
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
  }, [map]);
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.8, 48, 32]} />
        <meshStandardMaterial map={map} roughness={0.65} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.83, 48, 32]} />
        <meshBasicMaterial
          color="#83c5e2"
          transparent
          opacity={0.13}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}
function Station({
  id,
  sim,
  active,
  root,
  onTarget,
  visit,
}: {
  id: Topic;
  sim: Simulation;
  active: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  onTarget: (id: string) => void;
  visit: () => void;
}) {
  const z = zones[id],
    o = observe(sim),
    a = (name: string, child: ReactNode) => (
      <Anchor
        key={name}
        id={name}
        root={root}
        enabled={active}
        onTarget={onTarget}
      >
        {child}
      </Anchor>
    );
  const rot = id === 'relativity' ? -Math.PI / 2 : 0;
  return (
    <group position={z.pos} rotation={[0, rot, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
        receiveShadow
      >
        <circleGeometry args={[2.65, 64]} />
        <meshStandardMaterial
          color={active ? '#d6d9be' : '#dedbc8'}
          roughness={0.9}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
        <ringGeometry args={[2.57, 2.62, 64]} />
        <meshStandardMaterial color={z.color} metalness={0.5} roughness={0.3} />
      </mesh>
      <Sign
        text={z.name}
        sub={z.sub}
        position={[0, 3.9, -1.9]}
        width={4.7}
        height={0.8}
      />
      <group
        onClick={(e) => {
          e.stopPropagation();
          visit();
        }}
      >
        <Block p={[0, 0.8, 2.35]} size={[1.8, 0.08, 0.55]} color="#b0a185" />
        <Sign
          text={active ? 'YOU ARE HERE' : 'EXPLORE THIS QUESTION →'}
          position={[0, 1.05, 2.45]}
          width={1.8}
          height={0.25}
        />
      </group>
      {id === 'neural' && (
        <>
          <Model file="WoodenTable_01" position={[0, 0, -0.1]} size={4.2} />
          <Block
            p={[0, 2.35, -0.5]}
            size={[4.4, 2.25, 0.12]}
            color="#354d43"
            metal={0.2}
          />
          {a(
            'input-0',
            <mesh position={[-1.5, 2.5, -0.3]}>
              <sphereGeometry args={[0.25, 32, 24]} />
              <meshStandardMaterial
                color="#d4e2bf"
                metalness={0.2}
                roughness={0.25}
              />
            </mesh>,
          )}
          {a(
            'weight',
            <mesh position={[0, 2.5, -0.3]}>
              <torusGeometry args={[0.34, 0.06, 16, 48]} />
              <meshStandardMaterial
                color="#d4b36f"
                metalness={0.65}
                roughness={0.23}
              />
            </mesh>,
          )}
          {a(
            'prediction',
            <mesh position={[1.5, 2.5, -0.3]}>
              <sphereGeometry args={[0.29, 32, 24]} />
              <meshStandardMaterial
                color="#92bd9b"
                emissive="#6c9d7c"
                emissiveIntensity={0.4}
                metalness={0.2}
                roughness={0.25}
              />
            </mesh>,
          )}
          <Connection
            a={[-1.3, 2.5, -0.3]}
            b={[1.3, 2.5, -0.3]}
            color="#d3bd85"
          />
          <Sign
            text={
              sim.params.model === 'linear'
                ? `${Number(sim.params.x1).toFixed(1)} × ${Number(sim.params.weight).toFixed(2)} = ${Number(o.prediction).toFixed(2)}`
                : `Network prediction: ${Number(o.prediction).toFixed(3)}`
            }
            sub={
              sim.params.model === 'linear'
                ? 'input × weight = prediction'
                : 'Network active · prediction from tanh units'
            }
            position={[0, 1.9, -0.39]}
            width={3.8}
            height={0.6}
            dark
          />
          {a(
            'loss',
            <Sign
              text={`Loss ${Number(o.loss).toFixed(3)}`}
              position={[0, 1.45, -0.38]}
              width={2.5}
              height={0.3}
              dark
            />,
          )}
          {a(
            'target',
            <Sign
              text={`Target ${Number(sim.params.target).toFixed(1)}`}
              position={[0, 3.2, -0.38]}
              width={2.5}
              height={0.3}
              dark
            />,
          )}
          {sim.params.model !== 'linear' &&
            [0, 1, 2].map((i) =>
              a(
                `hidden-${i}`,
                <mesh position={[0, 1.8 + i * 0.65, -0.24]}>
                  <sphereGeometry args={[0.14, 24, 16]} />
                  <meshStandardMaterial color="#a9c199" />
                </mesh>,
              ),
            )}
          {sim.params.model !== 'linear' &&
            a(
              'input-1',
              <mesh position={[-1.5, 1.9, -0.3]}>
                <sphereGeometry args={[0.2, 24, 16]} />
                <meshStandardMaterial color="#d4e2bf" />
              </mesh>,
            )}
        </>
      )}
      {id === 'rocket' && (
        <>
          <Block p={[0, 2.15, -1.9]} size={[4.7, 3.6, 0.14]} color="#859c99" />
          <mesh position={[0, 0.24, 0]} receiveShadow>
            <cylinderGeometry args={[1.65, 1.75, 0.45, 64]} />
            <meshStandardMaterial
              color="#66736c"
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
          {a(
            'ground',
            <mesh position={[0, 0.475, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.15, 1.22, 64]} />
              <meshStandardMaterial color="#e8d7a7" />
            </mesh>,
          )}
          {a(
            'rocket',
            <group
              position={[0, 0.5 + (sim.data.rocket!.altitude / 120) * 0.9, 0]}
            >
              <Model file="rocket" size={2.3} axis="vertical" />
              {sim.data.rocket!.fuelMass > 0 &&
                +sim.params.throttle > 0 &&
                sim.data.rocket!.status === 'flying' && (
                  <mesh position={[0, -0.18, 0]} rotation={[Math.PI, 0, 0]}>
                    <coneGeometry
                      args={[0.1, 0.2 + +sim.params.throttle * 0.6, 24]}
                    />
                    <meshBasicMaterial
                      color="#f2b553"
                      transparent
                      opacity={0.8}
                    />
                  </mesh>
                )}
              {[-1, 1].map((x) => (
                <Connection
                  key={x}
                  a={[x * 0.07, 0.5, 0]}
                  b={[x * 0.5, 0, 0.2]}
                  radius={0.025}
                  color="#626b62"
                />
              ))}
            </group>,
          )}
          {a(
            'altitude',
            <Sign
              text={`${Number(o.altitude).toFixed(1)} m`}
              sub="ALTITUDE"
              position={[-1.5, 2.65, 0.4]}
              width={1.3}
              height={0.55}
              dark
            />,
          )}
          {a(
            'velocity',
            <Sign
              text={`${Number(o.velocity).toFixed(1)} m/s`}
              sub="VELOCITY"
              position={[1.45, 2.65, 0.4]}
              width={1.3}
              height={0.55}
              dark
            />,
          )}
          {a(
            'fuel',
            <Sign
              text={`${Number(o.fuel).toFixed(0)} kg fuel`}
              position={[0, 0.7, 1.8]}
              width={2}
              height={0.3}
              dark
            />,
          )}
          {+o.thrust > 0 && (
            <group>
              <Connection
                a={[0.8, 1.7, 0.2]}
                b={[0.8, 1.7 + Math.min(2, +o.thrust / 24000), 0.2]}
                color="#8eb697"
                radius={0.025}
              />
              <mesh position={[0.8, 1.7 + Math.min(2, +o.thrust / 24000), 0.2]}>
                <coneGeometry args={[0.1, 0.22, 16]} />
                <meshStandardMaterial color="#8eb697" />
              </mesh>
            </group>
          )}
          <Connection
            a={[-0.8, 2.7, 0.2]}
            b={[
              -0.8,
              2.7 - Math.min(2, (+o.mass * +sim.params.gravity) / 24000),
              0.2,
            ]}
            color="#d3a477"
            radius={0.025}
          />
          <mesh
            position={[
              -0.8,
              2.7 - Math.min(2, (+o.mass * +sim.params.gravity) / 24000),
              0.2,
            ]}
            rotation={[Math.PI, 0, 0]}
          >
            <coneGeometry args={[0.1, 0.22, 16]} />
            <meshStandardMaterial color="#d3a477" />
          </mesh>
          <Block
            p={[-2.2, 2, -1.6]}
            size={[0.12, 4, 0.15]}
            color="#849387"
            metal={0.5}
          />
          <Connection
            a={[-2.2, 3.5, -1.6]}
            b={[-0.7, 3.5, -1.6]}
            color="#a4aca0"
            radius={0.07}
          />
        </>
      )}
      {id === 'attention' && (
        <>
          <Model file="WoodenTable_01" position={[0, 0, 0]} size={4.6} />
          {attentionOf(sim).tokens.map((token, i, all) => {
            const x =
                (i - (all.length - 1) / 2) * Math.min(0.82, 4.6 / all.length),
              y = 1.7 + (i === +sim.params.query ? 0.65 : 0),
              share = attentionOf(sim).weights[+sim.params.query][i];
            return (
              <group key={i}>
                {a(
                  `token-${i}`,
                  <group position={[x, y, 0]}>
                    <Block
                      p={[0, 0, 0]}
                      size={[0.65, 0.6, 0.16]}
                      color={i === +sim.params.query ? '#d0b06c' : '#9eb4a1'}
                      metal={0.3}
                    />
                    <Sign
                      text={token}
                      sub={`${(share * 100).toFixed(1)}%`}
                      position={[0, 0, 0.09]}
                      width={0.65}
                      height={0.56}
                      dark
                    />
                  </group>,
                )}
                {share > 0 && (
                  <Connection
                    a={[
                      (+sim.params.query - (all.length - 1) / 2) *
                        Math.min(0.82, 4.6 / all.length),
                      2.35,
                      -0.08,
                    ]}
                    b={[x, y, -0.08]}
                    radius={0.012 + share * 0.06}
                    color="#bfaa75"
                  />
                )}
                <Connection
                  a={[x, 1.05, 0]}
                  b={[x, y - 0.35, 0]}
                  radius={0.015}
                  color="#9b9683"
                />
              </group>
            );
          })}
          {a(
            'context',
            <Sign
              text={`Query: ${String(o.query)}`}
              sub="Toy Q/K/V · computed connections"
              position={[0, 3.12, -0.3]}
              width={3.4}
              height={0.55}
              dark
            />,
          )}
        </>
      )}
      {id === 'traffic' && (
        <>
          <Model file="WoodenTable_01" position={[0, 0, 0]} size={5} />
          <group position={[0, 1.45, 0]}>
            {a(
              'ring',
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <ringGeometry args={[1.65, 2.2, 96]} />
                <meshStandardMaterial
                  color="#566460"
                  roughness={0.8}
                  side={THREE.DoubleSide}
                />
              </mesh>,
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <ringGeometry args={[1.91, 1.925, 96]} />
              <meshStandardMaterial color="#e5d9b2" side={THREE.DoubleSide} />
            </mesh>
            <Model file="potted_plant_02" position={[0, 0, -0.25]} size={0.9} />
            {sim.data.traffic!.cars.map((car) => {
              const angle = (car.position / 350) * Math.PI * 2;
              return a(
                car.id,
                <group
                  position={[
                    1.92 * Math.cos(angle),
                    0.035,
                    1.92 * Math.sin(angle),
                  ]}
                  rotation={[0, -angle, 0]}
                >
                  <Model
                    file="car"
                    size={Math.min(
                      0.36,
                      ((1.92 * 2 * Math.PI) / +sim.params.count) * 0.7,
                    )}
                  />
                  <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, -0.02, 0]}
                  >
                    <circleGeometry
                      args={[car.id === 'car_0' ? 0.18 : 0.115, 20]}
                    />
                    <meshBasicMaterial
                      color={
                        car.id === 'car_0'
                          ? '#e4b751'
                          : car.speed < 6
                            ? '#c97652'
                            : '#8eb3a0'
                      }
                      transparent
                      opacity={0.7}
                    />
                  </mesh>
                </group>,
              );
            })}
            {a(
              'jam-front',
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[
                  1.92 *
                    Math.cos(
                      (trafficFront(sim).car.position / 350) * Math.PI * 2,
                    ),
                  0.018,
                  1.92 *
                    Math.sin(
                      (trafficFront(sim).car.position / 350) * Math.PI * 2,
                    ),
                ]}
              >
                <ringGeometry args={[0.17, 0.19, 32]} />
                <meshBasicMaterial color="#d49356" side={THREE.DoubleSide} />
              </mesh>,
            )}
          </group>
          <Sign
            text={`${Number(o.meanSpeed).toFixed(1)} m/s`}
            sub="MEAN SPEED · 350 m ROAD"
            position={[0, 3, -0.8]}
            width={2.7}
            height={0.65}
            dark
          />
        </>
      )}
      {id === 'relativity' && (
        <>
          <Block p={[0, 2, -1]} size={[5, 3.4, 0.18]} color="#1d333e" />
          {Array.from({ length: 70 }, (_, i) => (
            <mesh
              key={i}
              position={[
                -2.4 + ((i * 0.7123) % 4.8),
                0.45 + ((i * 0.399) % 3),
                -0.89,
              ]}
            >
              <sphereGeometry args={[i % 6 ? 0.009 : 0.018, 6, 6]} />
              <meshBasicMaterial color="#d4d8d3" />
            </mesh>
          ))}
          <group position={[-1.15, 2.25, 0.05]}>
            <Earth />
          </group>
          <Model
            file="shuttle"
            position={[
              0.65 + 0.9 * Math.min(1, sim.time / +sim.params.duration),
              2.1,
              0.2,
            ]}
            size={1.7}
            axis="horizontal"
          />
          {a(
            'earth-clock',
            <Sign
              text={`${(sim.time || +sim.params.duration).toFixed(2)} s`}
              sub="EARTH COORDINATE TIME"
              position={[-1.15, 1.1, 0.32]}
              width={2}
              height={0.65}
              dark
            />,
          )}
          {a(
            'ship-clock',
            <Sign
              text={`${((sim.time || +sim.params.duration) / +o.gamma).toFixed(2)} s`}
              sub="SHIP PROPER TIME"
              position={[1.15, 1.1, 0.32]}
              width={2}
              height={0.65}
              dark
            />,
          )}
          {a(
            'gamma',
            <Sign
              text={`Earth frame · γ ${Number(o.gamma).toFixed(4)}`}
              sub={`v = ${Number(sim.params.beta).toFixed(3)}c · distance compressed`}
              position={[0, 3.25, -0.88]}
              width={3.8}
              height={0.5}
              dark
            />,
          )}
          {a(
            'worldline',
            <Connection a={[-1, 1.6, 0]} b={[1.8, 2.8, 0]} color="#c9ac6d" />,
          )}
          {a(
            'light-cone',
            <Connection
              a={[-1.8, 1.6, 0]}
              b={[-1.8, 3.1, 0]}
              color="#8cbdbf"
            />,
          )}
        </>
      )}
    </group>
  );
}
function Travel({
  destination,
  orbit,
  zoom,
}: {
  destination: Topic | 'atrium';
  orbit: number;
  zoom: number;
}) {
  const { camera, gl } = useThree(),
    target = useRef(new THREE.Vector3(0, 2, -4)),
    phase = useRef(0),
    prior = useRef(destination),
    reduced = useRef(false);
  useEffect(() => {
    reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  useEffect(() => {
    if (prior.current !== destination) {
      phase.current = 1;
      prior.current = destination;
      gl.domElement.dataset.travelling = 'true';
    }
  }, [destination, gl]);
  useFrame((_, dt) => {
    const zone = destination === 'atrium' ? null : zones[destination];
    let eye: V3, look: V3;
    if (zone) {
      const p = zone.pos,
        rel = destination === 'relativity';
      eye = rel
        ? [p[0] - 6.5 * zoom, 3.8, p[2] + orbit * 1.6]
        : [p[0] + orbit * 2.6, 3.1, p[2] + 6.5 * zoom];
      look = [p[0], 1.9, p[2] - 0.1];
    } else {
      eye = [orbit * 4, 4.4, 12 * zoom];
      look = [0, 2.2, -4];
    }
    // The clear central aisle is the shared waypoint; no path passes through a workbench.
    if (phase.current === 1 && !reduced.current) {
      const center = new THREE.Vector3(0, 3.4, 5.5);
      camera.position.lerp(center, 1 - Math.exp(-dt * 3.8));
      if (camera.position.distanceTo(center) < 0.25) phase.current = 2;
    } else {
      camera.position.lerp(
        new THREE.Vector3(...eye),
        reduced.current ? 1 : 1 - Math.exp(-dt * 3.4),
      );
      if (camera.position.distanceTo(new THREE.Vector3(...eye)) < 0.05) {
        phase.current = 0;
        gl.domElement.dataset.travelling = 'false';
      }
    }
    target.current.lerp(
      new THREE.Vector3(...look),
      reduced.current ? 1 : 1 - Math.exp(-dt * 3),
    );
    camera.lookAt(target.current);
    gl.domElement.dataset.destination = destination;
  });
  return null;
}
export default function Atelier({
  sim,
  onTarget,
  onTopic,
  teaching,
  onAction,
}: {
  sim: Simulation;
  onTarget: (id: string) => void;
  onTopic: (id: Topic) => void;
  teaching: boolean;
  onAction: (tool: SimTool, args?: Record<string, unknown>) => void;
}) {
  const [destination, setDestination] = useState<Topic | 'atrium'>('atrium'),
    [orbit, setOrbit] = useState(0),
    [zoom, setZoom] = useState(1),
    [quality, setQuality] = useState('balanced');
  const root = useRef<HTMLDivElement>(null),
    first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setDestination(sim.id);
    setOrbit(0);
  }, [sim.id]);
  useEffect(() => {
    if (teaching) setDestination(sim.id);
  }, [teaching, sim.id]);
  const visit = (id: Topic) => {
    setDestination(id);
    setOrbit(0);
    onTopic(id);
  };
  return (
    <div className={s.world} data-testid="atelier">
      <div
        className={s.scene}
        tabIndex={0}
        aria-label="Petros Learning Atelier. Use the map to visit a lab. Arrow keys look around; plus and minus zoom."
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setOrbit((v) =>
              Math.max(
                -1,
                Math.min(1, v + (e.key === 'ArrowLeft' ? -0.25 : 0.25)),
              ),
            );
          }
          if (e.key === '+' || e.key === '-')
            setZoom((v) =>
              Math.max(0.75, Math.min(1.35, v + (e.key === '+' ? -0.1 : 0.1))),
            );
        }}
      >
        <Boundary>
          <Canvas
            shadows
            dpr={quality === 'light' ? 1 : [1, 1.5]}
            camera={{ position: [0, 4.4, 12], fov: 52, near: 0.1, far: 150 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.0;
              gl.setClearColor('#c9d9cf');
            }}
          >
            <fog attach="fog" args={['#d9e2d5', 32, 85]} />
            <Suspense fallback={null}>
              <Lighting />
              <Architecture />
              <Library />
              {TOPICS.map((id) => (
                <Station
                  key={id}
                  id={id}
                  sim={id === sim.id ? sim : preview(id)}
                  active={id === sim.id && destination === id}
                  root={root}
                  onTarget={onTarget}
                  visit={() => visit(id)}
                />
              ))}
            </Suspense>
            <Travel destination={destination} orbit={orbit} zoom={zoom} />
          </Canvas>
        </Boundary>
        <div ref={root} className={s.anchors} />
        <div className={s.location}>
          <span>THE LEARNING ATELIER</span>
          <strong>
            {destination === 'atrium'
              ? 'Welcome to the central library'
              : zones[destination].name}
          </strong>
        </div>
        <div className={s.viewControls}>
          <button
            aria-label="Look left"
            onClick={() => setOrbit((v) => Math.max(-1, v - 0.3))}
          >
            ←
          </button>
          <button
            aria-label="Look right"
            onClick={() => setOrbit((v) => Math.min(1, v + 0.3))}
          >
            →
          </button>
          <button
            aria-label="Move closer"
            onClick={() => setZoom((v) => Math.max(0.75, v - 0.1))}
          >
            ＋
          </button>
          <button
            aria-label="Move back"
            onClick={() => setZoom((v) => Math.min(1.35, v + 0.1))}
          >
            −
          </button>
        </div>
      </div>
      <nav className={s.map} aria-label="Atelier quick travel">
        <button
          aria-pressed={destination === 'atrium'}
          onClick={() => setDestination('atrium')}
        >
          ⌂ Atrium
        </button>
        {TOPICS.map((id, i) => (
          <button
            key={id}
            aria-label={`Visit ${zones[id].name}`}
            aria-pressed={destination === id}
            onClick={() => visit(id)}
          >
            <i style={{ background: zones[id].color }} />
            {
              [
                'Neural lab',
                'Launch bay',
                'Language',
                'Traffic',
                'Observatory',
              ][i]
            }
          </button>
        ))}
      </nav>
      {destination !== 'atrium' && (
        <div className={s.stationAction}>
          <span>At your workbench</span>
          <button
            onClick={() => {
              if (sim.id === 'neural')
                onAction('sim_step', { seconds: 1 / 60 });
              if (sim.id === 'rocket')
                onAction('sim_set_params', {
                  patch: { throttle: Math.min(1, +sim.params.throttle + 0.1) },
                });
              if (sim.id === 'attention')
                onAction('sim_set_params', {
                  patch: {
                    query:
                      (+sim.params.query + 1) % attentionOf(sim).tokens.length,
                  },
                });
              if (sim.id === 'traffic') onAction('sim_brake');
              if (sim.id === 'relativity')
                onAction('sim_set_params', { patch: { beta: 0.99 } });
            }}
          >
            {
              {
                neural: 'Train one step →',
                rocket: 'Add 10% thrust →',
                attention: 'Follow the next word →',
                traffic: 'Brake the gold car →',
                relativity: 'Travel at 0.99c →',
              }[sim.id]
            }
          </button>
        </div>
      )}
      <div className={s.worldHint}>
        <span>
          {destination === 'atrium'
            ? 'Five questions. One connected place. Choose a station to travel with Petros.'
            : 'The model and your conversation stay with you. Open experiment controls to change it.'}
        </span>
        <select
          aria-label="World quality"
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
        >
          <option value="balanced">Balanced quality</option>
          <option value="light">Lighter rendering</option>
        </select>
      </div>
    </div>
  );
}
import { lessonModel } from '../core/teaching';
const previews = Object.fromEntries(
  TOPICS.map((id) => [id, lessonModel(id)]),
) as Record<Topic, Simulation>;
function preview(id: Topic) {
  return previews[id];
}
