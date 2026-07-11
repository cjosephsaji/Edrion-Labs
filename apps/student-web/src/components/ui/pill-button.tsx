import type { ButtonHTMLAttributes, ReactNode } from 'react';

const variants = {
  primary:
    'bg-st-accent text-white hover:bg-st-accentDeep shadow-sm active:scale-[0.99]',
  ghost:
    'bg-transparent text-st-ink border border-st-bd1 hover:bg-st-accentSoft/40',
  soft: 'bg-st-accentSoft text-st-accentDeep hover:bg-st-accentSoft/80',
};

export function PillButton({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-[44px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
