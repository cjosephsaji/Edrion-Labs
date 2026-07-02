'use client';
import { forwardRef } from 'react';
import { cn } from './cn';

/**
 * The app's checkbox: a real <input type="checkbox"> (appearance-none, so it stays keyboard- and
 * screen-reader-accessible) styled as a rounded box that fills primary-green on check, with a
 * springy check-mark that pops in. The tick is a sibling <svg> animated via `peer-checked`.
 * Reduced-motion is honoured globally (transitions collapse to ~0ms in globals.css).
 */
export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border-2 border-border-strong bg-surface',
          'transition-[background-color,border-color,box-shadow] duration-150 ease-standard',
          'hover:border-primary/70',
          'checked:border-primary checked:bg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <svg
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 m-auto h-3 w-3 scale-50 text-primary-foreground opacity-0',
          'transition-[transform,opacity] duration-150 ease-[var(--ease-emphasized)]',
          'peer-checked:scale-100 peer-checked:opacity-100',
        )}
      >
        <path d="M3.5 8.4l3 3 6-6.6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ),
);
Checkbox.displayName = 'Checkbox';
