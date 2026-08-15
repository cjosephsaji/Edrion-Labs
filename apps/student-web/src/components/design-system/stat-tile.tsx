import styles from './primitives.module.css';

type StatTone = 'neutral' | 'positive' | 'warning' | 'critical';
type StatProminence = 'primary' | 'secondary' | 'quiet';

export function StatTile({
  label,
  value,
  supporting,
  tone = 'neutral',
  prominence = 'secondary',
}: {
  label: string;
  value: string;
  supporting: string;
  tone?: StatTone;
  prominence?: StatProminence;
}) {
  return (
    <article className={styles.statTile} data-tone={tone} data-prominence={prominence}>
      <div>
        <span className={styles.statLabel}>{label}</span>
        <strong className={styles.statValue}>{value}</strong>
      </div>
      <p className={styles.statSupporting}>{supporting}</p>
    </article>
  );
}
