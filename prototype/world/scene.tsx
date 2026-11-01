'use client';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { lessons } from '../lessons';
import type { Lesson, ShowcaseState, Station } from '../teaching/types';
import {
  ConstructionModel,
  RiverModel,
  SpatialBoard,
} from './spatial-teaching';
import { Interior, ImportedBook } from './asset-interior';
import { assetBudget } from './asset-budget';
import { BOARD_POSITION, BOARD_SIZE } from './board-surface';
import { Label, type Pick, type V3 } from './primitives';
import type { AvatarProjection } from './cloud-layout';
import type { ScenePresentation } from './storyboard';
import {
  MotionTrack,
  cameraDuration,
  cameraPoint,
  createMotionSignals,
  recordFrame,
  type MotionSignals,
  type Point3,
} from './motion';
import { WorldMotionContext, useWorldMotion } from './motion-context';
const ANCHORS: Record<Station, V3> = {
  desk: [-1.65, 0.568, -0.9],
  bookshelf: [-2.15, 0.568, -3.1],
  board: [-2.1, 0.568, -2.8],
  experiment: [0.45, 0.568, -0.1],
};
const PICKS: Record<string, V3> = {
  desk: [-3.1, 0.883, 0.95],
  bookshelf: [-3.65, 1.7, -3.4],
  board: [0.8, 1.7, -3.6],
  experiment: [2.3, 0.824, -0.1],
};
for (const [id, x, y] of [
  ['root', 800, 305],
  ['branch-0', 320, 490],
  ['branch-1', 800, 490],
  ['branch-2', 1280, 490],
  ['leaf-0-0', 222, 700],
  ['leaf-1-0', 702, 700],
] as const) {
  PICKS[id] = [
    BOARD_POSITION[0] + (x / 1600 - 0.5) * BOARD_SIZE[0],
    BOARD_POSITION[1] + (0.5 - y / 900) * BOARD_SIZE[1],
    BOARD_POSITION[2] + 0.01,
  ];
}
interface WorldMetrics {
  transitions: {
    preset: string;
    frames: number;
    ms: number;
    fps: number;
    status?: string;
    id?: number;
    expectedMs?: number;
  }[];
  renderer: string;
  triangles: number;
  drawCalls: number;
  picks: Record<string, { x: number; y: number }>;
  stationClicks: string[];
  books: Record<string, { x: number; y: number; z: number }>;
  bookAnimation?: { id: string; completed: boolean; durationMs: number };
  ready: boolean;
  budget?: ReturnType<typeof assetBudget>;
  camera?: { position: number[]; quaternion: number[]; zoom: number };
}
declare global {
  interface Window {
    __PETROS_WORLD_METRICS__?: WorldMetrics;
  }
}
export interface SceneProps {
  state: ShowcaseState;
  caption?: string;
  progress?: number;
  scene: ScenePresentation;
  reduced: boolean;
  frozen: boolean;
  active?: boolean;
  previewId?: string;
  onReady: () => void;
  onBookArrived: (id: string) => void;
  onStation: (s: Station) => void;
  onBook: (l: Lesson) => void;
  onPick: Pick;
  onAnchor: (point: AvatarProjection) => void;
  onCamera: (busy: boolean) => void;
}
function bookStart(lesson: Lesson): V3 {
  if (lesson.general) return [lesson.id === 'time' ? -3.4 : -3.0, 1.08, 0.95];
  return [
    lesson.id === 'ai3' || lesson.id === 'ehs3' ? -3.5 : -3.2,
    lesson.id.startsWith('ai') ? 2.23 : 1.575,
    -3.54,
  ];
}
for (const lesson of lessons) PICKS[`book-${lesson.id}`] = bookStart(lesson);
function SourceBook({
  lesson,
  active,
  phase,
  paused,
  reduced,
  onBook,
  onArrived,
  resumeAtStand,
}: {
  lesson: Lesson;
  active: boolean;
  phase: ScenePresentation['phase'];
  paused: boolean;
  reduced: boolean;
  onBook: (l: Lesson) => void;
  onArrived: (id: string) => void;
  resumeAtStand: boolean;
}) {
  const initialReading = useRef(active && resumeAtStand),
    held = useRef(initialReading.current);
  const group = useRef<THREE.Group>(null);
  const start = bookStart(lesson),
    destination: V3 = [-3.15, 0.925, -1.7];
  const initial = useRef(initialReading.current ? destination : start);
  const { invalidate, gl } = useThree();
  const task = useRef<null | {
    clock: MotionTrack;
    last: number;
    wall: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromQ: THREE.Quaternion;
    toQ: THREE.Quaternion;
    reading: boolean;
  }>(null);
  const callback = useRef(onArrived);
  callback.current = onArrived;
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    if (phase === 'retrieving' && !active) held.current = false;
    const reading =
      (active &&
        ['retrieving', 'book', 'teaching', 'practice', 'recap'].includes(
          phase,
        )) ||
      (held.current && ['arrival', 'library'].includes(phase));
    const target = new THREE.Vector3(...(reading ? destination : start));
    const targetQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(reading ? -Math.PI / 2 : 0, 0, reading ? 0.1 : 0),
    );
    if (
      g.position.distanceToSquared(target) < 1e-10 &&
      g.quaternion.angleTo(targetQ) < 1e-6 &&
      !(phase === 'retrieving' && active)
    )
      return;
    const instant = g.position.distanceToSquared(target) < 1e-10;
    task.current = {
      clock: new MotionTrack(instant ? 0 : reading ? 0.9 : 0.65),
      last: performance.now(),
      wall: performance.now(),
      from: g.position.clone(),
      to: target,
      fromQ: g.quaternion.clone(),
      toQ: targetQ,
      reading,
    };
    invalidate();
  }, [phase, active, invalidate]);
  useEffect(() => {
    if (task.current) task.current.last = performance.now();
    invalidate();
  }, [paused, reduced, invalidate]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = task.current;
    if (t && !paused) {
      const now = performance.now(),
        p = t.clock.advance((now - t.last) / 1000, false, reduced);
      t.last = now;
      g.position.lerpVectors(t.from, t.to, p);
      g.position.y += Math.sin(Math.PI * p) * 0.45;
      g.quaternion.slerpQuaternions(t.fromQ, t.toQ, p);
      gl.shadowMap.needsUpdate = true;
      if (t.clock.done) {
        g.position.copy(t.to);
        g.quaternion.copy(t.toQ);
        held.current = t.reading;
        task.current = null;
        if (t.reading && active && phase === 'retrieving') {
          if (window.__PETROS_WORLD_METRICS__)
            window.__PETROS_WORLD_METRICS__.bookAnimation = {
              id: lesson.id,
              completed: true,
              durationMs: reduced ? 0 : now - t.wall,
            };
          callback.current(lesson.id);
        }
      } else invalidate();
    }
    if (window.__PETROS_WORLD_METRICS__)
      window.__PETROS_WORLD_METRICS__.books[lesson.id] = {
        x: g.position.x,
        y: g.position.y,
        z: g.position.z,
      };
  });
  return (
    <group
      ref={group}
      position={initial.current}
      rotation={initialReading.current ? [-Math.PI / 2, 0, 0.1] : [0, 0, 0]}
      scale={0.37}
      onClick={(e) => {
        e.stopPropagation();
        onBook(lesson);
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <group rotation={[0, -Math.PI / 2, 0]}>
        <ImportedBook
          variant={lesson.module ?? (lesson.id === 'time' ? 15 : 2)}
          height={1.04}
        />
      </group>
      <Label
        text={
          lesson.general ? 'EXPLORE' : lesson.id.startsWith('ai') ? 'AI' : 'EHS'
        }
        position={[0, 0.24, 0.105]}
        size={[0.61, 0.15]}
        color="#f8e7be"
        fontSize={115}
      />
      <Label
        text={
          lesson.general
            ? lesson.id === 'time'
              ? 'TIME'
              : 'AI'
            : `Module ${lesson.module}`
        }
        position={[0, -0.06, 0.105]}
        size={[0.61, 0.2]}
        color="#f8e7be"
        fontSize={115}
      />
      {!lesson.general && (
        <Label
          text={
            {
              ai3: 'MINIMAX',
              ai4: 'REASONING',
              ehs3: 'SITE SAFETY',
              ehs5: 'WATER',
            }[lesson.id as 'ai3' | 'ai4' | 'ehs3' | 'ehs5']
          }
          position={[0, -0.3, 0.105]}
          size={[0.61, 0.12]}
          color="#e1cca2"
          fontSize={80}
        />
      )}
      {active && (
        <Label
          text="●"
          position={[0, 0.66, 0.02]}
          size={[0.22, 0.2]}
          color="#c9d7a7"
        />
      )}
    </group>
  );
}
function Character({
  station,
  state,
  scene,
  reduced,
  frozen,
  onAnchor,
}: {
  station: Station;
  state: ShowcaseState;
  scene: ScenePresentation;
  reduced: boolean;
  frozen: boolean;
  onAnchor: SceneProps['onAnchor'];
}) {
  const textures = useLoader(THREE.TextureLoader, [
    '/petros/states/petros-idle.png',
    '/petros/states/petros-listening.png',
    '/petros/states/petros-thinking.png',
    '/petros/states/petros-point-right.png',
  ]);
  const motion = useWorldMotion();
  const initial = useRef(station),
    anchor = useRef(station),
    target = useRef(station),
    cameraTrack = useRef<number | null>(null),
    started = useRef(false),
    alpha = useRef(1),
    local = useRef(new MotionTrack(0.24)),
    last = useRef(performance.now());
  const sprite = useRef<THREE.Sprite>(null),
    shadow = useRef<THREE.Mesh>(null),
    material = useRef<THREE.SpriteMaterial>(null);
  const { invalidate, camera, size } = useThree();
  const callback = useRef(onAnchor);
  callback.current = onAnchor;
  const projection = useRef('');
  useEffect(() => {
    if (target.current !== station) {
      target.current = station;
      cameraTrack.current = null;
      local.current = new MotionTrack(0.24);
      started.current = true;
      alpha.current = material.current?.opacity ?? 1;
      last.current = performance.now();
      invalidate();
    }
  }, [station, invalidate]);
  useEffect(() => {
    last.current = performance.now();
    invalidate();
  }, [frozen, state.paused, reduced, invalidate]);
  useFrame(() => {
    if (!sprite.current || !material.current || !shadow.current) return;
    const now = performance.now(),
      paused = state.paused || frozen;
    const cam = motion?.signals.camera;
    if (started.current && !paused) {
      let p: number;
      if (cam?.status === 'moving' && !reduced) {
        cameraTrack.current = cam.id;
        p = cam.progress;
      } else if (cameraTrack.current === cam?.id && cam.status === 'idle') {
        // Camera completion owns the final reveal; do not restart the fallback fade.
        p = 1;
      } else {
        p = local.current.advance((now - last.current) / 1000, false, reduced);
      }
      material.current.opacity =
        p < 0.18
          ? alpha.current * (1 - p / 0.18)
          : p < 0.65
            ? 0
            : Math.min(1, (p - 0.65) / 0.35);
      if (p >= 0.18 && anchor.current !== target.current) {
        anchor.current = target.current;
        sprite.current.position.set(...ANCHORS[anchor.current]);
        shadow.current.position.set(
          ANCHORS[anchor.current][0],
          0.012,
          ANCHORS[anchor.current][2],
        );
      }
      if (p >= 1) {
        material.current.opacity = 1;
        started.current = false;
      } else invalidate();
    }
    last.current = now;
    shadow.current.visible = material.current.opacity > 0.01;
    (shadow.current.material as THREE.MeshBasicMaterial).opacity =
      0.22 * material.current.opacity;
    if (motion) {
      motion.signals.character.station = anchor.current;
      motion.signals.character.opacity = material.current.opacity;
      motion.signals.character.moving = started.current;
    }
    const stamp = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
      size.width,
      size.height,
      anchor.current,
      material.current.opacity,
    ].join(',');
    if (stamp === projection.current) return;
    projection.current = stamp;
    const rect = document
      .querySelector('[data-world-scene] canvas')
      ?.getBoundingClientRect();
    const head = new THREE.Vector3(...ANCHORS[anchor.current]);
    head.y += 0.7;
    head.project(camera);
    const feet = new THREE.Vector3(...ANCHORS[anchor.current]);
    feet.y -= 0.55;
    feet.project(camera);
    callback.current({
      head: {
        x: (rect?.left ?? 0) + ((head.x + 1) * size.width) / 2,
        y: (rect?.top ?? 0) + ((1 - head.y) * size.height) / 2,
      },
      feet: {
        x: (rect?.left ?? 0) + ((feet.x + 1) * size.width) / 2,
        y: (rect?.top ?? 0) + ((1 - feet.y) * size.height) / 2,
      },
      visible:
        material.current.opacity > 0.25 &&
        Math.abs(head.x) < 1 &&
        Math.abs(head.y) < 1 &&
        head.z < 1,
    });
  }, -1);
  const pose =
    frozen || state.pendingRequest
      ? 1
      : state.cue?.kind === 'thought'
        ? 2
        : scene.phase === 'teaching' &&
            station === 'board' &&
            state.highlightTargetId
          ? 3
          : 0;
  return (
    <group>
      <sprite
        ref={sprite}
        position={ANCHORS[initial.current]}
        scale={[1.15, 1.54, 1]}
      >
        <spriteMaterial
          ref={material}
          map={textures[pose]}
          transparent
          alphaTest={0.03}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <mesh
        ref={shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[
          ANCHORS[initial.current][0],
          0.012,
          ANCHORS[initial.current][2],
        ]}
        scale={[0.5, 0.18, 1]}
      >
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial
          color="#29221c"
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
function CameraRig({
  scene,
  state,
  reduced,
  frozen,
  active,
  signals,
  onCamera,
}: {
  scene: ScenePresentation;
  state: ShowcaseState;
  reduced: boolean;
  frozen: boolean;
  active: boolean;
  signals: MotionSignals;
  onCamera: SceneProps['onCamera'];
}) {
  const { camera, size, invalidate } = useThree();
  const initialized = useRef(false),
    lastSkip = useRef(scene.skipCamera),
    serial = useRef(0);
  const look = useRef(new THREE.Vector3(-0.4, 1.5, -3));
  const callback = useRef(onCamera);
  callback.current = onCamera;
  const live = useRef({ frozen, reduced, active });
  live.current = { frozen, reduced, active };
  const transition = useRef<null | {
    id: number;
    clock: MotionTrack;
    last: number;
    wall: number;
    frames: number;
    from: Point3;
    to: Point3;
    fromQ: THREE.Quaternion;
    toQ: THREE.Quaternion;
    fromLook: THREE.Vector3;
    toLook: THREE.Vector3;
    fromFov: number;
    toFov: number;
    label: string;
  }>(null);
  const library = ['library', 'retrieving', 'book'].includes(scene.phase);
  const experiment = state.sceneStation === 'experiment';
  function destination() {
    const focus = scene.preset === 'teaching' || scene.preset === 'interaction';
    const position: Point3 = library
      ? [-2.8, 1.6, 0.1]
      : focus && experiment
        ? [2.5, 1.78, 2.6]
        : focus
          ? [-0.55, 1.65, 1.85]
          : [0.2, 1.65, 3.95];
    const target = new THREE.Vector3(
      ...((library
        ? [-2.8, 1.27, -3.55]
        : focus && experiment
          ? [1.8, 1.24, -0.2]
          : focus
            ? [size.width < 600 ? 0.8 : 0, size.width < 600 ? 1.61 : 1.3, -3.6]
            : [-0.1, 1.35, -2.9]) as Point3),
    );
    const span =
      focus && !experiment
        ? { w: size.width < 600 ? 5.2 : 6.5, h: 3.6 }
        : library
          ? { w: 4, h: 3.35 }
          : focus
            ? { w: 3.7, h: 2.25 }
            : null;
    const distance = new THREE.Vector3(...position).distanceTo(target);
    const fov = span
      ? THREE.MathUtils.radToDeg(
          2 *
            Math.atan(
              Math.max(span.h / 2, span.w / 2 / (size.width / size.height)) /
                distance,
            ),
        )
      : 60;
    const orientation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        new THREE.Vector3(...position),
        target,
        camera.up,
      ),
    );
    return { position, target, fov, orientation };
  }
  useEffect(() => {
    if (!active && initialized.current) return;
    const end = destination(),
      now = performance.now(),
      instant =
        !initialized.current ||
        lastSkip.current !== scene.skipCamera ||
        reduced;
    const old = transition.current;
    if (old) publish(old, 'cancelled');
    initialized.current = true;
    lastSkip.current = scene.skipCamera;
    const alreadyThere =
      camera.position.distanceToSquared(new THREE.Vector3(...end.position)) <
        1e-10 && camera.quaternion.angleTo(end.orientation) < 1e-6;
    const task = {
      id: ++serial.current,
      clock: new MotionTrack(
        instant || alreadyThere ? 0 : cameraDuration(state.sceneStation),
      ),
      last: now,
      wall: now,
      frames: 0,
      from: camera.position.toArray() as Point3,
      to: end.position,
      fromQ: camera.quaternion.clone(),
      toQ: end.orientation,
      fromLook: look.current.clone(),
      toLook: end.target,
      fromFov: (camera as THREE.PerspectiveCamera).fov,
      toFov: end.fov,
      label: library ? 'library' : experiment ? 'experiment' : scene.preset,
    };
    transition.current = task;
    signals.camera = {
      id: task.id,
      progress: 0,
      status: frozen ? 'paused' : 'moving',
      station: state.sceneStation,
    };
    callback.current(true);
    invalidate();
  }, [
    scene.preset,
    library,
    state.sceneStation,
    scene.skipCamera,
    reduced,
    active,
  ]);
  useEffect(() => {
    const task = transition.current;
    if (!active && initialized.current) {
      if (task?.id === 1 && task.clock.duration === 0) {
        invalidate();
        return;
      }
      if (task) publish(task, 'cancelled');
      transition.current = null;
      signals.camera.status = 'cancelled';
      callback.current(false);
      return;
    }
    if (task) {
      task.last = performance.now();
      signals.camera.status = frozen ? 'paused' : 'moving';
      invalidate();
    }
  }, [frozen, active]);
  useEffect(() => {
    const task = transition.current;
    const end = destination();
    if (task) {
      task.toFov = end.fov;
      task.toQ.copy(end.orientation);
      task.toLook.copy(end.target);
    } else {
      // CSS panel/viewport resizing also changes the canvas aspect. Fit the full
      // teaching span after ResizeObserver reports that size, without a camera journey.
      (camera as THREE.PerspectiveCamera).fov = end.fov;
      camera.quaternion.copy(end.orientation);
      look.current.copy(end.target);
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [size.width, size.height]);
  useEffect(
    () => () => {
      serial.current++;
      transition.current = null;
      signals.camera.status = 'cancelled';
    },
    [],
  );
  const resize = useRef(false);
  useEffect(() => {
    const request = () => {
      resize.current = true;
      invalidate();
    };
    window.addEventListener('resize', request);
    return () => window.removeEventListener('resize', request);
  }, [invalidate]);
  function publish(
    task: NonNullable<typeof transition.current>,
    status: 'completed' | 'cancelled',
  ) {
    const previous = window.__PETROS_WORLD_METRICS__;
    const picks: WorldMetrics['picks'] = {};
    for (const [id, point] of Object.entries(PICKS)) {
      const v = new THREE.Vector3(...point).project(camera);
      picks[id] = {
        x: ((v.x + 1) * size.width) / 2,
        y: ((1 - v.y) * size.height) / 2,
      };
    }
    window.__PETROS_WORLD_METRICS__ = {
      transitions: [
        ...(previous?.transitions ?? []),
        {
          preset: task.label,
          frames: task.frames,
          ms: performance.now() - task.wall,
          fps: task.clock.elapsed ? task.frames / task.clock.elapsed : 0,
          status,
          id: task.id,
          expectedMs: task.clock.duration * 1000,
        },
      ].slice(-40),
      renderer: previous?.renderer ?? '',
      triangles: previous?.triangles ?? 0,
      drawCalls: previous?.drawCalls ?? 0,
      picks,
      stationClicks: previous?.stationClicks ?? [],
      books: previous?.books ?? {},
      bookAnimation: previous?.bookAnimation,
      budget: previous?.budget,
      ready: true,
      camera: {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        zoom: 1,
      },
    };
  }
  useFrame(() => {
    const task = transition.current,
      now = performance.now();
    if (!task) {
      if (resize.current && !live.current.frozen) {
        resize.current = false;
        (camera as THREE.PerspectiveCamera).fov = destination().fov;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (live.current.frozen && task.clock.duration) {
      task.last = now;
      signals.camera.status = 'paused';
      return;
    }
    const delta = Math.max(0, (now - task.last) / 1000);
    task.last = now;
    if (task.frames > 0) recordFrame(signals.frameTimes.camera, delta);
    const p = task.clock.advance(delta, false, live.current.reduced);
    camera.position.set(...cameraPoint(task.from, task.to, p));
    camera.quaternion.slerpQuaternions(task.fromQ, task.toQ, p);
    look.current.lerpVectors(task.fromLook, task.toLook, p);
    (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
      task.fromFov,
      task.toFov,
      p,
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (window.__PETROS_WORLD_METRICS__)
      window.__PETROS_WORLD_METRICS__!.camera = {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        zoom: 1,
      };
    task.frames++;
    signals.camera.progress = task.clock.progress;
    signals.camera.status = 'moving';
    if (!task.clock.done) invalidate();
    else if (transition.current === task) {
      camera.position.set(...task.to);
      camera.quaternion.copy(task.toQ);
      look.current.copy(task.toLook);
      signals.camera.status = 'idle';
      signals.camera.progress = 1;
      transition.current = null;
      publish(task, 'completed');
      callback.current(false);
    }
  }, -2);
  return null;
}
function ScenePerformance({
  signals,
  kind,
}: {
  signals: MotionSignals;
  kind: string;
}) {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    let dead = false;
    // Reuse the exact detailed shadow map while only the camera/whiteboard changes.
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    const collect = () => {
      if (dead) return;
      const budget = assetBudget(scene, gl);
      const previous = window.__PETROS_WORLD_METRICS__;
      if (previous) {
        previous.budget = budget;
        previous.drawCalls = gl.info.render.calls;
        previous.triangles = gl.info.render.triangles;
        const ctx = gl.getContext(),
          debug = ctx.getExtension('WEBGL_debug_renderer_info');
        previous.renderer = String(
          ctx.getParameter(
            debug ? debug.UNMASKED_RENDERER_WEBGL : ctx.RENDERER,
          ),
        );
      }
    };
    const timer = setTimeout(collect, 1200);
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [gl, scene, kind, invalidate]);
  useFrame(() => {
    (window as any).__PETROS_ANIMATION__ = signals;
    const metric = window.__PETROS_WORLD_METRICS__;
    if (metric) {
      metric.drawCalls = gl.info.render.calls;
      if (metric.budget) metric.budget.rendererObjects = { ...gl.info.memory };
    }
  });
  return null;
}
function SpatialBounds() {
  const { camera, size } = useThree();
  useFrame(() => {
    const points = [];
    for (const x of [1.22, 3.4])
      for (const y of [0.8, 2.17])
        for (const z of [-0.9, 0.65]) {
          const v = new THREE.Vector3(x, y, z).project(camera);
          points.push({
            x: ((v.x + 1) * size.width) / 2,
            y: ((1 - v.y) * size.height) / 2,
          });
        }
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    (window as any).__PETROS_EXPERIMENT_RECT__ = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  });
  return null;
}
function Ready({ onReady }: { onReady: () => void }) {
  const fired = useRef(false),
    frames = useRef(0);
  const { invalidate } = useThree();
  useFrame(() => {
    if (++frames.current < 2) {
      invalidate();
      return;
    }
    if (!fired.current) {
      fired.current = true;
      onReady();
    }
  });
  return null;
}
const StaticInterior = memo(function StableInterior({
  onStation,
  signals,
}: {
  onStation: SceneProps['onStation'];
  signals: MotionSignals;
}) {
  useEffect(() => {
    signals.assets.interiorMounts++;
  }, [signals]);
  return <Interior onStation={onStation} />;
});
const StableBook = memo(SourceBook);
export const Scene = memo(function Scene(props: SceneProps) {
  const {
    state,
    scene,
    reduced,
    frozen,
    previewId,
    caption,
    progress,
    onReady,
    onBookArrived,
    onBook,
    onPick,
    onAnchor,
    onCamera,
  } = props;
  const signals = useMemo(createMotionSignals, []);
  const motionContext = useMemo(
    () => ({
      signals,
      reduced,
      paused: state.paused || props.active === false,
    }),
    [signals, reduced, state.paused, props.active],
  );
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );
  return (
    <WorldMotionContext.Provider value={motionContext}>
      <CameraRig
        scene={scene}
        state={state}
        reduced={reduced}
        frozen={frozen || state.paused}
        active={props.active ?? true}
        signals={signals}
        onCamera={onCamera}
      />
      <ScenePerformance signals={signals} kind={state.visualState.kind} />
      <StaticInterior onStation={props.onStation} signals={signals} />
      {lessons.map((l) => (
        <StableBook
          key={l.id}
          lesson={l}
          active={l.id === (previewId ?? state.lessonId)}
          resumeAtStand={state.phase !== 'welcome'}
          phase={scene.phase}
          paused={state.paused || frozen}
          reduced={reduced}
          onBook={onBook}
          onArrived={onBookArrived}
        />
      ))}
      <SpatialBoard
        state={state}
        reveal={scene.reveal}
        onPick={onPick}
        visible={['teaching', 'practice', 'recap'].includes(scene.phase)}
        caption={caption}
        progress={progress}
        onOpen={() => props.onStation('board')}
      />
      <group position={[0.35, -0.025, -0.59]} scale={0.65}>
        {state.visualState.kind === 'hazards' ? (
          <ConstructionModel
            reduced={reduced}
            state={state}
            angle={state.visualState.angle ?? 0}
            onPick={onPick}
          />
        ) : state.visualState.kind === 'river' ? (
          <RiverModel
            state={state}
            angle={state.visualState.angle ?? 0}
            onPick={onPick}
          />
        ) : null}
      </group>
      <SpatialBounds />
      <Character
        station={scene.phase === 'arrival' ? 'desk' : state.sceneStation}
        state={state}
        scene={scene}
        reduced={reduced}
        frozen={frozen}
        onAnchor={onAnchor}
      />
      <Ready onReady={onReady} />
    </WorldMotionContext.Provider>
  );
});
