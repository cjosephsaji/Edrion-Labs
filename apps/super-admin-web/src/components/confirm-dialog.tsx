'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button, Label, FieldError, cn } from '@edrion/ui';
import { useFocusTrap } from '@/lib/use-focus-trap';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** When true, a typed reason is required and passed to onConfirm. */
  requireReason?: boolean;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  /** Extra content (impact preview, billing summary) shown above the reason field. */
  children?: React.ReactNode;
}

/**
 * Accessible confirmation for sensitive/irreversible actions. Not a browser confirm(). Holds
 * a required reason that flows into the audit event. Closes on Escape / backdrop click.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  requireReason = true,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
  error,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  // Portal target is only available on the client; render after mount.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;
  const reasonInvalid = requireReason && reason.trim().length < 5;

  // Portal to <body> so the fixed overlay centres on the viewport — a backdrop-filter
  // ancestor (e.g. the topbar) would otherwise become its containing block and offset it.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden />
      <div className="flex min-h-full items-center justify-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative flex w-full max-w-md max-h-[min(85dvh,calc(100dvh-2rem))] flex-col rounded-lg border border-border bg-surface-elevated shadow-lg animate-fade-in-up"
      >
        <div className="flex shrink-0 items-start gap-3 p-5">
          <span
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary',
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-md font-semibold text-text-primary">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {(children || requireReason) && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-2">
            {children}
            {requireReason && (
              <div>
                <Label htmlFor="confirm-reason">Reason (recorded in the audit log)</Label>
                <textarea
                  id="confirm-reason"
                  ref={ref}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => setTouched(true)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  placeholder="Why are you taking this action?"
                />
                {touched && reasonInvalid && <FieldError>Provide a reason (min 5 characters).</FieldError>}
              </div>
            )}
            {error && <FieldError>{error}</FieldError>}
          </div>
        )}

        <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            disabled={reasonInvalid}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
