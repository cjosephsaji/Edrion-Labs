'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Label, Select } from '@edrion/ui';
import { ApiClientError, useCreatePlanDraft, type PlanDetailDto } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  PlanPricingFields,
  emptyPricingForm,
  toPricingPayload,
  type PricingForm,
} from './plan-pricing-fields';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/**
 * Create a draft plan with its first version (v1). No charge, not sensitive — the draft is
 * inert until published. Pricing is captured up-front so v1 is fully formed.
 */
export function CreatePlanDialog({ onCreated }: { onCreated?: (plan: PlanDetailDto) => void }) {
  const createMut = useCreatePlanDraft();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('institution');
  const [pricing, setPricing] = useState<PricingForm>(emptyPricingForm());

  function reset() {
    setError(null);
    setKey('');
    setName('');
    setDescription('');
    setAudience('institution');
    setPricing(emptyPricingForm());
  }

  function submit() {
    setError(null);
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(key.trim())) {
      return setError('Key: lower_snake_case, starts with a letter (2–48 chars).');
    }
    if (name.trim().length < 2) return setError('Plan name is required (min 2 characters).');
    const priced = toPricingPayload(pricing);
    if (!priced.ok) return setError(priced.error);

    createMut.mutate(
      {
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        audience,
        pricing: priced.value,
      },
      {
        onSuccess: (plan) => {
          setOpen(false);
          reset();
          onCreated?.(plan);
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not create the plan.'),
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4" /> New plan
      </Button>

      <ConfirmDialog
        open={open}
        title="Create a draft plan"
        description="Define the plan and its first version. Drafts are inert until you publish a version."
        requireReason={false}
        confirmLabel="Create draft"
        loading={createMut.isPending}
        error={error}
        onConfirm={submit}
        onClose={() => { setOpen(false); reset(); }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="plan-key">Key</Label>
            <input id="plan-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="institution_pro" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="plan-name">Name</Label>
            <input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Institution Pro" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="plan-audience">Audience</Label>
            <Select id="plan-audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={fieldClass} options={[{ value: 'institution', label: 'Institution' }, { value: 'independent', label: 'Independent' }]} />
          </div>
          <div>
            <Label htmlFor="plan-desc">Description</Label>
            <input id="plan-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <div className="mt-1 border-t border-border pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Version 1 pricing</div>
          <PlanPricingFields value={pricing} onChange={setPricing} />
        </div>
      </ConfirmDialog>
    </>
  );
}
