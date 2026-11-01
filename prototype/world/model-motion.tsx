'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MotionTrack, recordFrame } from './motion';
import { useWorldMotion } from './motion-context';
import type { V3 } from './primitives';
export function AnimatedGroup({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  duration = 0.5,
  children,
}: {
  position?: V3;
  rotation?: V3;
  duration?: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null),
    initial = useRef({ position, rotation });
  const motion = useWorldMotion(),
    { invalidate, gl } = useThree();
  const task = useRef<null | {
    clock: MotionTrack;
    last: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromQ: THREE.Quaternion;
    toQ: THREE.Quaternion;
  }>(null);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const to = new THREE.Vector3(...position),
      toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    if (
      g.position.distanceToSquared(to) < 1e-12 &&
      g.quaternion.angleTo(toQ) < 1e-6
    )
      return;
    task.current = {
      clock: new MotionTrack(duration),
      last: performance.now(),
      from: g.position.clone(),
      to,
      fromQ: g.quaternion.clone(),
      toQ,
    };
    invalidate();
  }, [...position, ...rotation, duration, invalidate]);
  useEffect(() => {
    if (task.current) task.current.last = performance.now();
    invalidate();
  }, [motion?.paused, motion?.reduced, invalidate]);
  useFrame(() => {
    const t = task.current,
      g = ref.current;
    if (!t || !g || motion?.paused) return;
    const now = performance.now(),
      delta = (now - t.last) / 1000;
    t.last = now;
    const p = t.clock.advance(delta, false, motion?.reduced);
    g.position.lerpVectors(t.from, t.to, p);
    g.quaternion.slerpQuaternions(t.fromQ, t.toQ, p);
    gl.shadowMap.needsUpdate = true;
    if (motion) recordFrame(motion.signals.frameTimes.model, delta);
    if (t.clock.done) {
      g.position.copy(t.to);
      g.quaternion.copy(t.toQ);
      task.current = null;
    } else invalidate();
  });
  return (
    <group
      ref={ref}
      position={initial.current.position}
      rotation={initial.current.rotation}
    >
      {children}
    </group>
  );
}
export function Reveal({
  visible,
  duration = 0.22,
  appear = false,
  children,
}: {
  visible: boolean;
  duration?: number;
  appear?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null),
    value = useRef(visible && !appear ? 1 : 0),
    target = useRef(visible ? 1 : 0);
  const task = useRef<null | {
      clock: MotionTrack;
      last: number;
      from: number;
    }>(null),
    materials = useRef<THREE.Material[]>([]);
  const motion = useWorldMotion(),
    { invalidate, gl } = useThree();
  function apply(alpha: number) {
    const g = ref.current;
    if (!g) return;
    g.visible = alpha > 0.001;
    for (const m of materials.current) {
      m.transparent = true;
      m.opacity = alpha;
    }
    gl.shadowMap.needsUpdate = true;
  }
  useEffect(() => {
    const all = new Set<THREE.Material>();
    ref.current?.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          all.add(m);
    });
    materials.current = [...all];
    apply(value.current);
  }, []);
  useEffect(() => {
    target.current = visible ? 1 : 0;
    if (target.current !== value.current) {
      task.current = {
        clock: new MotionTrack(duration),
        last: performance.now(),
        from: value.current,
      };
      invalidate();
    }
  }, [visible, duration, invalidate]);
  useEffect(() => {
    if (task.current) task.current.last = performance.now();
    invalidate();
  }, [motion?.paused, motion?.reduced, invalidate]);
  useFrame(() => {
    const t = task.current;
    if (!t || motion?.paused) return;
    const now = performance.now(),
      delta = (now - t.last) / 1000;
    t.last = now;
    const p = t.clock.advance(delta, false, motion?.reduced);
    value.current = THREE.MathUtils.lerp(t.from, target.current, p);
    apply(value.current);
    if (t.clock.done) {
      value.current = target.current;
      apply(value.current);
      task.current = null;
    } else invalidate();
  });
  return <group ref={ref}>{children}</group>;
}
