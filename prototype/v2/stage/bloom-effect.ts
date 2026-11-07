import { BlendFunction, BloomEffect } from 'postprocessing';

/** Bloom's mipmap path ignores its deprecated height option in 6.39.
 * Bound the luminance and complete blur pyramid, preserving the HDR scene. */
export class CappedBloomEffect extends BloomEffect {
  private readonly maxHeight: number;

  constructor({ height = 512 }: { height?: number } = {}) {
    super({
      blendFunction: BlendFunction.ADD,
      luminanceThreshold: 0.95,
      mipmapBlur: true,
      intensity: 0.42,
      radius: 0.7,
      levels: 5,
    });
    this.maxHeight = Math.max(32, Math.round(height));
  }

  override setSize(width: number, height: number): void {
    const scale = Math.min(1, (this.maxHeight ?? 512) / Math.max(1, height));
    super.setSize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
  }
}
