'use client';
import { useState } from 'react';
import { Button, Label } from '@edrion/ui';
import {
  ApiClientError,
  useSubscriptionAction,
  type SubscriptionDetailDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ChangePlanDialog } from './change-plan-dialog';
import { ChangeCycleDialog } from './change-cycle-dialog';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

type ActionKey =
  | 'extend-trial'
  | 'add-addon'
  | 'override-pricing'
  | 'discount'
  | 'credit'
  | 'usage-limits'
  | 'overage'
  | 'grace'
  | 'pause'
  | 'resume'
  | 'cancel';

const TITLES: Record<ActionKey, { title: string; label: string; tone?: 'danger' }> = {
  'extend-trial': { title: 'Extend trial', label: 'Extend trial' },
  'add-addon': { title: 'Add campus add-on', label: 'Add add-on' },
  'override-pricing': { title: 'Override pricing', label: 'Override pricing' },
  discount: { title: 'Set discount', label: 'Discount' },
  credit: { title: 'Adjust credit', label: 'Credit' },
  'usage-limits': { title: 'Set usage limits', label: 'Usage limits' },
  overage: { title: 'Set overage policy', label: 'Overage' },
  grace: { title: 'Set grace period', label: 'Grace' },
  pause: { title: 'Pause subscription', label: 'Pause' },
  resume: { title: 'Resume subscription', label: 'Resume' },
  cancel: { title: 'Cancel subscription', label: 'Cancel', tone: 'danger' },
};

function iso(date?: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function toMinor(major?: string): number | undefined {
  if (!major || major.trim() === '') return undefined;
  const n = Number(major);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function SubscriptionActions({ sub, onChanged }: { sub: SubscriptionDetailDto; onChanged?: () => void }) {
  const action = useSubscriptionAction(sub.id);
  const [active, setActive] = useState<ActionKey | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const flag = (k: string, v: boolean) => setFlags((f) => ({ ...f, [k]: v }));

  function open(key: ActionKey) {
    setForm(key === 'overage' ? { overagePolicy: sub.overagePolicy } : {});
    setFlags({});
    setError(null);
    setActive(key);
  }

  function buildBody(key: ActionKey, reason: string): Record<string, unknown> | string {
    const base = { reason, version: sub.version };
    switch (key) {
      case 'extend-trial': {
        const d = iso(form.trialEndsAt);
        if (!d) return 'Pick a trial end date.';
        return { ...base, trialEndsAt: d };
      }
      case 'add-addon':
        return {
          ...base,
          campusId: form.campusId?.trim() || undefined,
          quantity: Number(form.quantity || '1'),
          unitPriceMinor: toMinor(form.unitPrice ?? ''),
        };
      case 'override-pricing':
        return {
          ...base,
          overridePriceMinor: flags.clearOverride ? null : toMinor(form.override ?? ''),
          institutionPerCampusPriceMinor: flags.clearPerCampus ? null : toMinor(form.perCampus ?? ''),
        };
      case 'discount': {
        const pct = Number(form.discountPct || '0');
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'Discount must be 0–100%.';
        return { ...base, discountBps: Math.round(pct * 100) };
      }
      case 'credit': {
        const amt = toMinor(form.creditAmount ?? '');
        if (amt === undefined || amt === 0) return 'Enter a non-zero amount (negative consumes credit).';
        return { ...base, amountMinor: amt };
      }
      case 'usage-limits': {
        const limits: Record<string, number> = {};
        for (const line of (form.usage ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
          const [k, v] = line.split('=').map((s) => s.trim());
          const n = Number(v);
          if (!k || !Number.isInteger(n) || n < 0) return `"${line}" must be key=whole-number.`;
          limits[k] = n;
        }
        return { ...base, usageLimitsOverride: limits };
      }
      case 'overage':
        return { ...base, overagePolicy: form.overagePolicy || 'block' };
      case 'grace': {
        const d = iso(form.grace);
        if (!d) return 'Pick a grace-period end date.';
        return { ...base, gracePeriodEndsAt: d };
      }
      case 'pause':
      case 'resume':
        return base;
      case 'cancel':
        return { ...base, immediate: Boolean(flags.immediate), cancelAt: iso(form.cancelAt ?? '') };
    }
  }

  function confirm(reason: string) {
    if (!active) return;
    const body = buildBody(active, reason);
    if (typeof body === 'string') return setError(body);
    setError(null);
    action.mutate(
      { action: active, body },
      {
        onSuccess: () => { setActive(null); onChanged?.(); },
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Action failed.'),
      },
    );
  }

  const live = sub.status !== 'cancelled' && sub.status !== 'expired';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {live && <ChangePlanDialog sub={sub} onChanged={onChanged} />}
        {live && <ChangeCycleDialog sub={sub} onChanged={onChanged} />}
        {live && <ActBtn onClick={() => open('extend-trial')} label="Extend trial" />}
        {live && <ActBtn onClick={() => open('add-addon')} label="Add add-on" />}
        {live && <ActBtn onClick={() => open('override-pricing')} label="Override pricing" />}
        {live && <ActBtn onClick={() => open('discount')} label="Discount" />}
        {live && <ActBtn onClick={() => open('credit')} label="Credit" />}
        {live && <ActBtn onClick={() => open('usage-limits')} label="Usage limits" />}
        {live && <ActBtn onClick={() => open('overage')} label="Overage" />}
        {live && <ActBtn onClick={() => open('grace')} label="Grace" />}
        {live && sub.status === 'paused' ? (
          <ActBtn onClick={() => open('resume')} label="Resume" />
        ) : live ? (
          <ActBtn onClick={() => open('pause')} label="Pause" />
        ) : null}
        {live && <ActBtn onClick={() => open('cancel')} label="Cancel" tone="danger" />}
      </div>

      <ConfirmDialog
        open={Boolean(active)}
        title={active ? TITLES[active].title : ''}
        description="This change is recorded in the audit trail."
        tone={active ? TITLES[active].tone : undefined}
        confirmLabel={active ? TITLES[active].label : 'Confirm'}
        loading={action.isPending}
        error={error}
        onConfirm={confirm}
        onClose={() => setActive(null)}
      >
        {active === 'extend-trial' && (
          <Field label="New trial end date">
            <input type="date" value={form.trialEndsAt ?? ''} onChange={(e) => set('trialEndsAt', e.target.value)} className={fieldClass} />
          </Field>
        )}
        {active === 'add-addon' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Campus ID (optional)"><input value={form.campusId ?? ''} onChange={(e) => set('campusId', e.target.value)} placeholder="uuid" className={fieldClass} /></Field>
            <Field label="Quantity"><input type="number" min={1} value={form.quantity ?? '1'} onChange={(e) => set('quantity', e.target.value)} className={fieldClass} /></Field>
            <Field label={`Unit price override (${sub.currency})`}><input type="number" min={0} step="0.01" value={form.unitPrice ?? ''} onChange={(e) => set('unitPrice', e.target.value)} placeholder={String(sub.perCampusPriceMinor / 100)} className={fieldClass} /></Field>
          </div>
        )}
        {active === 'override-pricing' && (
          <div className="space-y-2">
            <Field label={`Base price override (${sub.currency})`}><input type="number" min={0} step="0.01" disabled={flags.clearOverride} value={form.override ?? ''} onChange={(e) => set('override', e.target.value)} placeholder={sub.overridePriceMinor !== null ? String(sub.overridePriceMinor / 100) : String(sub.listPriceMinor / 100)} className={fieldClass} /></Field>
            <Check label="Remove base price override" checked={Boolean(flags.clearOverride)} onChange={(v) => flag('clearOverride', v)} />
            <Field label={`Per-campus price override (${sub.currency})`}><input type="number" min={0} step="0.01" disabled={flags.clearPerCampus} value={form.perCampus ?? ''} onChange={(e) => set('perCampus', e.target.value)} placeholder={String(sub.perCampusPriceMinor / 100)} className={fieldClass} /></Field>
            <Check label="Remove per-campus override" checked={Boolean(flags.clearPerCampus)} onChange={(v) => flag('clearPerCampus', v)} />
          </div>
        )}
        {active === 'discount' && (
          <Field label="Discount (%)"><input type="number" min={0} max={100} step="0.01" value={form.discountPct ?? String(sub.discountBps / 100)} onChange={(e) => set('discountPct', e.target.value)} className={fieldClass} /></Field>
        )}
        {active === 'credit' && (
          <Field label={`Amount (${sub.currency}, negative consumes credit)`}><input type="number" step="0.01" value={form.creditAmount ?? ''} onChange={(e) => set('creditAmount', e.target.value)} placeholder="25.00" className={fieldClass} /></Field>
        )}
        {active === 'usage-limits' && (
          <Field label="Usage limit overrides (key=number per line)">
            <textarea rows={3} value={form.usage ?? Object.entries(sub.usageLimits).map(([k, n]) => `${k}=${n}`).join('\n')} onChange={(e) => set('usage', e.target.value)} className={`${fieldClass} resize-none font-mono text-xs`} />
          </Field>
        )}
        {active === 'overage' && (
          <Field label="Overage policy">
            <select value={form.overagePolicy ?? sub.overagePolicy} onChange={(e) => set('overagePolicy', e.target.value)} className={fieldClass}>
              <option value="block">Block</option>
              <option value="allow">Allow</option>
              <option value="notify">Notify</option>
            </select>
          </Field>
        )}
        {active === 'grace' && (
          <Field label="Grace period ends"><input type="date" value={form.grace ?? ''} onChange={(e) => set('grace', e.target.value)} className={fieldClass} /></Field>
        )}
        {active === 'cancel' && (
          <div className="space-y-2">
            <Check label="Cancel immediately (otherwise at period end)" checked={Boolean(flags.immediate)} onChange={(v) => flag('immediate', v)} />
            {!flags.immediate && (
              <Field label="Cancel at (optional, defaults to period end)"><input type="date" value={form.cancelAt ?? ''} onChange={(e) => set('cancelAt', e.target.value)} className={fieldClass} /></Field>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

function ActBtn({ onClick, label, tone }: { onClick: () => void; label: string; tone?: 'danger' }) {
  return (
    <Button variant={tone === 'danger' ? 'outline' : 'secondary'} size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
