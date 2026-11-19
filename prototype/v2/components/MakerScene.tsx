'use client';
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  Edges,
  Billboard,
  Text,
  OrbitControls,
  TransformControls,
} from '@react-three/drei';
import { Group, Plane, Vector3 } from 'three';
import {
  partGeometry,
  geometryFacts,
  applyWorldTransform,
} from '../core/maker-geometry';
import {
  worldMatrix,
  type Part,
  type Project,
  type Vec3,
} from '../core/maker-project';

export type MakerSceneProps = {
  project: Project;
  selected: string | null;
  time: number;
  mode: 'translate' | 'rotate' | 'scale' | 'inspect';
  playing: boolean;
  wire: boolean;
  isolate: boolean;
  section: boolean;
  reset: number;
  view: string;
  snap: boolean;
  onSelect: (id: string) => void;
  onTransform: (project: Project) => void;
  onFailure: () => void;
};
function Body({
  part,
  project,
  time,
  selected,
  wire,
  ghost,
  plane,
  register,
  onSelect,
  dragging,
}: {
  part: Part;
  project: Project;
  time: number;
  selected: boolean;
  wire: boolean;
  ghost: boolean;
  plane: Plane[];
  register: (id: string, node: Group | null) => void;
  onSelect: (id: string) => void;
  dragging: boolean;
}) {
  const node = useRef<Group>(null);
  const geometry = useMemo(
    () => partGeometry(part),
    [part.shape, ...part.size, part.teeth],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    if (!node.current || dragging) return;
    worldMatrix(project, part.id, time).decompose(
      node.current.position,
      node.current.quaternion,
      node.current.scale,
    );
    node.current.updateMatrixWorld();
  }, [project, part.id, time, dragging]);
  return (
    <group
      ref={(value) => {
        node.current = value;
        register(part.id, value);
      }}
    >
      <mesh
        geometry={geometry}
        onClick={(e) => {
          if (e.delta < 5) {
            e.stopPropagation();
            onSelect(part.id);
          }
        }}
      >
        <meshStandardMaterial
          color={part.color}
          roughness={
            part.material === 'polymer'
              ? 0.55
              : part.material === 'wood'
                ? 0.8
                : 0.32
          }
          metalness={
            part.material === 'steel' || part.material === 'aluminium'
              ? 0.65
              : 0.05
          }
          transparent={ghost}
          opacity={ghost ? 0.12 : 1}
          depthWrite={!ghost}
          wireframe={wire}
          clippingPlanes={plane}
        />
        {selected && !plane.length && (
          <Edges scale={1.002} color="#f4c688" threshold={25} />
        )}
      </mesh>
      {selected && !plane.length && (
        <Billboard position={[0, part.size[1] / 2 + 15, 0]}>
          <Text
            font="/world-v3/fonts/ui.ttf"
            fontSize={8}
            color="#f6d6a1"
            outlineWidth={0.3}
            outlineColor="#14262c"
          >{`${part.id} · ${part.size.map((n) => Number(n.toFixed(1))).join(' × ')} mm`}</Text>
        </Billboard>
      )}
    </group>
  );
}
function Scene(p: MakerSceneProps) {
  const { camera, size, gl, invalidate } = useThree(),
    controls = useRef<React.ComponentRef<typeof OrbitControls>>(null),
    nodes = useRef(new Map<string, Group>());
  const [target, setTarget] = useState<Group | null>(null),
    [dragging, setDragging] = useState(false);
  const facts = useMemo(() => geometryFacts(p.project), [p.project]);
  const clip = useMemo(
    () =>
      p.section
        ? [
            new Plane(
              new Vector3(0, -1, 0),
              (facts.bounds.max.y + facts.bounds.min.y) / 2,
            ),
          ]
        : [],
    [p.section, facts],
  );
  useEffect(() => {
    setTarget(p.selected ? (nodes.current.get(p.selected) ?? null) : null);
  }, [p.selected, p.project]);
  useEffect(() => {
    const box = facts.bounds,
      center = box.isEmpty()
        ? new Vector3(0, 60, 0)
        : box.getCenter(new Vector3());
    const radius = Math.max(100, ...facts.size) * 0.7,
      d = radius * (size.width < 550 ? 3.5 : 2.8);
    const dir =
      p.view === 'top'
        ? [0, 1, 0.001]
        : p.view === 'front'
          ? [0, 0, 1]
          : p.view === 'side'
            ? [1, 0, 0]
            : [0.85, 0.55, 1];
    camera.position
      .copy(center)
      .add(new Vector3(...dir).normalize().multiplyScalar(d));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.current?.target.copy(center);
    controls.current?.update();
    invalidate();
    // A manual fit/view change frames the current geometry; editing keeps the camera still.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reset, p.view, size.width, size.height, camera, invalidate]);
  useEffect(() => {
    const lost = (e: Event) => {
      e.preventDefault();
      p.onFailure();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, p.onFailure]);
  return (
    <>
      <color attach="background" args={['#14262c']} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#eff6e7', '#3c5353', 1.2]} />
      <directionalLight position={[100, 250, 200]} intensity={3} />
      <directionalLight
        position={[-150, 80, -80]}
        intensity={1.5}
        color="#91c4d0"
      />
      <gridHelper
        args={[800, 40, '#3b5b60', '#263e44']}
        position={[0, -0.2, 0]}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={false}
        minDistance={30}
        maxDistance={3500}
      />
      {p.project.parts.map((part) => (
        <Body
          key={part.id}
          part={part}
          project={p.project}
          time={p.time}
          selected={p.selected === part.id}
          wire={p.wire}
          ghost={p.isolate && p.selected !== part.id}
          plane={clip}
          register={(id, node) => {
            if (node) nodes.current.set(id, node);
            else nodes.current.delete(id);
          }}
          onSelect={p.onSelect}
          dragging={dragging && p.selected === part.id}
        />
      ))}
      {target &&
        p.selected &&
        p.mode !== 'inspect' &&
        !p.playing &&
        p.time === 0 && (
          <TransformControls
            object={target}
            mode={p.mode}
            space="local"
            size={0.85}
            translationSnap={p.snap ? 5 : null}
            rotationSnap={p.snap ? Math.PI / 12 : null}
            scaleSnap={p.snap ? 0.1 : null}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => {
              const result = applyWorldTransform(
                p.project,
                p.selected!,
                target.position.toArray() as Vec3,
                [target.rotation.x, target.rotation.y, target.rotation.z],
                target.scale.toArray() as Vec3,
              );
              setDragging(false);
              p.onTransform(result);
            }}
          />
        )}
      {!p.project.parts.length && (
        <Billboard position={[0, 50, 0]}>
          <Text
            font="/world-v3/fonts/ui.ttf"
            fontSize={6}
            textAlign="center"
            color="#b6d0cc"
          >
            {
              'Your first part starts something.\nAdd a shape or write a build script.'
            }
          </Text>
        </Billboard>
      )}
    </>
  );
}
class Boundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function MakerScene(props: MakerSceneProps) {
  return (
    <Boundary onFailure={props.onFailure}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [300, 240, 400], near: 0.1, far: 10000, fov: 42 }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.domElement.setAttribute(
            'aria-label',
            'Editable 3D assembly. Select parts or drag transform handles. The parts list and numeric inspector provide keyboard alternatives.',
          );
        }}
        fallback={
          <p style={{ color: '#fff' }}>
            3D unavailable. The parts inspector, scripts and exports still work.
          </p>
        }
      >
        <Scene {...props} />
      </Canvas>
    </Boundary>
  );
}
