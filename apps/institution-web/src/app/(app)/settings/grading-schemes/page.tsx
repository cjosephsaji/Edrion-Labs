'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Badge, Button, Card, PermissionDenied, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { formatPortalError } from '@/lib/portal-client';
import { useGradingMutations, useGradingPresets, useGradingSchemes } from '@/lib/grading';
import { TermRecomputeProposeCard } from '@/components/settings/term-recompute-propose';

export default function GradingSchemesPage() {
  const { can } = usePermissions();
  const schemes = useGradingSchemes();
  const presets = useGradingPresets();
  const { createPreset } = useGradingMutations();
  const [error, setError] = useState<string | null>(null);

  if (!can('academics.view')) {
    return (
      <>
        <Topbar title="Grading schemes" />
        <div className="p-6"><PermissionDenied description="You don’t have permission to view grading schemes." /></div>
      </>
    );
  }

  async function addPreset(kind: string) {
    setError(null);
    try {
      await createPreset.mutateAsync(kind);
    } catch (err) {
      setError(formatPortalError(err));
    }
  }

  return (
    <>
      <Topbar title="Grading schemes" />
      <div className="page-enter mx-auto max-w-4xl space-y-6 p-5">
        <p className="text-sm text-text-muted">
          <Link href="/settings" className="text-primary underline">Settings</Link> / Grading schemes
        </p>

        {can('academics.manage') ? (
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Create from preset</h2>
            <div className="flex flex-wrap gap-2">
              {(presets.data ?? []).map((preset) => (
                <Button key={preset.key} type="button" size="sm" variant="secondary" disabled={createPreset.isPending} onClick={() => addPreset(preset.key)}>
                  {preset.name}
                </Button>
              ))}
            </div>
          </Card>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Card className="divide-y divide-border">
          {schemes.isLoading ? <Skeleton className="m-4 h-24" /> : null}
          {(schemes.data ?? []).map((scheme) => (
            <div key={scheme.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{scheme.name}</p>
                <p className="text-xs text-text-muted">
                  {scheme.kind} · {scheme.gpaFormula} · v{scheme.version}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {scheme.isDefault ? <Badge tone="primary">Default</Badge> : null}
                <Badge tone="muted">{scheme.bands.length} bands</Badge>
              </div>
            </div>
          ))}
          {!schemes.isLoading && (schemes.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-text-muted">No schemes yet. Create one from a preset.</p>
          ) : null}
        </Card>

        {createPreset.isPending ? (
          <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Creating…</p>
        ) : null}

        <TermRecomputeProposeCard />
      </div>
    </>
  );
}
