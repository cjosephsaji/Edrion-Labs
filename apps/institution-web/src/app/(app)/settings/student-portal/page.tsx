'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { defaultStudentHomePriorities, type StudentHomePriorityKey } from '@edrion/schemas';
import { Button, Card, Checkbox, Dialog, ErrorState, Input, Skeleton, useToast } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { StudentHomePreview } from '@/components/student-home-preview';
import { usePermissions } from '@/lib/permissions';
import { formatPortalError } from '@/lib/portal-client';
import {
  useSaveStudentPortalConfig,
  useStudentPortalConfig,
  type StudentPortalConfigAdminResponse,
} from '@/lib/student-portal';

type Draft = {
  modules: Record<string, boolean>;
  terminology: Record<string, string>;
  labels: Record<string, string>;
  threshold: number;
  scheme: string;
  priorities: Record<StudentHomePriorityKey, number>;
};

const CATEGORY_LABELS: Record<string, string> = { academics: 'Academics', money: 'Money', campus: 'Campus', life: 'Life', learning: 'Learning' };
const HOME_PRIORITY_LABELS: Record<StudentHomePriorityKey, string> = {
  exam: 'Examinations',
  due_work: 'Due assignments and homework',
  learning: 'Continue unfinished work',
  fees: 'Fees and payments',
  attendance: 'Attendance risk',
  schedule: 'Classes and timetable',
  announcement: 'Institution announcements',
  notification: 'General updates',
};

export default function StudentPortalSettingsPage() {
  const { can } = usePermissions();
  const query = useStudentPortalConfig();
  const save = useSaveStudentPortalConfig();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('institution');
  const [confirming, setConfirming] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    const next = makeDraft(query.data);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [query.data]);

  const dirty = draft ? JSON.stringify(draft) !== baseline : false;
  const currentPreset = useMemo(() => {
    if (!draft || !query.data || Object.keys(draft.labels).length) return 'custom';
    if (Object.entries(defaultStudentHomePriorities).some(([key, value]) => draft.priorities[key as StudentHomePriorityKey] !== value)) return 'custom';
    return Object.values(query.data.presets).find((preset) =>
      Object.entries(preset.modules).every(([k, v]) => draft.modules[k] === v) &&
      Object.entries(preset.terminology).every(([k, v]) => draft.terminology[k] === v) &&
      preset.defaults.attendanceThreshold === draft.threshold && preset.defaults.gradingScheme === draft.scheme,
    )?.key ?? 'custom';
  }, [draft, query.data]);

  if (!can('student_portal.manage')) return <><Topbar title="Student portal" /><div className="p-6 text-sm text-text-secondary">You do not have permission to configure the student portal.</div></>;
  if (query.isLoading || !draft) return <><Topbar title="Student portal" /><div className="grid gap-6 p-6 lg:grid-cols-[1fr_390px]"><Skeleton className="h-[680px]" /><Skeleton className="h-[680px]" /></div></>;
  if (query.error || !query.data) return <><Topbar title="Student portal" /><div className="p-6"><ErrorState title="Couldn't load your portal settings" description="Retry to load the current configuration." action={<Button onClick={() => void query.refetch()}>Retry</Button>} /></div></>;
  const data = query.data;

  function chooseScope(value: string) {
    setSelectedCampus(value);
    if (!data) return;
    const next = makeDraft(data);
    if (value !== 'institution') Object.assign(next.modules, data.campusOverrides[value] ?? {});
    setDraft(next); setBaseline(JSON.stringify(next));
  }
  function applyPreset(key: string) {
    const preset = data.presets[key]; if (!preset) return;
    setDraft({ modules: { ...preset.modules }, terminology: { ...preset.terminology }, labels: {}, threshold: preset.defaults.attendanceThreshold, scheme: preset.defaults.gradingScheme, priorities: { ...defaultStudentHomePriorities } });
    setPendingPreset(null);
  }
  async function submit() {
    if (!draft) return;
    try {
      const campusMode = selectedCampus !== 'institution';
      const original = makeDraft(data);
      const modules = campusMode
        ? Object.fromEntries(Object.entries(draft.modules).filter(([k, v]) => v !== original.modules[k]))
        : draft.modules;
      const result = await save.mutateAsync({
        revision: data.settings.revision,
        scope: campusMode ? { campus_id: selectedCampus } : 'institution',
        modules,
        cleared_overrides: campusMode ? Object.keys(data.campusOverrides[selectedCampus] ?? {}).filter((k) => !(k in modules)) : [],
        ...(campusMode ? {} : { terminology: draft.terminology, label_overrides: draft.labels, attendance_threshold: draft.threshold, grading_scheme: draft.scheme, home_priorities: draft.priorities }),
      });
      setConfirming(false); setBaseline(JSON.stringify(draft));
      toast.say(`Student portal updated · revision ${result.revision}`);
    } catch (error) { toast.say(formatPortalError(error, 'Could not save the portal configuration.')); }
  }

  return (
    <><Topbar title="Student portal" />
      <div className="mx-auto w-full max-w-[1440px] p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <select aria-label="Preset" value={currentPreset} onChange={(e) => e.target.value !== 'custom' && setPendingPreset(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            {Object.values(data.presets).map((p) => <option key={p.key} value={p.key}>{p.label}{data.settings.revision === 0 && p.key === data.suggestedPresetKey ? ' · Suggested' : ''}</option>)}
            <option value="custom">Custom</option>
          </select>
          {data.campuses.length > 1 && <select aria-label="Campus scope" value={selectedCampus} onChange={(e) => chooseScope(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"><option value="institution">All campuses (default)</option>{data.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <Button className="ml-auto" disabled={!dirty || save.isPending} onClick={() => setConfirming(true)}>Save changes</Button>
        </div>
        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_410px]">
          <div className="space-y-6">
            {Object.entries(CATEGORY_LABELS).map(([category, label]) => <section key={category}><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">{label}</h2><div className="grid gap-3 md:grid-cols-2">{data.catalog.filter((m) => m.category === category).map((module) => {
              const disabled = module.planLocked || !module.dependencyMet;
              const display = draft.labels[module.key] || module.label;
              return <Card key={module.key} className={disabled ? 'opacity-65' : ''}><div className="flex items-start gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-medium">{display}</p><p className="mt-1 text-xs text-text-muted">{module.planLocked ? 'An Edrion super administrator must enable this.' : !module.dependencyMet ? `Needs the ${module.dependencyNoteKey} institution module.` : selectedCampus === 'institution' ? 'Institution default' : (data.campusOverrides[selectedCampus]?.[module.key] === undefined ? 'Inherited' : 'Campus override')}</p><Input className="mt-3 h-8 text-xs" aria-label={`Rename ${module.label}`} placeholder={module.label} value={draft.labels[module.key] ?? ''} disabled={selectedCampus !== 'institution'} onChange={(e) => { const labels = { ...draft.labels }; if (e.target.value) labels[module.key] = e.target.value; else delete labels[module.key]; setDraft({ ...draft, labels }); }} /></div><Checkbox checked={draft.modules[module.key] ?? false} disabled={disabled} onChange={(e) => setDraft({ ...draft, modules: { ...draft.modules, [module.key]: e.target.checked } })} /></div></Card>;
            })}</div></section>)}
            {selectedCampus === 'institution' && <section><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Terminology</h2><Card><div className="grid gap-4 p-5 md:grid-cols-2">{Object.entries(draft.terminology).map(([key, value]) => <label key={key} className="text-xs font-medium text-text-muted">{key.replaceAll('_', ' ')}<Input className="mt-1" value={value} maxLength={30} onChange={(e) => setDraft({ ...draft, terminology: { ...draft.terminology, [key]: e.target.value } })} /></label>)}<label className="text-xs font-medium text-text-muted">Attendance threshold<Input className="mt-1" type="number" min={1} max={100} value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })} /></label><label className="text-xs font-medium text-text-muted">Grading scheme<Input className="mt-1" value={draft.scheme} onChange={(e) => setDraft({ ...draft, scheme: e.target.value })} /></label></div></Card></section>}
            {selectedCampus === 'institution' && (
              <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">Student home priority</h2>
                <Card>
                  <div className="divide-y divide-border px-5">
                    {Object.entries(HOME_PRIORITY_LABELS).map(([key, label]) => {
                      const priorityKey = key as StudentHomePriorityKey;
                      return (
                        <label key={key} className="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-x-4 gap-y-3 py-4 text-sm md:grid-cols-[minmax(0,1fr)_minmax(140px,220px)_42px]">
                          <span>
                            <strong className="block font-medium text-text-primary">{label}</strong>
                            <small className="mt-0.5 block text-xs text-text-muted">Higher values move relevant items forward.</small>
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={draft.priorities[priorityKey]}
                            aria-label={`${label} priority`}
                            onChange={(event) => setDraft({ ...draft, priorities: { ...draft.priorities, [priorityKey]: Number(event.target.value) } })}
                            className="col-span-2 row-start-2 w-full accent-primary md:col-span-1 md:col-start-2 md:row-start-1"
                          />
                          <span className="col-start-2 row-start-1 text-right font-mono text-sm font-semibold text-text-primary md:col-start-3">{draft.priorities[priorityKey]}</span>
                        </label>
                      );
                    })}
                  </div>
                </Card>
              </section>
            )}
            <Link href="/settings/student-portal/request-types" className="block rounded-xl border border-border bg-white p-5 text-sm font-semibold text-primary">Configure request types →</Link>
          </div>
          <div className="sticky top-20"><StudentHomePreview modules={data.catalog.map((m) => ({ key: m.key, label: draft.labels[m.key] || m.label, enabled: Boolean(draft.modules[m.key]) }))} terminology={draft.terminology} priorities={draft.priorities} /></div>
        </div>
      </div>
      <Dialog open={Boolean(pendingPreset)} onClose={() => setPendingPreset(null)} title={`Apply ${pendingPreset ? data.presets[pendingPreset]?.label : ''} preset?`}><div className="p-5"><h2 className="font-semibold">Apply preset?</h2><p className="mt-1 text-sm text-text-muted">This replaces your unsaved module and terminology edits. Students are not affected until you save.</p><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPendingPreset(null)}>Cancel</Button><Button onClick={() => pendingPreset && applyPreset(pendingPreset)}>Apply preset</Button></div></div></Dialog>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Save student portal changes?"><div className="p-5"><h2 className="font-semibold">Save student portal changes?</h2><p className="mt-1 text-sm text-text-muted">This updates {selectedCampus === 'institution' ? 'all students' : 'students at this campus'} the next time they open the app.</p><div className="mt-4 max-h-52 overflow-auto rounded-lg bg-surface-muted p-3 text-sm"><p>Modules, labels, terminology, home priorities and portal defaults will be saved together.</p></div><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirming(false)}>Keep editing</Button><Button loading={save.isPending} onClick={() => void submit()}>Save</Button></div></div></Dialog>
    </>
  );
}

function makeDraft(data: StudentPortalConfigAdminResponse): Draft {
  return { modules: Object.fromEntries(data.catalog.map((m) => [m.key, m.value])), terminology: { ...data.settings.terminology }, labels: { ...data.settings.labelOverrides }, threshold: data.settings.attendanceThreshold, scheme: data.settings.gradingScheme, priorities: { ...data.settings.homePriorities } };
}
