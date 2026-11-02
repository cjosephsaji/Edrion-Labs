'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations } from '@react-three/drei';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { useAsset } from './assets';
import { useWorld, placePosition } from './store';
import { speechAmplitude } from './audio';
import { worldBounds } from './anchors';
export function PetrosGuide({
  speaking,
  thinking,
  focus,
  phase,
  assessment,
}: {
  speaking: boolean;
  thinking: boolean;
  focus: string | null;
  phase: string;
  assessment?: string;
}) {
  const quality = useWorld((s) => s.quality),
    place = useWorld((s) => s.place),
    moving = useWorld((s) => s.moving),
    gltf = useAsset(quality === 'low' ? 'petros-low' : 'petros');
  const body = useMemo(() => {
    const o = clone(gltf.scene);
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = c.receiveShadow = true;
        for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
          const mat = m as THREE.MeshStandardMaterial;
          if (mat.aoMap) mat.aoMap.anisotropy = 12;
        }
      }
    });
    return o;
  }, [gltf]);
  const ref = useRef<THREE.Group>(null),
    { actions, mixer } = useAnimations(gltf.animations, ref),
    active = useRef<THREE.AnimationAction | null>(null),
    first = useRef(true),
    target = useRef(new THREE.Vector3(0, 1.25, 7));
  const mood = thinking
    ? 'Think'
    : speaking
      ? 'Speak'
      : moving
        ? 'Hover'
        : assessment === 'wrong' && phase === 'RETEACH_OR_EXTEND'
          ? 'Confused'
          : assessment === 'correct' && phase === 'RETEACH_OR_EXTEND'
            ? 'Celebrate'
            : ['EXPLAIN', 'DEMONSTRATE', 'RETEACH_OR_EXTEND'].includes(phase) &&
                focus
              ? 'Point'
              : 'Idle';
  useEffect(() => {
    const a = actions[mood] ?? actions.Idle;
    if (a && active.current !== a) {
      a.reset().fadeIn(0.3).play();
      active.current?.fadeOut(0.3);
      active.current = a;
    }
    return () => {
      a?.fadeOut(0.2);
    };
  }, [mood, actions]);
  useEffect(() => {
    const p = placePosition(place);
    target.current.set(p[0] - 2.9, p[1] + 0.5, p[2] + 3.6);
    if (place === 'hub') target.current.set(0, 1.25, 7);
    if (first.current && ref.current) {
      ref.current.position.copy(target.current);
      first.current = false;
    }
  }, [place]);
  const parts = useMemo(() => {
    const mouths: THREE.Mesh[] = [],
      lids: THREE.Mesh[] = [];
    let head: THREE.Bone | undefined, arm: THREE.Bone | undefined;
    body.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.morphTargetDictionary?.MouthOpen !== undefined) mouths.push(o);
        if (o.morphTargetDictionary?.Blink !== undefined) lids.push(o);
      }
      if (o instanceof THREE.Bone) {
        const name = o.name.replace(/[._]/g, '');
        if (name === 'Head') head = o;
        if (name === 'ArmR') arm = o;
      }
    });
    return { mouths, lids, head, arm, headRest: head?.quaternion.clone() };
  }, [body]);
  const gaze = useMemo(
    () => ({
      offset: new THREE.Quaternion(),
      inverse: new THREE.Quaternion(),
      angles: new THREE.Euler(),
      applied: false,
    }),
    [parts.head],
  );
  // Undo only our previous gaze offset before useAnimations evaluates the clip.
  // Some clips omit constant head tracks, so adding to Euler angles accumulates.
  useFrame(() => {
    if (parts.head && gaze.applied) {
      parts.head.quaternion.multiply(gaze.inverse.copy(gaze.offset).invert());
      gaze.applied = false;
    }
  }, -1);
  const petrosBox = useMemo(() => new THREE.Box3(), []),
    pos = useMemo(() => new THREE.Vector3(), []),
    look = useMemo(() => new THREE.Vector3(), []),
    q = useMemo(() => new THREE.Quaternion(), []),
    up = useMemo(() => new THREE.Vector3(0, 1, 0), []),
    parentQ = useMemo(() => new THREE.Quaternion(), []),
    mouth = useRef(0);
  useFrame(({ clock, camera, pointer, gl }, dt) => {
    if (!ref.current) return;
    ref.current.position.lerp(target.current, 1 - Math.exp(-dt * 2.2));
    look.copy(camera.position).sub(ref.current.position);
    const yaw = Math.atan2(look.x, look.z);
    // Quaternion interpolation takes the short turn across the +/-pi boundary.
    ref.current.quaternion.slerp(
      q.setFromAxisAngle(up, yaw),
      1 - Math.exp(-4 * dt),
    );
    const t = clock.elapsedTime,
      blink = Math.pow(Math.max(0, Math.sin(t * 1.05 + 1.3)), 46);
    for (const m of parts.lids)
      m.morphTargetInfluences![m.morphTargetDictionary!.Blink] = blink;
    mouth.current = THREE.MathUtils.damp(
      mouth.current,
      speaking ? speechAmplitude() : 0,
      18,
      dt,
    );
    for (const m of parts.mouths)
      m.morphTargetInfluences![m.morphTargetDictionary!.MouthOpen] =
        mouth.current;
    if (parts.head) {
      const still = useWorld.getState().reducedMotion || moving;
      gaze.angles.x = THREE.MathUtils.damp(
        gaze.angles.x,
        still ? 0 : THREE.MathUtils.clamp(pointer.y, -1, 1) * 0.025,
        6,
        dt,
      );
      gaze.angles.z = THREE.MathUtils.damp(
        gaze.angles.z,
        still ? 0 : THREE.MathUtils.clamp(pointer.x, -1, 1) * 0.045,
        6,
        dt,
      );
      gaze.offset.setFromEuler(gaze.angles);
      parts.head.quaternion.multiply(gaze.offset);
      gaze.applied = true;
    }
    if (mood === 'Point' && parts.arm && focus) {
      const b = worldBounds.get(focus);
      if (b) {
        b.getCenter(pos);
        parts.arm.getWorldPosition(look);
        pos.sub(look).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos);
        parts.arm.parent!.getWorldQuaternion(parentQ);
        parts.arm.quaternion.slerp(parentQ.invert().multiply(q), 0.65);
      }
    }
    petrosBox.setFromObject(ref.current);
    worldBounds.set('petros-guide', petrosBox);
    gl.domElement.dataset.character = 'rigged-glb';
    gl.domElement.dataset.petrosState = mood;
    gl.domElement.dataset.mouthAmplitude = mouth.current.toFixed(3);
    if (parts.head && parts.headRest)
      gl.domElement.dataset.petrosHeadTilt = parts.head.quaternion
        .angleTo(parts.headRest)
        .toFixed(4);
  });
  useEffect(
    () => () => {
      mixer.stopAllAction();
      worldBounds.delete('petros-guide');
    },
    [mixer],
  );
  const shadowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec2 vUv;void main(){vec2 p=vUv-.5;float a=exp(-dot(p,p)*19.)*.18;gl_FragColor=vec4(.12,.20,.15,a);}',
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial]);
  return (
    <group ref={ref} name="Petros guide">
      <primitive object={body} dispose={null} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.07, 0]}
        material={shadowMaterial}
      >
        <planeGeometry args={[3, 2.1]} />
      </mesh>
    </group>
  );
}
