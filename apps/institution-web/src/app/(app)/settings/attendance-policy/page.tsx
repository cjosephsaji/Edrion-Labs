'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button, Card, Input, Label, PermissionDenied, Select, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { PortalClientError, formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

type AttendancePolicy = {
  thresholdPct: number;
  safeMarginPct: number;
  odBasis: 'present' | 'excluded';
  excusedBasis: 'present' | 'excluded';
  lateCountsAs: 'present' | 'absent';
  leftEarlyCountsAs: 'present' | 'absent';
  computationBasis: 'conducted' | 'scheduled';
  leaveMark: 'excused' | 'od';
  correctionWindowDays: number;
  condonationEnabled: boolean;
  parentVisibility: 'on' | 'off';
  workingDaysMask: number;
  version: number;
};

const WEEKDAYS = [
  { bit: 1, label: 'Mon' },
  { bit: 2, label: 'Tue' },
  { bit: 4, label: 'Wed' },
  { bit: 8, label: 'Thu' },
  { bit: 16, label: 'Fri' },
  { bit: 32, label: 'Sat' },
  { bit: 64, label: 'Sun' },
];

const BASIS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'excluded', label: 'Excluded' },
];

const LATE_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
];

const COMPUTATION_OPTIONS = [
  { value: 'conducted', label: 'Conducted sessions' },
  { value: 'scheduled', label: 'Scheduled sessions' },
];

const LEAVE_MARK_OPTIONS = [
  { value: 'excused', label: 'Excused' },
  { value: 'od', label: 'On duty (OD)' },
];

const PARENT_VISIBILITY_OPTIONS = [
  { value: 'on', label: 'Visible to parents' },
  { value: 'off', label: 'Hidden from parents' },
];

function toggleWorkingDay(mask: number, bit: number, checked: boolean): number {
  return checked ? mask | bit : mask & ~bit;
}

export default function AttendancePolicyPage() {
  const { can } = usePermissions();
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const canManage = can('institution_settings.manage');

  const policy = useQuery({
    queryKey: ['attendance-policy', scope],
    queryFn: () => client.get<AttendancePolicy>('/portal/settings/attendance-policy', scope),
    enabled: can('institution_settings.view'),
  });

  const [form, setForm] = useState<AttendancePolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (policy.data) setForm(policy.data);
  }, [policy.data]);

  const save = useMutation({
    mutationFn: (body: AttendancePolicy) => client.put<AttendancePolicy>('/portal/settings/attendance-policy', scope, body),
    onSuccess: (data) => {
      setForm(data);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['attendance-policy'] });
    },
    onError: (e) => {
      if (e instanceof PortalClientError && e.code === 'VERSION_CONFLICT') {
        setError(e.message || 'Attendance policy was updated elsewhere. Refresh and try again.');
        void qc.invalidateQueries({ queryKey: ['attendance-policy'] });
        return;
      }
      setError(formatPortalError(e, 'Save failed'));
    },
  });

  if (!can('institution_settings.view')) {
    return (
      <>
        <Topbar title="Attendance policy" />
        <div className="p-6">
          <PermissionDenied description="You don't have permission to view attendance policy." />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Attendance policy" />
      <div className="page-enter mx-auto w-full max-w-3xl space-y-5 p-5">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <span className="text-text-primary">Attendance policy</span>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Attendance policy</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Thresholds, counting rules, and parent visibility. Changes trigger a background rollup rebuild.
          </p>
        </div>

        {policy.isLoading || !form ? (
          <Skeleton className="h-96" />
        ) : (
          <Card className="space-y-6 p-6">
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Thresholds</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="thresholdPct">Minimum attendance (%)</Label>
                  <Input
                    id="thresholdPct"
                    type="number"
                    min={1}
                    max={100}
                    disabled={!canManage}
                    value={form.thresholdPct}
                    onChange={(e) => setForm({ ...form, thresholdPct: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="safeMarginPct">Safe margin (%)</Label>
                  <Input
                    id="safeMarginPct"
                    type="number"
                    min={0}
                    max={50}
                    disabled={!canManage}
                    value={form.safeMarginPct}
                    onChange={(e) => setForm({ ...form, safeMarginPct: Number(e.target.value) })}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Counting rules</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>On-duty (OD) basis</Label>
                  <Select
                    value={form.odBasis}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, odBasis: e.target.value as AttendancePolicy['odBasis'] })}
                    options={BASIS_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Excused absence basis</Label>
                  <Select
                    value={form.excusedBasis}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, excusedBasis: e.target.value as AttendancePolicy['excusedBasis'] })}
                    options={BASIS_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Late arrival counts as</Label>
                  <Select
                    value={form.lateCountsAs}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, lateCountsAs: e.target.value as AttendancePolicy['lateCountsAs'] })}
                    options={LATE_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Left early counts as</Label>
                  <Select
                    value={form.leftEarlyCountsAs}
                    disabled={!canManage}
                    onChange={(e) =>
                      setForm({ ...form, leftEarlyCountsAs: e.target.value as AttendancePolicy['leftEarlyCountsAs'] })
                    }
                    options={LATE_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Computation basis</Label>
                  <Select
                    value={form.computationBasis}
                    disabled={!canManage}
                    onChange={(e) =>
                      setForm({ ...form, computationBasis: e.target.value as AttendancePolicy['computationBasis'] })
                    }
                    options={COMPUTATION_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Approved leave mark</Label>
                  <Select
                    value={form.leaveMark}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, leaveMark: e.target.value as AttendancePolicy['leaveMark'] })}
                    options={LEAVE_MARK_OPTIONS}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Corrections & visibility</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="correctionWindowDays">Correction window (days)</Label>
                  <Input
                    id="correctionWindowDays"
                    type="number"
                    min={1}
                    max={365}
                    disabled={!canManage}
                    value={form.correctionWindowDays}
                    onChange={(e) => setForm({ ...form, correctionWindowDays: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Parent visibility</Label>
                  <Select
                    value={form.parentVisibility}
                    disabled={!canManage}
                    onChange={(e) =>
                      setForm({ ...form, parentVisibility: e.target.value as AttendancePolicy['parentVisibility'] })
                    }
                    options={PARENT_VISIBILITY_OPTIONS}
                  />
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!canManage}
                  checked={form.condonationEnabled}
                  onChange={(e) => setForm({ ...form, condonationEnabled: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-medium text-text-primary">Condonation enabled</span>
                  <span className="block text-xs text-text-muted">
                    Allow condonation workflows when attendance falls below the threshold.
                  </span>
                </span>
              </label>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text-primary">Working days</h2>
              <p className="text-xs text-text-muted">Sessions on unchecked days are excluded from attendance rollups.</p>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map(({ bit, label }) => (
                  <label key={bit} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={(form.workingDaysMask & bit) !== 0}
                      onChange={(e) =>
                        setForm({ ...form, workingDaysMask: toggleWorkingDay(form.workingDaysMask, bit, e.target.checked) })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            {canManage && (
              <div className="flex justify-end border-t border-border pt-4">
                <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(form)}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save policy'}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
