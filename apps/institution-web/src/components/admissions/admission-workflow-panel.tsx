'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Checkbox, Input, Label, Select } from '@edrion/ui';
import { useDecideAdmission, useEnrolAdmission } from '@/lib/admissions';
import {
  useDepartmentOptions,
  useProgrammeLevelOptions,
  useSectionOptionsByProgrammeLevel,
  useTermOptionsByProgrammeLevel,
} from '@/lib/academics';
import { useCreateInfoRequest, useInfoRequests, useInfoFileUrl, type InfoFieldDef, type InfoFileRef } from '@/lib/admission-info';
import { usePermissions } from '@/lib/permissions';
import { useTerm } from '@/lib/term';
import { PortalClientError } from '@/lib/portal-client';
import type { AdmissionDecision, AdmissionRow } from '@/lib/admissions-types';

const DECISION_OPTIONS: { value: AdmissionDecision; label: string }[] = [
  { value: 'accepted', label: 'Accept' },
  { value: 'waitlisted', label: 'Waitlist' },
  { value: 'info_requested', label: 'Request more info' },
  { value: 'rejected', label: 'Reject' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'date', label: 'Date' },
  { value: 'file', label: 'File upload' },
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'field';

type Builder = { label: string; type: InfoFieldDef['type']; optionsText: string; required: boolean; multiple: boolean };
const emptyField = (): Builder => ({ label: '', type: 'text', optionsText: '', required: false, multiple: false });

function AdmissionDecisionSection({ application }: { application: AdmissionRow }) {
  const decide = useDecideAdmission();
  const [decision, setDecision] = useState<AdmissionDecision>('accepted');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDecision('accepted');
    setNote(application.decisionNote ?? '');
    setNotify(true);
    setError(null);
    setSaved(false);
  }, [application.id, application.decisionNote]);

  const notifyEmail = application.guardianEmail ?? application.email ?? null;
  const hasEmail = !!notifyEmail;

  async function submit() {
    setError(null);
    setSaved(false);
    try {
      await decide.mutateAsync({
        id: application.id,
        body: { decision, note: note.trim() || undefined, notify, version: application.version },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not record this decision.');
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Record decision</h3>
      {saved && (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Decision saved.</div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="decision-outcome">Outcome</Label>
        <Select
          id="decision-outcome"
          value={decision}
          onChange={(e) => setDecision(e.target.value as AdmissionDecision)}
          options={DECISION_OPTIONS}
        />
      </div>
      <div>
        <Label htmlFor="decision-note">Note (optional)</Label>
        <textarea
          id="decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Shared with the guardian when they're notified."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
        />
      </div>
      <label className="flex items-center gap-2.5 text-sm text-text-primary">
        <Checkbox checked={notify && hasEmail} disabled={!hasEmail} onChange={(e) => setNotify(e.target.checked)} />
        Notify by email
      </label>
      {hasEmail ? (
        <p className="-mt-1 text-xs text-text-muted">Sends to {notifyEmail}.</p>
      ) : (
        <p className="-mt-1 text-xs text-text-muted">No email on file — nothing will be sent.</p>
      )}
      <Button onClick={submit} loading={decide.isPending} size="sm" className="self-start">
        Save decision
      </Button>
    </section>
  );
}

function AdmissionInfoSection({ application }: { application: AdmissionRow }) {
  const requests = useInfoRequests(application.id);
  const create = useCreateInfoRequest(application.id);
  const fileUrl = useInfoFileUrl();

  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Builder[]>([emptyField()]);
  const [error, setError] = useState<string | null>(null);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setField = (i: number, patch: Partial<Builder>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  async function send() {
    setError(null);
    const built: InfoFieldDef[] = [];
    const keys = new Set<string>();
    for (const f of fields) {
      if (!f.label.trim()) return setError('Every field needs a label.');
      let key = slug(f.label);
      while (keys.has(key)) key += '_2';
      keys.add(key);
      const needsOptions = f.type === 'select' || f.type === 'mcq';
      const options = needsOptions ? f.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : undefined;
      if (needsOptions && (!options || options.length === 0)) return setError(`Add comma-separated choices for "${f.label}".`);
      built.push({ key, label: f.label.trim(), type: f.type, options, required: f.required, multiple: f.type === 'file' ? f.multiple : undefined });
    }
    try {
      const res = await create.mutateAsync({ message: message.trim() || undefined, fields: built });
      setSentLink(res.link);
      setMessage('');
      setFields([emptyField()]);
    } catch (e) {
      setError(e instanceof PortalClientError ? e.message : 'Could not send the request.');
    }
  }

  function copyLink() {
    if (!sentLink) return;
    navigator.clipboard?.writeText(sentLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h3 className="text-sm font-semibold text-text-primary">Request more information</h3>

      {sentLink && (
        <div className="rounded-md border border-success/30 bg-success-soft/40 p-3 text-sm">
          <p className="font-medium text-text-primary">Request sent — the applicant was emailed a secure link.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={sentLink} className="min-w-0 flex-1 truncate rounded border border-border bg-surface px-2 py-1 text-xs text-text-secondary" />
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:text-primary">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="info-msg">Message to applicant</Label>
        <textarea
          id="info-msg"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Please attach a birth certificate and confirm the blood group."
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">Fields to collect</span>
          <button type="button" onClick={() => setFields((f) => [...f, emptyField()])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add field
          </button>
        </div>
        {fields.map((f, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Input placeholder="Field label (e.g. Birth certificate)" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
                <div className="flex gap-2">
                  <Select value={f.type} options={FIELD_TYPES} onChange={(e) => setField(i, { type: e.target.value as InfoFieldDef['type'] })} />
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
                    <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} className="h-3.5 w-3.5" /> Required
                  </label>
                  {f.type === 'file' && (
                    <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-text-secondary">
                      <input type="checkbox" checked={f.multiple} onChange={(e) => setField(i, { multiple: e.target.checked })} className="h-3.5 w-3.5" /> Multiple
                    </label>
                  )}
                </div>
                {(f.type === 'select' || f.type === 'mcq') && (
                  <Input placeholder="Choices, comma-separated (e.g. A+, O+, B+)" value={f.optionsText} onChange={(e) => setField(i, { optionsText: e.target.value })} />
                )}
              </div>
              {fields.length > 1 && (
                <button type="button" aria-label="Remove field" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} className="mt-1 text-text-muted hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button onClick={send} loading={create.isPending} size="sm" className="self-start">
          Send to applicant
        </Button>
      </div>

      {(requests.data?.items.length ?? 0) > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <span className="text-xs font-medium text-text-secondary">Previous requests</span>
          {requests.data!.items.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-text-muted">{new Date(r.createdAt).toLocaleDateString()}</span>
                <Badge tone={r.status === 'submitted' ? 'success' : r.status === 'cancelled' ? 'neutral' : 'warning'}>{r.status}</Badge>
              </div>
              {r.status === 'submitted' && r.responses ? (
                <dl className="space-y-1">
                  {r.fields.map((f) => (
                    <div key={f.key} className="flex justify-between gap-3">
                      <dt className="text-text-secondary">{f.label}</dt>
                      <dd className="max-w-[60%] text-right text-text-primary">
                        {f.type === 'file' ? (
                          <span className="flex flex-col items-end gap-0.5">
                            {((r.responses![f.key] as InfoFileRef[]) ?? []).map((file, k) => (
                              <a key={k} href={fileUrl(r.id, file.storageKey)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                <Paperclip className="h-3 w-3" />
                                {file.fileName}
                              </a>
                            ))}
                          </span>
                        ) : Array.isArray(r.responses![f.key]) ? (
                          (r.responses![f.key] as string[]).join(', ')
                        ) : (
                          String(r.responses![f.key] ?? '—')
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-text-muted">Awaiting the applicant's response ({r.fields.length} fields).</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AdmissionEnrolSection({ application }: { application: AdmissionRow }) {
  const { t } = useTerm();
  const { data: departments } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState('');
  const [programmeLevelId, setProgrammeLevelId] = useState('');
  const [termId, setTermId] = useState('');
  const { data: programmeLevels } = useProgrammeLevelOptions(departmentId || undefined);
  const { data: terms } = useTermOptionsByProgrammeLevel(programmeLevelId || undefined);
  const { data: sections } = useSectionOptionsByProgrammeLevel(programmeLevelId || undefined, termId || undefined);
  const enrol = useEnrolAdmission();
  const [admissionNo, setAdmissionNo] = useState('');
  const [classId, setClassId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasProgrammeLinks = (programmeLevels?.items?.length ?? 0) > 0;

  useEffect(() => {
    setAdmissionNo(application.applicationNo);
    setDepartmentId('');
    setProgrammeLevelId('');
    setTermId('');
    setClassId('');
    setError(null);
    setSaved(false);
  }, [application.id, application.applicationNo]);

  useEffect(() => {
    setProgrammeLevelId('');
    setTermId('');
    setClassId('');
  }, [departmentId]);

  useEffect(() => {
    setTermId('');
    setClassId('');
  }, [programmeLevelId]);

  useEffect(() => {
    setClassId('');
  }, [termId]);

  const sectionOptions = useMemo(
    () => (sections?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
    [sections],
  );

  async function submit() {
    setError(null);
    setSaved(false);
    try {
      await enrol.mutateAsync({
        id: application.id,
        body: { admissionNo: admissionNo.trim() || undefined, classId: classId || null },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not enrol this applicant.');
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h3 className="text-sm font-semibold text-text-primary">Enrol applicant</h3>
      <p className="text-xs text-text-muted">
        Creates a {t('student').toLowerCase()} record from the application and marks it as enrolled.
      </p>
      {saved && (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Applicant enrolled.</div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="enrol-admission-no">Admission no.</Label>
        <Input id="enrol-admission-no" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} placeholder="e.g. ADM-1024" />
      </div>
      {hasProgrammeLinks && (
        <>
          <div>
            <Label htmlFor="enrol-programme">{t('department')}</Label>
            <Select
              id="enrol-programme"
              value={departmentId}
              placeholder="Select…"
              options={(departments?.items ?? []).map((d) => ({ value: d.id, label: d.name }))}
              onChange={(e) => setDepartmentId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="enrol-year">{t('gradeLevel')}</Label>
            <Select
              id="enrol-year"
              value={programmeLevelId}
              placeholder={departmentId ? 'Select…' : `Choose ${t('department').toLowerCase()} first`}
              disabled={!departmentId}
              options={(programmeLevels?.items ?? []).map((l) => ({
                value: l.id,
                label: l.gradeLevelName ?? l.gradeLevelId,
              }))}
              onChange={(e) => setProgrammeLevelId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="enrol-term">{t('term')}</Label>
            <Select
              id="enrol-term"
              value={termId}
              placeholder={programmeLevelId ? 'Optional' : `Choose ${t('gradeLevel').toLowerCase()} first`}
              disabled={!programmeLevelId}
              options={(terms?.items ?? []).map((x) => ({ value: x.id, label: x.name }))}
              onChange={(e) => setTermId(e.target.value)}
            />
          </div>
        </>
      )}
      <div>
        <Label htmlFor="enrol-class">{t('class')} (optional)</Label>
        <Select id="enrol-class" value={classId} onChange={(e) => setClassId(e.target.value)} placeholder="Assign later" options={sectionOptions} />
      </div>
      <Button onClick={submit} loading={enrol.isPending} size="sm" className="self-start">
        Enrol {t('student').toLowerCase()}
      </Button>
    </section>
  );
}

/** Combined admissions workflow — decision, info requests, and enrolment. */
export function AdmissionWorkflowPanel({ application }: { application: AdmissionRow }) {
  const { can } = usePermissions();
  const canManage = can('admissions.manage');

  if (!canManage) return null;

  const showDecision = application.status !== 'enrolled';
  const showEnrol = application.status === 'accepted' && !application.enrolledStudentId;

  if (!showDecision && !showEnrol) return null;

  return (
    <div className="flex flex-col gap-6">
      {showDecision && (
        <>
          <AdmissionDecisionSection application={application} />
          <AdmissionInfoSection application={application} />
        </>
      )}
      {showEnrol && <AdmissionEnrolSection application={application} />}
    </div>
  );
}
