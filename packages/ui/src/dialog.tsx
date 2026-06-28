'use client';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn';
import { Button } from './button';
import { useFocusTrap } from './use-focus-trap';

/** Centered modal dialog. Controlled. Closes on Escape + backdrop click. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-md rounded-lg border border-border bg-surface-elevated shadow-xl animate-fade-in-up focus:outline-none',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for destructive / irreversible actions (delete a class, a subject, …).
 * The confirm button defaults to the danger variant; pass `loading` while the mutation runs.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  loading,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-md font-semibold text-text-primary">{title}</h2>
            {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
