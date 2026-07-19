'use client';
import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Button, Label, Select } from '@edrion/ui';
import {
  ApiClientError,
  usePlan,
  usePlans,
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

/** Move a subscription to a different published plan, with a proration preview before commit. */
export function ChangePlanDialog({ sub, onChanged }: { sub: SubscriptionDetailDto; onChanged?: () => void }) {
  const plansQuery = usePlans({ status: 'published', pageSize: 100 });
  const previewMut = useSubscriptionPreview(sub.id, 'plan-change');
  const action = useSubscriptionAction(sub.id);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'form' | 'confirm'>('form');
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState(sub.billingCycle);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [proration, setProration] = useState<PlanChangeProrationDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planDetail = usePlan(planId);
  const targetVersionId = planDetail.data?.publishedVersionId ?? null;

  function reset() {
    setStage('form');
    setPlanId('');
    setCycle(sub.billingCycle);
    setEffectiveDate('');
    setProration(null);
    setError(null);
  }

  function runPreview() {
    setError(null);
    if (!targetVersionId) return setError('Select a plan with a published version.');
    previewMut.mutate(
      { planVersionId: targetVersionId, billingCycle: cycle, effectiveDate: toIso(effectiveDate) },
      {
        onSuccess: (d) => { setProration(d); setStage('confirm'); },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not price this change.'),
      },
    );
  }

  function runApply(reason: string) {
    setError(null);
    if (!targetVersionId) return;
    action.mutate(
      {
        action: 'change-plan',
        body: { planVersionId: targetVersionId, billingCycle: cycle, effectiveDate: toIso(effectiveDate), reason, version: sub.version },
      },
      {
        onSuccess: () => { setOpen(false); reset(); onChanged?.(); },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not change the plan.'),
      },
    );
  }

  const isForm = stage === 'form';
  const plans = (plansQuery.data?.items ?? []).filter((p) => p.id !== sub.planId);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Repeat className="h-4 w-4" /> Change plan
      </Button>

      <ConfirmDialog
        open={open}
        title={isForm ? 'Change plan' : 'Confirm plan change'}
        description={
          isForm
            ? 'Move to a different published plan. You will review the prorated impact before it is applied.'
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
          <div className="space-y-3">
            <div>
              <Label htmlFor="cp-plan">Target plan</Label>
              <Select id="cp-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className={fieldClass} placeholder="Select a published plan…" options={[{ value: '', label: 'Select a published plan…' }, ...plans.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))]} />
              {planId && !targetVersionId && !planDetail.isLoading && (
                <p className="mt-1 text-xs text-warning">This plan has no published version.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cp-cycle">Billing cycle</Label>
                <Select id="cp-cycle" value={cycle} onChange={(e) => setCycle(e.target.value)} className={fieldClass} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }]} />
              </div>
              <div>
                <Label htmlFor="cp-eff">Effective date</Label>
                <input id="cp-eff" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={fieldClass} />
              </div>
            </div>
          </div>
        ) : proration ? (
          <>
            <ProrationBreakdown proration={proration} />
            <button type="button" onClick={() => { setStage('form'); setError(null); }} className="text-xs text-text-muted underline-offset-2 hover:text-text-primary hover:underline">
              ← Edit selection
            </button>
          </>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
