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
import { ApiClientError, useFeature, useSetFeatureStatus } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EffectiveValuePreview } from '@/components/features/effective-value-preview';
import { FeatureAssignments } from '@/components/features/feature-assignments';
import { FeatureRollouts } from '@/components/features/feature-rollouts';

export default function FeatureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useFeature(id);
  const setStatus = useSetFeatureStatus(id);
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<'active' | 'inactive' | 'archived'>('inactive');
  const [error, setError] = useState<string | null>(null);

  const def = data?.definition;

  function openStatus(target: 'active' | 'inactive' | 'archived') {
    setError(null);
    setNextStatus(target);
    setStatusOpen(true);
  }

  function runStatus(reason: string) {
    if (!def) return;
    setError(null);
    setStatus.mutate(
      { status: nextStatus, version: def.version, reason },
      {
        onSuccess: () => setStatusOpen(false),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not change status.'),
      },
    );
  }

  return (
    <>
      <Topbar title="Feature" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <Link href="/features" className="hover:text-text-primary">Feature Controls</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">{def?.name ?? '…'}</span>
        </nav>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError || !data || !def ? (
          <ErrorState description="Could not load this feature." />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-text-primary">{def.name}</h2>
                  <StatusBadge status={def.status} />
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-text-muted">
                    {def.releaseStage}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {def.key} · module {def.module}
                  {def.description ? ` · ${def.description}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {def.status !== 'active' && (
                  <Button variant="secondary" size="sm" onClick={() => openStatus('active')}>Activate</Button>
                )}
                {def.status === 'active' && (
                  <Button variant="outline" size="sm" onClick={() => openStatus('inactive')}>Deactivate</Button>
                )}
                {def.status !== 'archived' && (
                  <Button variant="outline" size="sm" onClick={() => openStatus('archived')}>Archive</Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Definition</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Default value" value={def.defaultValue ? 'ON' : 'OFF'} />
                  <Row label="Status" value={def.status} />
                  <Row label="Release stage" value={def.releaseStage} />
                  <Row label="Owner" value={def.owner ?? '—'} />
                  <Row label="Scopes" value={(def.availableScopes ?? []).join(', ') || '—'} />
                </CardContent>
              </Card>
              <div className="lg:col-span-2">
                <EffectiveValuePreview featureId={def.id} />
              </div>
            </div>

            <FeatureAssignments
              featureId={def.id}
              assignments={data.assignments}
              availableScopes={def.availableScopes ?? []}
            />

            <FeatureRollouts featureId={def.id} rollouts={data.rollouts} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={statusOpen}
        title={`Set status to ${nextStatus}`}
        description={
          nextStatus === 'active'
            ? 'Re-enable resolution from overrides and rollouts.'
            : 'A non-active feature resolves OFF for everyone. This is a sensitive action, logged to the audit trail.'
        }
        tone={nextStatus === 'active' ? 'primary' : 'danger'}
        confirmLabel={`Set ${nextStatus}`}
        loading={setStatus.isPending}
        error={error}
        onConfirm={runStatus}
        onClose={() => setStatusOpen(false)}
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
