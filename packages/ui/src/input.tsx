'use client';
import { forwardRef } from 'react';
import { cn } from './cn';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-input w-full rounded-lg border border-border bg-surface-elevated px-3 text-sm text-text-primary shadow-xs',
        'placeholder:text-text-muted transition-[border-color,box-shadow,background-color] duration-100',
        'focus-visible:bg-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Label = forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('mb-1.5 block text-sm font-semibold text-text-primary', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export function FieldError({
  id,
  children,
  prominent,
  className,
}: {
  id?: string;
  children?: React.ReactNode;
  /** High-visibility banner for critical feedback (e.g. OTP / API errors). */
  prominent?: boolean;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        prominent
          ? 'rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-center text-sm font-semibold leading-snug text-danger'
          : 'mt-1.5 text-sm font-medium text-danger',
        prominent ? 'mt-3' : undefined,
        className,
      )}
    >
      {children}
    </p>
  );
}
