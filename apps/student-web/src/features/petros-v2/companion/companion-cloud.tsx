'use client';
import { useState } from 'react';
import type { CompanionCue } from '@edrion/schemas';
import styles from './companion.module.css';
export function cloudContent(cue: CompanionCue) {
  const text = cue.caption.trim();
  const status =
    cue.mode === 'thinking'
      ? 'Checking the source…'
      : cue.mode === 'listening'
        ? 'Ready for your question'
        : '';
  return {
    text: text || status,
    kind: cue.mode === 'thinking' || cue.mode === 'listening' ? 'status' : 'speech',
  } as const;
}
export function CompanionCloud({
  cue,
  microphoneActive = false,
  statusLabel,
}: {
  cue: CompanionCue;
  microphoneActive?: boolean;
  statusLabel?: string;
}) {
  const content = cloudContent(cue);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [transcript, setTranscript] = useState(false);
  const long = content.text.length > 240;
  if (!content.text) return null;
  return (
    <div
      className={styles.cloud}
      data-cloud={content.kind}
      data-cloud-kind={content.kind}
      data-caption-format={long ? 'transcript' : 'compact'}
    >
      <span className={styles.mode}>
        {microphoneActive
          ? 'Recording · Listening'
          : (statusLabel ??
            (cue.mode === 'listening'
              ? 'Ready for your question'
              : content.kind === 'status'
                ? 'Status'
                : 'Petros'))}
      </span>
      <div className={styles.captionBody}>
        {transcript ? (
          <div className={styles.transcript} aria-label="Current companion transcript" tabIndex={0}>
            {content.text}
          </div>
        ) : (
          dismissed !== content.text && (
            <p role="status" aria-live="polite" aria-atomic="true">
              {long ? `${content.text.slice(0, 220).trimEnd()}…` : content.text}
            </p>
          )
        )}
      </div>
      <div className={styles.cloudTools}>
        <button onClick={() => setTranscript(!transcript)} aria-expanded={transcript}>
          {long ? 'Full transcript' : 'Transcript'}
        </button>
        <button onClick={() => setDismissed(dismissed === content.text ? null : content.text)}>
          {dismissed === content.text ? 'Show caption' : 'Dismiss caption'}
        </button>
      </div>
    </div>
  );
}
