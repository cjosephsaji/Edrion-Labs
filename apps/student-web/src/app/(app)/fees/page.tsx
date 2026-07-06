'use client';
import { useFeesSurface } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
}

export default function FeesPage() {
  const { data, isLoading } = useFeesSurface();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Fees</h1>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (
        <div className="mt-6 space-y-3">
          {(data?.invoices ?? []).map((inv) => (
            <Card key={inv.invoiceNo}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-st-ink">{inv.label}</p>
                  <p className="text-xs text-st-muted">{inv.invoiceNo}</p>
                </div>
                <span className="text-sm font-semibold text-st-ink">
                  {formatMoney(inv.amountMinor, data?.currency ?? 'INR')}
                </span>
              </div>
              <p className="mt-2 text-xs text-st-muted">
                Paid {formatMoney(inv.paidMinor, data?.currency ?? 'INR')} · {inv.status}
                {inv.dueDate && ` · Due ${inv.dueDate}`}
              </p>
            </Card>
          ))}
          {(data?.invoices ?? []).length === 0 && (
            <p className="text-sm text-st-muted">No fee records available.</p>
          )}
        </div>
      )}
    </div>
  );
}
