'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CheckCircle2, ReceiptText } from 'lucide-react';
import { QueryPage } from '@/components/query-page';
import { ActionButton, ActionLink, Card, PageHeader, StatusPill } from '@/components/design-system';
import { EmptyState } from '@/components/ui/states';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';

type Invoice = {
  id: string;
  label?: string | null;
  amountMinor?: number | null;
  amount?: number | null;
  dueDate?: string | null;
  currency?: string | null;
};

type FeesPayload = {
  items: Invoice[];
  balanceMinor?: number;
  currency?: string;
};

type Intent = {
  intentId: string;
  provider: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  checkout?: { keyId: string; mode?: 'mock' | 'razorpay' } | null;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function loadRazorpay() {
  if (window.Razorpay) return window.Razorpay;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay checkout.'));
    document.body.appendChild(script);
  });
  if (!window.Razorpay) throw new Error('Razorpay unavailable.');
  return window.Razorpay;
}

export default function PayFeesPage() {
  const api = useStudentApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fees = useQuery({
    queryKey: ['student', 'fees'],
    queryFn: () => api.get<FeesPayload>('/student/fees'),
  });

  const outstanding = useMemo(
    () => (fees.data?.items ?? []).filter((i) => (i.amountMinor ?? 0) > 0),
    [fees.data],
  );

  const amountMinor = useMemo(
    () =>
      outstanding
        .filter((i) => selected.includes(i.id))
        .reduce((sum, i) => sum + (i.amountMinor ?? 0), 0),
    [outstanding, selected],
  );

  const pay = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error('Select at least one invoice.');
      const intent = await api.post<Intent>(
        '/student/fees/intents',
        { amount_minor: amountMinor, invoice_ids: selected },
        { 'Idempotency-Key': newIdempotencyKey() },
      );

      if (intent.provider === 'mock' || intent.checkout?.mode === 'mock') {
        return api.post(`/student/fees/intents/${intent.intentId}/complete-mock`);
      }

      if (intent.provider === 'razorpay' || intent.checkout?.mode === 'razorpay') {
        const Razorpay = await loadRazorpay();
        const keyId = intent.checkout?.keyId;
        if (!keyId || !intent.providerRef) {
          throw new Error('Payment checkout is not configured.');
        }
        await new Promise<void>((resolve, reject) => {
          const checkout = new Razorpay({
            key: keyId,
            amount: intent.amountMinor,
            currency: intent.currency,
            order_id: intent.providerRef,
            name: 'Edrion Fees',
            description: 'Student fee payment',
            handler: async (response: {
              razorpay_payment_id: string;
              razorpay_order_id: string;
              razorpay_signature: string;
            }) => {
              try {
                await api.post(`/student/fees/intents/${intent.intentId}/confirm`, {
                  payment_id: response.razorpay_payment_id,
                  signature: response.razorpay_signature,
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
          });
          checkout.open();
        });
        return intent;
      }

      throw new Error(`Unsupported payment provider: ${intent.provider}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['student', 'fees'] });
      await qc.invalidateQueries({ queryKey: ['student', 'home'] });
      router.replace('/fees');
    },
    onError: (err) => setError(formatApiError(err)),
    onSettled: () => setBusy(false),
  });

  return (
    <QueryPage query={fees} loadingLabel="Loading invoices…">
      {() => (
        <div className="mx-auto w-full max-w-[1120px]">
          <PageHeader
            eyebrow="Fees · Secure payment"
            title="Pay fees"
            description="Select the invoices you want to pay. Your running total updates before checkout opens."
            actions={
              <ActionLink href="/fees" variant="secondary">Back to fees</ActionLink>
            }
          />

          {outstanding.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No outstanding invoices" description="Your account is settled. New invoices will appear here only after your institution publishes them." actionHref="/fees" actionLabel="View fee history" />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_.65fr]">
              <Card density="roomy">
                <div className="border-b border-[var(--s-divider)] pb-5">
                  <p className="text-xs uppercase tracking-[.1em] text-[var(--s-muted)]">Before you continue</p>
                  <h2 className="mt-2 text-2xl text-[var(--s-ink)]">Choose invoices</h2>
                  <p className="mt-2 max-w-[66ch] text-base leading-7 text-[var(--s-muted)]">Oldest outstanding invoices must be included when required by your institution’s policy. You can review the exact total before payment.</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <ActionButton
                    variant="secondary"
                    onClick={() => setSelected(outstanding.map((i) => i.id))}
                  >
                    Select all
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => setSelected([])} disabled={!selected.length} disabledReason={!selected.length ? 'No invoices are selected.' : undefined}>
                    Clear
                  </ActionButton>
                </div>
                <ul className="mt-4 space-y-3">
                  {outstanding.map((inv) => {
                    const checked = selected.includes(inv.id);
                    return (
                      <li key={inv.id}>
                        <label className={`flex min-h-[92px] cursor-pointer items-start gap-4 border p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${checked ? 'border-[var(--s-accent)] bg-[var(--s-accentSoft)]' : 'border-[var(--s-bd2)] bg-[var(--s-cardAlt)] hover:border-[var(--s-accent)]'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelected((prev) =>
                                e.target.checked
                                  ? [...prev, inv.id]
                                  : prev.filter((id) => id !== inv.id),
                              );
                            }}
                            className="mt-1 h-5 w-5 accent-[var(--s-accentDeep)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-start justify-between gap-3">
                            <span className="block text-base font-semibold text-[var(--s-ink)]">
                              {inv.label ?? 'Invoice'}
                            </span>
                            {checked ? <StatusPill label="Selected" tone="positive" /> : null}
                            </span>
                            <span className="mt-2 block text-sm text-[var(--s-muted)]">
                              {[
                                inv.amount != null
                                  ? `${inv.currency ?? fees.data?.currency ?? ''} ${inv.amount.toLocaleString()}`.trim()
                                  : '',
                                inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card variant={selected.length ? 'emphasis' : 'subtle'} density="roomy" className="lg:sticky lg:top-[108px]">
                <ReceiptText className="h-6 w-6 opacity-70" aria-hidden="true" />
                <p className="mt-6 text-xs uppercase tracking-[.1em] opacity-70">Payment total</p>
                <p className="mt-3 text-[clamp(2.5rem,5vw,4.5rem)] leading-none" aria-live="polite">
                  <span className="sr-only">Current total: </span>
                  {(fees.data?.currency ?? '')} {(amountMinor / 100).toLocaleString()}
                </p>
                <p className="mt-3 text-base leading-6 opacity-75">{selected.length ? `${selected.length} ${selected.length === 1 ? 'invoice' : 'invoices'} selected` : 'Select at least one invoice to continue.'}</p>
                {error ? <p className="mt-5 border border-[var(--s-danger)] bg-[var(--s-dangerSoft)] p-3 text-sm text-[var(--s-danger)]" role="alert">{error}</p> : null}
                <div className="mt-8">
                  <ActionButton
                    disabled={!selected.length || busy || pay.isPending}
                    disabledReason={!selected.length ? 'Select at least one invoice to continue.' : busy || pay.isPending ? 'Your payment request is being prepared.' : undefined}
                    loading={busy || pay.isPending}
                    loadingLabel="Processing…"
                    onClick={() => {
                      setError(null);
                      setBusy(true);
                      pay.mutate();
                    }}
                  >
                    Continue to payment
                  </ActionButton>
                </div>
                <p className="mt-5 text-sm leading-6 opacity-70">Checkout opens only after you confirm this selection. No amount is charged from this screen.</p>
              </Card>
            </div>
          )}
        </div>
      )}
    </QueryPage>
  );
}
