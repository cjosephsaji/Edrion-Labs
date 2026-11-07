'use client';
import { useMemo } from 'react';
import { createEffectComponent } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { CappedBloomEffect } from './bloom-effect';

// Use the installed integration's reconciler/lifecycle, like its own Bloom.
const BloomImpl = createEffectComponent<typeof CappedBloomEffect, object>(
  CappedBloomEffect,
);
export function CappedBloom({ height }: { height: number }) {
  const args = useMemo<ConstructorParameters<typeof CappedBloomEffect>>(
    () => [{ height }],
    [height],
  );
  return <BloomImpl args={args} blendFunction={BlendFunction.ADD} />;
}
