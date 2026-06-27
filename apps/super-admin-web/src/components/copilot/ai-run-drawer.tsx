'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useRun } from '@edrion/api-client';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { ToolCallCard } from './tool-call-card';

/** Right-side drawer: full AI run — prompt, context, prepared actions, confirmation, audit links. */
export function AiRunDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useRun(id ?? '', !!id);
  const drawerRef = useFocusTrap<HTMLElement>(!!id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (id) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  if (!id) return null;
  const run = data?.run;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-run-drawer-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface-elevated shadow-lg animate-slide-in-right"
      >
        <header className="flex items-center justify-between border-b border-border p-4">
          <h2 id="ai-run-drawer-title" className="text-md font-semibold text-text-primary">AI run</h2>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : isError || !data || !run ? (
            <p className="text-sm text-danger">Could not load this run.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Meta label="Employee" value={run.employeeName ?? run.employeeId} />
                <Meta label="Status" value={run.status.replace(/_/g, ' ')} />
                <Meta label="Risk" value={run.riskLevel ?? '—'} />
                <Meta label="Model" value={run.model} />
                <Meta label="Prompt version" value={run.promptVersion ?? '—'} />
                <Meta label="Duration" value={run.durationMs != null ? `${run.durationMs} ms` : '—'} />
                <Meta label="Tokens" value={run.inputTokens != null ? `${run.inputTokens}/${run.outputTokens}` : '—'} />
                <Meta label="Started" value={new Date(run.startedAt).toLocaleString()} />
                <Meta label="Context sources" value={(run.contextSources ?? []).join(', ') || '—'} />
              </dl>

              <Section title="Prompt">
                <p className="rounded-md border border-border bg-background-secondary p-3 text-sm text-text-secondary">{run.prompt}</p>
              </Section>

              <Section title={`Prepared actions (${data.toolCalls.length})`}>
                <div className="space-y-2">
                  {data.toolCalls.map((t) => (
                    <ToolCallCard key={t.id} call={t} />
                  ))}
                </div>
              </Section>

              {data.confirmations.length > 0 && (
                <Section title="Confirmation">
                  {data.confirmations.map((c) => (
                    <p key={c.id} className="text-xs text-text-secondary">
                      {c.employeeName ?? c.employeeId} · {c.method} · {new Date(c.createdAt).toLocaleString()}
                      {c.reason ? ` — ${c.reason}` : ''}
                    </p>
                  ))}
                </Section>
              )}

              {data.approvals.length > 0 && (
                <Section title="Second-approver sign-off">
                  {data.approvals.map((a) => (
                    <p key={a.id} className="text-xs text-text-secondary">
                      {a.approverName ?? a.approverId} · {a.approved ? 'approved' : 'rejected'} · {new Date(a.createdAt).toLocaleString()}
                    </p>
                  ))}
                </Section>
              )}

              <Section title={`Linked audit events (${data.auditEvents.length})`}>
                {data.auditEvents.length === 0 ? (
                  <p className="text-xs text-text-muted">No audit events yet.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {data.auditEvents.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 border-b border-border pb-1">
                        <span className="font-mono text-text-primary">{e.action}</span>
                        <span className="text-text-muted">
                          {e.aiInvolved ? 'AI · ' : ''}
                          {new Date(e.occurredAt).toLocaleTimeString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
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
      <dd className="capitalize text-text-primary">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  );
}
