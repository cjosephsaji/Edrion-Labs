'use client';
import { Card, CardContent, CardHeader, CardTitle, StatCard, Skeleton, ErrorState } from '@edrion/ui';
import { useSystemHealth } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

function fmtUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemHealthPage() {
  const { data, isLoading, isError } = useSystemHealth();
  const healthy = data?.status === 'ok';

  return (
    <>
      <Topbar title="System Health" />
      <div className="page-enter space-y-5 p-6">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError || !data ? (
          <ErrorState description="Could not load system health. Confirm the API is running on :3001." />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${healthy ? 'bg-success' : 'bg-danger'}`} />
              <span className="text-sm font-medium text-text-primary">
                {healthy ? 'All systems operational' : 'Degraded'}
              </span>
              <span className="text-xs text-text-muted">· checked {new Date(data.time).toLocaleTimeString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="API" value={data.api.status} hint={`uptime ${fmtUptime(data.api.uptimeSeconds)}`} />
              <StatCard label="Database" value={data.database.status} hint={`${data.database.latencyMs}ms`} />
              <StatCard label="Redis" value={data.redis?.status ?? 'n/a'} />
              <StatCard label="Active support sessions" value={data.records.activeSupportSessions} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Background jobs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {(data.jobs?.latest ?? []).length === 0 ? (
                  <p className="text-text-muted">No tracked job runs yet.</p>
                ) : (
                  data.jobs.latest.map((j) => (
                    <div key={j.name} className="flex items-center justify-between gap-4">
                      <span className="font-mono text-text-primary">{j.name}</span>
                      <span className="flex items-center gap-3 text-text-muted">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            j.status === 'succeeded' ? 'bg-success' : j.status === 'failed' ? 'bg-danger' : 'bg-warning'
                          }`}
                        />
                        <span>{j.status}</span>
                        <span>{j.itemsProcessed} items</span>
                        <span>{j.durationMs ?? '—'} ms</span>
                        <span className="text-xs">{new Date(j.startedAt).toLocaleTimeString()}</span>
                      </span>
                    </div>
                  ))
                )}
                {(data.queues ?? []).length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">Queue depth</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
                      {data.queues.map((q) => (
                        <Row
                          key={q.name}
                          label={q.name}
                          value={`${q.waiting} waiting · ${q.failed} failed`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Runtime</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="API version" value={data.api.version} />
                  <Row label="Node" value={data.api.node} />
                  <Row label="Database" value={data.database.version} />
                  <Row label="DB latency" value={`${data.database.latencyMs} ms`} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Record counts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Institutions" value={String(data.records.institutions)} />
                  <Row label="Subscriptions" value={String(data.records.subscriptions)} />
                  <Row label="Audit events" value={String(data.records.auditEvents)} />
                  <Row label="Active support sessions" value={String(data.records.activeSupportSessions)} />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
