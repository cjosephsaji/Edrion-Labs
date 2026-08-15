'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Database, FileStack, RefreshCw, ShieldCheck, TimerReset } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

type ArtifactDashboard = {
  privacy: string;
  contentExposed: boolean;
  funnel: { proposed: number; edited: number; saved: number; saveFailures: number; averageCommitLatencyMs: number; maximumCommitLatencyMs: number; completedCommits: number; byKind: Array<{ kind: string; proposed: number; edited: number; saved: number; failed: number }> };
  reviews: { completed: number; retentionPercent: number | null; grades: Array<{ grade: string; count: number }>; schedulerVersions: Array<{ schedulerVersion: string | null; due: number; total: number }> };
  integrity: { duplicatePreventions: number; sanitizationFailures: number; sourceUnavailable: number };
  storage: { artifacts: number; estimatedBytes: number; orphanedArtifacts: number; failedOperations: number };
  jobs: { export: number; transfer: number; deletion: number; statuses: Array<{ kind: string; status: string; count: number }> };
};

export default function PetrosArtifactsDashboardPage() {
  const api = useApiClient();
  const [institutionId, setInstitutionId] = useState('');
  const [data, setData] = useState<ArtifactDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : '';
      setData(await api.get<ArtifactDashboard>(`/petros-artifacts/dashboard${query}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The artifact dashboard could not load.');
    } finally {
      setLoading(false);
    }
  }, [api, institutionId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Topbar title="Petros Artifacts" actions={<span className="hidden text-xs text-text-muted md:inline">Aggregate only · audited reads</span>} />
      <main className="page-enter space-y-5 p-4 md:p-6">
        <section className="rounded-2xl border border-cyan-400/20 bg-[linear-gradient(125deg,#10252a,#17363c_58%,#20505a)] p-5 text-white shadow-md md:p-7">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200"><FileStack className="h-4 w-4" /> Artifact operations</p>
          <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Reconcile proposals, ownership, and review return.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Privacy-preserving funnel, scheduler, source-health, duplicate-prevention, sanitization, and lifecycle job evidence. Student artifact content is never returned by this dashboard.</p>
        </section>

        <Card className="p-4 md:p-5">
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <label className="grid flex-1 gap-1 text-xs text-text-muted">Institution ID (optional)<input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="All institutions or exact UUID" className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary" /></label>
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </form>
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4" /> The response is content-free; identifiable support access remains outside this view.</p>
        </Card>

        {loading && <Skeleton className="h-64" />}
        {error && <Card className="p-8"><ErrorState description={`${error} Verify migration 0193 and ai.view permission.`} /></Card>}
        {data && !loading && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Proposals" value={data.funnel.proposed} detail={`${data.funnel.edited} edited`} icon={FileStack} />
              <Metric label="Explicit saves" value={data.funnel.saved} detail={`${data.funnel.saveFailures} failures · ${data.funnel.averageCommitLatencyMs} ms avg`} icon={Database} />
              <Metric label="Reviews completed" value={data.reviews.completed} detail={data.reviews.retentionPercent == null ? 'No retention sample yet' : `${data.reviews.retentionPercent}% non-Again`} icon={TimerReset} />
              <Metric label="Integrity signals" value={data.integrity.duplicatePreventions + data.integrity.sanitizationFailures + data.integrity.sourceUnavailable} detail="duplicates · sanitize · sources" icon={Activity} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4 md:p-5">
                <h2 className="font-semibold">Proposal → edited → saved</h2>
                <div className="mt-4 space-y-3">
                  <Bar label="Proposed" value={data.funnel.proposed} max={data.funnel.proposed} />
                  <Bar label="Edited/selected" value={data.funnel.edited} max={data.funnel.proposed} />
                  <Bar label="Saved" value={data.funnel.saved} max={data.funnel.proposed} />
                </div>
                <p className="mt-4 text-xs text-text-muted">Failures: {data.funnel.saveFailures}. Proposed counts are deliberately separate from learner-owned counts.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs"><thead><tr className="border-b border-border text-text-muted"><th className="py-2">Type</th><th>Proposed</th><th>Edit actions</th><th>Saved</th><th>Failed</th></tr></thead><tbody>{data.funnel.byKind.map((row) => <tr key={row.kind} className="border-b border-border/60"><td className="py-2 font-medium">{row.kind.replace('_', ' ')}</td><td>{row.proposed}</td><td>{row.edited}</td><td>{row.saved}</td><td>{row.failed}</td></tr>)}</tbody></table>
                </div>
                <p className="mt-3 text-xs text-text-muted">Commit latency: {data.funnel.averageCommitLatencyMs} ms average · {data.funnel.maximumCommitLatencyMs} ms max across {data.funnel.completedCommits} measured commits.</p>
              </Card>
              <Card className="p-4 md:p-5">
                <h2 className="font-semibold">Scheduler versions and due load</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs"><thead><tr className="border-b border-border text-text-muted"><th className="py-2">Version</th><th>Cards</th><th>Due</th></tr></thead><tbody>{data.reviews.schedulerVersions.map((row, index) => <tr key={`${row.schedulerVersion}-${index}`} className="border-b border-border/60"><td className="py-2 font-medium">{row.schedulerVersion ?? 'not scheduled'}</td><td>{row.total}</td><td>{row.due}</td></tr>)}</tbody></table>
                </div>
              </Card>
              <Card className="p-4 md:p-5">
                <h2 className="font-semibold">Integrity and source health</h2>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-xs"><Signal label="Duplicates stopped" value={data.integrity.duplicatePreventions} /><Signal label="Unsafe edits rejected" value={data.integrity.sanitizationFailures} /><Signal label="Unavailable sources" value={data.integrity.sourceUnavailable} /></dl>
              </Card>
              <Card className="p-4 md:p-5">
                <h2 className="font-semibold">Storage and portability jobs</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-center text-xs"><Signal label="Stored wrappers" value={data.storage.artifacts} /><Signal label="Estimated bytes" value={data.storage.estimatedBytes} /><Signal label="Orphaned products" value={data.storage.orphanedArtifacts} /><Signal label="Storage failures" value={data.storage.failedOperations} /></dl>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-center text-xs"><Signal label="Exports" value={data.jobs.export} /><Signal label="Transfers" value={data.jobs.transfer} /><Signal label="Deletions" value={data.jobs.deletion} /></dl>
                <a href="/ai/petros-routing" className="mt-4 inline-flex text-xs font-semibold text-primary">Open Petros AI Routing and filter artifact functions →</a>
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: typeof Activity }) {
  return <Card className="p-4"><p className="flex items-center gap-2 text-xs text-text-muted"><Icon className="h-4 w-4" /> {label}</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-text-muted">{detail}</p></Card>;
}
function Bar({ label, value, max }: { label: string; value: number; max: number }) { return <div><div className="mb-1 flex justify-between text-xs"><span>{label}</span><strong>{value}</strong></div><div className="h-2 rounded-full bg-surface"><div className="h-full rounded-full bg-primary" style={{ width: `${max ? Math.min(100, value / max * 100) : 0}%` }} /></div></div>; }
function Signal({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-border p-3"><dt className="text-text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>; }
