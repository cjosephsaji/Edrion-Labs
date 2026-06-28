'use client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  StatCard,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePortalDashboard, usePortalMe } from '@/lib/hooks';
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
  const { data: me } = usePortalMe();
  const { data, isLoading, isError, refetch } = usePortalDashboard();

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="page-enter flex flex-1 flex-col gap-5 p-5">
        {me && (
          <div>
            <p className="text-lg font-semibold text-text-primary">
              {greeting()}, {me.fullName.split(' ')[0]}.
            </p>
            <p className="text-sm text-text-secondary">
              {data ? `${KIND_HEADING[data.kind]} · ${data.scopeLabel}` : me.institutionName}
            </p>
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
  return (
    <>
      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {data.stats.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={s.pending ? '—' : s.value}
            hint={s.pending ? 'Module coming soon' : s.hint}
            className={s.pending ? 'opacity-70' : undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">No recent activity in this scope.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">{a.title}</p>
                      <p className="truncate text-xs text-text-muted">{a.description}</p>
                    </div>
                    <span className="shrink-0 text-xs text-text-muted">{formatWhen(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending approvals + campus comparison */}
        <div className="flex flex-col gap-4">
          <StatCard
            label="Pending approvals"
            value={data.pendingApprovals}
            hint="Actions awaiting your decision"
          />
          {data.campusComparison && data.campusComparison.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Campus comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.campusComparison.map((c) => (
                    <li key={c.campusId} className="flex items-center justify-between text-sm">
                      <span className="truncate text-text-primary">{c.name}</span>
                      <span className="shrink-0 text-text-muted">{c.users} users</span>
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
