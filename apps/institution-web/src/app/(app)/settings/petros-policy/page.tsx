'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Eye, History, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import type { PetrosInstitutionPolicyConfig, PetrosResolvedPolicy } from '@edrion/schemas';
import { Button, Card, ErrorState, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

type Version = {
  id: string; version: number; status: 'draft' | 'scheduled' | 'published' | 'superseded' | 'rolled_back';
  scope: { level: string; campusId: string | null; programmeId: string | null; gradeId: string | null; subjectId: string | null };
  config: PetrosInstitutionPolicyConfig; reason: string; authorId: string; effectiveFrom: string | null; effectiveUntil: string | null; createdAt: string; publishedAt: string | null;
};
type Dashboard = { versions: Version[]; effective: PetrosResolvedPolicy; disclosurePreview: PetrosResolvedPolicy['disclosure']; platformLimits: string[]; voiceRequired: false; productionReady: false };
type PolicyPreview = { preview: PetrosResolvedPolicy; current: PetrosResolvedPolicy; changedSections: string[]; studentDisclosureChanged: boolean };

export default function PetrosPolicyPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const [data, setData] = useState<Dashboard | null>(null);
  const [draft, setDraft] = useState<PetrosInstitutionPolicyConfig | null>(null);
  const [reason, setReason] = useState('Clarify the institution learning boundary and disclosure.');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [policyLevel, setPolicyLevel] = useState<'institution' | 'campus' | 'programme' | 'grade' | 'subject'>(scope.mode === 'campus' ? 'campus' : 'institution');
  const [programmeId, setProgrammeId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [fixtureStudentId, setFixtureStudentId] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [preview, setPreview] = useState<PetrosResolvedPolicy | null>(null);
  const [previewDetail, setPreviewDetail] = useState<PolicyPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const next = await client.get<Dashboard>('/portal/petros/institutional/policy', scope);
      setData(next); setDraft(structuredClone(next.effective.config));
      setSelectedVersion(next.versions.find((row) => row.status === 'draft')?.id ?? next.versions[0]?.id ?? '');
    } catch (caught) { setError(formatPortalError(caught, 'Petros policy could not load.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [client, scope]);

  const selected = useMemo(() => data?.versions.find((row) => row.id === selectedVersion) ?? null, [data, selectedVersion]);
  const policyScope = () => ({
    level: policyLevel,
    campusId: scope.mode === 'campus' ? scope.campusId : null,
    programmeId: programmeId || null,
    gradeId: gradeId || null,
    subjectId: subjectId || null,
  });
  async function saveDraft() {
    if (!draft) return; setBusy(true); setError(''); setMessage('');
    try {
      const body = {
        scope: policyScope(),
        config: draft,
        reason,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
        effectiveUntil: effectiveUntil ? new Date(effectiveUntil).toISOString() : null,
      };
      const row = selected?.status === 'draft'
        ? await client.put<Version>(`/portal/petros/institutional/policies/${selected.id}`, scope, { ...body, expectedVersion: selected.version })
        : await client.post<Version>('/portal/petros/institutional/policies', scope, body);
      setMessage(`Draft v${row.version} ${selected?.status === 'draft' ? 'updated' : 'created'}. Students are not affected until publish.`); await load(); setSelectedVersion(row.id);
    } catch (caught) { setError(formatPortalError(caught, 'Draft could not be created.')); }
    finally { setBusy(false); }
  }
  async function previewSelected() {
    if (!selected) return; setBusy(true); setError('');
    try {
      const row = await client.post<PolicyPreview>(`/portal/petros/institutional/policies/${selected.id}/preview`, scope, { campusId: scope.mode === 'campus' ? scope.campusId : null, programmeId: programmeId || null, gradeId: gradeId || null, subjectId: subjectId || null, studentId: fixtureStudentId || null, language: 'en', accessibility: [] });
      setPreview(row.preview); setPreviewDetail(row); setMessage('Preview uses the selected version and fixture without affecting sessions.');
    } catch (caught) { setError(formatPortalError(caught, 'Preview could not be resolved.')); }
    finally { setBusy(false); }
  }
  async function publishSelected() {
    if (!selected || selected.status !== 'draft' || !publishConfirmed) return; setBusy(true); setError('');
    try {
      await client.post(`/portal/petros/institutional/policies/${selected.id}/publish`, scope, { expectedVersion: selected.version, reason, confirmDisclosureReviewed: true });
      setPublishConfirmed(false);
      setMessage(effectiveFrom && new Date(effectiveFrom) > new Date() ? 'Policy scheduled. Existing sessions keep their snapshot.' : 'Policy published. Existing sessions keep their snapshot.'); await load();
    } catch (caught) { setError(formatPortalError(caught, 'Policy could not be published.')); }
    finally { setBusy(false); }
  }
  async function rollbackSelected() {
    if (!selected || selected.status === 'draft' || !rollbackConfirmed) return; setBusy(true); setError('');
    try {
      await client.post('/portal/petros/institutional/policies/rollback', scope, { targetVersionId: selected.id, reason: `Rollback: ${reason}`, confirm: 'ROLL BACK PETROS POLICY' });
      setRollbackConfirmed(false);
      setMessage(`Restored policy v${selected.version} as a new audited version.`); await load();
    } catch (caught) { setError(formatPortalError(caught, 'Rollback could not be completed.')); }
    finally { setBusy(false); }
  }

  if (loading) return <><Topbar title="Petros policy" /><main className="p-5"><Skeleton className="h-[720px]" /></main></>;
  if (error && !data) return <><Topbar title="Petros policy" /><main className="p-5"><ErrorState description={error} action={<Button onClick={() => void load()}>Retry</Button>} /></main></>;
  if (!data || !draft) return null;
  const shown = preview ?? data.effective;
  return <>
    <Topbar title="Petros policy" />
    <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <section className="rounded-2xl bg-[linear-gradient(130deg,#162c3d,#275878)] p-5 text-white md:p-7"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em]"><ShieldCheck className="h-4 w-4" /> Institutional learning boundary</p><h1 className="mt-3 text-2xl font-semibold">Configure what Petros may do—and show students the same rule.</h1><p className="mt-2 max-w-3xl text-sm text-white/75">Draft, preview, test, schedule, publish and roll back syllabus, homework, visibility, handoff, class-signal and digest policy. Voice remains optional.</p></section>
      <Card className="border-amber-400/30 bg-amber-50 p-4 text-sm"><strong>Acceptance remains open.</strong> Publishing configuration does not make Stage 12 or production readiness complete. Existing sessions retain their disclosed snapshot.</Card>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-5">
          <PolicyEditor config={draft} onChange={setDraft} />
          <Card className="p-5"><h2 className="font-semibold">Scope, activation and reason</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">Policy scope<select value={policyLevel} disabled={scope.mode === 'campus'} onChange={(event) => setPolicyLevel(event.target.value as typeof policyLevel)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3"><option value="institution">Institution</option><option value="campus">Campus</option><option value="programme">Programme</option><option value="grade">Grade</option><option value="subject">Subject</option></select></label><label className="text-sm">Programme ID (when scoped)<input value={programmeId} onChange={(event) => setProgrammeId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" /></label><label className="text-sm">Grade ID (when scoped)<input value={gradeId} onChange={(event) => setGradeId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" /></label><label className="text-sm">Subject ID (when scoped)<input value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" /></label><label className="text-sm">Effective from (blank = now)<input type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" /></label><label className="text-sm">Effective until (optional)<input type="datetime-local" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" /></label><label className="text-sm md:col-span-2">Audit reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} className="mt-1 min-h-24 w-full rounded-lg border border-border p-3" /></label></div><div className="mt-4 flex flex-wrap gap-2"><Button loading={busy} onClick={() => void saveDraft()}><Save className="mr-2 h-4 w-4" />{selected?.status === 'draft' ? 'Save draft changes' : 'Create draft'}</Button><Button variant="secondary" onClick={() => { setSelectedVersion(''); setDraft(structuredClone(data.effective.config)); setPreview(null); setPreviewDetail(null); }}>Start a new draft</Button></div></Card>
          <Card className="overflow-hidden"><div className="border-b border-border p-4"><h2 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4" />Version and audit history</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-surface-muted"><tr>{['Version','Scope','Status','Effective','Reason','Select'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.versions.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-4 py-3">v{row.version}</td><td className="px-4 py-3">{row.scope.level}</td><td className="px-4 py-3">{row.status.replaceAll('_', ' ')}</td><td className="px-4 py-3">{row.effectiveFrom ? new Date(row.effectiveFrom).toLocaleString() : 'On publish'}</td><td className="max-w-64 px-4 py-3">{row.reason}</td><td className="px-4 py-3"><button aria-pressed={selectedVersion === row.id} onClick={() => { setSelectedVersion(row.id); setDraft(structuredClone(row.config)); setReason(row.reason); setPolicyLevel(row.scope.level as typeof policyLevel); setProgrammeId(row.scope.programmeId ?? ''); setGradeId(row.scope.gradeId ?? ''); setSubjectId(row.scope.subjectId ?? ''); setPreview(null); setPreviewDetail(null); setPublishConfirmed(false); setRollbackConfirmed(false); }} className="font-semibold text-primary">{selectedVersion === row.id ? 'Selected' : 'Select'}</button></td></tr>)}</tbody></table></div><div className="space-y-3 p-4"><label className="block max-w-xl text-sm">Student fixture ID (optional)<input value={fixtureStudentId} onChange={(event) => setFixtureStudentId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border px-3" /></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} className="mt-1" /><span>I reviewed the student disclosure and confirm this selected draft may be published.</span></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rollbackConfirmed} onChange={(event) => setRollbackConfirmed(event.target.checked)} className="mt-1" /><span>I confirm the selected published or historical policy may be restored as a new audited version.</span></label><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!selected || busy} onClick={() => void previewSelected()}><Eye className="mr-2 h-4 w-4" />Preview/test</Button><Button disabled={selected?.status !== 'draft' || busy || !publishConfirmed} onClick={() => void publishSelected()}>Publish selected</Button><Button variant="secondary" disabled={!selected || selected.status === 'draft' || busy || !rollbackConfirmed} onClick={() => void rollbackSelected()}><RotateCcw className="mr-2 h-4 w-4" />Restore as new version</Button></div>{previewDetail ? <p className="text-xs text-text-muted">Changed sections: {previewDetail.changedSections.join(', ') || 'none'} · disclosure changed: {previewDetail.studentDisclosureChanged ? 'yes' : 'no'}</p> : null}</div></Card>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-20"><DisclosurePreview policy={shown} /><Card className="p-4 text-sm"><h2 className="font-semibold">Platform limits</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-text-muted">{data.platformLimits.map((item) => <li key={item}>{item}</li>)}</ul></Card></aside>
      </div>
    </main>
  </>;
}

function PolicyEditor({ config, onChange }: { config: PetrosInstitutionPolicyConfig; onChange: (value: PetrosInstitutionPolicyConfig) => void }) {
  const set = <K extends keyof PetrosInstitutionPolicyConfig>(key: K, value: PetrosInstitutionPolicyConfig[K]) => onChange({ ...config, [key]: value });
  const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-border px-3 py-2';
  const list = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  const check = <T extends string>(values: T[], value: T, checked: boolean) => checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
  const visibilityCategories = ['session_metadata','concept_and_goal','attempt_summary','teacher_handoff','raw_transcript','private_questions','voice_recording','images','unsaved_artifacts'] as const;
  const digestSections = ['work_completed','concepts_building','support_ideas','upcoming_review','effort_and_strategy'] as const;
  return <Card className="p-5"><h2 className="flex items-center gap-2 font-semibold"><BookOpenCheck className="h-4 w-4" />Policy editor</h2><div className="mt-5 grid gap-5 lg:grid-cols-2">
    <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-2 font-semibold">Syllabus</legend>
      <label className="block text-sm">Approved source IDs<textarea value={config.syllabus.approvedSourceIds.join('\n')} onChange={(event) => set('syllabus', { ...config.syllabus, approvedSourceIds: list(event.target.value) })} className={inputClass} /></label>
      <label className="block text-sm">Grades<textarea value={config.syllabus.grades.join('\n')} onChange={(event) => set('syllabus', { ...config.syllabus, grades: list(event.target.value) })} className={inputClass} /></label>
      <label className="block text-sm">Subjects<textarea value={config.syllabus.subjects.join('\n')} onChange={(event) => set('syllabus', { ...config.syllabus, subjects: list(event.target.value) })} className={inputClass} /></label>
      <label className="block text-sm">Topic keys<textarea value={config.syllabus.topicKeys.join('\n')} onChange={(event) => set('syllabus', { ...config.syllabus, topicKeys: list(event.target.value) })} className={inputClass} /></label>
      <label className="block text-sm">Maximum teaching depth<input type="number" min={0} max={10} value={config.syllabus.maxDepth} onChange={(event) => set('syllabus', { ...config.syllabus, maxDepth: Number(event.target.value) })} className={inputClass} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.syllabus.allowExternalSources} onChange={(event) => set('syllabus', { ...config.syllabus, allowExternalSources: event.target.checked })} />Allow permitted external sources</label>
      <label className="block text-sm">Outside-scope path<textarea value={config.syllabus.outsidePathLabel} onChange={(event) => set('syllabus', { ...config.syllabus, outsidePathLabel: event.target.value })} className={inputClass} /></label>
    </fieldset>
    <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-2 font-semibold">Active homework</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.homework.enabled} onChange={(event) => set('homework', { ...config.homework, enabled: event.target.checked })} />Guided-homework shape enabled</label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Grace minutes<input type="number" min={0} max={10080} value={config.homework.graceMinutes} onChange={(event) => set('homework', { ...config.homework, graceMinutes: Number(event.target.value) })} className={inputClass} /></label><label className="text-sm">Policy timezone<input value={config.homework.timezone} onChange={(event) => set('homework', { ...config.homework, timezone: event.target.value })} className={inputClass} /></label><label className="text-sm">Relation threshold (basis points)<input type="number" min={5000} max={10000} value={config.homework.relationThresholdBasisPoints} onChange={(event) => set('homework', { ...config.homework, relationThresholdBasisPoints: Number(event.target.value) })} className={inputClass} /></label></div>
      <div><span className="text-sm">Covered statuses</span>{(['assigned','late','extended'] as const).map((status) => <label key={status} className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.homework.restrictedStatuses.includes(status)} onChange={(event) => set('homework', { ...config.homework, restrictedStatuses: check(config.homework.restrictedStatuses, status, event.target.checked) })} />{status}</label>)}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.homework.teacherOverrideAllowed} onChange={(event) => set('homework', { ...config.homework, teacherOverrideAllowed: event.target.checked })} />Allow assignment-level teacher override</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.homework.studentCorrectionAllowed} onChange={(event) => set('homework', { ...config.homework, studentCorrectionAllowed: event.target.checked })} />Allow student false-match correction</label>
      <label className="block text-sm">Student disclosure<textarea value={config.homework.disclosure} onChange={(event) => set('homework', { ...config.homework, disclosure: event.target.value })} className={inputClass} /></label>
      <p className="text-xs text-text-muted">Final answers are withheld only for a related, active, covered status. Questions, hints, setup, repair, critique and process feedback remain available.</p>
    </fieldset>
    <fieldset className="space-y-4 rounded-xl border border-border p-4"><legend className="px-2 font-semibold">Visibility and disclosure</legend>
      {(['teacher','parent'] as const).map((audience) => <div key={audience} className="rounded-lg bg-surface-muted p-3"><strong className="text-sm capitalize">{audience}</strong>{visibilityCategories.map((category) => <label key={category} className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={config.visibility[audience].categories.includes(category)} onChange={(event) => set('visibility', { ...config.visibility, [audience]: { ...config.visibility[audience], categories: check(config.visibility[audience].categories, category, event.target.checked) } })} />{category.replaceAll('_',' ')}</label>)}<label className="mt-2 block text-sm">Retention days<input type="number" min={1} max={3650} value={config.visibility[audience].retentionDays} onChange={(event) => set('visibility', { ...config.visibility, [audience]: { ...config.visibility[audience], retentionDays: Number(event.target.value) } })} className={inputClass} /></label><label className="mt-2 block text-sm">Purpose<textarea value={config.visibility[audience].purpose} onChange={(event) => set('visibility', { ...config.visibility, [audience]: { ...config.visibility[audience], purpose: event.target.value } })} className={inputClass} /></label></div>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.visibility.requireStudentConsentForContent} onChange={(event) => set('visibility', { ...config.visibility, requireStudentConsentForContent: event.target.checked })} />Require student consent before content sharing</label>
      <p className="text-xs text-text-muted">Platform exclusions still override policy: unsaved drafts, provider details, hidden reasoning, unrelated history, and credentials cannot be shared.</p>
    </fieldset>
    <div className="space-y-5">
      <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-2 font-semibold">Teacher handoff</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.escalation.enabled} onChange={(event) => set('escalation', { ...config.escalation, enabled: event.target.checked })} />Optional teacher handoff</label><label className="block text-sm">Offer after failed repairs<input type="number" min={1} max={10} value={config.escalation.offerAfterFailedRepairCount} onChange={(event) => set('escalation', { ...config.escalation, offerAfterFailedRepairCount: Number(event.target.value) })} className={inputClass} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.escalation.studentCanEdit} onChange={(event) => set('escalation', { ...config.escalation, studentCanEdit: event.target.checked })} />Student can edit summary</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.escalation.requireConsent} onChange={(event) => set('escalation', { ...config.escalation, requireConsent: event.target.checked })} />Require explicit consent</label><label className="block text-sm">Cancellation window (minutes)<input type="number" min={0} max={1440} value={config.escalation.cancellationMinutes} onChange={(event) => set('escalation', { ...config.escalation, cancellationMinutes: Number(event.target.value) })} className={inputClass} /></label></fieldset>
      <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-2 font-semibold">Class signals</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.classSignals.enabled} onChange={(event) => set('classSignals', { ...config.classSignals, enabled: event.target.checked })} />Aggregate signals enabled</label><label className="block text-sm">Minimum class cohort<input type="number" min={5} max={100} value={config.classSignals.minimumCohortSize} onChange={(event) => set('classSignals', { ...config.classSignals, minimumCohortSize: Number(event.target.value) })} className={inputClass} /></label><label className="block text-sm">Minimum independent evidence<input type="number" min={2} max={100} value={config.classSignals.minimumIndependentEvidence} onChange={(event) => set('classSignals', { ...config.classSignals, minimumIndependentEvidence: Number(event.target.value) })} className={inputClass} /></label><label className="block text-sm">Freshness days<input type="number" min={1} max={365} value={config.classSignals.freshnessDays} onChange={(event) => set('classSignals', { ...config.classSignals, freshnessDays: Number(event.target.value) })} className={inputClass} /></label></fieldset>
      <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-2 font-semibold">Parent digest</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.digest.enabled} onChange={(event) => set('digest', { ...config.digest, enabled: event.target.checked })} />Parent digest enabled</label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Cadence<select value={config.digest.cadence} onChange={(event) => set('digest', { ...config.digest, cadence: event.target.value as typeof config.digest.cadence })} className={inputClass}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></label><label className="text-sm">Preferred language<input value={config.digest.preferredLanguage} onChange={(event) => set('digest', { ...config.digest, preferredLanguage: event.target.value })} className={inputClass} /></label><label className="text-sm">Maximum retries<input type="number" min={0} max={10} value={config.digest.maxRetries} onChange={(event) => set('digest', { ...config.digest, maxRetries: Number(event.target.value) })} className={inputClass} /></label></div><div><span className="text-sm">Delivery channels</span>{(['portal','email'] as const).map((channel) => <label key={channel} className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.digest.deliveryChannels.includes(channel)} onChange={(event) => set('digest', { ...config.digest, deliveryChannels: check(config.digest.deliveryChannels, channel, event.target.checked) })} />{channel}{channel === 'email' ? ' (fails safely until configured)' : ''}</label>)}</div><div><span className="text-sm">Permitted sections</span>{digestSections.map((section) => <label key={section} className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={config.digest.permittedSections.includes(section)} onChange={(event) => set('digest', { ...config.digest, permittedSections: check(config.digest.permittedSections, section, event.target.checked) })} />{section.replaceAll('_',' ')}</label>)}</div></fieldset>
    </div>
  </div></Card>;
}

function DisclosurePreview({ policy }: { policy: PetrosResolvedPolicy }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Student disclosure preview</p><h2 className="mt-2 font-semibold">What the learner sees</h2><ul className="mt-3 space-y-2 text-sm">{policy.disclosure.plainLanguage.map((line) => <li key={line} className="rounded-lg bg-surface-muted p-3">{line}</li>)}</ul><p className="mt-3 text-xs text-text-muted">Policy IDs: {policy.policyVersionIds.join(', ')} · stable for session: yes</p></Card>;
}
