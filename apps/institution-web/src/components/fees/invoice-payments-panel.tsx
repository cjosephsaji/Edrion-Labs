'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useInvoicePaymentMutations, useInvoicePayments } from '@/lib/fees';
import { PortalClientError } from '@/lib/portal-client';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];
const methodLabel = (v: string) => METHODS.find((m) => m.value === v)?.label ?? v;

/** Inline invoice payments — shown in the invoice detail popup. */
export function InvoicePaymentsPanel({
  invoiceId,
  invoiceNo,
  amount,
  amountPaid,
  balance,
}: {
  invoiceId: string;
  invoiceNo: string;
  amount: number;
  amountPaid: number;
  balance: number;
}) {
  const { can } = usePermissions();
  const canManage = can('fees.manage');
  const { data: payments, isLoading } = useInvoicePayments(invoiceId);
  const { record, remove } = useInvoicePaymentMutations(invoiceId);

  const [payAmount, setPayAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPayAmount('');
    setMethod('cash');
    setReference('');
    setPaidDate('');
  }

  async function add() {
    if (!payAmount) return;
    setError(null);
    try {
      await record.mutateAsync({
        amount: Number(payAmount),
        method,
        reference: reference || null,
        paidDate: paidDate || null,
      });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not record the payment.');
    }
  }

  async function drop(id: string) {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the payment.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Payments</h3>
      <p className="text-xs text-text-muted">Payments recorded against invoice {invoiceNo}.</p>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
        <div>
          <p className="text-xs text-text-muted">Billed</p>
          <p className="font-medium tabular-nums">{amount}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Paid</p>
          <p className="font-medium tabular-nums">{amountPaid}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Balance</p>
          <p className="font-medium tabular-nums">{balance}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" type="number" min={1} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-method">Method</Label>
              <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS} />
            </div>
            <div>
              <Label htmlFor="pay-date">Paid on</Label>
              <Input id="pay-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pay-ref">Reference</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <Button onClick={add} loading={record.isPending} disabled={!payAmount}>
            Record payment
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (payments ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">No payments recorded against this invoice yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(payments ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium tabular-nums text-text-primary">
                  {p.amount} · {methodLabel(p.method)}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {[p.paidDate, p.reference].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  aria-label="Remove payment"
                  onClick={() => drop(p.id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
