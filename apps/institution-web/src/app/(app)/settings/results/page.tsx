'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Card, Label, PermissionDenied, Select, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { formatPortalError } from '@/lib/portal-client';
import { useResultsSettings, useResultsSettingsMutation } from '@/lib/mark-release';

export default function ResultsSettingsPage() {
  const { can } = usePermissions();
  const settings = useResultsSettings();
  const save = useResultsSettingsMutation();
  const [form, setForm] = useState({
    showClassAverage: true,
    missingEntryPolicy: 'block' as 'block' | 'confirm',
    hodReleaseGate: false,
    revaluationRefundOnReject: false,
    version: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  if (!can('institution_settings.view')) {
    return (
      <>
        <Topbar title="Results settings" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to view results settings." />
        </div>
      </>
    );
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync(form);
      setSaved(true);
    } catch (err) {
      setError(formatPortalError(err));
    }
  }

  return (
    <>
      <Topbar title="Results settings" />
      <div className="page-enter mx-auto max-w-2xl space-y-6 p-5">
        <Card className="space-y-4 p-4">
          {settings.isLoading ? <Skeleton className="h-40" /> : null}
          {settings.isError ? (
            <p className="text-sm text-danger">Couldn’t load settings. Refresh and try again.</p>
          ) : null}

          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Show class average to students</span>
            <input
              type="checkbox"
              checked={form.showClassAverage}
              disabled={!can('institution_settings.manage')}
              onChange={(e) => setForm((f) => ({ ...f, showClassAverage: e.target.checked }))}
            />
          </label>

          <div className="space-y-2">
            <Label htmlFor="missing-policy">Missing entry policy</Label>
            <Select
              id="missing-policy"
              value={form.missingEntryPolicy}
              disabled={!can('institution_settings.manage')}
              onChange={(e) => setForm((f) => ({ ...f, missingEntryPolicy: e.target.value as 'block' | 'confirm' }))}
              options={[
                { value: 'block', label: 'Block release until complete' },
                { value: 'confirm', label: 'Allow with confirmation' },
              ]}
            />
          </div>

          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Require HOD approval before release</span>
            <input
              type="checkbox"
              checked={form.hodReleaseGate}
              disabled={!can('institution_settings.manage')}
              onChange={(e) => setForm((f) => ({ ...f, hodReleaseGate: e.target.checked }))}
            />
          </label>

          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Refund revaluation fee on reject</span>
            <input
              type="checkbox"
              checked={form.revaluationRefundOnReject}
              disabled={!can('institution_settings.manage')}
              onChange={(e) => setForm((f) => ({ ...f, revaluationRefundOnReject: e.target.checked }))}
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {saved ? <p className="text-sm text-success">Saved.</p> : null}

          {can('institution_settings.manage') ? (
            <Button type="button" onClick={onSave} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save settings
            </Button>
          ) : null}
        </Card>
      </div>
    </>
  );
}
