'use client';

import { useState } from 'react';
import manifest from '../../../public/petros/v2/rig/manifest.json';
import { PetrosSpeakingAvatar, usePetrosSpeakingMouth } from './petros-speaking-avatar';
import styles from './petros-avatar.module.css';

export type PetrosAvatarPose = keyof typeof manifest.poses;

/** Pixels only: no teaching clock, microphone, player or session authority.
 * Idle and mouth movement are approximations using complete PNGs and an SVG overlay. */
export function PetrosAvatar({ pose = 'neutral', speaking = false, idle = false, animate = true,
  reducedMotion = false, transition = false, mouthOverlay = true, label = 'Petros', className }: {
  pose?: PetrosAvatarPose; speaking?: boolean; idle?: boolean; animate?: boolean;
  reducedMotion?: boolean; transition?: boolean; mouthOverlay?: boolean; label?: string; className?: string;
}) {
  const [missing, setMissing] = useState<PetrosAvatarPose[]>([]);
  const displayed = missing.includes(pose) ? 'neutral' : pose;
  const overlay = mouthOverlay && speaking && displayed === 'speaking' && !missing.includes('neutral');
  const mouthOpen = usePetrosSpeakingMouth(overlay, animate && !reducedMotion);
  // Swap the SVG base and neutral PNG immediately; fading both exposes a doubled face.
  return <span className={`${styles.avatar} ${className ?? ''}`} data-shared-petros data-avatar-pose={displayed}
    data-idle-motion={idle && animate && !reducedMotion && !speaking && displayed === 'neutral'}
    data-motion={animate && !reducedMotion}
    data-transition={transition && animate && !reducedMotion && !overlay && displayed !== 'neutral'}
    data-speaking={speaking} data-mouth={overlay && mouthOpen ? 'open' : 'closed'}
    data-fallback={missing.includes(pose) ? 'missing-artwork' : undefined}>
    <span className={styles.art}>
      {(Object.entries(manifest.poses) as [PetrosAvatarPose, string][]).filter(([name]) => !missing.includes(name)).map(([name, src]) => <img
        key={name} src={src} data-active={!overlay && name === displayed} aria-hidden={overlay || name !== displayed ? true : undefined}
        alt={!overlay && name === displayed ? label : ''} width="384" height="512" draggable={false}
        onError={() => setMissing(current => current.includes(name) ? current : [...current, name])} />)}
      {overlay && <PetrosSpeakingAvatar mouthOpen={mouthOpen} label={label} />}
      {missing.includes('neutral') && displayed === 'neutral' && !overlay && <span role="img" aria-label={label}>Petros</span>}
    </span>
  </span>;
}
