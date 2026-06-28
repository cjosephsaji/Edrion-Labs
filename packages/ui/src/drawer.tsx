'use client';
import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { useFocusTrap } from './use-focus-trap';

/**
 * Right-side slide-over used for the portal's create/edit forms. Controlled (`open` + `onClose`).
 * Closes on Escape and on backdrop click; locks body scroll while open. Keep the content a plain
 * form — the drawer owns only the chrome (header, scroll area, optional footer).
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex h-full w-full max-w-md flex-col bg-surface-elevated shadow-xl animate-slide-in-right focus:outline-none sm:max-w-md',
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-md font-semibold text-text-primary">{title}</h2>
            {description && <p id={descId} className="mt-0.5 text-sm text-text-secondary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="border-t border-border p-4">{footer}</footer>}
      </div>
    </div>
  );
}
