'use client';
import { useFeesSurface } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
}

export default function FeesPage() {
  const { data, isLoading } = useFeesSurface();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>SCHOOL</Eyebrow>} title="Fees" />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (data?.invoices ?? []).length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO RECORDS"
          title="No fee records"
          description="Invoices from your school will appear here when available."
        />
      ) : (
        <div className="mt-6 space-y-2">
          {(data?.invoices ?? []).map((inv) => (
            <div key={inv.invoiceNo} className="rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-st-ink">{inv.label}</p>
                  <p className="font-mono-ui text-xs text-st-faint">{inv.invoiceNo}</p>
                </div>
                <span className="text-sm font-semibold text-st-ink">
                  {formatMoney(inv.amountMinor, data?.currency ?? 'INR')}
                </span>
              </div>
              <p className="mt-2 text-xs text-st-muted">
                Paid {formatMoney(inv.paidMinor, data?.currency ?? 'INR')} · {inv.status}
                {inv.dueDate && ` · Due ${inv.dueDate}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
