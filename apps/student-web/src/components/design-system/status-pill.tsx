import styles from './primitives.module.css';

export type StatusTone = 'neutral' | 'info' | 'positive' | 'warning' | 'critical';

export function StatusPill({ label, tone = 'neutral', showDot = true }: { label: string; tone?: StatusTone; showDot?: boolean }) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {showDot ? <span className={styles.pillDot} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
