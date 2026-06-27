'use client';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, StatCard, StatusBadge, EmptyState } from '@edrion/ui';
import {
  ApiClientError,
  useBillingSummary,
  useCreateInvoice,
  useCredits,
  useEntitlements,
  useInvoiceAction,
  useInvoices,
  useIssueCredit,
  useRecordPayment,
  useSubscriptionByInstitution,
  type InvoiceDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatMinor } from '@/lib/format';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

type Active =
  | { kind: 'create-invoice' }
  | { kind: 'finalize'; invoice: InvoiceDto }
  | { kind: 'pay'; invoice: InvoiceDto }
  | { kind: 'void'; invoice: InvoiceDto }
  | { kind: 'dunning'; invoice: InvoiceDto }
  | { kind: 'issue-credit' }
  | null;

export function BillingTab({ institutionId }: { institutionId: string }) {
  const summary = useBillingSummary(institutionId);
  const entitlements = useEntitlements(institutionId);
  const sub = useSubscriptionByInstitution(institutionId);
  const invoices = useInvoices({ institutionId, pageSize: 50 });
  const credits = useCredits({ institutionId, pageSize: 20 });

  const createInvoice = useCreateInvoice();
  const issueCredit = useIssueCredit();
  const recordPayment = useRecordPayment();

  const [active, setActive] = useState<Active>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const invoiceAction = useInvoiceAction(active && 'invoice' in active ? active.invoice.id : '');

  function open(a: Active) { setForm({}); setError(null); setActive(a); }
  function close() { setActive(null); }

  function confirm(reason: string) {
    if (!active) return;
    setError(null);
    const onErr = (e: unknown) => setError(e instanceof ApiClientError ? e.message : 'Action failed.');
    const done = () => { close(); };

    switch (active.kind) {
      case 'create-invoice': {
        if (!sub.data) return setError('This institution has no subscription to invoice.');
        const taxRateBps = form.taxPct ? Math.round(Number(form.taxPct) * 100) : undefined;
        const discountBps = form.discountPct ? Math.round(Number(form.discountPct) * 100) : undefined;
        return createInvoice.mutate({ subscriptionId: sub.data.id, taxRateBps, discountBps }, { onSuccess: done, onError: onErr });
      }
      case 'finalize':
        return invoiceAction.mutate({ action: 'finalize', body: {} }, { onSuccess: done, onError: onErr });
      case 'void':
        return invoiceAction.mutate({ action: 'void', body: { reason, version: active.invoice.version } }, { onSuccess: done, onError: onErr });
      case 'dunning':
        return invoiceAction.mutate({ action: 'dunning', body: { dunningState: form.dunningState || 'reminder', reason, version: active.invoice.version } }, { onSuccess: done, onError: onErr });
      case 'pay':
        return recordPayment.mutate(
          { invoiceId: active.invoice.id, institutionId, amountMinor: active.invoice.amountDueMinor, method: form.method || 'card', succeeded: form.fail !== 'yes', failureReason: form.fail === 'yes' ? 'smoke decline' : undefined },
          { onSuccess: done, onError: onErr },
        );
      case 'issue-credit': {
        const amountMinor = Math.round(Number(form.amount || '0') * 100);
        if (!amountMinor || amountMinor <= 0) return setError('Enter a positive amount.');
        return issueCredit.mutate({ institutionId, amountMinor, reason, source: form.source || 'manual' }, { onSuccess: done, onError: onErr });
      }
    }
  }

  const busy = createInvoice.isPending || issueCredit.isPending || recordPayment.isPending || invoiceAction.isPending;
  const s = summary.data;
  const ent = entitlements.data;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Outstanding" value={s ? formatMinor(s.outstandingMinor) : '—'} />
        <StatCard label="Paid" value={s ? formatMinor(s.paidMinor) : '—'} />
        <StatCard label="Credit balance" value={s ? formatMinor(s.creditBalanceMinor) : '—'} />
        <StatCard label="Open invoices" value={s?.openCount ?? 0} />
      </div>

      {/* Entitlements */}
      <Card>
        <CardHeader><CardTitle>Plan entitlements</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {entitlements.isError || !ent ? (
            <p className="text-text-muted">No subscription to resolve entitlements from.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-text-secondary">{ent.planName} v{ent.planVersion}</span>
                <Badge tone="info">{ent.supportTier}</Badge>
                <span className="text-text-muted">campuses {ent.campusCount}/{ent.baseCampusAllowance} base</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ent.features).filter(([, on]) => on).map(([k]) => <Badge key={k} tone="success">{k}</Badge>)}
                {Object.entries(ent.usageLimits).map(([k, n]) => <Badge key={k} tone="neutral">{k}: {n}</Badge>)}
                {Object.keys(ent.features).length === 0 && Object.keys(ent.usageLimits).length === 0 && (
                  <span className="text-text-muted">No features or usage limits set on this plan.</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Invoices</CardTitle>
          <Button size="sm" disabled={!sub.data} onClick={() => open({ kind: 'create-invoice' })}>Create invoice</Button>
        </CardHeader>
        <CardContent>
          {invoices.isLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : !invoices.data || invoices.data.items.length === 0 ? (
            <EmptyState title="No invoices" description={sub.data ? 'Create the first invoice from the subscription.' : 'No subscription to invoice.'} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-2">Number</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Due</th>
                  <th className="py-2">Dunning</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.data.items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2 font-medium text-text-primary">{inv.number ?? 'draft'}</td>
                    <td className="py-2"><StatusBadge status={inv.status} /></td>
                    <td className="py-2 text-right tabular-nums">{formatMinor(inv.totalMinor, inv.currency)}</td>
                    <td className="py-2 text-right tabular-nums">{formatMinor(inv.amountDueMinor, inv.currency)}</td>
                    <td className="py-2 text-text-muted">{inv.dunningState !== 'none' ? inv.dunningState.replace(/_/g, ' ') : '—'}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1.5">
                        {inv.status === 'draft' && <Mini onClick={() => open({ kind: 'finalize', invoice: inv })} label="Finalize" />}
                        {inv.status === 'open' && <Mini onClick={() => open({ kind: 'pay', invoice: inv })} label="Pay" />}
                        {inv.status === 'open' && <Mini onClick={() => open({ kind: 'dunning', invoice: inv })} label="Dunning" />}
                        {inv.status !== 'paid' && inv.status !== 'void' && <Mini onClick={() => open({ kind: 'void', invoice: inv })} label="Void" tone="danger" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Credits */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Credits</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => open({ kind: 'issue-credit' })}>Issue credit</Button>
        </CardHeader>
        <CardContent>
          {!credits.data || credits.data.items.length === 0 ? (
            <p className="text-sm text-text-muted">No credits issued.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {credits.data.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span className="text-text-secondary">{c.reason ?? c.source}</span>
                  <span className="tabular-nums text-text-primary">{formatMinor(c.remainingMinor, c.currency)} / {formatMinor(c.amountMinor, c.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(active)}
        title={dialogTitle(active)}
        description="Financial actions are replay-protected and logged to the audit trail."
        tone={active?.kind === 'void' ? 'danger' : 'primary'}
        requireReason={active?.kind === 'void' || active?.kind === 'dunning' || active?.kind === 'issue-credit'}
        confirmLabel={dialogConfirm(active)}
        loading={busy}
        error={error}
        onConfirm={confirm}
        onClose={close}
      >
        {active?.kind === 'create-invoice' && (
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="Tax rate (%)"><input type="number" min={0} step="0.01" value={form.taxPct ?? ''} onChange={(e) => set('taxPct', e.target.value)} placeholder="0" className={fieldClass} /></Labelled>
            <Labelled label="Discount (%)"><input type="number" min={0} step="0.01" value={form.discountPct ?? ''} onChange={(e) => set('discountPct', e.target.value)} placeholder="from subscription" className={fieldClass} /></Labelled>
          </div>
        )}
        {active?.kind === 'pay' && (
          <div className="space-y-2 text-sm">
            <p className="text-text-secondary">Recording a {formatMinor(active.invoice.amountDueMinor, active.invoice.currency)} payment.</p>
            <Labelled label="Method"><input value={form.method ?? 'card'} onChange={(e) => set('method', e.target.value)} className={fieldClass} /></Labelled>
            <label className="flex items-center gap-2 text-text-secondary"><input type="checkbox" checked={form.fail === 'yes'} onChange={(e) => set('fail', e.target.checked ? 'yes' : '')} /> Simulate a failed payment</label>
          </div>
        )}
        {active?.kind === 'dunning' && (
          <Labelled label="Dunning state">
            <select value={form.dunningState ?? 'reminder'} onChange={(e) => set('dunningState', e.target.value)} className={fieldClass}>
              {['reminder', 'overdue', 'final_notice', 'written_off'].map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </Labelled>
        )}
        {active?.kind === 'issue-credit' && (
          <Labelled label="Amount"><input type="number" min={0} step="0.01" value={form.amount ?? ''} onChange={(e) => set('amount', e.target.value)} placeholder="50.00" className={fieldClass} /></Labelled>
        )}
      </ConfirmDialog>
    </div>
  );
}

function dialogTitle(a: Active): string {
  switch (a?.kind) {
    case 'create-invoice': return 'Create invoice';
    case 'finalize': return `Finalize ${a.invoice.number ?? 'invoice'}?`;
    case 'pay': return 'Record payment';
    case 'void': return `Void ${a.invoice.number ?? 'invoice'}?`;
    case 'dunning': return 'Advance dunning';
    case 'issue-credit': return 'Issue credit';
    default: return '';
  }
}
function dialogConfirm(a: Active): string {
  switch (a?.kind) {
    case 'create-invoice': return 'Create draft';
    case 'finalize': return 'Finalize';
    case 'pay': return 'Record payment';
    case 'void': return 'Void invoice';
    case 'dunning': return 'Advance';
    case 'issue-credit': return 'Issue credit';
    default: return 'Confirm';
  }
}

function Mini({ onClick, label, tone }: { onClick: () => void; label: string; tone?: 'danger' }) {
  return <Button variant={tone === 'danger' ? 'outline' : 'secondary'} size="sm" onClick={onClick}>{label}</Button>;
}
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-medium text-text-secondary">{label}</label>{children}</div>;
}
