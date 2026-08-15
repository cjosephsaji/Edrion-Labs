import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './primitives.module.css';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <section className={styles.emptyState}>
      <div className={styles.stateInner}>
        <span className={styles.stateIcon} aria-hidden="true"><Icon /></span>
        <h2 className={styles.stateTitle}>{title}</h2>
        <p className={styles.stateDescription}>{description}</p>
        <div className={styles.stateAction}>{action}</div>
      </div>
    </section>
  );
}
