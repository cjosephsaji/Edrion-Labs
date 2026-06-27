'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { StatusBadge } from '@edrion/ui';
import { useAuditEvent } from '@edrion/api-client';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { StateDiff } from './state-diff';

/** Right-side drawer: full audit event + before/after diff. */
export function AuditDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useAuditEvent(id ?? '', !!id);
  const drawerRef = useFocusTrap<HTMLElement>(!!id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (id) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  if (!id) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-drawer-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-surface-elevated shadow-lg animate-slide-in-right"
      >
        <header className="flex items-center justify-between border-b border-border p-4">
          <h2 id="audit-drawer-title" className="text-md font-semibold text-text-primary">Audit event</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : isError || !data ? (
            <p className="text-sm text-danger">Could not load this event.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-text-primary">{data.action}</span>
                <StatusBadge status={data.result} />
                <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-text-muted">
                  {data.riskLevel}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Meta label="When" value={new Date(data.occurredAt).toLocaleString()} />
                <Meta label="Module" value={data.module} />
                <Meta label="Actor" value={data.actorName ?? data.actorType} />
                <Meta label="Actor role" value={data.actorRole ?? '—'} />
                <Meta label="Institution" value={data.institutionName ?? '—'} />
                <Meta label="Entity" value={data.entityType ? `${data.entityType} ${data.entityId ?? ''}` : '—'} />
                <Meta label="Support session" value={data.supportSessionId ?? '—'} />
                <Meta label="Case ref" value={data.caseRef ?? '—'} />
                <Meta label="IP" value={data.ip ?? '—'} />
                <Meta label="Correlation" value={data.correlationId ?? '—'} />
              </dl>

              {data.reason && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Reason</div>
                  <p className="rounded-md border border-border bg-surface p-3 text-sm text-text-secondary">{data.reason}</p>
                </div>
              )}

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Before / after
                </div>
                <StateDiff before={data.previousState} after={data.newState} />
              </div>

              {data.errorDetail && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Error detail</div>
                  <p className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger">{data.errorDetail}</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="truncate text-text-primary">{value}</dd>
    </div>
  );
}
