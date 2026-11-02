'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { useWorld, placePosition } from './store';
export function CameraRig() {
  const { camera, size } = useThree(),
    place = useWorld((s) => s.place),
    moving = useWorld((s) => s.moving),
    opening = useWorld((s) => s.opening),
    controls = useRef<CameraControls>(null),
    progress = useRef({ t: 0 }),
    curve = useRef<THREE.CatmullRomCurve3 | null>(null),
    lookStart = useRef(new THREE.Vector3()),
    lookEnd = useRef(new THREE.Vector3()),
    look = useRef(new THREE.Vector3()),
    first = useRef(true),
    flight = useRef<gsap.core.Tween | null>(null);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const p = placePosition(place);
    const portrait = size.width / size.height < 0.8;
    let end: THREE.Vector3, target: THREE.Vector3;
    if (place === 'hub') {
      end = new THREE.Vector3(
        portrait ? 44 : 27,
        portrait ? 48 : 21,
        portrait ? 82 : 35,
      );
      target = new THREE.Vector3(portrait ? 3 : 1, 0, -2);
    } else {
      const distance = portrait ? 2.15 : 1;
      const offset =
        place === 'traffic'
          ? [7 * distance, 9.5 * distance, 10.5 * distance]
          : place === 'relativity'
            ? [7 * distance, 5.3 * distance, 11 * distance]
            : [6.5 * distance, 5.2 * distance, 10.5 * distance];
      end = new THREE.Vector3(
        p[0] + offset[0],
        p[1] + offset[1],
        p[2] + offset[2],
      );
      target = new THREE.Vector3(p[0] - 0.4, p[1] + 2.1, p[2] + 0.8);
    }
    if (first.current) {
      camera.position.set(11, 9, 23);
      look.current.set(0, 1.5, 4);
      first.current = false;
    }
    flight.current?.kill();
    lookStart.current.copy(look.current);
    lookEnd.current.copy(target);
    const from = camera.position.clone();
    const middle = from.clone().lerp(end, 0.5);
    middle.y =
      Math.max(from.y, end.y) + Math.min(5, from.distanceTo(end) * 0.12);
    curve.current = new THREE.CatmullRomCurve3([
      from,
      from.clone().lerp(middle, 0.65),
      middle,
      end.clone().lerp(middle, 0.22),
      end,
    ]);
    progress.current.t = 0;
    useWorld.getState().patch({ moving: true });
    flight.current = gsap.to(progress.current, {
      t: 1,
      duration: reduced ? 0.01 : opening ? 6 : 4.8,
      ease: 'sine.inOut',
      onComplete: () => {
        useWorld.getState().patch({ moving: false });
        controls.current?.setLookAt(
          end.x,
          end.y,
          end.z,
          target.x,
          target.y,
          target.z,
          false,
        );
      },
    });
    return () => {
      flight.current?.kill();
    };
  }, [place, opening, size.width / size.height < 0.8, camera]);
  useEffect(() => {
    if (!moving && flight.current?.isActive()) {
      flight.current.kill();
      const p = camera.position,
        t = look.current;
      controls.current?.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
    }
  }, [moving, camera]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as Element)?.closest(
          'input,textarea,select,[contenteditable]',
        ) ||
        useWorld.getState().opening
      )
        return;
      const c = controls.current;
      if (!c) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        flight.current?.kill();
        useWorld.getState().patch({ moving: false, tour: false });
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
          void c.rotate(e.key === 'ArrowLeft' ? -0.14 : 0.14, 0, true);
        else void c.dolly(e.key === 'ArrowUp' ? 0.7 : -0.7, true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useFrame(() => {
    if (useWorld.getState().moving && curve.current) {
      camera.position.copy(curve.current.getPointAt(progress.current.t));
      look.current.lerpVectors(
        lookStart.current,
        lookEnd.current,
        progress.current.t,
      );
      camera.lookAt(look.current);
    } else if (controls.current) {
      controls.current.getTarget(look.current);
    }
  });
  return (
    <CameraControls
      ref={controls}
      enabled={!useWorld((s) => s.moving) && !opening}
      minDistance={5}
      maxDistance={place === 'hub' ? 130 : 65}
      maxPolarAngle={Math.PI * 0.48}
      minPolarAngle={0.2}
      smoothTime={0.6}
      draggingSmoothTime={0.2}
      onStart={() => {
        flight.current?.kill();
        useWorld.getState().patch({ moving: false, tour: false });
      }}
    />
  );
}
