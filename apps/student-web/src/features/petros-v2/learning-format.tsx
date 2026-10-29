import { forwardRef, type ReactNode } from 'react';
import {
  BookOpen,
  Calculator,
  Columns3,
  FlaskConical,
  Lightbulb,
  ListOrdered,
  Network,
  PencilLine,
  ChartNoAxesCombined,
} from 'lucide-react';
import type { LearningUIFamily } from '@edrion/schemas';
import styles from './learning-format.module.css';
import { LearningSurface } from './classic-learning';

const icons = {
  reading: BookOpen,
  equation: Calculator,
  relationships: Network,
  comparison: Columns3,
  graph: ChartNoAxesCombined,
  process: ListOrdered,
  experiment: FlaskConical,
  practice: PencilLine,
};
export const LearningCard = forwardRef<
  HTMLElement,
  {
    family: LearningUIFamily;
    title: string;
    badge?: string;
    children: ReactNode;
    className?: string;
    elementId?: string;
    feedback?: string;
    highlighted?: boolean;
  }
>(function LearningCard(
  { family, title, badge, children, className = '', elementId, feedback, highlighted },
  ref,
) {
  const Icon = icons[family];
  return (
    <LearningSurface
      ref={ref}
      className={`${styles.card} ${className}`}
      data-learning-format={family}
      data-canvas-element={elementId}
      id={elementId ? `learning-element-${elementId}` : undefined}
      data-feedback={feedback}
      data-highlighted={highlighted}
      label={title}
    >
      <header className={styles.cardHeading}>
        <span className={styles.formatIcon}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <h3>{title}</h3>
        {badge && <span className={styles.badge}>{badge}</span>}
      </header>
      {children}
    </LearningSurface>
  );
});
export function LearningIntro({
  objective,
  reason,
  instruction,
}: {
  objective: string;
  reason: string;
  instruction: string;
}) {
  return (
    <div className={styles.intro} data-learning-intro>
      <div className={styles.focus}>
        <BookOpen size={21} aria-hidden="true" />
        <div>
          <strong>What you’re exploring</strong>
          <p>{objective}</p>
        </div>
      </div>
      <div className={styles.introReason}>
        <Lightbulb size={20} aria-hidden="true" />
        <div>
          <strong>Why start here?</strong>
          <p>{reason}</p>
        </div>
      </div>
      <p className={styles.nextMove}>
        <strong>Your next move</strong>
        {instruction}
      </p>
    </div>
  );
}
export function LearningFacts({ values }: { values: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={styles.facts}>
      {values.map(({ label, value }, index) => (
        <div key={`${label}-${index}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function learningLabel(value: string) {
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
