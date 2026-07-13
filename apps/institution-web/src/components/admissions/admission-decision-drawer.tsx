'use client';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Drawer, Label, Select } from '@edrion/ui';
import { useDecideAdmission } from '@/lib/admissions';
import { PortalClientError } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';
import type { AdmissionDecision, AdmissionRow } from '@/lib/admissions-types';

const DECISION_OPTIONS: { value: AdmissionDecision; label: string }[] = [
  { value: 'accepted', label: 'Accept' },
  { value: 'waitlisted', label: 'Waitlist' },
  { value: 'info_requested', label: 'Request more info' },
  { value: 'rejected', label: 'Reject' },
];

/**
 * Record a decision on an application: pick an outcome (accept/waitlist/request-info/reject), add an
 * optional note, and optionally notify by email. On success the API stamps status + decision_date,
 * and — when notify is on and an email is on file (guardian email, else the verified contact email
 * from the public funnel) — fans out a notification.
 */
export function AdmissionDecisionDrawer({
  application,
  open,
  onClose,
}: {
  application: AdmissionRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const decide = useDecideAdmission();
  const [decision, setDecision] = useState<AdmissionDecision>('accepted');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && application) {
      setDecision('accepted');
      setNote(application.decisionNote ?? '');
      setNotify(true);
      setError(null);
    }
  }, [open, application]);

  // Guardian email if present, else the verified contact email a public applicant submitted with.
  const notifyEmail = application?.guardianEmail ?? application?.email ?? null;
  const hasEmail = !!notifyEmail;

  async function submit() {
    if (!application) return;
    setError(null);
    try {
      await decide.mutateAsync({
        id: application.id,
        body: { decision, note: note.trim() || undefined, notify, version: application.version },
      });
      onClose();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not record this decision.');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Record decision"
      description={application ? `${formatPersonName(application)} (${application.applicationNo})` : ''}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={decide.isPending}>
            Save decision
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
            rows={4}
            maxLength={500}
            placeholder="Shared with the guardian when they're notified."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
          />
        </div>
        <label className="flex items-center gap-2.5 text-sm text-text-primary">
          <Checkbox
            checked={notify && hasEmail}
            disabled={!hasEmail}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Notify by email
        </label>
        {hasEmail ? (
          <p className="-mt-1 text-xs text-text-muted">Sends to {notifyEmail}.</p>
        ) : (
          <p className="-mt-1 text-xs text-text-muted">No email on file — nothing will be sent.</p>
        )}
      </div>
    </Drawer>
  );
}
