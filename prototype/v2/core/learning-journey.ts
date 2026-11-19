import type { Investigation } from './investigation';
import { checkpoints } from './investigation-playback';

/** Navigation follows actual model snapshots, including two-frame experiments. */
export function observationJourney(task: Investigation, frame: number) {
  const stops = checkpoints(task);
  const at = Math.max(0, Math.min(task.frames.length - 1, frame));
  const next = stops.find((stop) => stop.index > at);
  const previous = stops.filter((stop) => stop.index < at).at(-1);
  const current = Math.max(0, stops.filter((stop) => stop.index <= at).length - 1);
  return { stops, next, previous, current, atEnd: at === task.frames.length - 1 };
}

export const viewGuidance = {
  '2d': {
    title: '2D diagram',
    purpose: 'Follow labels, relationships and exact values.',
    instruction: 'Read the labeled comparison. Select a part to understand it, or open “Read the model” below.',
  },
  '3d': {
    title: '3D workshop',
    purpose: 'Create, shape and program your own assemblies.',
    instruction: 'Build an editable 3D project with parts, attachments, driven motion, prompts and code.',
  },
} as const;
