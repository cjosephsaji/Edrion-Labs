'use client';
import { useEffect } from 'react';
import type { ShowcaseState } from '../teaching/types';
import s from '../components/showcase.module.css';
export function Companion({
  state,
  patch,
}: {
  state: ShowcaseState;
  patch: (p: Partial<ShowcaseState>) => void;
}) {
  useEffect(() => {
    if (state.phase !== 'welcome' || state.welcomeCueShown) return;
    const timer = setTimeout(() => {
      if (document.activeElement?.matches('input,textarea,dialog[open] *'))
        return;
      patch({
        welcomeCueShown: true,
        cue: { text: 'We’ll figure this out together. Ready?', kind: 'speech' },
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [state.sessionId, state.mode, state.phase, state.welcomeCueShown]);
  const pose = state.pendingRequest
    ? 'listening'
    : state.cue?.kind === 'thought'
      ? 'thinking'
      : 'idle';
  return (
    <aside className={s.companion} aria-label="Petros companion">
      <div className={s.companionTitle}>
        <span className={s.liveDot} /> HERE WITH YOU
      </div>
      <div className={s.avatarStage}>
        {state.cue && (
          <div
            role="status"
            className={`${s.cloud} ${state.cue.kind === 'thought' ? s.thought : state.cue.kind === 'notice' ? s.notice : ''}`}
          >
            <button
              aria-label="Dismiss Petros cloud"
              onClick={() => patch({ cue: null })}
            >
              ×
            </button>
            <p>{state.cue.text}</p>
          </div>
        )}
        <img
          src={`/petros/states/petros-${pose}.png`}
          alt={`Original Petros, ${pose} pose`}
          width={192}
          height={256}
          draggable={false}
        />
      </div>
      <strong>Petros</strong>
      <p className={s.caption}>A little curiosity goes a long way.</p>
      <div className={s.companionNote}>
        Prepared teaching · practice feedback
        <br />
        Captions on · voice unavailable
      </div>
    </aside>
  );
}
