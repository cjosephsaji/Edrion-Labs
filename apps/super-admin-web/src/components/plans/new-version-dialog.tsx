'use client';
import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button, Label } from '@edrion/ui';
import {
  ApiClientError,
  useCreatePlanVersion,
  type PlanDetailDto,
  type PlanVersionDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  PlanPricingFields,
  emptyPricingForm,
  pricingFormFromVersion,
  toPricingPayload,
  type PricingForm,
} from './plan-pricing-fields';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/**
 * Cut a new draft version. Editing a published plan never mutates the live version — it always
 * produces a fresh draft (immutable history). The form seeds from the latest version so the
 * operator edits from current pricing.
 */
export function NewVersionDialog({
  planId,
  seedFrom,
  onDone,
}: {
  planId: string;
  seedFrom?: PlanVersionDto;
  onDone?: (plan: PlanDetailDto) => void;
}) {
  const mut = useCreatePlanVersion(planId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pricing, setPricing] = useState<PricingForm>(emptyPricingForm());

  function start() {
    setError(null);
    setNote('');
    setPricing(seedFrom ? pricingFormFromVersion(seedFrom) : emptyPricingForm());
    setOpen(true);
  }

  function submit() {
    setError(null);
    const priced = toPricingPayload(pricing);
    if (!priced.ok) return setError(priced.error);
    mut.mutate(
      { pricing: priced.value, note: note.trim() || undefined },
      {
        onSuccess: (plan) => {
          setOpen(false);
          onDone?.(plan);
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not create a new version.'),
      },
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={start}>
        <GitBranch className="h-4 w-4" /> New version
      </Button>

      <ConfirmDialog
        open={open}
        title="Cut a new plan version"
        description="A new draft version is created. The current version is left untouched until you publish the new one."
        requireReason={false}
        confirmLabel="Create version"
        loading={mut.isPending}
        error={error}
        onConfirm={submit}
        onClose={() => setOpen(false)}
      >
        <div>
          <Label htmlFor="version-note">Changelog note (optional)</Label>
          <input id="version-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Q3 price increase" className={fieldClass} />
        </div>
        <div className="mt-1 border-t border-border pt-3">
          <PlanPricingFields value={pricing} onChange={setPricing} />
        </div>
      </ConfirmDialog>
    </>
  );
}
