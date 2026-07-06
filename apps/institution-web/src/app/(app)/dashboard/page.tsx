'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  StatCard,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePortalDashboard, usePortalMe } from '@/lib/hooks';
import { usePermissions } from '@/lib/permissions';
import { useFormat } from '@/lib/format';
import { useAttention } from '@/lib/attention';
import type { DashboardKind, PortalDashboardDto } from '@/lib/types';

const KIND_HEADING: Record<DashboardKind, string> = {
  institution: 'Institution overview',
  campus: 'Campus overview',
  teacher: 'Your teaching',
  parent: 'Your children',
  student: 'Your learning',
  generic: 'Overview',
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: me } = usePortalMe();
  const { can } = usePermissions();
  const { data, isLoading, isError, refetch } = usePortalDashboard();

  // A freshly approved institution lands here; steer its admins into the setup wizard until
  // they go live. Only admins (who can actually complete onboarding) are redirected — other
  // staff use the portal normally.
  const needsOnboarding =
    !!me && me.onboardingStatus !== 'completed' && me.institutionStatus === 'onboarding';
  useEffect(() => {
    if (needsOnboarding && can('institution_settings.manage')) {
      router.replace('/onboarding');
    }
  }, [needsOnboarding, can, router]);

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="page-enter flex flex-1 flex-col gap-6 p-5 lg:p-6">
        {me && (
          <div className="rounded-2xl border border-border bg-surface/85 p-5 shadow-sm">
            <p className="text-2xl font-semibold tracking-[0.01em] text-text-primary">
              {greeting()}, {me.fullName.split(' ')[0]}.
            </p>
            <p className="mt-1 max-w-3xl text-sm text-text-secondary">
              {data
                ? `Here is what needs attention across ${data.scopeLabel} today.`
                : `Here is what needs attention across ${me.institutionName} today.`}
            </p>
            {data && <p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-muted">{KIND_HEADING[data.kind]}</p>}
          </div>
        )}

        {isLoading && <DashboardSkeleton />}
        {isError && (
          <ErrorState
            title="Couldn’t load the dashboard"
            description="The portal API may be offline. Retry in a moment."
            action={
              <button
                onClick={() => refetch()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Retry
              </button>
            }
          />
        )}
        {data && <DashboardBody data={data} />}
      </div>
    </>
  );
}

function DashboardBody({ data }: { data: PortalDashboardDto }) {
  const fmt = useFormat();
  const statValue = (s: PortalDashboardDto['stats'][number]) => {
    if (s.pending) return '—';
    if (s.format === 'money') return fmt.money(Number(s.value));
    return s.value;
  };
  const readyStats = data.stats.filter((s) => !s.pending);
  const priorityStats = readyStats.slice(0, 4);
  const supportingStats = data.stats.slice(4, 10);

  return (
    <>
      <AttentionPriorities />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {priorityStats.map((s) => (
          <PulseCard key={s.key} label={s.label} value={statValue(s)} hint={s.hint} />
        ))}
      </section>

      {supportingStats.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Institution pulse</h2>
            <Badge tone="primary">Live scope</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {supportingStats.map((s) => (
              <StatCard
                key={s.key}
                label={s.label}
                value={statValue(s)}
                hint={s.pending ? 'Module coming soon' : s.hint}
                className={s.pending ? 'opacity-70' : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent meaningful activity</CardTitle>
            <CardDescription>Important changes in the selected scope.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
                No recent activity in this scope.
              </div>
            ) : (
              <ul className="relative space-y-1 before:absolute before:left-[0.6875rem] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="relative flex items-start gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-primary-soft/35">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary-soft text-primary">
                      <Clock3 className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">{a.title}</p>
                      <p className="truncate text-xs text-text-muted">{a.description}</p>
                    </div>
                    <span className="shrink-0 text-xs text-text-muted">{formatWhen(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <PendingApprovalsCard count={data.pendingApprovals} />
          <AttentionQuickView />
          {data.campusComparison && data.campusComparison.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Campus comparison</CardTitle>
                <CardDescription>User distribution by campus.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {data.campusComparison.map((c) => (
                    <li key={c.campusId} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium text-text-primary">{c.name}</span>
                        <span className="shrink-0 text-text-muted">{c.users} users</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-background-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${campusWidth(c.users, data.campusComparison ?? [])}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function PulseCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden p-5 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
          <CheckCircle2 className="h-4 w-4" />
        </span>
      </div>
      {hint ? <p className="mt-3 text-sm text-text-secondary">{hint}</p> : null}
    </Card>
  );
}

function PendingApprovalsCard({ count }: { count: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Pending approvals</p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">{count}</p>
          <p className="mt-1 text-sm text-text-secondary">
            {count > 0 ? 'Actions awaiting your decision.' : 'No approval queue at the moment.'}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning">
          <AlertCircle className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

/** A compact read-out of the Attention Centre: total open items + the top categories, linking through. */
function AttentionQuickView() {
  const router = useRouter();
  const { data, isLoading } = useAttention();
  const cats = (data?.categories ?? []).filter((c) => c.status === 'ok');
  const total = cats.reduce((n, c) => n + c.count, 0);
  const top = cats.filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 p-5 pb-3">
        <CardTitle>Needs attention</CardTitle>
        <button
          type="button"
          onClick={() => router.push('/attention')}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <CardContent>
        {isLoading ? (
          <p className="py-3 text-sm text-text-muted">Loading…</p>
        ) : total === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-sm text-text-muted">
            All clear. Nothing needs attention here.
          </div>
        ) : (
          <>
            <p className="mb-2 text-2xl font-semibold text-text-primary">
              {total} <span className="text-sm font-normal text-text-muted">item{total === 1 ? '' : 's'}</span>
            </p>
            <ul className="flex flex-col">
              {top.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => router.push('/attention')}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-primary-soft/45"
                  >
                    <span className="truncate text-text-primary">{c.label}</span>
                    <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">{c.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionPriorities() {
  const router = useRouter();
  const { data, isLoading } = useAttention();
  const cats = (data?.categories ?? []).filter((c) => c.status === 'ok');
  const top = cats.filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Today&apos;s priorities</CardTitle>
          <CardDescription>The highest open attention areas from live portal data.</CardDescription>
        </div>
        <button
          type="button"
          onClick={() => router.push('/attention')}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-primary shadow-xs transition-colors hover:bg-primary-soft"
        >
          Open centre <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : top.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">No urgent actions found</p>
              <p className="text-sm text-text-muted">Your active scope has no open attention items.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {top.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => router.push('/attention')}
                className="rounded-xl border border-border bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-text-primary">{c.label}</p>
                  <Badge tone={c.count > 0 ? 'danger' : 'neutral'}>{c.count}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-text-muted">{c.description}</p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function campusWidth(users: number, all: { users: number }[]): number {
  const max = Math.max(...all.map((c) => c.users), 1);
  return Math.max(8, Math.round((users / max) * 100));
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
