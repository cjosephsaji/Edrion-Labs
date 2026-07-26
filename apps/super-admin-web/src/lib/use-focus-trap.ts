'use client';
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * a11y props for a clickable table row (or any non-button element that opens something on
 * click). Makes it keyboard-operable: focusable, announced as a button, and activated by
 * Enter/Space. Spread onto the `<tr>` alongside its `onClick`.
 */
export function rowActivation(onActivate: () => void, label?: string) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Modal accessibility for custom (non-Radix) dialogs/drawers: while `active`, Tab/Shift+Tab
 * cycle within the container (focus trap), focus that escapes is pulled back, and on close the
 * element that opened the modal regains focus (focus return). Pair with `role="dialog"` +
 * `aria-modal="true"` on the same element. Escape handling stays with the caller.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function focusable(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !container) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeEl = document.activeElement;
      if (!container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Return focus to the trigger so keyboard users are not dropped at the top of the page.
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
