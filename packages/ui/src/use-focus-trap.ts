'use client';
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessibility wiring shared by the modal primitives (Drawer, Dialog). While `open`:
 *  - moves focus into the container (first focusable, else the container itself),
 *  - traps Tab / Shift+Tab so keyboard focus can't escape the modal,
 *  - closes on Escape,
 *  - restores focus to the element that had it when the modal opened (so keyboard + screen-reader
 *    users return to where they were).
 *
 * Returns a ref to attach to the modal container.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the modal on open.
    const focusables = () => Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusables()[0];
    (first ?? container)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === container)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Restore focus to the trigger when the modal closes.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open, onClose]);

  return ref;
}
