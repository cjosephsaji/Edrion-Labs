'use client';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  type CatmullRomCurve3,
  type PerspectiveCamera,
  Vector3,
  Fog,
} from 'three';
import gsap from 'gsap';
import { cameraSpline } from '../world-v3/camera-path';
import type { StageLesson } from './lesson';
import { setStageView } from './viewport';
export interface OrbitState {
  az: number;
  polar: number;
  last: number;
  dial: boolean;
  cancel: () => void;
}
export function StageCamera<S>({
  lesson,
  state,
  selected,
  reduced,
  replay,
  root,
  orbit,
  intro,
  onMotion,
}: {
  lesson: StageLesson<S>;
  state: S;
  selected: string | null;
  reduced: boolean;
  replay: number;
  root: RefObject<HTMLElement | null>;
  orbit: RefObject<OrbitState>;
  intro: RefObject<number>;
  onMotion: (moving: boolean) => void;
}) {
  const { camera: raw, size, gl, scene } = useThree(),
    camera = raw as PerspectiveCamera;
  const tween = useRef<gsap.core.Tween | null>(null),
    progress = useRef({ t: 1 });
  const path = useRef<CatmullRomCurve3 | null>(null),
    fromLook = useRef(new Vector3()),
    look = useRef(new Vector3(0, 1.6, 0));
  const dest = useRef(new Vector3()),
    destLook = useRef(new Vector3()),
    initialized = useRef(false);
  const callbacks = useRef(onMotion);
  callbacks.current = onMotion;
  const current = useRef(state);
  current.current = state;
  const base = useRef({ distance: 18, az: 0.12, polar: 1.26 }),
    scratch = useMemo(() => new Vector3(), []);
  useEffect(() => {
    const rect = root.current
      ?.querySelector('[data-stage-area]')
      ?.getBoundingClientRect();
    const box = root.current?.getBoundingClientRect();
    if (!rect || !box) return;
    const canvas = gl.domElement.getBoundingClientRect();
    const card =
      box.width < 720
        ? root.current
            ?.querySelector('[data-testid="stage-explainer"]')
            ?.getBoundingClientRect()
        : undefined;
    const area = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: Math.max(
        50,
        Math.min(rect.bottom, card ? card.top - 24 : rect.bottom) - rect.y,
      ),
    };
    const cx = area.x - box.x + area.width / 2,
      cy = area.y - box.y + area.height / 2;
    setStageView(
      camera,
      box,
      { x: canvas.x - box.x, y: canvas.y - box.y, ...size },
      { x: cx, y: cy },
    );
    const shot =
      lesson.shots.find((s) => s.part === (selected ?? 'whole')) ??
      lesson.shots[0];
    const target = new Vector3(
      ...(box.width < 720 && shot.phoneTarget
        ? shot.phoneTarget(current.current)
        : shot.target(current.current)),
    );
    const direction = new Vector3(
      Math.sin(shot.polar) * Math.sin(shot.azimuth),
      Math.cos(shot.polar),
      Math.sin(shot.polar) * Math.cos(shot.azimuth),
    );
    let distance = shot.distance;
    if (
      !selected ||
      selected === 'whole' ||
      shot.fitBounds ||
      shot.framePoints
    ) {
      const right = new Vector3()
          .crossVectors(new Vector3(0, 1, 0), direction)
          .normalize(),
        up = new Vector3().crossVectors(direction, right);
      const tanV = Math.tan((camera.fov * Math.PI) / 360),
        tanH = (tanV * box.width) / box.height;
      distance = 0;
      const points = shot.framePoints?.(current.current) ??
        lesson.framePoints ?? [lesson.bounds.min, lesson.bounds.max];
      for (const p of points) {
        const v = new Vector3(...p).sub(target),
          depth = v.dot(direction);
        distance = Math.max(
          distance,
          depth +
            Math.abs(v.dot(right)) / (((tanH * area.width) / box.width) * 0.96),
          depth +
            Math.abs(v.dot(up)) / (((tanV * area.height) / box.height) * 0.96),
        );
      }
    } else if (box.width < 720)
      distance = Math.max(
        distance,
        shot.phoneDistance ?? (shot.part === 'loss' ? 18 : 14),
      );
    base.current = { distance, az: shot.azimuth, polar: shot.polar };
    if (lesson.relativeFog || shot.fitBounds || shot.framePoints) {
      camera.far = Math.max(100, distance * 1.32 + 35);
      camera.updateProjectionMatrix();
    }
    destLook.current.copy(target);
    dest.current.copy(target).addScaledVector(direction, distance);
    tween.current?.kill();
    orbit.current.az = 0;
    orbit.current.polar = 0;
    if (!initialized.current) {
      intro.current = reduced ? 3 : 0;
      if (!initialized.current)
        camera.position
          .copy(target)
          .addScaledVector(direction, distance * (reduced ? 1 : 1.32));
      initialized.current = true;
    }
    if (!selected && intro.current < 0.1 && !reduced)
      camera.position.copy(target).addScaledVector(direction, distance * 1.32);
    fromLook.current.copy(look.current);
    path.current = cameraSpline(camera.position.clone(), dest.current, 1.2);
    progress.current.t = 0;
    callbacks.current(true);
    tween.current = gsap.to(progress.current, {
      t: 1,
      duration: reduced ? 0 : !selected && intro.current < 0.1 ? 2.4 : 1.2,
      ease: 'sine.inOut',
      onComplete: () => callbacks.current(false),
    });
    orbit.current.cancel = () => {
      if (!tween.current?.isActive()) return;
      tween.current.kill();
      path.current = null;
      destLook.current.copy(look.current);
      orbit.current.az = 0;
      orbit.current.polar = 0;
      const offset = camera.position.clone().sub(look.current),
        distance = offset.length();
      base.current = {
        distance,
        az: Math.atan2(offset.x, offset.z),
        polar: Math.acos(offset.y / Math.max(0.001, distance)),
      };
      callbacks.current(false);
    };
    return () => {
      tween.current?.kill();
    };
  }, [
    camera,
    gl,
    lesson,
    selected,
    reduced,
    replay,
    size.width,
    size.height,
    root,
    orbit,
    intro,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest('input,textarea,select')) return;
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        orbit.current.cancel();
        orbit.current.last = performance.now();
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
          orbit.current.az += e.key === 'ArrowLeft' ? -0.12 : 0.12;
        else orbit.current.polar += e.key === 'ArrowUp' ? -0.06 : 0.06;
      }
    };
    gl.domElement.addEventListener('keydown', key);
    return () => gl.domElement.removeEventListener('keydown', key);
  }, [gl, orbit]);
  useFrame(({ clock }, dt) => {
    intro.current = reduced ? 3 : intro.current + Math.min(dt, 0.05);
    if (tween.current?.isActive() && path.current) {
      camera.position.copy(path.current.getPointAt(progress.current.t));
      look.current.lerpVectors(
        fromLook.current,
        destLook.current,
        progress.current.t,
      );
    } else {
      const o = orbit.current;
      if (performance.now() - o.last > 3500) {
        o.az *= reduced ? 0 : Math.exp(-dt * 0.8);
        o.polar *= reduced ? 0 : Math.exp(-dt * 0.8);
      }
      o.az = Math.max(-0.9, Math.min(0.9, o.az));
      o.polar = Math.max(-0.2, Math.min(0.28, o.polar));
      const b = base.current,
        az =
          b.az +
          o.az +
          (reduced || selected ? 0 : Math.sin(clock.elapsedTime * 0.22) * 0.2),
        pol = b.polar + o.polar;
      // Follow the current height as training moves a focused sphere.
      const shot = lesson.shots.find((s) => s.part === selected);
      if (shot)
        destLook.current.set(
          ...(size.width < 720 && shot.phoneTarget
            ? shot.phoneTarget(current.current)
            : shot.target(current.current)),
        );
      look.current.lerp(destLook.current, reduced ? 1 : Math.min(1, dt * 7));
      scratch.set(
        Math.sin(pol) * Math.sin(az),
        Math.cos(pol),
        Math.sin(pol) * Math.cos(az),
      );
      camera.position.copy(look.current).addScaledVector(scratch, b.distance);
    }
    camera.lookAt(look.current);
    // A narrow viewport may dolly far back to fit a whole ring above a sheet.
    // Keep its studio haze relative to the specimen rather than fogging it out.
    if (lesson.relativeFog && scene.fog instanceof Fog) {
      const distance = camera.position.distanceTo(look.current);
      scene.fog.near = Math.max(22, distance - 12);
      scene.fog.far = Math.max(60, distance + 26);
    }
    camera.updateMatrixWorld();
    gl.domElement.dataset.cameraPosition = camera.position
      .toArray()
      .map((v) => v.toFixed(4))
      .join(',');
    gl.domElement.dataset.introComplete = String(intro.current >= 2.4);
  }, -2);
  return null;
}
