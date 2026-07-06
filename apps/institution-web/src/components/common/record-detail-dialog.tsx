'use client';
import type { ReactNode } from 'react';
import { Pencil, X } from 'lucide-react';
import { Button, cn, Dialog, type DetailSection } from '@edrion/ui';

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === '';

/**
 * Centred read-only record popup — the default row-click inspector for every ResourceManager list.
 * Matches the student/user profile modal pattern (Dialog) instead of the older sliding drawer.
 */
export function RecordDetailDialog({
  open,
  onClose,
  title,
  description,
  header,
  sections,
  extra,
  headerActions,
  canEdit,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  header?: ReactNode;
  sections: DetailSection[];
  /** Rich content below the field sections (payments, submissions, workflow, etc.). */
  extra?: ReactNode;
  /** Extra header buttons beside Edit (publish, mark read, …). */
  headerActions?: ReactNode;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-3xl">
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5 pr-14">
          <div className="min-w-0 flex-1">
            <h2 className="text-md font-semibold text-text-primary">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
            {header && <div className="mt-3">{header}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {headerActions}
            {canEdit && onEdit && (
              <Button size="sm" variant="secondary" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-6">
            {sections.map((section, si) => (
              <section key={section.title ?? si}>
                {section.title && (
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{section.title}</h3>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {section.fields.map((f, fi) => (
                    <div key={f.label + fi} className={cn('min-w-0', f.full && 'col-span-2')}>
                      <dt className="text-xs text-text-muted">{f.label}</dt>
                      <dd className="mt-0.5 break-words text-sm text-text-primary">
                        {isEmpty(f.value) ? <span className="text-text-muted">—</span> : f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            {extra && <div className="border-t border-border pt-6">{extra}</div>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
