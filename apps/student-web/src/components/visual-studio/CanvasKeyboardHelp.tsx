'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { CANVAS_KEYBOARD_HELP } from '@/lib/visual-studio/node-navigation';

type CanvasKeyboardHelpProps = {
  open: boolean;
  onClose: () => void;
};

export function CanvasKeyboardHelp({ open, onClose }: CanvasKeyboardHelpProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-st-ink/35 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        tabIndex={-1}
        aria-labelledby="canvas-keyboard-help-title"
        className="thinking-canvas__panel w-full max-w-md rounded-2xl border border-st-bd1 bg-st-page p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="canvas-keyboard-help-title" className="font-display text-lg font-semibold text-st-ink">
            Keyboard help
          </h2>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-st-bd1"
            aria-label="Close keyboard help"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-st-muted">{CANVAS_KEYBOARD_HELP}</p>
      </div>
    </div>
  );
}

export function CanvasKeyboardInstructions() {
  return (
    <p id="thinking-canvas-instructions" className="sr-only">
      {CANVAS_KEYBOARD_HELP}
    </p>
  );
}
