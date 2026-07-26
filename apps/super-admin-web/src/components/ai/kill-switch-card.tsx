'use client';
import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent } from '@edrion/ui';
import { useSetAiKillSwitch, type AiGovernanceOverviewDto } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { errorMessage } from '@/lib/errors';

/**
 * Global emergency AI kill switch. Short-circuits every AI action to BLOCKED regardless of mode.
 * Sensitive (ai.disable) — requires recent auth at the API.
 */
export function KillSwitchCard({ overview }: { overview?: AiGovernanceOverviewDto }) {
  const setKill = useSetAiKillSwitch();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = overview?.killSwitchActive ?? false;
  const enabling = !active;

  function run(reason: string) {
    setError(null);
    setKill.mutate(
      { scope: 'global', scopeId: null, enabled: enabling, reason },
      {
        onSuccess: () => setOpen(false),
        onError: (e) => setError(errorMessage(e, 'Could not toggle the kill switch.')),
      },
    );
  }

  return (
    <Card className={active ? 'border-danger' : undefined}>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <span
            className={
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
              (active ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')
            }
          >
            {active ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Emergency kill switch — {active ? 'ACTIVE' : 'off'}
            </div>
            <p className="text-xs text-text-muted">
              {active
                ? 'All AI actions are blocked platform-wide, overriding every policy.'
                : 'Instantly block every AI action across the platform.'}
            </p>
          </div>
        </div>
        <Button
          variant={active ? 'secondary' : 'danger'}
          size="sm"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          {active ? 'Re-enable AI' : 'Activate kill switch'}
        </Button>
      </CardContent>

      <ConfirmDialog
        open={open}
        title={enabling ? 'Activate AI kill switch' : 'Re-enable AI'}
        description={
          enabling
            ? 'Immediately blocks every AI action platform-wide. This is a critical, audited action.'
            : 'Lifts the global kill switch. Per-scope policies and confirmations still apply.'
        }
        tone={enabling ? 'danger' : 'primary'}
        confirmLabel={enabling ? 'Activate kill switch' : 'Re-enable AI'}
        loading={setKill.isPending}
        error={error}
        onConfirm={run}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}
