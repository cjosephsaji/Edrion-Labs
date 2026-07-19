'use client';
import { forwardRef, useCallback } from 'react';
import { Combobox } from './combobox';
import { cn } from './cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  options: SelectOption[];
  /** Shown when the value is empty and no matching option is selected. */
  placeholder?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  searchPlaceholder?: string;
  emptyText?: string;
}

function syntheticChange(value: string, name?: string): React.ChangeEvent<HTMLSelectElement> {
  const target = { value, name: name ?? '' } as HTMLSelectElement;
  return { target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>;
}

/** Searchable select — wraps {@link Combobox} with a native-select-compatible API. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      options,
      placeholder,
      value,
      onChange,
      disabled,
      id,
      name,
      required,
      searchPlaceholder,
      emptyText,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
    },
    ref,
  ) => {
    const handleChange = useCallback(
      (next: string) => {
        onChange?.(syntheticChange(next, name));
      },
      [onChange, name],
    );

    return (
      <>
        {name ? (
          <input
            type="text"
            name={name}
            value={value ?? ''}
            required={required}
            tabIndex={-1}
            aria-hidden
            readOnly
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        ) : null}
        <Combobox
          ref={ref}
          id={id}
          options={options}
          value={value ?? ''}
          onChange={handleChange}
          placeholder={placeholder ?? 'Select…'}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          disabled={disabled}
          className={cn(className)}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
        />
      </>
    );
  },
);
Select.displayName = 'Select';
