import type { Station } from '../teaching/types';
export type Point3 = [number, number, number];
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (t: number) => {
  const p = clamp01(t);
  return p * p * p * (p * (p * 6 - 15) + 10);
};
export const between = (time: number, start: number, duration: number) =>
  ease((time - start) / duration);
/** Finite presentation time. Pausing retains progress; no frame-count increments or delta clamp. */
export class MotionTrack {
  elapsed = 0;
  constructor(public duration: number) {}
  get progress() {
    return this.duration ? clamp01(this.elapsed / this.duration) : 1;
  }
  get done() {
    return this.progress === 1;
  }
  advance(delta: number, paused = false, reduced = false) {
    if (reduced) this.elapsed = this.duration;
    else if (!paused && Number.isFinite(delta) && delta > 0) {
      this.elapsed = Math.min(this.duration, this.elapsed + delta);
      if (this.duration - this.elapsed < 1e-7) this.elapsed = this.duration;
    }
    return ease(this.progress);
  }
  finish() {
    this.elapsed = this.duration;
  }
}
export const cameraDuration = (station: Station) =>
  station === 'bookshelf' ? 1.25 : station === 'experiment' ? 1.05 : 1.15;
/** A shallow room-side bow stays clear of the reading stand, with approved endpoints unchanged. */
export function cameraPoint(from: Point3, to: Point3, t: number): Point3 {
  const p = clamp01(t),
    u = 1 - p;
  const a = from.map((v, i) => v + (to[i]! - v) / 3) as Point3;
  const b = from.map((v, i) => v + (2 * (to[i]! - v)) / 3) as Point3;
  const bow = Math.min(
    0.24,
    Math.hypot(to[0] - from[0], to[2] - from[2]) * 0.08,
  );
  a[2] += bow;
  b[2] += bow;
  return from.map(
    (v, i) =>
      u * u * u * v +
      3 * u * u * p * a[i]! +
      3 * u * p * p * b[i]! +
      p * p * p * to[i]!,
  ) as Point3;
}
export interface MotionSignals {
  character: { station: Station; opacity: number; moving: boolean };
  camera: {
    id: number;
    progress: number;
    status: 'idle' | 'moving' | 'paused' | 'cancelled';
    station: Station;
  };
  board: {
    key: string;
    elapsed: number;
    duration: number;
    status: 'idle' | 'moving' | 'paused';
  };
  frameTimes: { camera: number[]; board: number[]; model: number[] };
  assets: {
    interiorMounts: number;
    boardTexturesCreated: number;
    boardTexturesDisposed: number;
  };
}
export function createMotionSignals(): MotionSignals {
  return {
    character: { station: 'desk', opacity: 1, moving: false },
    camera: { id: 0, progress: 1, status: 'idle', station: 'desk' },
    board: { key: '', elapsed: 0, duration: 0, status: 'idle' },
    frameTimes: { camera: [], board: [], model: [] },
    assets: {
      interiorMounts: 0,
      boardTexturesCreated: 0,
      boardTexturesDisposed: 0,
    },
  };
}
export function recordFrame(list: number[], delta: number) {
  if (delta > 0 && Number.isFinite(delta)) {
    list.push(delta * 1000);
    if (list.length > 2400) list.shift();
  }
}
