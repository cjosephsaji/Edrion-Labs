'use client';
import { memo, useEffect, useId, useState } from 'react';
import manifest from '../../../../public/petros/v2/rig/candidate-rejected.json';
import type { CompanionVisual } from './companion-controller';
import { useAmplitudeMouth } from './use-amplitude-mouth';
import styles from './companion.module.css';

export function boundedAmplitude(
  value: number | undefined,
  playing: boolean,
  reducedMotion: boolean,
): 'closed' | 'small' | 'medium' | 'wide' {
  if (!playing || reducedMotion || !Number.isFinite(value) || value! < 0.025) return 'closed';
  return value! < 0.08 ? 'small' : value! < 0.17 ? 'medium' : 'wide';
}
export function validateLayeredAsset(
  svg: string,
  anchors: Record<string, number[]> = manifest.anchorLayers,
) {
  return (
    Object.entries(anchors).every(
      ([id, point]) =>
        point.length === 2 &&
        point.every(Number.isFinite) &&
        svg.includes(`id="${id}" data-anchor="${point[0]} ${point[1]}"`),
    ) &&
    manifest.layers.every((id) => svg.includes(`id="${id}"`)) &&
    svg.includes('viewBox="0 0 384 512"') &&
    !/<(?:script|foreignObject)\b/i.test(svg) &&
    !/\son\w+=/i.test(svg)
  );
}
let loaded: Promise<boolean> | undefined;
async function assetReady() {
  loaded ??= (async () => {
    try {
      const r = await fetch('/petros/v2/rig/layers.svg');
      if (!r.ok) return false;
      const svg = await r.text();
      if (!validateLayeredAsset(svg)) return false;
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(svg))),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      return hash === manifest.assets['layers.svg'].sha256;
    } catch {
      return false;
    }
  })();
  return loaded;
}
/** All geometry is authored locally. No model-authored SVG, coordinates or joint angles. */
export const LayeredCharacter = memo(function LayeredCharacter({
  visual,
  gaze = { x: 0, y: 0 },
  reducedMotion = false,
  playing = false,
  amplitude,
  assetAvailable,
  audio,
}: {
  visual: CompanionVisual;
  gaze?: { x: number; y: number };
  reducedMotion?: boolean;
  playing?: boolean;
  amplitude?: number;
  assetAvailable?: boolean;
  audio?: HTMLAudioElement | null;
}) {
  const [available, setAvailable] = useState<boolean | null>(assetAvailable ?? null);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const measured = useAmplitudeMouth(audio, playing, reducedMotion);
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    if (assetAvailable !== undefined) {
      setAvailable(assetAvailable);
      return;
    }
    let live = true;
    void assetReady().then((ok) => {
      if (live) setAvailable(ok);
    });
    return () => {
      live = false;
    };
  }, [assetAvailable]);
  if (available !== true)
    return fallbackFailed ? (
      <span role="img" aria-label="Petros">
        Petros
      </span>
    ) : (
      <img
        src="/petros/v2/rig/neutral.png"
        alt="Petros, settled"
        onError={() => setFallbackFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    );
  const use = (layer: string, props: React.SVGProps<SVGUseElement> = {}) => (
    <use href={`/petros/v2/rig/layers.svg#${layer}`} {...props} />
  );
  const allowed = (manifest.expressionGesturePolicy as Record<string, string[]>)[visual.gesture];
  const gesture =
    (visual.gesture === 'point'
      ? manifest.supportedDirections.every((d) => manifest.gestureClips.includes(`point-${d}`))
      : manifest.gestureClips.includes(visual.gesture)) &&
    (!allowed || allowed.includes(visual.expression))
      ? visual.gesture
      : 'settled';
  const face =
    manifest.expressionCombinations[visual.expression] ?? manifest.expressionCombinations.neutral;
  const gx = Number.isFinite(gaze.x)
    ? Math.max(-manifest.limits.gazeX, Math.min(manifest.limits.gazeX, gaze.x))
    : 0;
  const gy = Number.isFinite(gaze.y)
    ? Math.max(-manifest.limits.gazeY, Math.min(manifest.limits.gazeY, gaze.y))
    : 0;
  const mouth = boundedAmplitude(amplitude ?? measured, playing, reducedMotion);
  const blink = !reducedMotion && !['paused', 'blocked', 'processing'].includes(visual.intent);
  const point = gesture === 'point' && !!visual.targetId && !reducedMotion;
  // Directions select bounded authored clips. No claim of finger/pen contact.
  const direction =
    Math.abs(gx) > Math.abs(gy) ? (gx < 0 ? 'left' : 'right') : gy < 0 ? 'up' : 'down';
  const rotation = direction === 'down' ? 72 : 0;
  return (
    <svg
      className={styles.layered}
      viewBox="0 0 384 512"
      role="img"
      aria-label={`Petros, ${visual.expression}`}
      data-layered-character
      data-expression={visual.expression}
      data-gesture={gesture}
      data-mouth={mouth}
      data-blink={blink}
    >
      <defs>
        <clipPath id={`${id}-left`}>
          <ellipse cx="155" cy="208" rx="22" ry="29" />
        </clipPath>
        <clipPath id={`${id}-right`}>
          <ellipse cx="231" cy="211" rx="22" ry="29" />
        </clipPath>
      </defs>
      {use('legs')}
      {use('body')}
      {point && direction === 'left' ? (
        <g transform="translate(384 0) scale(-1 1)">{use('point-right')}</g>
      ) : (
        use('arm-left')
      )}
      {point && direction !== 'left' ? (
        <g transform={`rotate(${rotation} 272 251)`}>
          {use(direction === 'up' ? 'point-up' : 'point-right')}
        </g>
      ) : (
        use(gesture === 'open-hand' ? 'open-right' : 'arm-right')
      )}
      <g
        className={styles.headMotion}
        data-lean={!reducedMotion && gesture === 'lean'}
        data-nod={!reducedMotion && gesture === 'nod'}
        data-acknowledge={!reducedMotion && gesture === 'acknowledge'}
      >
        <g transform={`rotate(${face.head} 192 326)`}>
          {use('head-shell')}
          <g
            className={blink ? styles.blinkEyes : undefined}
            style={{ transformOrigin: '192px 210px' }}
          >
            {use('eye-left')}
            {use('eye-right')}
            <g clipPath={`url(#${id}-left)`}>
              {use('pupil-left', { transform: `translate(${gx} ${gy})` })}
            </g>
            <g clipPath={`url(#${id}-right)`}>
              {use('pupil-right', { transform: `translate(${gx} ${gy})` })}
            </g>
          </g>
          <g className={blink ? styles.blinkLids : styles.hiddenLids}>
            {use('lid-left')}
            {use('lid-right')}
          </g>
          {use('brow-left', { transform: `translate(0 ${face.brows[0]})` })}
          {use('brow-right', { transform: `translate(0 ${face.brows[1]})` })}
          {use(
            mouth === 'closed' && visual.expression === 'pleased'
              ? 'mouth-pleased'
              : `mouth-${mouth}`,
          )}
        </g>
      </g>
      {use('book')}
    </svg>
  );
});
