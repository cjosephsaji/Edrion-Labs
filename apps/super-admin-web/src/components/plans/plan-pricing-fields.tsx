'use client';
import { Label, Select } from '@edrion/ui';
import type { PlanVersionDto, PlanVersionPricingPayload } from '@edrion/api-client';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED'];
const SUPPORT_TIERS = ['standard', 'priority', 'enterprise'];

/** String-backed form mirror of the pricing payload (inputs hold raw strings). */
export interface PricingForm {
  currency: string;
  supportTier: string;
  monthly: string;
  annual: string;
  baseCampusAllowance: string;
  perCampus: string;
  trialDays: string;
  /** One `key=number` per line. */
  usageLimits: string;
  /** Comma/newline separated feature keys, all entitled (true). */
  featureEntitlements: string;
}

export function emptyPricingForm(): PricingForm {
  return {
    currency: 'USD',
    supportTier: 'standard',
    monthly: '',
    annual: '',
    baseCampusAllowance: '1',
    perCampus: '',
    trialDays: '0',
    usageLimits: '',
    featureEntitlements: '',
  };
}

/** Seed a new-version form from the version being superseded (so edits start from current). */
export function pricingFormFromVersion(v: PlanVersionDto): PricingForm {
  return {
    currency: v.currency,
    supportTier: v.supportTier,
    monthly: (v.monthlyPriceMinor / 100).toString(),
    annual: (v.annualPriceMinor / 100).toString(),
    baseCampusAllowance: String(v.baseCampusAllowance),
    perCampus: (v.perCampusPriceMinor / 100).toString(),
    trialDays: String(v.trialDays),
    usageLimits: Object.entries(v.usageLimits)
      .map(([k, n]) => `${k}=${n}`)
      .join('\n'),
    featureEntitlements: Object.entries(v.featureEntitlements)
      .filter(([, on]) => on)
      .map(([k]) => k)
      .join(', '),
  };
}

function toMinor(major: string): number | null {
  if (major.trim() === '') return 0;
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Validate + convert the form into the wire payload. Returns an error string on bad input. */
export function toPricingPayload(
  form: PricingForm,
): { ok: true; value: PlanVersionPricingPayload } | { ok: false; error: string } {
  const monthly = toMinor(form.monthly);
  const annual = toMinor(form.annual);
  const perCampus = toMinor(form.perCampus);
  if (monthly === null || annual === null || perCampus === null) {
    return { ok: false, error: 'Prices must be non-negative numbers.' };
  }
  const baseCampusAllowance = Number(form.baseCampusAllowance);
  const trialDays = Number(form.trialDays);
  if (!Number.isInteger(baseCampusAllowance) || baseCampusAllowance < 0) {
    return { ok: false, error: 'Base campus allowance must be a non-negative whole number.' };
  }
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
    return { ok: false, error: 'Trial days must be between 0 and 365.' };
  }

  const usageLimits: Record<string, number> = {};
  for (const line of form.usageLimits.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [k, v] = line.split('=').map((s) => s.trim());
    const n = Number(v);
    if (!k || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: `Usage limit "${line}" must be in the form key=whole-number.` };
    }
    usageLimits[k] = n;
  }

  const featureEntitlements: Record<string, boolean> = {};
  for (const key of form.featureEntitlements.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
    featureEntitlements[key] = true;
  }

  return {
    ok: true,
    value: {
      currency: form.currency,
      supportTier: form.supportTier,
      monthlyPriceMinor: monthly,
      annualPriceMinor: annual,
      baseCampusAllowance,
      perCampusPriceMinor: perCampus,
      trialDays,
      usageLimits,
      featureEntitlements,
    },
  };
}

export function PlanPricingFields({
  value,
  onChange,
}: {
  value: PricingForm;
  onChange: (next: PricingForm) => void;
}) {
  const set = (patch: Partial<PricingForm>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="plan-currency">Currency</Label>
          <Select id="plan-currency" value={value.currency} onChange={(e) => set({ currency: e.target.value })} className={fieldClass} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>
        <div>
          <Label htmlFor="plan-support">Support tier</Label>
          <Select id="plan-support" value={value.supportTier} onChange={(e) => set({ supportTier: e.target.value })} className={fieldClass} options={SUPPORT_TIERS.map((t) => ({ value: t, label: t }))} />
        </div>
        <div>
          <Label htmlFor="plan-monthly">Monthly price</Label>
          <input id="plan-monthly" type="number" min={0} step="0.01" value={value.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="499.00" className={fieldClass} />
        </div>
        <div>
          <Label htmlFor="plan-annual">Annual price</Label>
          <input id="plan-annual" type="number" min={0} step="0.01" value={value.annual} onChange={(e) => set({ annual: e.target.value })} placeholder="4990.00" className={fieldClass} />
        </div>
        <div>
          <Label htmlFor="plan-base">Base campus allowance</Label>
          <input id="plan-base" type="number" min={0} step="1" value={value.baseCampusAllowance} onChange={(e) => set({ baseCampusAllowance: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <Label htmlFor="plan-percampus">Per-campus price</Label>
          <input id="plan-percampus" type="number" min={0} step="0.01" value={value.perCampus} onChange={(e) => set({ perCampus: e.target.value })} placeholder="99.00" className={fieldClass} />
        </div>
        <div>
          <Label htmlFor="plan-trial">Trial days</Label>
          <input id="plan-trial" type="number" min={0} max={365} step="1" value={value.trialDays} onChange={(e) => set({ trialDays: e.target.value })} className={fieldClass} />
        </div>
      </div>
      <div>
        <Label htmlFor="plan-usage">Usage limits (key=number per line)</Label>
        <textarea id="plan-usage" rows={2} value={value.usageLimits} onChange={(e) => set({ usageLimits: e.target.value })} placeholder={'ai_messages=5000\nstorage_gb=50'} className={`${fieldClass} resize-none font-mono text-xs`} />
      </div>
      <div>
        <Label htmlFor="plan-features">Feature entitlements (comma-separated keys)</Label>
        <textarea id="plan-features" rows={2} value={value.featureEntitlements} onChange={(e) => set({ featureEntitlements: e.target.value })} placeholder="copilot, advanced_reports, sso" className={`${fieldClass} resize-none font-mono text-xs`} />
      </div>
    </div>
  );
}
