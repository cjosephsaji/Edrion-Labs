'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button, Label } from '@edrion/ui';
import { INSTITUTION_ROLES } from '@edrion/schemas';
import { ApiClientError, useInviteInstitutionUser } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/** Invite a new user into a specific institution. Roles assigned here; campus access on detail. */
export function InviteUserDialog({
  institutionId,
  institutionName,
  onInvited,
}: {
  institutionId: string;
  institutionName?: string;
  onInvited?: () => void;
}) {
  const invite = useInviteInstitutionUser();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail('');
    setFullName('');
    setRoleKeys([]);
    setError(null);
  }

  function toggleRole(key: string) {
    setRoleKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function onConfirm() {
    setError(null);
    if (!email.trim() || !fullName.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (roleKeys.length === 0) {
      setError('Assign at least one role.');
      return;
    }
    invite.mutate(
      { institutionId, email: email.trim(), fullName: fullName.trim(), roleKeys },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
          onInvited?.();
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not send the invitation.'),
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
        <UserPlus className="h-4 w-4" /> Invite user
      </Button>

      <ConfirmDialog
        open={open}
        title={institutionName ? `Invite a user to ${institutionName}` : 'Invite a user'}
        description="They receive an email invitation. You can assign campus access after they appear in the directory."
        requireReason={false}
        confirmLabel="Send invitation"
        loading={invite.isPending}
        error={error}
        onConfirm={onConfirm}
        onClose={() => setOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="invite-name">Full name</Label>
            <input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <div>
          <Label>Roles</Label>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {INSTITUTION_ROLES.map((r) => (
              <label
                key={r.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-text-secondary hover:bg-background-secondary"
              >
                <input type="checkbox" checked={roleKeys.includes(r.key)} onChange={() => toggleRole(r.key)} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
