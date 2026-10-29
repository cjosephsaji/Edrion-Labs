import type { CompanionCue, SharedCanvasState } from '@edrion/schemas';
import type { CompanionVisual } from './companion-controller';
import manifest from '../../../../public/petros/v2/rig/manifest.json';

export type CompanionPose = keyof typeof manifest.poses;
export type CompanionDirection = 'left' | 'right' | 'up' | 'down';
export function resolveSupportedPose(
  cue: CompanionCue,
  canvas: SharedCanvasState,
  direction: CompanionDirection | null,
  options: { disabledCapabilities?: readonly string[]; speaking?: boolean } = {},
): CompanionPose {
  const supports = (capability: string) =>
    (manifest.supported as string[]).includes(capability) &&
    !options.disabledCapabilities?.includes(capability);
  if (!supports('static-poses')) return 'neutral';
  if (cue.mode === 'listening') return 'listening';
  if (cue.mode === 'thinking') return 'thinking';
  if (cue.mode !== 'teaching') return 'neutral';
  // A surviving element can belong to a previous beat. Point only at the current
  // presentation focus/highlight, never merely at any element in the canvas.
  const currentTarget =
    cue.targetId &&
    canvas.elements.some((e) => e.id === cue.targetId) &&
    (canvas.highlightedIds.includes(cue.targetId) || canvas.focusedId === cue.targetId);
  if (supports('directional-pointing') && currentTarget && direction && cue.gesture !== 'neutral')
    return `point-${direction}`;
  if (cue.gesture !== 'neutral') return 'neutral';
  return options.speaking && supports('speech-pose') ? 'speaking' : 'neutral';
}
export function supportsRigCapability(capability: string) {
  return (manifest.supported as string[]).includes(capability);
}

/** Only authored original poses may reach the current renderer. Unsupported
 * expression/gesture proposals retain their public caption and settled artwork. */
export function resolveOriginalEventPose(
  visual: CompanionVisual,
  direction: CompanionDirection | null,
  options: {
    assessmentSafe: boolean;
    reducedMotion: boolean;
    speaking: boolean;
    disabledCapabilities?: readonly string[];
  },
): CompanionPose {
  const supports = (capability: string) =>
    supportsRigCapability(capability) && !options.disabledCapabilities?.includes(capability);
  if (
    !supports('static-poses') ||
    options.assessmentSafe ||
    visual.intent === 'paused' ||
    visual.intent === 'blocked'
  )
    return 'neutral';
  if (visual.intent === 'listening') return 'listening';
  if (visual.intent === 'processing')
    return visual.expression === 'thoughtful' ? 'thinking' : 'neutral';
  if (
    !options.reducedMotion &&
    visual.gesture === 'point' &&
    visual.targetId &&
    direction &&
    supports('directional-pointing')
  )
    return `point-${direction}`;
  if (options.speaking && supports('speech-pose')) return 'speaking';
  return 'neutral';
}
