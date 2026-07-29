'use client';

import { useState } from 'react';
import { Badge, Button, PermissionDenied } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

/**
 * Academics → Report Cards — generation wizard with release validation,
 * mandatory class-teacher review, and publish lock.
 */
export default function ReportCardsIssuancePage() {
  const { can } = usePermissions();
  const client = usePortalClient();
  const { scope } = useScope();
  const [termId, setTermId] = useState('');
  const [sectionIds, setSectionIds] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [validation, setValidation] = useState<{
    canGenerate: boolean;
    blockers: Array<{ message: string }>;
    warnings: Array<{ message: string }>;
  } | null>(null);
  const [batch, setBatch] = useState<{ id: string; status: string; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can('reports.generate') && !can('documents.issue')) {
    return (
      <>
        <Topbar title="Report cards" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to generate report cards." />
        </div>
      </>
    );
  }

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      const result = await client.post<typeof validation>(
        '/portal/report-cards/validate',
        scope,
        {
          termId,
          sectionIds: sectionIds.split(',').map((s) => s.trim()).filter(Boolean),
        },
      );
      setValidation(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setBusy(false);
    }
  }

  async function createRun() {
    setBusy(true);
    setError(null);
    try {
      const created = await client.post<{ id: string; status: string; version: number }>(
        '/portal/report-cards/runs',
        scope,
        {
          termId,
          sectionIds: sectionIds.split(',').map((s) => s.trim()).filter(Boolean),
          templateId,
        },
      );
      setBatch(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create run');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!batch) return;
    setBusy(true);
    try {
      const updated = await client.post<typeof batch>(
        `/portal/report-cards/runs/${batch.id}/publish`,
        scope,
        { version: batch.version },
      );
      setBatch(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Report cards" />
      <div className="page-enter mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
        <section className="rounded-2xl border border-border bg-surface-elevated p-5">
          <h1 className="font-semibold">New report-card run</h1>
          <p className="mt-1 text-sm text-text-muted">
            Only marks in a released batch with published entries can reach a render.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">
              Term ID
              <input
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Section IDs (comma-separated)
              <input
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
                value={sectionIds}
                onChange={(e) => setSectionIds(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Template ID
              <input
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => void validate()}>Validate releases</Button>
            <Button
              loading={busy}
              disabled={!validation?.canGenerate || !templateId}
              onClick={() => void createRun()}
            >
              Create draft run
            </Button>
            {batch && (
              <Button loading={busy} onClick={() => void publish()}>
                Publish (lock)
              </Button>
            )}
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          {validation && (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                Status:{' '}
                <Badge tone={validation.canGenerate ? 'success' : 'danger'}>
                  {validation.canGenerate ? 'Ready' : 'Blocked'}
                </Badge>
              </p>
              {validation.blockers.map((b, i) => (
                <p key={i} className="text-danger">{b.message}</p>
              ))}
              {validation.warnings.map((w, i) => (
                <p key={i} className="text-warning">{w.message}</p>
              ))}
            </div>
          )}
          {batch && (
            <p className="mt-4 font-mono text-xs text-text-muted">
              Batch {batch.id} · {batch.status} · v{batch.version}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
