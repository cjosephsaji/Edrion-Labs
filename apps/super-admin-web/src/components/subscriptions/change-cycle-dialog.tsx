'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Label } from '@edrion/ui';
import {
  ApiClientError,
  useSubscriptionAction,
  useSubscriptionPreview,
  type PlanChangeProrationDto,
  type SubscriptionDetailDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProrationBreakdown } from './proration-breakdown';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

function toIso(date: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Switch billing cycle (monthly ⇄ annual) with a proration preview before commit. */
export function ChangeCycleDialog({ sub, onChanged }: { sub: SubscriptionDetailDto; onChanged?: () => void }) {
  const target = sub.billingCycle === 'annual' ? 'monthly' : 'annual';
  const previewMut = useSubscriptionPreview(sub.id, 'cycle-change');
  const action = useSubscriptionAction(sub.id);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'form' | 'confirm'>('form');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [proration, setProration] = useState<PlanChangeProrationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStage('form');
    setEffectiveDate('');
    setProration(null);
    setError(null);
  }

  function runPreview() {
    setError(null);
    previewMut.mutate(
      { billingCycle: target, effectiveDate: toIso(effectiveDate) },
      {
        onSuccess: (d) => { setProration(d); setStage('confirm'); },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not price this change.'),
      },
    );
  }

  function runApply(reason: string) {
    setError(null);
    action.mutate(
      { action: 'change-cycle', body: { billingCycle: target, effectiveDate: toIso(effectiveDate), reason, version: sub.version } },
      {
        onSuccess: () => { setOpen(false); reset(); onChanged?.(); },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not change the cycle.'),
      },
    );
  }

  const isForm = stage === 'form';

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}>
        <RefreshCw className="h-4 w-4" /> Switch to {target}
      </Button>

      <ConfirmDialog
        open={open}
        title={isForm ? `Switch to ${target} billing` : 'Confirm cycle change'}
        description={
          isForm
            ? `Move this subscription from ${sub.billingCycle} to ${target} billing. Review the prorated impact before applying.`
            : 'Review the prorated impact below. Applying is logged to the audit trail.'
        }
        requireReason={!isForm}
        confirmLabel={isForm ? 'Preview impact' : 'Apply change'}
        loading={isForm ? previewMut.isPending : action.isPending}
        error={error}
        onConfirm={isForm ? () => runPreview() : runApply}
        onClose={() => { setOpen(false); reset(); }}
      >
        {isForm ? (
          <div>
            <Label htmlFor="cc-eff">Effective date (optional)</Label>
            <input id="cc-eff" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={fieldClass} />
          </div>
        ) : proration ? (
          <>
            <ProrationBreakdown proration={proration} />
            <button type="button" onClick={() => { setStage('form'); setError(null); }} className="text-xs text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
              ← Edit
            </button>
          </>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
