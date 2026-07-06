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

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-danger">
      {children}
    </p>
  );
}
