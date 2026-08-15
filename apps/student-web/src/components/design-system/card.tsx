import type { HTMLAttributes, ReactNode } from 'react';
import styles from './primitives.module.css';

type CardTag = 'article' | 'div' | 'section';
type CardVariant = 'default' | 'subtle' | 'emphasis' | 'urgent' | 'positive';
type CardDensity = 'compact' | 'default' | 'roomy';

export function Card({
  as: Tag = 'section',
  variant = 'default',
  density = 'default',
  interactive = false,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: CardTag;
  variant?: CardVariant;
  density?: CardDensity;
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <Tag
      className={`${styles.card} ${interactive ? styles.interactive : ''} ${className}`}
      data-density={density}
      data-variant={variant}
      {...props}
    >
      {children}
    </Tag>
  );
}
