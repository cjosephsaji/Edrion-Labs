'use client';
import { CheckCircle2 } from 'lucide-react';
import type { CampusChargeBreakdownDto } from '@edrion/api-client';
import { formatMinor } from '@/lib/format';

/**
 * Renders the campus charge preview inside the confirm dialog, before any charge is created.
 * Mirrors the pure engine in @edrion/schemas (calculateCampusCharge): included-in-base →
 * no charge; otherwise list price → proration → discount → tax → next-invoice impact.
 */
export function CampusChargeBreakdown({ charge }: { charge: CampusChargeBreakdownDto }) {
  const { currency } = charge;

  if (charge.includedInBase) {
    return (
      <div className="rounded-md border border-success/40 bg-success-soft p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          Included in the base plan — no charge
        </div>
        <p className="mt-1 text-text-secondary">
          This campus fits inside the institution’s base allowance. It activates with no impact
          on the next invoice.
        </p>
      </div>
    );
  }

  const prorationPct = Math.round(charge.prorationFactor * 100);

  return (
    <div className="rounded-md border border-border bg-background-secondary p-3 text-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Charge for this campus
      </div>
      <dl className="space-y-1.5">
        <Line label="List price (full period)" value={formatMinor(charge.listPriceMinor, currency)} />
        <Line label={`Proration (${prorationPct}% of period)`} value={`× ${charge.prorationFactor.toFixed(3)}`} muted />
        {charge.discountMinor > 0 && (
          <Line label="Discount" value={`− ${formatMinor(charge.discountMinor, currency)}`} tone="success" />
        )}
        <Line label="Subtotal" value={formatMinor(charge.subtotalMinor, currency)} />
        {charge.taxMinor > 0 && <Line label="Tax" value={formatMinor(charge.taxMinor, currency)} />}
        <div className="my-1.5 border-t border-border" />
        <Line label="Total" value={formatMinor(charge.totalMinor, currency)} strong />
        <Line
          label="Impact on next invoice"
          value={`+ ${formatMinor(charge.nextInvoiceImpactMinor, currency)}`}
          tone="warning"
          strong
        />
        <Line
          label="Effective from"
          value={new Date(charge.effectiveDate).toLocaleDateString()}
          muted
        />
      </dl>
    </div>
  );
}

function Line({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: 'success' | 'warning';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : muted
          ? 'text-text-muted'
          : 'text-text-primary';
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`${valueClass} ${strong ? 'font-semibold' : ''} tabular-nums`}>{value}</dd>
    </div>
  );
}
