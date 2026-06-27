'use client';
import Link from 'next/link';
import {
  StatCard,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from '@edrion/ui';
import { useDashboard, usePendingActions } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { formatMinor } from '@/lib/format';

const PRIORITY_META: { key: string; label: string; tone: string }[] = [
  { key: 'critical', label: 'Critical', tone: 'text-danger' },
  { key: 'today', label: 'Today', tone: 'text-warning' },
  { key: 'upcoming', label: 'Upcoming', tone: 'text-primary' },
  { key: 'informational', label: 'Informational', tone: 'text-text-muted' },
];

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const pending = usePendingActions();

  const inst = data?.institutions ?? {};
  const subs = data?.subscriptions ?? {};
  const instTotal = Object.values(inst).reduce((a, b) => a + b, 0);
  const subActive = subs['active'] ?? 0;

  const overviewCards = [
    { label: 'Total institutions', value: instTotal },
    { label: 'Active', value: inst['active'] ?? 0 },
    { label: 'Trials', value: inst['trial'] ?? 0 },
    { label: 'Past due', value: inst['past_due'] ?? 0 },
    { label: 'Active subscriptions', value: subActive },
    { label: 'Institution users', value: data?.users.institutionUsers ?? 0 },
  ];

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="page-enter space-y-6 p-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Customer overview</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {isLoading
              ? overviewCards.map((c) => <Skeleton key={c.label} className="h-[88px]" />)
              : overviewCards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} />)}
          </div>
          {isError && (
            <p className="mt-2 text-sm text-danger">
              Could not load metrics. Is the API running on :3001?
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Commercial</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {isLoading ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px]" />)
            ) : (
              <>
                <StatCard
                  label="Recurring monthly"
                  value={formatMinor(data?.revenue.recurringMonthlyMinor ?? 0, 'USD')}
                  hint="Active subscriptions"
                />
                <StatCard
                  label="Outstanding"
                  value={formatMinor(data?.billing.outstandingMinor ?? 0, 'USD')}
                  hint={`${data?.billing.openInvoices ?? 0} open invoices`}
                />
                <StatCard label="Collected" value={formatMinor(data?.billing.paidMinor ?? 0, 'USD')} />
                <StatCard
                  label="Credit balance"
                  value={formatMinor(data?.billing.creditBalanceMinor ?? 0, 'USD')}
                />
              </>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Pending actions</CardTitle>
                <CardDescription>What needs attention now.</CardDescription>
              </div>
              <Link href="/pending-actions" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.isLoading ? (
                <Skeleton className="h-32" />
              ) : (pending.data?.total ?? 0) === 0 ? (
                <p className="text-sm text-text-muted">Nothing pending. All clear.</p>
              ) : (
                PRIORITY_META.map(({ key, label, tone }) => {
                  const count = pending.data?.groups[key]?.length ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${tone}`}>{label}</span>
                      <span className="text-text-secondary">{count}</span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscriptions by status</CardTitle>
              <CardDescription>Across all institutions.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32" />
              ) : Object.keys(subs).length === 0 ? (
                <p className="text-sm text-text-muted">No subscriptions yet.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(subs).map(([status, n]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-text-secondary">{status.replace('_', ' ')}</span>
                      <span className="tabular-nums text-text-primary">{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
