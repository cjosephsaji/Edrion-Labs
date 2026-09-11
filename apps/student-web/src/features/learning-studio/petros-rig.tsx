'use client';

import { motion, useReducedMotion } from 'motion/react';

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
      <image
        href="/petros/petros-pointing.png"
        width="724"
        height="760"
        preserveAspectRatio="xMidYMid meet"
        transform={facing === 'right' ? 'translate(724 0) scale(-1 1)' : undefined}
      />
    </motion.svg>
  );
}
