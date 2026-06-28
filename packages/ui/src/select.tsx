'use client';
import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  /** Shown as a disabled leading option when the value is empty (acts as a label). */
  placeholder?: string;
}

/** Styled native <select> — accessible, zero-dependency, matches the Input chrome. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-input w-full appearance-none rounded-md border border-border bg-surface px-3 pr-9 text-sm text-text-primary',
          'transition-shadow duration-100 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="">{placeholder}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
    </div>
  ),
);
Select.displayName = 'Select';
