import {
  EdgeDetectionMode,
  EffectAttribute,
  PredicationMode,
  SMAAEffect,
  type EffectComposer,
} from 'postprocessing';

/** Color-edge SMAA with predication disabled never samples the scene depth.
 * Its default attribute still asks the composer for a full-resolution copy. */
export class ColorSMAAEffect extends SMAAEffect {
  constructor(
    options: NonNullable<ConstructorParameters<typeof SMAAEffect>[0]> = {},
  ) {
    super(options);
    const material = this.edgeDetectionMaterial;
    if (
      material.edgeDetectionMode === EdgeDetectionMode.COLOR &&
      material.predicationMode === PredicationMode.DISABLED
    )
      this.setAttributes(this.getAttributes() & ~EffectAttribute.DEPTH);
  }
}

/** Keep MSAA depth tests, but skip storing/resolving unused depth afterward. */
export function setDepthResolvePolicy(
  composer: Pick<EffectComposer, 'inputBuffer' | 'outputBuffer'>,
  needsDepth: boolean,
): void {
  composer.inputBuffer.resolveDepthBuffer = needsDepth;
  composer.outputBuffer.resolveDepthBuffer = needsDepth;
}
