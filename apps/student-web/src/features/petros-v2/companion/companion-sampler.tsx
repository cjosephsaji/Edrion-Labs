'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PetrosAvatar, type PetrosAvatarPose } from '@/components/petros/petros-avatar';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from '../playground/teaching-fixtures';
import narration from '../../../../public/petros/audio/spoken-fixtures.json';
import { CompanionCloud } from './companion-cloud';
import manifest from '../../../../public/petros/v2/rig/manifest.json';
import styles from './companion-sampler.module.css';

/** Inspection of the user-selected original artwork. No academic state changes. */
export function CompanionSampler() {
  const playback = useMemo(() => new PresentationController(TEACHING_FIXTURES[0]!.timeline), []);
  const media = useSyncExternalStore(
    playback.subscribe,
    playback.getSnapshot,
    playback.getSnapshot,
  );
  const [pose, setPose] = useState<PetrosAvatarPose>('neutral');
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState(280);
  useEffect(() => () => playback.dispose(), [playback]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) playback.stopVoicePreview();
    };
    document.addEventListener('visibilitychange', stop);
    return () => document.removeEventListener('visibilitychange', stop);
  }, [playback]);
  const playing = media.speech.phase === 'speaking';
  const displayed = playing ? 'speaking' : pose;
  const caption = media.speech.preview?.caption ?? 'The original Petros artwork is in use.';
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>PETROS / COMPANION PLAYGROUND</p>
      <h1>The familiar Petros.</h1>
      <p>Your original artwork is selected for the Studio and Playground.</p>
      <section className={styles.controls} aria-label="Original artwork inspection controls">
        <label>
          Pose
          <select
            aria-label="Pose"
            value={pose}
            onChange={(e) => setPose(e.target.value as PetrosAvatarPose)}
          >
            {(Object.keys(manifest.poses) as PetrosAvatarPose[]).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Size
          <select aria-label="Size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[512, 360, 280, 256, 180, 160, 102, 96, 78, 48].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={minimized}
            onChange={(e) => setMinimized(e.target.checked)}
          />{' '}
          Minimize
        </label>
      </section>
      <section className={styles.comparison} aria-label="Original versus active artwork">
        <article>
          <h2>Approved original reference</h2>
          <img
            src={manifest.poses.neutral}
            alt="Approved original Petros neutral reference"
            width="192"
            height="256"
          />
        </article>
        <article>
          <h2>Active shared renderer · same original pixels</h2>
          <div style={{ width: 192, height: 256 }}>
            <PetrosAvatar pose="neutral" animate={false} idle={false} mouthOverlay={false} />
          </div>
        </article>
      </section>
      <p>
        No faithful layered reconstruction is accepted. Blink, independent gaze, nod,
        pleased/uncertain faces, open hand and travel remain unavailable. The sampler demonstrates
        authored pose switches and the existing static audio pose.
      </p>
      <div className={styles.actions} aria-label="Existing local narration inspection">
        <button
          onClick={() => {
            const sample = narration.segments[0]!;
            playback.playLocalResponse({
              ...sample,
              mimeType: 'audio/mpeg',
              provenance: 'approved-local-fixture',
            });
            const audio = playback.getActiveAudio();
            if (audio) audio.muted = muted;
          }}
        >
          Play existing narration
        </button>
        <button onClick={() => playback.stopVoicePreview()}>Stop playback</button>
        <label>
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => {
              setMuted(e.target.checked);
              const audio = playback.getActiveAudio();
              if (audio) audio.muted = e.target.checked;
            }}
          />{' '}
          Mute narration
        </label>
      </div>
      <section
        className={styles.stage}
        aria-label="Selected original Petros pose"
        data-original-preview
      >
        {!minimized && (
          <div style={{ height: size, width: size * 0.75 }}>
            <PetrosAvatar
              pose={displayed}
              speaking={playing}
              animate={false}
              mouthOverlay={false}
            />
          </div>
        )}
        <CompanionCloud cue={{ mode: 'waiting', gesture: 'neutral', targetId: null, caption }} />
      </section>
      <section className={styles.expressions} aria-label="Original authored pose collection">
        {(Object.entries(manifest.poses) as [PetrosAvatarPose, string][]).map(([name, src]) => (
          <figure key={name}>
            <div>
              <img src={src} alt={`Original Petros ${name}`} width="128" height="170" />
            </div>
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </section>
      <p>
        These are the original complete poses. Narration uses the existing offline sample and static
        talking pose. Independent facial animation is unavailable with this artwork.
      </p>
      <a href="/petros/companion-playground">Open the teaching Playground</a>
    </main>
  );
}
