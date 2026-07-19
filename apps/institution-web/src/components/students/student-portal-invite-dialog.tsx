'use client';

import { useState } from 'react';
import { Button, Input, Label, Select } from '@edrion/ui';
import { useInviteStudentToPortal, useSendStudentPortalPasswordReset } from '@/lib/student-portal';

interface GuardianOption {
  id: string;
  label: string;
}

interface Props {
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  guardians: GuardianOption[];
  /** When set, the student already has a portal account — show password reset instead of invite. */
  institutionUserId?: string | null;
  portalUserStatus?: string | null;
  onDone?: () => void;
}

export function StudentPortalInviteDialog({
  studentId,
  studentName,
  studentEmail,
  guardians,
  institutionUserId,
  portalUserStatus,
  onDone,
}: Props) {
  const invite = useInviteStudentToPortal();
  const reset = useSendStudentPortalPasswordReset();
  const [mode, setMode] = useState<'email' | 'guardian'>(guardians.length ? 'guardian' : 'email');
  const [email, setEmail] = useState(studentEmail ?? '');
  const [guardianId, setGuardianId] = useState(guardians[0]?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const linked = Boolean(institutionUserId);
  const suspended = portalUserStatus === 'disabled';
  const invitedOnly = linked && portalUserStatus === 'invited';

  async function onSubmitInvite() {
    setMessage(null);
    try {
      await invite.mutateAsync({
        studentId,
        ...(mode === 'email' ? { targetEmail: email } : { guardianParentId: guardianId }),
      });
      setMessage('Invitation sent.');
      onDone?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Invite failed');
    }
  }

  async function onSubmitReset() {
    setMessage(null);
    try {
      const result = await reset.mutateAsync(studentId);
      setMessage(`Password reset email sent to ${result.email}.`);
      onDone?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Password reset failed');
    }
  }

  if (linked) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{studentName}</span> already has a portal
          account
          {portalUserStatus ? (
            <>
              {' '}
              (<span className="font-medium text-text-primary">{portalUserStatus}</span>)
            </>
          ) : null}
          .
          {suspended
            ? ' Unsuspend the account before sending a password reset.'
            : invitedOnly
              ? ' They have not activated yet — wait for them to use their invitation, or contact support if the link expired.'
              : ' Send a password reset link instead of a new invitation.'}
        </p>

        {message && <p className="text-sm text-text-secondary">{message}</p>}

        {!suspended && !invitedOnly && (
          <Button onClick={onSubmitReset} loading={reset.isPending}>
            Send password reset
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Invite <span className="font-medium text-text-primary">{studentName}</span> to the student portal.
        They will receive an activation link to set a password.
      </p>

      {guardians.length > 0 && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'guardian' ? 'primary' : 'secondary'}
            onClick={() => setMode('guardian')}
          >
            Via guardian
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'email' ? 'primary' : 'secondary'}
            onClick={() => setMode('email')}
          >
            Student email
          </Button>
        </div>
      )}

      {mode === 'email' ? (
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@school.edu"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="invite-guardian">Guardian</Label>
          <Select
            id="invite-guardian"
            value={guardianId}
            onChange={(e) => setGuardianId(e.target.value)}
            options={guardians.map((g) => ({ value: g.id, label: g.label }))}
          />
        </div>
      )}

      {message && <p className="text-sm text-text-secondary">{message}</p>}

      <Button onClick={onSubmitInvite} loading={invite.isPending} disabled={mode === 'email' && !email}>
        Send invitation
      </Button>
    </div>
  );
}
