'use client';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  ErrorState,
  PermissionDenied,
  Skeleton,
  StatCard,
  type BadgeTone,
  type Column,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useFormat } from '@/lib/format';
import {
  formatMoney,
  useBillingInvoices,
  useBillingPlans,
  useBillingSubscription,
  type BillingInvoice,
} from '@/lib/billing';

const SUB_STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  trial: 'info',
  trialing: 'info',
  past_due: 'warning',
  paused: 'warning',
  cancelled: 'danger',
  canceled: 'danger',
  expired: 'neutral',
};
const INVOICE_STATUS_TONE: Record<string, BadgeTone> = {
  paid: 'success',
  open: 'info',
  draft: 'neutral',
  void: 'neutral',
  uncollectible: 'danger',
  refunded: 'warning',
};

const cycleLabel = (c: string) => (c === 'annual' ? 'per year' : 'per month');

export default function BillingPage() {
  const { can } = usePermissions();
  const fmt = useFormat();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const subQ = useBillingSubscription();
  const invQ = useBillingInvoices(page, pageSize);
  const plansQ = useBillingPlans();

  const columns = useMemo<Column<BillingInvoice>[]>(
    () => [
      {
        key: 'number',
        header: 'Invoice',
        render: (r) => <span className="font-medium">{r.number ?? '—'}</span>,
      },
      {
        key: 'period',
        header: 'Period',
        render: (r) =>
          r.periodStart || r.periodEnd ? (
            <span className="text-text-secondary">
              {fmt.date(r.periodStart)} – {fmt.date(r.periodEnd)}
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      { key: 'issuedAt', header: 'Issued', render: (r) => <span className="text-text-secondary">{fmt.date(r.issuedAt)}</span> },
      { key: 'dueAt', header: 'Due', render: (r) => <span className="text-text-secondary">{fmt.date(r.dueAt)}</span> },
      {
        key: 'totalMinor',
        header: 'Total',
        align: 'right',
        render: (r) => <span className="tabular-nums">{formatMoney(r.totalMinor, r.currency)}</span>,
      },
      {
        key: 'amountDueMinor',
        header: 'Due',
        align: 'right',
        render: (r) => <span className="tabular-nums">{formatMoney(r.amountDueMinor, r.currency)}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <Badge tone={INVOICE_STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>,
      },
    ],
    [fmt],
  );

  if (!can('billing.view')) {
    return (
      <>
        <Topbar title="Billing" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to view billing." />
        </div>
      </>
    );
  }

  const sub = subQ.data?.subscription ?? null;
  const invoices = invQ.data?.items ?? [];
  const plans = plansQ.data?.plans ?? [];

  return (
    <>
      <Topbar title="Billing" />

      <div className="page-enter flex flex-1 flex-col gap-6 p-5">
        {/* Current subscription */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Current plan</h2>
          {subQ.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : subQ.isError ? (
            <ErrorState
              title="Couldn’t load billing"
              description="We couldn’t load your subscription."
              action={
                <Button size="sm" variant="secondary" onClick={() => subQ.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : !sub ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-text-muted">
                No active Edrion subscription is on file for this institution.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Plan"
                value={sub.plan.name}
                hint={<Badge tone={SUB_STATUS_TONE[sub.status] ?? 'neutral'}>{sub.status}</Badge>}
              />
              <StatCard
                label="Recurring"
                value={formatMoney(sub.priceMinor, sub.currency)}
                hint={cycleLabel(sub.billingCycle)}
              />
              <StatCard
                label="Current period"
                value={<span className="text-base">{fmt.date(sub.periodStart)} – {fmt.date(sub.periodEnd)}</span>}
                hint={sub.cancelAt ? `Cancels ${fmt.date(sub.cancelAt)}` : 'Renews automatically'}
              />
              <StatCard
                label={sub.trialEndsAt ? 'Trial ends' : 'Per extra campus'}
                value={
                  sub.trialEndsAt ? (
                    <span className="text-base">{fmt.date(sub.trialEndsAt)}</span>
                  ) : (
                    formatMoney(sub.perCampusPriceMinor, sub.currency)
                  )
                }
                hint={sub.trialEndsAt ? 'Trial period' : `${sub.baseCampusAllowance} campus included`}
              />
            </div>
          )}
        </section>

        {/* Invoice history */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Invoices</h2>
          <DataTable<BillingInvoice>
            columns={columns}
            rows={invoices}
            rowKey={(r) => r.id}
            loading={invQ.isLoading}
            page={page}
            pageSize={pageSize}
            total={invQ.data?.total ?? 0}
            onPageChange={setPage}
            emptyTitle="No invoices yet"
            emptyDescription="Edrion invoices to this institution will appear here."
          />
        </section>

        {/* Plan catalogue (read-only) */}
        {plans.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-primary">Available plans</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <Card key={p.key} className={sub?.plan.key === p.key ? 'border-primary' : undefined}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{p.name}</CardTitle>
                      {sub?.plan.key === p.key && <Badge tone="success">Current</Badge>}
                    </div>
                    {p.description && <CardDescription>{p.description}</CardDescription>}
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-text-primary tabular-nums">
                      {formatMoney(p.monthlyPriceMinor, p.currency)}
                      <span className="text-sm font-normal text-text-muted"> / month</span>
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      {formatMoney(p.annualPriceMinor, p.currency)} / year · {formatMoney(p.perCampusPriceMinor, p.currency)} per extra campus
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-text-muted">
              To change your plan, contact Edrion support. Self-service plan changes are coming soon.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
