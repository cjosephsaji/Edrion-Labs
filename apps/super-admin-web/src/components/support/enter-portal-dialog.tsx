'use client';
import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button, Label, cn, Select } from '@edrion/ui';
import { ACCESS_LEVELS } from '@edrion/schemas';
import {
  ApiClientError,
  useCurrentEmployee,
  useStartSupportSession,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSupportSession } from '@/lib/support-session';

const DURATIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
];

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/**
 * "Enter Institution Portal" — opens a time-boxed, audited support-access session. Shown only to
 * employees holding `institutions.access_portal`. On confirm it creates the session server-side
 * (recent-auth enforced there) and flips the app into support mode (persistent banner).
 */
export function EnterPortalDialog({
  institutionId,
  institutionName,
}: {
  institutionId: string;
  institutionName: string;
}) {
  const { data: me } = useCurrentEmployee();
  const { active, enter } = useSupportSession();
  const start = useStartSupportSession();

  const [open, setOpen] = useState(false);
  const [accessLevel, setAccessLevel] = useState<string>('support');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [caseRef, setCaseRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canAccess =
    !me || me.permissions.includes('institutions.access_portal') || me.roleKeys.includes('platform_owner');
  if (!canAccess) return null;

  const alreadyHere = active?.institutionId === institutionId;

  function onConfirm(reason: string) {
    setError(null);
    start.mutate(
      {
        institutionId,
        accessLevel,
        reason,
        durationMinutes,
        caseRef: caseRef.trim() || undefined,
      },
      {
        onSuccess: (session) => {
          enter({
            sessionId: session.id,
            institutionId: session.institutionId,
            institutionName: session.institutionName ?? institutionName,
            employeeName: session.employeeName,
            accessLevel: session.accessLevel,
            reason: session.reason,
            expiresAt: session.expiresAt,
          });
          setOpen(false);
          setCaseRef('');
        },
        onError: (e) =>
          setError(
            e instanceof ApiClientError
              ? e.message
              : 'Could not start the support session. Please retry.',
          ),
      },
    );
  }

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={alreadyHere}
        title={alreadyHere ? 'You are already in this institution portal' : undefined}
      >
        <LogIn className="h-4 w-4" />
        {alreadyHere ? 'In portal' : 'Enter portal'}
      </Button>

      <ConfirmDialog
        open={open}
        title={`Enter ${institutionName} portal?`}
        description="You will act as yourself inside this institution. Every action you take is recorded against this support session and the audit trail."
        confirmLabel="Start session"
        loading={start.isPending}
        error={error}
        onConfirm={onConfirm}
        onClose={() => setOpen(false)}
      >
        <div className="rounded-md bg-background-secondary px-3 py-2 text-sm text-text-secondary">
          Accessing as <span className="font-medium text-text-primary">{me?.fullName ?? '—'}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="access-level">Access level</Label>
            <Select
              id="access-level"
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value)}
              className={cn(fieldClass, 'capitalize')}
              options={ACCESS_LEVELS.map((lvl) => ({ value: lvl, label: lvl.replace(/_/g, ' ') }))}
            />
          </div>
          <div>
            <Label htmlFor="duration">Duration</Label>
            <Select
              id="duration"
              value={String(durationMinutes)}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className={fieldClass}
              options={DURATIONS.map((d) => ({ value: String(d.value), label: d.label }))}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="case-ref">Support case / ticket reference (optional)</Label>
          <input
            id="case-ref"
            value={caseRef}
            onChange={(e) => setCaseRef(e.target.value)}
            placeholder="e.g. CASE-1042"
            maxLength={64}
            className={fieldClass}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
