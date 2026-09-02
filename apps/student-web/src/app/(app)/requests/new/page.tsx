'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryPage } from '@/components/query-page';
import { Button } from '@/components/ui/button';
import { PageHeader, SurfaceCard } from '@/components/ui/states';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';

type RequestType = { key: string; label: string; category: string; enabled: boolean };

type FormOptions = {
  invoices: Array<{ id: string; label: string; balanceMinor: number }>;
  libraryLoans: Array<{ id: string; title: string; dueDate: string | null }>;
  clubs: Array<{ id: string; name: string }>;
  transportAssignment: {
    assignmentId: string;
    routeId: string;
    routeName: string | null;
    stopName: string | null;
  } | null;
  transportRoutes: Array<{ id: string; name: string }>;
  gradeEntries: Array<{
    gradeEntryId: string;
    subjectId: string;
    subjectName: string | null;
    currentScore: number;
    title: string | null;
  }>;
  attendanceAbsences: Array<{
    sessionId: string;
    date: string;
    subjectName: string | null;
    status: string;
  }>;
  paymentIntents: Array<{
    id: string;
    provider: string;
    providerRef: string | null;
    amountMinor: number;
    status: string;
    createdAt: string;
  }>;
};

const fieldClass =
  'w-full rounded-xl border border-[var(--s-bd2)] bg-[var(--s-cardAlt)] px-3 py-2 text-sm text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]';

function toIsoLocal(datetimeLocal: string): string {
  if (!datetimeLocal) return '';
  const d = new Date(datetimeLocal);
  return d.toISOString();
}

export default function NewRequestPage() {
  const api = useStudentApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [type, setType] = useState('leave_request');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string | boolean | string[]>>({});

  const typesQuery = useQuery({
    queryKey: ['student', 'requests', 'types'],
    queryFn: () => api.get<{ types: RequestType[] }>('/student/requests/types'),
  });
  const optionsQuery = useQuery({
    queryKey: ['student', 'requests', 'form-options'],
    queryFn: () => api.get<FormOptions>('/student/requests/form-options'),
  });

  const available = useMemo(
    () => (typesQuery.data?.types ?? []).filter((t) => t.enabled),
    [typesQuery.data],
  );

  useEffect(() => {
    if (available.length && !available.some((t) => t.key === type)) {
      setType(available[0]!.key);
    }
  }, [available, type]);

  useEffect(() => {
    // Reset field bag when type changes; seed useful defaults from options.
    const opts = optionsQuery.data;
    const next: Record<string, string | boolean | string[]> = {};
    if (type === 'fee_waiver' && opts?.invoices[0]) next.invoice_id = opts.invoices[0].id;
    if (type === 'campus_library_renewal' || type === 'loan_renewal') {
      if (opts?.libraryLoans[0]) next.loan_id = opts.libraryLoans[0].id;
      next.renewal_days = '7';
    }
    if (type === 'club_join' && opts?.clubs[0]) next.club_id = opts.clubs[0].id;
    if (type === 'transport_change' || type === 'transport_renewal') {
      if (opts?.transportAssignment?.assignmentId) {
        next.assignment_id = opts.transportAssignment.assignmentId;
      }
      next.term_months = '12';
    }
    if (type === 'revaluation' && opts?.gradeEntries[0]) {
      next.grade_entry_id = opts.gradeEntries[0].gradeEntryId;
      next.subject_id = opts.gradeEntries[0].subjectId;
      next.current_score = String(opts.gradeEntries[0].currentScore);
      next.reason = 'revaluation';
    }
    if (type === 'attendance_correction' && opts?.attendanceAbsences[0]) {
      next.session_ids = [opts.attendanceAbsences[0].sessionId];
    }
    if (type === 'payment_dispute' && opts?.paymentIntents[0]) {
      const intent = opts.paymentIntents[0];
      next.intent_id = intent.id;
      next.provider = intent.provider;
      next.provider_ref = intent.providerRef ?? '';
      next.amount_minor = String(intent.amountMinor);
      next.occurred_at = new Date().toISOString().slice(0, 16);
    }
    if (type === 'leave_request') next.reason = 'medical';
    if (type === 'od_request') next.reason = 'sports';
    if (type === 'hostel_outpass') {
      next.reason = 'family';
      next.guardian_ack = false;
    }
    if (type === 'id_card_reissue') next.reason = 'lost';
    if (type === 'document_request') next.doc_type = 'bonafide';
    if (type === 'helpdesk_ticket') next.topic = 'it';
    if (type === 'grievance') next.category = 'academic';
    if (type === 'sensitive_report') {
      next.category = 'safety';
      next.contact_ok = false;
    }
    setFields(next);
  }, [type, optionsQuery.data]);

  const set = (key: string, value: string | boolean | string[]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const buildPayload = (): Record<string, unknown> => {
    const opts = optionsQuery.data;
    switch (type) {
      case 'leave_request':
        return {
          start_date: fields.start_date,
          end_date: fields.end_date || fields.start_date,
          scope: 'full_day',
          reason: fields.reason,
          reason_text: fields.reason_text || '',
          notify_sessions: [],
        };
      case 'od_request':
        return {
          start_date: fields.start_date,
          end_date: fields.end_date || fields.start_date,
          event_name: fields.event_name,
          organizer: fields.organizer,
          reason: fields.reason,
          reason_text: fields.reason_text || '',
          sessions_snapshot: [],
        };
      case 'document_request':
        return {
          doc_type: fields.doc_type,
          delivery: 'digital',
          purpose: fields.doc_type === 'bonafide' ? fields.purpose : undefined,
          purpose_text: fields.purpose_text || '',
          copies: fields.doc_type === 'transcript' ? Number(fields.copies || 1) : undefined,
        };
      case 'helpdesk_ticket':
        return {
          topic: fields.topic,
          summary: fields.summary,
          details: fields.details,
        };
      case 'grievance':
        return {
          category: fields.category,
          subject: fields.subject,
          description: fields.description,
          desired_outcome: fields.desired_outcome || undefined,
        };
      case 'sensitive_report':
        return {
          category: fields.category,
          narrative: fields.narrative,
          contact_ok: Boolean(fields.contact_ok),
        };
      case 'id_card_reissue':
        return {
          reason: fields.reason,
          reason_text: fields.reason_text || '',
        };
      case 'health_profile_update':
        return {
          blood_group: fields.blood_group || undefined,
          allergies: fields.allergies || undefined,
          conditions: fields.conditions || undefined,
          emergency_contact: fields.emergency_contact || undefined,
        };
      case 'hostel_outpass':
        return {
          reason: fields.reason,
          reason_text: fields.reason_text || '',
          leave_at: toIsoLocal(String(fields.leave_at || '')),
          expected_return_at: toIsoLocal(String(fields.expected_return_at || '')),
          destination: fields.destination,
          guardian_ack: true,
        };
      case 'fee_waiver':
        return {
          invoice_id: fields.invoice_id,
          requested_amount_minor: fields.requested_amount_minor
            ? Number(fields.requested_amount_minor)
            : undefined,
          reason: fields.reason_text || fields.reason,
        };
      case 'payment_dispute':
        return {
          intent_id: fields.intent_id,
          provider: fields.provider,
          provider_ref: fields.provider_ref,
          amount_minor: Number(fields.amount_minor),
          occurred_at: toIsoLocal(String(fields.occurred_at || '')),
        };
      case 'revaluation': {
        const entry = opts?.gradeEntries.find((g) => g.gradeEntryId === fields.grade_entry_id);
        return {
          grade_entry_id: fields.grade_entry_id,
          subject_id: entry?.subjectId ?? fields.subject_id,
          current_score: Number(entry?.currentScore ?? fields.current_score ?? 0),
          reason: fields.reason,
          note: fields.note || '',
        };
      }
      case 'attendance_correction': {
        const ids = (fields.session_ids as string[]) ?? [];
        return {
          record_refs: ids.map((session_id) => ({ session_id, claim: 'was_present' })),
          claim: 'was_present',
          note: fields.note || '',
        };
      }
      case 'campus_library_renewal':
      case 'loan_renewal':
        return {
          loan_id: fields.loan_id,
          renewal_days: Number(fields.renewal_days || 7),
        };
      case 'transport_change':
        return {
          assignment_id: fields.assignment_id || opts?.transportAssignment?.assignmentId,
          requested_route_id: fields.requested_route_id || undefined,
          requested_stop: fields.requested_stop || undefined,
          effective_date: fields.effective_date || undefined,
          reason: fields.reason_text || fields.reason,
        };
      case 'transport_renewal':
        return {
          assignment_id: fields.assignment_id || opts?.transportAssignment?.assignmentId,
          term_months: Number(fields.term_months || 12),
          reason: fields.reason_text || '',
        };
      case 'club_join':
        return {
          club_id: fields.club_id,
          statement: fields.statement,
        };
      default:
        return { ...fields };
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (type === 'hostel_outpass' && !fields.guardian_ack) {
        throw new Error('Guardian acknowledgement is required.');
      }
      return api.post<{ id: string }>(
        '/student/requests',
        { type, payload, attachments: [] },
        { 'Idempotency-Key': newIdempotencyKey() },
      );
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ['student', 'requests'] });
      router.replace(`/requests/${row.id}`);
    },
    onError: (err) => setError(formatApiError(err)),
  });

  const loading = typesQuery.isLoading || optionsQuery.isLoading;
  const combinedError = typesQuery.error ?? optionsQuery.error;
  const readyQuery = {
    ...typesQuery,
    isLoading: loading,
    error: combinedError,
    data: typesQuery.data,
    refetch: async () => {
      await Promise.all([typesQuery.refetch(), optionsQuery.refetch()]);
      return typesQuery;
    },
  };

  const opts = optionsQuery.data;

  return (
    <QueryPage query={readyQuery as typeof typesQuery} loadingLabel="Loading request form…">
      {() => (
        <div>
          <PageHeader
            title="New request"
            description="Choose a request type and fill in the details."
            actions={
              <Link href="/requests" className="text-sm font-medium text-[var(--s-accentDeep)]">
                Back to requests
              </Link>
            }
          />

          <SurfaceCard className="space-y-4">
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
                {available.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {type === 'leave_request' || type === 'od_request' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start date">
                    <input
                      type="date"
                      className={fieldClass}
                      value={String(fields.start_date || '')}
                      onChange={(e) => set('start_date', e.target.value)}
                    />
                  </Field>
                  <Field label="End date">
                    <input
                      type="date"
                      className={fieldClass}
                      value={String(fields.end_date || '')}
                      onChange={(e) => set('end_date', e.target.value)}
                    />
                  </Field>
                </div>
                {type === 'od_request' ? (
                  <>
                    <Field label="Event name">
                      <input
                        className={fieldClass}
                        value={String(fields.event_name || '')}
                        onChange={(e) => set('event_name', e.target.value)}
                      />
                    </Field>
                    <Field label="Organizer">
                      <input
                        className={fieldClass}
                        value={String(fields.organizer || '')}
                        onChange={(e) => set('organizer', e.target.value)}
                      />
                    </Field>
                  </>
                ) : null}
                <Field label="Reason">
                  <select
                    className={fieldClass}
                    value={String(fields.reason || '')}
                    onChange={(e) => set('reason', e.target.value)}
                  >
                    {(type === 'leave_request'
                      ? ['medical', 'family', 'event', 'other']
                      : ['sports', 'cultural', 'placement', 'nss_ncc', 'conference', 'other']
                    ).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Details">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={String(fields.reason_text || '')}
                    onChange={(e) => set('reason_text', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'document_request' ? (
              <>
                <Field label="Document type">
                  <select
                    className={fieldClass}
                    value={String(fields.doc_type || 'bonafide')}
                    onChange={(e) => set('doc_type', e.target.value)}
                  >
                    {['bonafide', 'transcript', 'migration', 'conduct'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                {fields.doc_type === 'bonafide' ? (
                  <Field label="Purpose">
                    <select
                      className={fieldClass}
                      value={String(fields.purpose || 'bank_loan')}
                      onChange={(e) => set('purpose', e.target.value)}
                    >
                      {['bank_loan', 'visa', 'passport', 'scholarship', 'other'].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {fields.doc_type === 'transcript' ? (
                  <Field label="Copies">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      className={fieldClass}
                      value={String(fields.copies || 1)}
                      onChange={(e) => set('copies', e.target.value)}
                    />
                  </Field>
                ) : null}
                <Field label="Purpose notes">
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={String(fields.purpose_text || '')}
                    onChange={(e) => set('purpose_text', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'helpdesk_ticket' ? (
              <>
                <Field label="Topic">
                  <select
                    className={fieldClass}
                    value={String(fields.topic || 'it')}
                    onChange={(e) => set('topic', e.target.value)}
                  >
                    {['it', 'facilities', 'library', 'other'].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Summary">
                  <input
                    className={fieldClass}
                    value={String(fields.summary || '')}
                    onChange={(e) => set('summary', e.target.value)}
                  />
                </Field>
                <Field label="Details">
                  <textarea
                    className={fieldClass}
                    rows={4}
                    value={String(fields.details || '')}
                    onChange={(e) => set('details', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'grievance' ? (
              <>
                <Field label="Category">
                  <select
                    className={fieldClass}
                    value={String(fields.category || 'academic')}
                    onChange={(e) => set('category', e.target.value)}
                  >
                    {['academic', 'facilities', 'conduct', 'other'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Subject">
                  <input
                    className={fieldClass}
                    value={String(fields.subject || '')}
                    onChange={(e) => set('subject', e.target.value)}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    className={fieldClass}
                    rows={5}
                    value={String(fields.description || '')}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </Field>
                <Field label="Desired outcome">
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={String(fields.desired_outcome || '')}
                    onChange={(e) => set('desired_outcome', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'sensitive_report' ? (
              <>
                <Field label="Category">
                  <select
                    className={fieldClass}
                    value={String(fields.category || 'safety')}
                    onChange={(e) => set('category', e.target.value)}
                  >
                    {['safety', 'harassment', 'discrimination', 'other'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Narrative">
                  <textarea
                    className={fieldClass}
                    rows={6}
                    value={String(fields.narrative || '')}
                    onChange={(e) => set('narrative', e.target.value)}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-[var(--s-inkSoft)]">
                  <input
                    type="checkbox"
                    checked={Boolean(fields.contact_ok)}
                    onChange={(e) => set('contact_ok', e.target.checked)}
                  />
                  It is okay to contact me about this report
                </label>
              </>
            ) : null}

            {type === 'id_card_reissue' ? (
              <>
                <Field label="Reason">
                  <select
                    className={fieldClass}
                    value={String(fields.reason || 'lost')}
                    onChange={(e) => set('reason', e.target.value)}
                  >
                    {['lost', 'damaged', 'details_changed'].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Details">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={String(fields.reason_text || '')}
                    onChange={(e) => set('reason_text', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'health_profile_update' ? (
              <>
                <Field label="Blood group">
                  <input
                    className={fieldClass}
                    value={String(fields.blood_group || '')}
                    onChange={(e) => set('blood_group', e.target.value)}
                  />
                </Field>
                <Field label="Allergies">
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={String(fields.allergies || '')}
                    onChange={(e) => set('allergies', e.target.value)}
                  />
                </Field>
                <Field label="Conditions">
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={String(fields.conditions || '')}
                    onChange={(e) => set('conditions', e.target.value)}
                  />
                </Field>
                <Field label="Emergency contact">
                  <input
                    className={fieldClass}
                    value={String(fields.emergency_contact || '')}
                    onChange={(e) => set('emergency_contact', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'hostel_outpass' ? (
              <>
                <Field label="Reason">
                  <select
                    className={fieldClass}
                    value={String(fields.reason || 'family')}
                    onChange={(e) => set('reason', e.target.value)}
                  >
                    {['family', 'medical', 'academic', 'other'].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Destination">
                  <input
                    className={fieldClass}
                    value={String(fields.destination || '')}
                    onChange={(e) => set('destination', e.target.value)}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Leave at">
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={String(fields.leave_at || '')}
                      onChange={(e) => set('leave_at', e.target.value)}
                    />
                  </Field>
                  <Field label="Expected return">
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={String(fields.expected_return_at || '')}
                      onChange={(e) => set('expected_return_at', e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Details">
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={String(fields.reason_text || '')}
                    onChange={(e) => set('reason_text', e.target.value)}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-[var(--s-inkSoft)]">
                  <input
                    type="checkbox"
                    checked={Boolean(fields.guardian_ack)}
                    onChange={(e) => set('guardian_ack', e.target.checked)}
                  />
                  Guardian has acknowledged this outpass
                </label>
              </>
            ) : null}

            {type === 'fee_waiver' ? (
              <>
                <Field label="Invoice">
                  <select
                    className={fieldClass}
                    value={String(fields.invoice_id || '')}
                    onChange={(e) => set('invoice_id', e.target.value)}
                  >
                    {(opts?.invoices ?? []).map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.label} · {(inv.balanceMinor / 100).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Requested amount (minor units, optional)">
                  <input
                    type="number"
                    className={fieldClass}
                    value={String(fields.requested_amount_minor || '')}
                    onChange={(e) => set('requested_amount_minor', e.target.value)}
                  />
                </Field>
                <Field label="Reason">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={String(fields.reason_text || '')}
                    onChange={(e) => set('reason_text', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'payment_dispute' ? (
              <>
                <Field label="Payment intent">
                  <select
                    className={fieldClass}
                    value={String(fields.intent_id || '')}
                    onChange={(e) => {
                      const intent = opts?.paymentIntents.find((i) => i.id === e.target.value);
                      set('intent_id', e.target.value);
                      if (intent) {
                        set('provider', intent.provider);
                        set('provider_ref', intent.providerRef ?? '');
                        set('amount_minor', String(intent.amountMinor));
                      }
                    }}
                  >
                    {(opts?.paymentIntents ?? []).map((intent) => (
                      <option key={intent.id} value={intent.id}>
                        {intent.provider} · {(intent.amountMinor / 100).toLocaleString()} ·{' '}
                        {intent.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="When it happened">
                  <input
                    type="datetime-local"
                    className={fieldClass}
                    value={String(fields.occurred_at || '')}
                    onChange={(e) => set('occurred_at', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'revaluation' ? (
              <>
                <Field label="Published result">
                  <select
                    className={fieldClass}
                    value={String(fields.grade_entry_id || '')}
                    onChange={(e) => {
                      const entry = opts?.gradeEntries.find((g) => g.gradeEntryId === e.target.value);
                      set('grade_entry_id', e.target.value);
                      if (entry) {
                        set('subject_id', entry.subjectId);
                        set('current_score', String(entry.currentScore));
                      }
                    }}
                  >
                    {(opts?.gradeEntries ?? []).map((g) => (
                      <option key={g.gradeEntryId} value={g.gradeEntryId}>
                        {g.subjectName ?? 'Subject'} · {g.title ?? 'Assessment'} · {g.currentScore}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Request type">
                  <select
                    className={fieldClass}
                    value={String(fields.reason || 'revaluation')}
                    onChange={(e) => set('reason', e.target.value)}
                  >
                    <option value="total_recheck">Total recheck</option>
                    <option value="revaluation">Revaluation</option>
                  </select>
                </Field>
                <Field label="Note">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={String(fields.note || '')}
                    onChange={(e) => set('note', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'attendance_correction' ? (
              <>
                <Field label="Sessions to correct">
                  <div className="space-y-2">
                    {(opts?.attendanceAbsences ?? []).map((row) => {
                      const ids = (fields.session_ids as string[]) ?? [];
                      const checked = ids.includes(row.sessionId);
                      return (
                        <label
                          key={row.sessionId}
                          className="flex items-center gap-2 text-sm text-[var(--s-inkSoft)]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...ids, row.sessionId]
                                : ids.filter((id) => id !== row.sessionId);
                              set('session_ids', next.slice(0, 5));
                            }}
                          />
                          {row.date} · {row.subjectName ?? 'Session'} · {row.status}
                        </label>
                      );
                    })}
                    {(opts?.attendanceAbsences?.length ?? 0) === 0 ? (
                      <p className="text-xs text-[var(--s-muted)]">
                        No recent absent/late sessions found.
                      </p>
                    ) : null}
                  </div>
                </Field>
                <Field label="Note">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={String(fields.note || '')}
                    onChange={(e) => set('note', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'campus_library_renewal' || type === 'loan_renewal' ? (
              <>
                <Field label="Loan">
                  <select
                    className={fieldClass}
                    value={String(fields.loan_id || '')}
                    onChange={(e) => set('loan_id', e.target.value)}
                  >
                    {(opts?.libraryLoans ?? []).map((loan) => (
                      <option key={loan.id} value={loan.id}>
                        {loan.title}
                        {loan.dueDate ? ` · due ${loan.dueDate}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Renewal days">
                  <input
                    type="number"
                    min={1}
                    max={14}
                    className={fieldClass}
                    value={String(fields.renewal_days || 7)}
                    onChange={(e) => set('renewal_days', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'transport_change' || type === 'transport_renewal' ? (
              <>
                {!opts?.transportAssignment ? (
                  <p className="text-sm text-[var(--s-muted)]">
                    No active transport assignment found for your account.
                  </p>
                ) : (
                  <p className="text-sm text-[var(--s-inkSoft)]">
                    Current route: {opts.transportAssignment.routeName ?? '—'}
                    {opts.transportAssignment.stopName
                      ? ` · ${opts.transportAssignment.stopName}`
                      : ''}
                  </p>
                )}
                {type === 'transport_change' ? (
                  <>
                    <Field label="Requested route">
                      <select
                        className={fieldClass}
                        value={String(fields.requested_route_id || '')}
                        onChange={(e) => set('requested_route_id', e.target.value)}
                      >
                        <option value="">Keep current / unspecified</option>
                        {(opts?.transportRoutes ?? []).map((route) => (
                          <option key={route.id} value={route.id}>
                            {route.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Requested stop">
                      <input
                        className={fieldClass}
                        value={String(fields.requested_stop || '')}
                        onChange={(e) => set('requested_stop', e.target.value)}
                      />
                    </Field>
                    <Field label="Effective date">
                      <input
                        type="date"
                        className={fieldClass}
                        value={String(fields.effective_date || '')}
                        onChange={(e) => set('effective_date', e.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Term months">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className={fieldClass}
                      value={String(fields.term_months || 12)}
                      onChange={(e) => set('term_months', e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Reason">
                  <textarea
                    className={fieldClass}
                    rows={3}
                    value={String(fields.reason_text || '')}
                    onChange={(e) => set('reason_text', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {type === 'club_join' ? (
              <>
                <Field label="Club">
                  <select
                    className={fieldClass}
                    value={String(fields.club_id || '')}
                    onChange={(e) => set('club_id', e.target.value)}
                  >
                    {(opts?.clubs ?? []).map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Statement">
                  <textarea
                    className={fieldClass}
                    rows={4}
                    value={String(fields.statement || '')}
                    onChange={(e) => set('statement', e.target.value)}
                  />
                </Field>
              </>
            ) : null}

            {error ? <p className="text-sm text-[var(--s-danger)]">{error}</p> : null}

            <Button
              loading={submit.isPending}
              loadingLabel="Submitting…"
              onClick={() => {
                setError(null);
                submit.mutate();
              }}
            >
              Submit request
            </Button>
          </SurfaceCard>
        </div>
      )}
    </QueryPage>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-[var(--s-ink)]">{label}</span>
      {children}
    </label>
  );
}
