'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, StatusBadge, Badge, Button } from '@edrion/ui';
import {
  ApiClientError,
  useSubscriptionAction,
  type SubscriptionAddonDto,
  type SubscriptionDetailDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SubscriptionActions } from './subscription-actions';
import { formatMinor, formatBps } from '@/lib/format';

function date(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : '—';
}

export function SubscriptionDetailView({ sub, onChanged }: { sub: SubscriptionDetailDto; onChanged?: () => void }) {
  const action = useSubscriptionAction(sub.id);
  const [removing, setRemoving] = useState<SubscriptionAddonDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = sub.currency;
  const activeAddons = sub.addons.filter((a) => a.active);

  function runRemove(reason: string) {
    if (!removing) return;
    setError(null);
    action.mutate(
      { action: 'remove-addon', body: { addonId: removing.id, reason, version: sub.version } },
      {
        onSuccess: () => { setRemoving(null); onChanged?.(); },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not remove the add-on.'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <SubscriptionActions sub={sub} onChanged={onChanged} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Plan" value={`${sub.planName ?? '—'} v${sub.planVersionNumber ?? '?'}`} />
            <Row label="Cycle" value={sub.billingCycle} />
            <Row label="Base price" value={formatMinor(sub.basePriceMinor, cur)} />
            {sub.overridePriceMinor !== null && (
              <Row label="List price" value={formatMinor(sub.listPriceMinor, cur)} muted />
            )}
            <Row label="Per-campus" value={formatMinor(sub.perCampusPriceMinor, cur)} />
            <Row label="Discount" value={sub.discountBps > 0 ? formatBps(sub.discountBps) : '—'} />
            <Row label="Credit balance" value={formatMinor(sub.creditBalanceMinor, cur)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status" value={<StatusBadge status={sub.status} />} />
            <Row label="Period" value={`${date(sub.periodStart)} → ${date(sub.periodEnd)}`} />
            <Row label="Trial ends" value={date(sub.trialEndsAt)} />
            {sub.pausedAt && <Row label="Paused" value={date(sub.pausedAt)} />}
            {sub.cancelAt && <Row label="Cancels" value={date(sub.cancelAt)} />}
            {sub.gracePeriodEndsAt && <Row label="Grace ends" value={date(sub.gracePeriodEndsAt)} />}
            {sub.scheduledChangeAt && (
              <Row label="Scheduled change" value={date(sub.scheduledChangeAt)} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Usage &amp; campuses</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Campuses" value={`${sub.campusCount} (base ${sub.baseCampusAllowance ?? '—'})`} />
            <Row label="Overage policy" value={sub.overagePolicy} />
            {Object.keys(sub.usageLimits).length === 0 ? (
              <p className="text-text-muted">No usage limits set.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(sub.usageLimits).map(([k, n]) => (
                  <Badge key={k} tone="neutral">{k}: {n}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Add-ons</CardTitle></CardHeader>
        <CardContent>
          {activeAddons.length === 0 ? (
            <p className="text-sm text-text-muted">No active add-ons.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-2">Kind</th>
                  <th className="py-2">Campus</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit price</th>
                  <th className="py-2 text-right">Effective</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeAddons.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 capitalize">{a.kind}</td>
                    <td className="py-2 text-text-muted">{a.campusId ? a.campusId.slice(0, 8) : '—'}</td>
                    <td className="py-2 text-right tabular-nums">{a.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{formatMinor(a.unitPriceMinor, cur)}</td>
                    <td className="py-2 text-right text-text-muted">{date(a.effectiveDate)}</td>
                    <td className="py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => { setError(null); setRemoving(a); }}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove add-on?"
        description="The add-on is deactivated. This is logged to the audit trail."
        tone="danger"
        confirmLabel="Remove add-on"
        loading={action.isPending}
        error={error}
        onConfirm={runRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className={`capitalize ${muted ? 'text-text-muted' : 'text-text-primary'}`}>{value}</span>
    </div>
  );
}
