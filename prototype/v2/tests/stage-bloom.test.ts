import { describe, expect, it } from 'vitest';
import {
  BlendFunction,
  BloomEffect,
  EdgeDetectionMode,
  EffectAttribute,
  PredicationMode,
  SMAAEffect,
} from 'postprocessing';
import { CappedBloomEffect } from '../stage/bloom-effect';
import { ColorSMAAEffect, setDepthResolvePolicy } from '../stage/smaa-effect';
import { HalfFloatType, WebGLRenderTarget } from 'three';
const blurImage = (effect: BloomEffect) =>
  effect.mipmapBlurPass.texture.image as { width: number; height: number };

describe('bounded Traffic bloom', () => {
  it('keeps scene depth testing and 4x HDR MSAA while restoring resolved depth for AO', () => {
    const inputBuffer = new WebGLRenderTarget(2880, 1800, {
        type: HalfFloatType,
        samples: 4,
      }),
      outputBuffer = inputBuffer.clone();
    try {
      setDepthResolvePolicy({ inputBuffer, outputBuffer }, false);
      for (const buffer of [inputBuffer, outputBuffer]) {
        expect(buffer.depthBuffer).toBe(true);
        expect(buffer.samples).toBe(4);
        expect(buffer.texture.type).toBe(HalfFloatType);
        expect(buffer.resolveDepthBuffer).toBe(false);
      }
      setDepthResolvePolicy({ inputBuffer, outputBuffer }, true);
      expect(inputBuffer.resolveDepthBuffer).toBe(true);
      expect(outputBuffer.resolveDepthBuffer).toBe(true);
    } finally {
      inputBuffer.dispose();
      outputBuffer.dispose();
    }
  });
  it('omits the unused depth copy for color-edge SMAA while retaining convolution', () => {
    const legacy = new SMAAEffect(),
      effect = new ColorSMAAEffect();
    try {
      expect(legacy.getAttributes() & EffectAttribute.DEPTH).not.toBe(0);
      expect(effect.getAttributes() & EffectAttribute.DEPTH).toBe(0);
      expect(effect.getAttributes() & EffectAttribute.CONVOLUTION).not.toBe(0);
      expect(effect.edgeDetectionMaterial.edgeDetectionMode).toBe(
        EdgeDetectionMode.COLOR,
      );
    } finally {
      effect.dispose();
      legacy.dispose();
    }
  });
  it('preserves depth when SMAA actually uses it', () => {
    for (const options of [
      { edgeDetectionMode: EdgeDetectionMode.DEPTH },
      { predicationMode: PredicationMode.DEPTH },
    ]) {
      const effect = new ColorSMAAEffect(options);
      try {
        expect(effect.getAttributes() & EffectAttribute.DEPTH).not.toBe(0);
      } finally {
        effect.dispose();
      }
    }
  });
  it('caps the expensive luminance/pyramid path that the legacy height option misses', () => {
    const legacy = new BloomEffect({ height: 256, mipmapBlur: true }),
      capped = new CappedBloomEffect();
    try {
      legacy.setSize(2880, 1800);
      capped.setSize(2880, 1800);
      expect(legacy.luminancePass.resolution.height).toBe(1800);
      expect(blurImage(legacy).height).toBe(900);
      expect(capped.luminancePass.resolution.height).toBe(512);
      expect(blurImage(capped).height).toBe(256);
      expect(blurImage(capped).width).toBe(410);
    } finally {
      legacy.dispose();
      capped.dispose();
    }
  });
  it('preserves aspect ratio on resize and never upscales a smaller buffer', () => {
    const effect = new CappedBloomEffect();
    try {
      for (const [w, h] of [
        [2880, 1800],
        [780, 1688],
        [640, 360],
        [3840, 2160],
      ]) {
        effect.setSize(w, h);
        const size = effect.luminancePass.resolution;
        expect(size.height).toBe(Math.min(512, h));
        expect(size.width / size.height).toBeCloseTo(w / h, 2);
        expect(size.width).toBeLessThanOrEqual(w);
        expect(blurImage(effect).height).toBe(Math.round(Math.min(512, h) / 2));
      }
    } finally {
      effect.dispose();
    }
  });
  it('retains the HDR threshold, additive blend, strength and blur radius', () => {
    const effect = new CappedBloomEffect();
    try {
      expect(effect.luminanceMaterial.threshold).toBe(0.95);
      expect(effect.intensity).toBe(0.42);
      expect(effect.mipmapBlurPass.radius).toBe(0.7);
      expect(effect.mipmapBlurPass.levels).toBe(5);
      expect(effect.blendMode.blendFunction).toBe(BlendFunction.ADD);
    } finally {
      effect.dispose();
    }
  });
});
