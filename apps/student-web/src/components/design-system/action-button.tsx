'use client';

import Link from 'next/link';
import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './primitives.module.css';

export function ActionButton({
  variant = 'primary',
  disabledReason,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  disabledReason?: string;
  children: ReactNode;
}) {
  const reasonId = useId();
  const describedBy = props.disabled && disabledReason ? reasonId : props['aria-describedby'];

  const button = (
    <button
      type="button"
      className={`${styles.action} ${className}`}
      data-variant={variant}
      {...props}
      aria-describedby={describedBy}
    >
      {children}
    </button>
  );

  if (!props.disabled || !disabledReason) return button;

  return (
    <span className={styles.actionWrap}>
      {button}
      <span className={styles.disabledReason} id={reasonId}>{disabledReason}</span>
    </span>
  );
}

export function ActionLink({
  href,
  variant = 'primary',
  className = '',
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${styles.action} ${className}`} data-variant={variant} {...props}>
      {children}
    </Link>
  );
}
