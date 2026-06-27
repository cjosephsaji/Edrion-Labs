'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { ApiClientError, usePreviewInstitutionUserAccess, type AccessPreviewDto } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

/** Shorten an `inst.x.y` permission key for the diff list. */
function permLabel(key: string): string {
  return key.replace(/^inst\./, '').replace(/\./g, ' · ').replace(/_/g, ' ');
}

function diff(before: string[], after: string[]) {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: after.filter((k) => !b.has(k)),
    removed: before.filter((k) => !a.has(k)),
  };
}

/**
 * Preview-before-confirm for any access change. On open it asks the API what the user's
 * effective access WOULD become (`/preview-access`), renders the added/removed permissions,
 * then commits the real change only after the operator confirms with a reason.
 */
export function AccessChangeDialog({
  userId,
  open,
  title,
  description,
  change,
  loading,
  error,
  confirmLabel = 'Apply change',
  onConfirm,
  onClose,
}: {
  userId: string;
  open: boolean;
  title: string;
  description?: string;
  /** Proposed change sent to the preview endpoint (roleKeys / campusAccess / overrides). */
  change: Record<string, unknown>;
  loading?: boolean;
  error?: string | null;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const preview = usePreviewInstitutionUserAccess(userId);
  const [data, setData] = useState<AccessPreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setPreviewError(null);
      return;
    }
    preview.mutate(change, {
      onSuccess: setData,
      onError: (e) =>
        setPreviewError(e instanceof ApiClientError ? e.message : 'Could not compute the access preview.'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(change)]);

  const permDiff = data ? diff(data.before.permissionKeys, data.after.permissionKeys) : null;
  const campusDelta = data ? data.after.campusCount - data.before.campusCount : 0;

  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      loading={loading}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="rounded-md border border-border bg-background-secondary p-3 text-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Resulting effective access
        </div>

        {preview.isPending && !data ? (
          <p className="text-text-muted">Computing impact…</p>
        ) : previewError ? (
          <p className="text-danger">{previewError}</p>
        ) : data && permDiff ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-text-secondary">
              <span>{data.before.permissionKeys.length} permissions</span>
              <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
              <span className="font-medium text-text-primary">{data.after.permissionKeys.length} permissions</span>
              {campusDelta !== 0 && (
                <span className="ml-2 text-text-muted">
                  · campuses {campusDelta > 0 ? `+${campusDelta}` : campusDelta}
                </span>
              )}
            </div>

            {permDiff.added.length === 0 && permDiff.removed.length === 0 ? (
              <p className="text-text-muted">No change to effective permissions.</p>
            ) : (
              <ul className="space-y-1">
                {permDiff.added.map((k) => (
                  <li key={`a-${k}`} className="flex items-center gap-1.5 text-success">
                    <Plus className="h-3.5 w-3.5 shrink-0" /> {permLabel(k)}
                  </li>
                ))}
                {permDiff.removed.map((k) => (
                  <li key={`r-${k}`} className="flex items-center gap-1.5 text-danger">
                    <Minus className="h-3.5 w-3.5 shrink-0" /> {permLabel(k)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
