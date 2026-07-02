'use client';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from './cn';

export interface ComboboxOption {
  value: string;
  /** Primary display text — also the default search target. */
  label: string;
  /** Secondary muted text shown on the right (e.g. a code or offset). */
  hint?: string;
  /** Leading node (e.g. a flag or calling code). */
  leading?: ReactNode;
  /** Extra search terms beyond `label` (codes, cities, aliases). */
  keywords?: string[];
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  loading?: boolean;
  id?: string;
  name?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
  /** Optional custom trigger content (defaults to the selected option's label). */
  renderValue?: (option: ComboboxOption | undefined) => ReactNode;
}

const ITEM_H = 36; // px — keep in sync with the option row height below
const LIST_MAX_H = 288; // px (18rem)
const OVERSCAN = 6;

// Combining diacritical marks (U+0300–U+036F), stripped after NFD decomposition.
const COMBINING_MARKS = /[̀-ͯ]/g;

function normalize(s: string): string {
  // Case-insensitive + accent-insensitive matching for Unicode names.
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

/**
 * Searchable, keyboard-navigable, virtualized combobox. Renders its dropdown in a
 * body portal with fixed positioning so it is never clipped by `overflow-hidden`
 * drawers/dialogs or trapped behind overlays. Matches the Input/Select chrome.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results found',
  disabled,
  readOnly,
  invalid,
  loading,
  id,
  name,
  className,
  renderValue,
  ...aria
}: ComboboxProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => {
      if (normalize(o.label).includes(q)) return true;
      if (o.hint && normalize(o.hint).includes(q)) return true;
      if (o.value.toLowerCase().includes(q)) return true;
      return (o.keywords ?? []).some((k) => normalize(k).includes(q));
    });
  }, [options, query]);

  const interactive = !disabled && !readOnly;

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const flip = spaceBelow < LIST_MAX_H + 64 && r.top > spaceBelow;
    setRect({ top: flip ? r.top : r.bottom, left: r.left, width: r.width, flip });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  // Reset highlight to the selected (or first) item whenever the list changes.
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, filtered, value]);

  useEffect(() => {
    if (open) {
      // Focus the search box once the portal is mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery('');
    setScrollTop(0);
  }, [open]);

  // Close on outside pointer / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Keep the active option scrolled into view (also drives virtualization window).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const top = activeIndex * ITEM_H;
    const bottom = top + ITEM_H;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, open]);

  const choose = (opt: ComboboxOption | undefined) => {
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Virtualization window.
  const total = filtered.length;
  const start = Math.max(0, Math.floor(scrollTop / ITEM_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + LIST_MAX_H) / ITEM_H) + OVERSCAN);
  const slice = filtered.slice(start, end);
  const activeId = `${reactId}-opt-${activeIndex}`;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        aria-readonly={readOnly || undefined}
        onClick={() => interactive && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex h-input w-full items-center gap-2 rounded-md border bg-surface px-3 text-left text-sm',
          'transition-shadow duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          invalid ? 'border-danger focus-visible:border-danger' : 'border-border focus-visible:border-primary',
          (disabled || readOnly) && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-text-muted')}>
          {renderValue ? renderValue(selected) : selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>

      {open &&
        rect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: rect.flip ? undefined : rect.top + 4,
              bottom: rect.flip ? window.innerHeight - rect.top + 4 : undefined,
              left: rect.left,
              width: rect.width,
              zIndex: 1000,
            }}
            className="animate-fade-in-up overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded
                aria-controls={listboxId}
                aria-activedescendant={total > 0 ? activeId : undefined}
                aria-autocomplete="list"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setScrollTop(0);
                  if (listRef.current) listRef.current.scrollTop = 0;
                }}
                onKeyDown={onListKeyDown}
                placeholder={searchPlaceholder}
                className="h-10 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">Loading…</div>
            ) : total === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">{emptyText}</div>
            ) : (
              <div
                ref={listRef}
                id={listboxId}
                role="listbox"
                onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
                style={{ maxHeight: LIST_MAX_H }}
                className="overflow-y-auto overscroll-contain py-1"
              >
                <div style={{ height: total * ITEM_H, position: 'relative' }}>
                  {slice.map((opt, i) => {
                    const idx = start + i;
                    const isActive = idx === activeIndex;
                    const isSelected = opt.value === value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        id={`${reactId}-opt-${idx}`}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => choose(opt)}
                        style={{ position: 'absolute', top: idx * ITEM_H, height: ITEM_H, left: 0, right: 0 }}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 text-left text-sm transition-colors',
                          isActive ? 'bg-background-secondary' : 'hover:bg-background-secondary',
                        )}
                      >
                        {opt.leading}
                        <span className="min-w-0 flex-1 truncate text-text-primary">{opt.label}</span>
                        {opt.hint && <span className="shrink-0 text-xs text-text-muted">{opt.hint}</span>}
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
