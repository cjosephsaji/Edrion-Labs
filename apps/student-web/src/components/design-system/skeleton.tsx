import styles from './primitives.module.css';

export function Skeleton({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}

export function CardSkeleton({ label = 'Loading content' }: { label?: string }) {
  return (
    <section className={styles.skeletonCard} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.srOnly}>{label}</span>
      <Skeleton width="32%" height={12} />
      <Skeleton width="58%" height={32} />
      <div className={styles.skeletonRow}>
        <Skeleton width={56} height={56} />
        <div className={styles.skeletonStack}>
          <Skeleton width="84%" height={16} />
          <Skeleton width="64%" height={16} />
        </div>
      </div>
      <Skeleton width="100%" height={72} />
    </section>
  );
}
