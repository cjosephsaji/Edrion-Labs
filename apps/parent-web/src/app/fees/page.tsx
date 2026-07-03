'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGet } from '@/lib/hooks';
import { api, money } from '@/lib/api';
import { Card, Pill, Skeleton, EmptyState, Section, Button, ErrorState } from '@/components/ui';

type Fees = {
  currency: string;
  totals: { outstandingMinor: number; bySource: Record<string, number> };
  invoices: Array<{ id: string; invoiceNo: string; source: string; amountMinor: number; balanceMinor: number; status: string }>;
};
const tone: Record<string, string> = { paid: 'good', pending: 'warn', partial: 'warn', overdue: 'bad', cancelled: 'neutral' };

export default function FeesPage() {
  const { data, isLoading, error } = useGet<Fees>('/fees');
  const qc = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return null;

  async function pay(id: string) {
    setPaying(id);
    try {
      await api.post(`/fees/invoices/${id}/payment-intents`, { provider: 'mock' }, `pay-${id}-${Date.now()}`);
      // Honest: never mark paid optimistically. The provider confirms out-of-band via webhook.
      setProcessing((s) => new Set(s).add(id));
      setTimeout(() => qc.invalidateQueries({ queryKey: ['/fees'] }), 1500);
    } finally {
      setPaying(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Fees</h1>
      <Card className="bg-brand/5 border-brand/30">
        <p className="text-xs text-muted">Total outstanding</p>
        <p className="text-3xl font-bold">{money(data.totals.outstandingMinor, data.currency)}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Object.entries(data.totals.bySource).map(([src, amt]) => (
            <Pill key={src} tone="brand">{src}: {money(amt, data.currency)}</Pill>
          ))}
        </div>
      </Card>

      <Section title="Invoices">
        {data.invoices.length ? data.invoices.map((inv) => (
          <Card key={inv.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-semibold">{inv.invoiceNo}</p><Pill tone="neutral">{inv.source}</Pill></div>
              <div className="text-right">
                <p className="font-bold">{money(inv.balanceMinor, data.currency)}</p>
                <Pill tone={tone[inv.status] ?? 'neutral'}>{inv.status}</Pill>
              </div>
            </div>
            {inv.balanceMinor > 0 && inv.status !== 'cancelled' && (
              processing.has(inv.id)
                ? <p className="text-xs text-warn font-medium">Payment initiated — awaiting confirmation…</p>
                : <Button disabled={paying === inv.id} onClick={() => pay(inv.id)}>{paying === inv.id ? 'Starting…' : `Pay ${money(inv.balanceMinor, data.currency)}`}</Button>
            )}
          </Card>
        )) : <EmptyState title="No fees due 🎉" />}
      </Section>
    </div>
  );
}
