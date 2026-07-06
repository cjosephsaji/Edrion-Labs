'use client';

import { useState } from 'react';
import { Button, Input, Label, Select } from '@edrion/ui';
import { useInviteStudentToPortal } from '@/lib/student-portal';

interface GuardianOption {
  id: string;
  label: string;
}

interface Props {
  studentId: string;
  studentName: string;
  studentEmail?: string | null;
  guardians: GuardianOption[];
  onDone?: () => void;
}

export function StudentPortalInviteDialog({
  studentId,
  studentName,
  studentEmail,
  guardians,
  onDone,
}: Props) {
  const invite = useInviteStudentToPortal();
  const [mode, setMode] = useState<'email' | 'guardian'>(guardians.length ? 'guardian' : 'email');
  const [email, setEmail] = useState(studentEmail ?? '');
  const [guardianId, setGuardianId] = useState(guardians[0]?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit() {
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

      <Button onClick={onSubmit} loading={invite.isPending} disabled={mode === 'email' && !email}>
        Send invitation
      </Button>
    </div>
  );
}
