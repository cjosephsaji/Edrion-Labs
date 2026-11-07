'use client';
import { createEffectComponent } from '@react-three/postprocessing';
import { ColorSMAAEffect } from './smaa-effect';
const SmaaImpl = createEffectComponent<typeof ColorSMAAEffect, object>(
  ColorSMAAEffect,
);
export function ColorSMAA() {
  return <SmaaImpl />;
}
