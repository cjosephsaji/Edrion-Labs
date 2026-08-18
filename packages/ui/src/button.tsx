'use client';
import { Children, forwardRef, isValidElement } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * The one Button. Variants map to design tokens (no hardcoded colours). Fast interaction:
 * transitions are ~100ms and limited to colour/opacity/transform.
 */
const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ' +
    'transition-[background-color,color,box-shadow,transform] duration-100 ease-standard ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
    'focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 ' +
    'active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md',
        secondary:
          'bg-surface-elevated text-text-primary border border-border shadow-xs hover:border-border-strong hover:bg-surface',
        ghost: 'text-text-secondary hover:bg-primary-soft hover:text-primary',
        danger: 'bg-danger text-white shadow-sm hover:opacity-90 hover:shadow-md',
        outline: 'border border-border-strong bg-surface/70 text-text-primary hover:bg-background-secondary hover:shadow-xs',
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

function isButtonIcon(child: React.ReactNode): boolean {
  if (!isValidElement<{ className?: unknown }>(child)) return false;
  const className = child.props.className;
  return typeof className === 'string' && /\bh-\S+\b/.test(className) && /\bw-\S+\b/.test(className);
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
      {loading ? Children.map(children, (child) => (isButtonIcon(child) ? null : child)) : children}
    </button>
  ),
);
Button.displayName = 'Button';
