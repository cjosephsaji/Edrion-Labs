'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBadge,
  Skeleton,
  ErrorState,
} from '@edrion/ui';
import { ApiClientError, useArchivePlan, usePlan } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NewVersionDialog } from '@/components/plans/new-version-dialog';
import { PlanVersionHistory } from '@/components/plans/version-history';

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: plan, isLoading, isError } = usePlan(id);
  const archiveMut = useArchivePlan(id);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The latest version seeds the "new version" form so edits start from current pricing.
  const latest = plan?.versions.length
    ? [...plan.versions].sort((a, b) => b.version - a.version)[0]
    : undefined;

  function runArchive(reason: string) {
    if (!plan) return;
    setError(null);
    archiveMut.mutate(
      { reason, version: plan.version },
      {
        onSuccess: () => setArchiving(false),
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not archive the plan.'),
      },
    );
  }

  return (
    <>
      <Topbar title="Plan" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <Link href="/plans" className="hover:text-text-primary">Plans</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">{plan?.name ?? '…'}</span>
        </nav>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError || !plan ? (
          <ErrorState description="Could not load this plan." />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-text-primary">{plan.name}</h2>
                  <StatusBadge status={plan.status} />
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {plan.key} · <span className="capitalize">{plan.audience}</span>
                  {plan.description ? ` · ${plan.description}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {plan.status !== 'archived' && (
                  <>
                    <NewVersionDialog planId={plan.id} seedFrom={latest} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setError(null); setArchiving(true); }}
                    >
                      Archive
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Status" value={plan.status} />
                  <Row label="Audience" value={plan.audience} />
                  <Row label="Versions" value={String(plan.versions.length)} />
                  <Row
                    label="Live subscriptions"
                    value={String(plan.liveSubscriptionCount)}
                  />
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Version history</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlanVersionHistory plan={plan} />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={archiving}
        title={plan ? `Archive ${plan.name}?` : ''}
        description="Archiving retires the plan from new subscriptions. Existing subscriptions keep their pinned version. This is a sensitive action, logged to the audit trail."
        tone="danger"
        confirmLabel="Archive plan"
        loading={archiveMut.isPending}
        error={error}
        onConfirm={runArchive}
        onClose={() => setArchiving(false)}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="capitalize text-text-primary">{value}</span>
    </div>
  );
}
