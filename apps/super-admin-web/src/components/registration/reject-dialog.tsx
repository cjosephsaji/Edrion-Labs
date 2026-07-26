'use client';
import { useState } from 'react';
import { Dialog, Button, Label, FieldError } from '@edrion/ui';
import { ApiClientError, useRejectRegistration, type RegistrationRequestDto } from '@edrion/api-client';

const textareaCls =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

/** Guided rejection: a required reason (emailed to the applicant) + an optional employee-only note. */
export function RejectDialog({
  open,
  onClose,
  request,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  request: RegistrationRequestDto;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useRejectRegistration(request.id);

  const submit = () => {
    if (reason.trim().length < 5) {
      setError('Provide a reason of at least 5 characters.');
      return;
    }
    setError(null);
    mutation.mutate(
      { version: request.version, reason: reason.trim(), internalNote: note.trim() || undefined },
      {
        onSuccess: () => {
          onDone();
          onClose();
        },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Failed to reject. Please retry.'),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="Reject application">
      <div className="p-5">
        <h2 className="text-md font-semibold text-text-primary">Reject application</h2>
        <p className="mt-1 text-sm text-text-secondary">
          The reason below is included in the email sent to the applicant. Keep it professional.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="reject-reason">Rejection reason (sent to applicant)</Label>
            <textarea
              id="reject-reason"
              rows={3}
              className={textareaCls}
              placeholder="e.g. We're not currently onboarding institutions in this region."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reject-note">Internal note (optional, employees only)</Label>
            <textarea
              id="reject-note"
              rows={2}
              className={textareaCls}
              placeholder="Context for the team — never shown to the applicant."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <FieldError>{error}</FieldError>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={mutation.isPending} disabled={mutation.isPending}>
            Reject application
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
