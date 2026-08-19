'use client';

import { TriangleAlert, WifiOff } from 'lucide-react';
import { ActionButton } from './action-button';
import styles from './primitives.module.css';

function SystemState({
  tone,
  icon: Icon,
  title,
  description,
  actionLabel,
  onRetry,
}: {
  tone: 'error' | 'offline';
  icon: typeof TriangleAlert;
  title: string;
  description: string;
  actionLabel: string;
  /** Omitted when there is nothing the student can do by trying again. */
  onRetry?: () => void;
}) {
  return (
    <section className={styles.systemState} data-tone={tone} role="status" aria-live="polite">
      <div className={styles.stateInner}>
        <span className={styles.stateIcon} aria-hidden="true"><Icon /></span>
        <h2 className={styles.stateTitle}>{title}</h2>
        <p className={styles.stateDescription}>{description}</p>
        {onRetry ? (
          <div className={styles.stateAction}><ActionButton onClick={onRetry}>{actionLabel}</ActionButton></div>
        ) : null}
      </div>
    </section>
  );
}

export function ErrorState({
  onRetry,
  title = 'We couldn’t load this section',
  description = 'Your information is safe. Try the request again, or return later if the problem continues.',
  actionLabel = 'Try again',
}: {
  onRetry?: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return <SystemState tone="error" icon={TriangleAlert} title={title} description={description} actionLabel={actionLabel} onRetry={onRetry} />;
}

export function OfflineState({
  onRetry,
  title = 'You’re offline',
  description = 'Reconnect to update this page. Previously loaded information remains available where supported.',
  actionLabel = 'Check connection',
}: {
  onRetry: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return <SystemState tone="offline" icon={WifiOff} title={title} description={description} actionLabel={actionLabel} onRetry={onRetry} />;
}
