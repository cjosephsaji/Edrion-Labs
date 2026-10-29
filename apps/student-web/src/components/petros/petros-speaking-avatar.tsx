'use client';

import { useEffect, useId, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/** Fixed-timer approximate mouth response, never phoneme or audio-level synchronization. */
export function usePetrosSpeakingMouth(speaking: boolean, animate = true) {
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [htmlReduced, setHtmlReduced] = useState(false);
  useEffect(() => {
    const update = () => setHtmlReduced(document.documentElement.dataset.reducedMotion === 'true');
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setOpen(false);
    if (!speaking || !animate || reducedMotion || htmlReduced) return;
    setOpen(true);
    const timer = window.setInterval(() => setOpen((current) => !current), 135);
    return () => window.clearInterval(timer);
  }, [speaking, animate, reducedMotion, htmlReduced]);
  return speaking && animate && !reducedMotion && !htmlReduced && open;
}

export function PetrosSpeakingAvatar({ mouthOpen, className, label = 'Petros, your animated learning buddy' }: {
  mouthOpen: boolean;
  className?: string;
  label?: string;
}) {
  const id = useId().replace(/:/g, '');
  return <svg className={className} viewBox="0 0 384 512" width="384" height="512" role="img" aria-label={label}
    style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }} data-mouth={mouthOpen ? 'open' : 'closed'}>
    <defs>
      <clipPath id={`${id}-idle-crop`}><rect width="384" height="480" /></clipPath>
      <radialGradient id={`${id}-skin`} cx="40%" cy="35%" r="75%">
        <stop offset="0" stopColor="#f8efd9" />
        <stop offset="1" stopColor="#f2e5cc" />
      </radialGradient>
      <radialGradient id={`${id}-blend`}>
        <stop offset="70%" stopColor="white" />
        <stop offset="100%" stopColor="black" />
      </radialGradient>
      <mask id={`${id}-mouth-mask`}>
        <ellipse cx="228" cy="224" rx="34" ry="20" fill={`url(#${id}-blend)`} />
      </mask>
    </defs>
    <image href="/petros/states/petros-idle.png" width="384" height="512" clipPath={`url(#${id}-idle-crop)`} />
    {/* Blend over the painted smile so an animated mouth never doubles up with it. */}
    <ellipse cx="228" cy="224" rx="34" ry="20" fill={`url(#${id}-skin)`} mask={`url(#${id}-mouth-mask)`} />
    {mouthOpen ? <g>
      <path d="M207 218 Q228 227 248 219 Q244 242 228 242 Q212 240 207 218Z" fill="#3c190e" stroke="#602c16" strokeWidth="1.2" />
      <path d="M217 237 Q229 228 240 237 Q230 245 217 237Z" fill="#be6947" />
    </g> : <path d="M207 220 Q228 233 248 221" fill="none" stroke="#613521" strokeWidth="2.6" strokeLinecap="round" />}
  </svg>;
}
