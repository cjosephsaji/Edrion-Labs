'use client';

import { motion, useReducedMotion } from 'motion/react';
import { PetrosAvatar } from '@/components/petros/petros-avatar';

export type PetrosRigState = 'enter' | 'walk' | 'point' | 'speak' | 'listen' | 'think' | 'acknowledge' | 'rest' | 'paused';

export function PetrosRig({
  state = 'rest',
  facing = 'left',
  label = 'Petros',
}: {
  state?: PetrosRigState;
  pointAngle?: number;
  facing?: 'left' | 'right';
  label?: string;
}) {
  const reducedMotion = useReducedMotion();
  const entering = !reducedMotion && state === 'enter';

  return (
    <motion.svg
      viewBox="0 0 724 760"
      role="img"
      aria-label={label}
      initial={entering ? { opacity: 0, x: 28 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <foreignObject aria-hidden="true" x="77" y="0" width="570" height="760">
        <PetrosAvatar pose={state === 'speak' ? 'speaking' : state === 'listen' ? 'listening' : state === 'think' ? 'thinking' : state === 'point' ? `point-${facing}` : 'neutral'}
          speaking={state === 'speak'} idle={state === 'rest'} reducedMotion={Boolean(reducedMotion)} label={label} />
      </foreignObject>
    </motion.svg>
  );
}
