import { create } from 'zustand';
import type { Topic } from '../simulations/runtime';
export type Place = 'hub' | Topic;
export type Quality = 'high' | 'balanced' | 'low';
export const places: {
  id: Topic;
  title: string;
  short: string;
  accent: string;
  position: [number, number, number];
}[] = [
  {
    id: 'neural',
    title: 'The Neural Garden',
    short: 'Neural learning',
    accent: '#8bd8c5',
    position: [-15, 0, -5],
  },
  {
    id: 'rocket',
    title: 'Sunset Launch',
    short: 'Rocket landing',
    accent: '#ed9c70',
    position: [-7, -0.6, -19],
  },
  {
    id: 'attention',
    title: 'The Word Constellation',
    short: 'Attention',
    accent: '#c5a6df',
    position: [10, 0.5, -17],
  },
  {
    id: 'traffic',
    title: 'The Little City',
    short: 'Traffic waves',
    accent: '#e8c76d',
    position: [18, -0.4, -1],
  },
  {
    id: 'relativity',
    title: 'The Quiet Observatory',
    short: 'Time dilation',
    accent: '#8ac8e5',
    position: [11, 0.5, 15],
  },
];
interface WorldState {
  reducedMotion: boolean;
  place: Place;
  quality: Quality;
  opening: boolean;
  moving: boolean;
  ready: boolean;
  tour: boolean;
  muted: boolean;
  askOpen: boolean;
  controlsOpen: boolean;
  infoOpen: boolean;
  pointing: boolean;
  frame: { ms: number; calls: number; triangles: number; dpr: number };
  setPlace: (p: Place) => void;
  setQuality: (q: Quality) => void;
  patch: (p: Partial<WorldState>) => void;
  reset: () => void;
}
const defaults = {
  reducedMotion: false,
  place: 'hub' as Place,
  quality: 'balanced' as Quality,
  opening: true,
  moving: false,
  ready: false,
  tour: false,
  muted: true,
  askOpen: false,
  controlsOpen: false,
  infoOpen: false,
  pointing: false,
  frame: { ms: 0, calls: 0, triangles: 0, dpr: 2 },
};
export const useWorld = create<WorldState>((set) => ({
  ...defaults,
  setPlace: (place) => set({ place, opening: false, tour: false }),
  setQuality: (quality) => set({ quality }),
  patch: (p) => set(p),
  reset: () => set({ ...defaults, ready: true, opening: false }),
}));
export function placePosition(place: Place): [number, number, number] {
  return places.find((p) => p.id === place)?.position ?? [0, 0.8, 5];
}
