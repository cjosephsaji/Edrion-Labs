'use client';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import type { PlanChangeProrationDto } from '@edrion/api-client';
import { formatMinor } from '@/lib/format';

/**
 * Renders a plan/cycle-change proration preview before commit: credit for the unused remainder
 * of the current plan, prorated charge for the new plan, and the net next-invoice impact (a
 * downgrade nets to a credit). Mirrors calculatePlanChangeProration in @edrion/schemas.
 */
export function ProrationBreakdown({ proration }: { proration: PlanChangeProrationDto }) {
  const { currency, isCredit } = proration;
  const pct = Math.round(proration.prorationFactor * 100);

  return (
    <div className="rounded-md border border-border bg-background-secondary p-3 text-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Proration ({pct}% of period remaining)
      </div>
      <dl className="space-y-1.5">
        <Line label="Credit for unused current plan" value={`− ${formatMinor(proration.creditUnusedMinor, currency)}`} tone="success" />
        <Line label="Charge for new plan (prorated)" value={`+ ${formatMinor(proration.chargeNewMinor, currency)}`} />
        <Line label="Subtotal" value={formatMinor(proration.subtotalMinor, currency)} />
        {proration.taxMinor > 0 && <Line label="Tax" value={formatMinor(proration.taxMinor, currency)} />}
        <div className="my-1.5 border-t border-border" />
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-1.5 font-medium text-text-primary">
            {isCredit ? (
              <ArrowDownCircle className="h-4 w-4 text-success" />
            ) : (
              <ArrowUpCircle className="h-4 w-4 text-warning" />
            )}
            {isCredit ? 'Net credit to account' : 'Next-invoice impact'}
          </dt>
          <dd className={`font-semibold tabular-nums ${isCredit ? 'text-success' : 'text-warning'}`}>
            {isCredit
              ? formatMinor(Math.abs(proration.totalMinor), currency)
              : `+ ${formatMinor(proration.totalMinor, currency)}`}
          </dd>
        </div>
        <Line label="Effective from" value={new Date(proration.effectiveDate).toLocaleDateString()} muted />
      </dl>
    </div>
  );
}

function Line({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: 'success';
}) {
  const cls = tone === 'success' ? 'text-success' : muted ? 'text-text-muted' : 'text-text-primary';
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`${cls} tabular-nums`}>{value}</dd>
    </div>
  );
}
