'use client';

import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './primitives.module.css';

export function ActionButton({
  variant = 'primary',
  disabledReason,
  loading = false,
  loadingLabel,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  disabledReason?: string;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}) {
  const reasonId = useId();
  const disabled = Boolean(props.disabled || loading);
  const describedBy = disabled && disabledReason ? reasonId : props['aria-describedby'];

  const button = (
    <button
      type="button"
      className={`${styles.action} ${className}`}
      data-variant={variant}
      data-loading-indicator={loading || undefined}
      {...props}
      disabled={disabled}
      aria-busy={loading || props['aria-busy'] || undefined}
      aria-describedby={describedBy}
    >
      {loading ? <LoaderCircle className={styles.loadingIcon} aria-hidden="true" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );

  if (!disabled || !disabledReason) return button;

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
