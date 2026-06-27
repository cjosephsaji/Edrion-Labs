'use client';
import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * The one Button. Variants map to design tokens (no hardcoded colours). Fast interaction:
 * transitions are ~100ms and limited to colour/opacity/transform.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-[background-color,color,box-shadow,transform] duration-100 ease-standard ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
    'focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 ' +
    'active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs',
        secondary:
          'bg-surface-elevated text-text-primary border border-border hover:bg-background-secondary',
        ghost: 'text-text-secondary hover:bg-background-secondary hover:text-text-primary',
        danger: 'bg-danger text-white hover:opacity-90 shadow-xs',
        outline: 'border border-border-strong text-text-primary hover:bg-background-secondary',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-input px-4',
        lg: 'h-11 px-6 text-md',
        icon: 'h-input w-input p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
