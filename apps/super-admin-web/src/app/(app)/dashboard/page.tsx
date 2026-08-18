'use client';
import Link from 'next/link';
import { AlertCircle, ArrowRight, BadgeDollarSign, Building2, CheckCircle2, Users } from 'lucide-react';
import {
  Badge,
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
        <section className="rounded-2xl border border-border bg-surface/85 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Platform operations</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[0.01em] text-text-primary">Super admin overview</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">
            Institutions, subscriptions, support load, and billing posture across the Edrion platform.
          </p>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Needs attention</h2>
            <Link href="/pending-actions" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover">
              Open queue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <PendingActionsOverview pending={pending} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Customer overview</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {isLoading
              ? overviewCards.map((c) => <Skeleton key={c.label} className="h-[88px]" />)
              : overviewCards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} />)}
          </div>
          {isError && (
            <p className="mt-2 text-sm text-danger">
              Could not load metrics. Is the API running on :3007?
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Commercial</h2>
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
                    <div key={status} className="space-y-1.5 rounded-xl border border-border bg-surface px-3 py-2.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-text-secondary">{status.replace('_', ' ')}</span>
                        <span className="tabular-nums text-text-primary">{n}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-background-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${statusWidth(n, subs)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform pulse</CardTitle>
              <CardDescription>Operational signals from loaded dashboard data.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <PulseRow icon={Building2} label="Institutions monitored" value={instTotal} />
              <PulseRow icon={Users} label="Institution users" value={data?.users.institutionUsers ?? 0} />
              <PulseRow icon={BadgeDollarSign} label="Open invoices" value={data?.billing.openInvoices ?? 0} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function PendingActionsOverview({ pending }: { pending: ReturnType<typeof usePendingActions> }) {
  if (pending.isLoading) return <Skeleton className="h-28 rounded-xl" />;
  if ((pending.data?.total ?? 0) === 0) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-text-primary">Nothing pending</p>
          <p className="text-sm text-text-muted">The platform queue is clear.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {PRIORITY_META.map(({ key, label, tone }) => {
        const count = pending.data?.groups[key]?.length ?? 0;
        return (
          <Card key={key} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <Badge tone={count > 0 ? (key === 'critical' ? 'danger' : key === 'today' ? 'warning' : 'primary') : 'neutral'}>{label}</Badge>
              <AlertCircle className={`h-4 w-4 ${tone}`} />
            </div>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-text-primary">
              {count}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function PulseRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-3">
      <span className="flex items-center gap-3 text-sm font-medium text-text-secondary">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </span>
      <span className="font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

function statusWidth(value: number, all: Record<string, number>): number {
  const max = Math.max(...Object.values(all), 1);
  return Math.max(8, Math.round((value / max) * 100));
}
