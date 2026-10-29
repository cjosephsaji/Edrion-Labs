'use client';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import styles from './classic-studio.module.css';

/** Presentation only. Navigation and educational transitions remain with M4/M5. */
export function ClassicLessonLayout({
  companion,
  children,
  stage,
}: {
  companion: ReactNode;
  children: ReactNode;
  stage: string | number;
}) {
  return (
    <section
      id="learning-stage"
      tabIndex={-1}
      className={styles.surface}
      data-stage={stage}
      aria-label="Learning studio"
    >
      <div className={styles.companion} data-studio-companion>
        {companion}
      </div>
      <div className={styles.workspace}>{children}</div>
    </section>
  );
}

export function LessonHeading({
  context,
  title,
  objective,
}: {
  context?: string;
  title: string;
  objective?: string;
}) {
  return (
    <header className={styles.heading}>
      {context && context !== title && <p className={styles.context}>{context}</p>}
      <h1>{title}</h1>
      {objective && <p className={styles.objective}>{objective}</p>}
    </header>
  );
}

export function LearningStageIndicator({
  labels,
  current,
  label = 'Lesson progress',
}: {
  labels: readonly string[];
  current: number;
  label?: string;
}) {
  return (
    <ol className={styles.steps} aria-label={label}>
      {labels.map((text, index) => (
        <li
          key={text}
          aria-current={current === index ? 'step' : undefined}
          data-complete={current > index}
        >
          <span aria-hidden="true">{index + 1}</span>
          {text}
        </li>
      ))}
    </ol>
  );
}

export const LearningSurface = forwardRef<
  HTMLElement,
  {
    children: ReactNode;
    className?: string;
    label: string;
  } & HTMLAttributes<HTMLElement>
>(function LearningSurface({ children, className = '', label, ...props }, ref) {
  return (
    <section
      {...props}
      ref={ref}
      className={`${styles.learningSurface} ${className}`}
      aria-label={label}
    >
      {children}
    </section>
  );
});

export function PrimaryLearningAction({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${styles.primary} ${className}`} />;
}

export function LearningFeedback({
  kind,
  children,
  label,
  className = '',
}: {
  kind:
    | 'information'
    | 'accepted'
    | 'refused'
    | 'validation'
    | 'network'
    | 'saved'
    | 'pending'
    | 'review';
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role={kind === 'network' || kind === 'validation' ? 'alert' : 'status'}
      aria-label={label}
      aria-live="polite"
      aria-atomic="true"
      className={`${styles.feedback} ${className}`}
      data-learning-feedback={kind}
    >
      {children}
    </div>
  );
}
