'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save } from 'lucide-react';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  PermissionDenied,
  Select,
  Skeleton,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { usePortalLearnPolicy, useSavePortalLearnPolicy } from '@/lib/learn-policy';

const BOUNDS = [
  { value: 'open', label: 'Open — any topic' },
  { value: 'institution_curriculum', label: 'Institution curriculum only' },
  { value: 'assigned_material_only', label: 'Assigned material only' },
];

const DIRECTNESS = [
  { value: 'default', label: 'Default' },
  { value: 'guided', label: 'Guided (more probing)' },
  { value: 'never_direct_on_assignment', label: 'Never direct during assignments' },
];

const VISIBILITY = [
  { value: 'none', label: 'None — students only' },
  { value: 'aggregate', label: 'Aggregate summaries' },
  { value: 'transcript', label: 'Full session transcripts' },
];

export default function LearnPolicyPage() {
  const { can } = usePermissions();
  const { data, isLoading } = usePortalLearnPolicy();
  const save = useSavePortalLearnPolicy();
  const [form, setForm] = useState({
    curriculum_bounds: 'open',
    answer_directness: 'default',
    session_visibility: 'none',
    enabled: true,
    killSwitch: false,
    version: 0,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        curriculum_bounds: data.curriculum_bounds,
        answer_directness: data.answer_directness,
        session_visibility: data.session_visibility,
        enabled: data.enabled,
        killSwitch: data.killSwitch,
        version: data.version,
      });
    }
  }, [data]);

  if (!can('ai.configure')) {
    return (
      <>
        <Topbar title="Edrion Learn policy" />
        <div className="p-6">
          <PermissionDenied description="You need AI configuration permission to manage learning policy." />
        </div>
      </>
    );
  }

  async function onSave() {
    setSaved(false);
    await save.mutateAsync({
      curriculum_bounds: form.curriculum_bounds as 'open' | 'institution_curriculum' | 'assigned_material_only',
      answer_directness: form.answer_directness as 'default' | 'guided' | 'never_direct_on_assignment',
      session_visibility: form.session_visibility as 'none' | 'aggregate' | 'transcript',
      enabled: form.enabled,
      killSwitch: form.killSwitch,
      reason: 'Institution learning policy update',
      version: form.version,
    });
    setSaved(true);
  }

  return (
    <>
      <Topbar title="Edrion Learn policy" />
      <div className="page-enter mx-auto max-w-3xl space-y-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-text-secondary">
              Controls how Edrion Learn tutors your students — separate from Petros chat policy.
            </p>
            <Link href="/settings" className="mt-1 inline-block text-sm text-primary hover:underline">
              ← Back to settings
            </Link>
          </div>
          <Button onClick={() => void onSave()} loading={save.isPending}>
            <Save className="h-4 w-4" />
            Save policy
          </Button>
        </div>

        {saved && (
          <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
            Learning policy saved.
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Student tutor policy</CardTitle>
              <CardDescription>
                Effective preview: {data?.effectivePreview?.effective_mode ?? 'enabled'} · visibility{' '}
                {data?.effectivePreview?.session_visibility ?? 'none'}
              </CardDescription>
            </CardHeader>
            <div className="grid gap-5 border-t border-border p-5">
              <div>
                <Label>Curriculum bounds</Label>
                <Select
                  value={form.curriculum_bounds}
                  onChange={(e) => setForm((f) => ({ ...f, curriculum_bounds: e.target.value }))}
                  options={BOUNDS}
                />
              </div>
              <div>
                <Label>Answer directness</Label>
                <Select
                  value={form.answer_directness}
                  onChange={(e) => setForm((f) => ({ ...f, answer_directness: e.target.value }))}
                  options={DIRECTNESS}
                />
                <p className="mt-1 text-xs text-text-muted">
                  &ldquo;Never direct during assignments&rdquo; biases toward retrieval and probing when homework overlaps.
                </p>
              </div>
              <div>
                <Label>Session visibility (staff)</Label>
                <Select
                  value={form.session_visibility}
                  onChange={(e) => setForm((f) => ({ ...f, session_visibility: e.target.value }))}
                  options={VISIBILITY}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                Edrion Learn enabled for this institution
              </label>
              <label className="flex items-center gap-2 text-sm text-danger">
                <input
                  type="checkbox"
                  checked={form.killSwitch}
                  onChange={(e) => {
                    if (e.target.checked && !window.confirm('Enable emergency kill switch? This disables orchestrated tutoring immediately for all students.')) {
                      return;
                    }
                    setForm((f) => ({ ...f, killSwitch: e.target.checked }));
                  }}
                />
                Emergency kill switch (disables orchestrated tutoring immediately)
              </label>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
