'use client';
import { useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Select } from '@edrion/ui';
import { useUpsertAiPolicy, type AiPolicyDto } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { errorMessage } from '@/lib/errors';
import { CAPABILITIES, MODES } from './labels';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

type Form = {
  mode: string;
  capabilities: Record<string, boolean>;
  maxFinancialImpactMinor: string;
  maxAffectedUsers: string;
  twoPersonThresholdMinor: string;
  secondApproverCapabilities: string[];
};

function fromPolicy(p?: AiPolicyDto): Form {
  return {
    mode: p?.mode ?? 'disabled',
    capabilities: p?.capabilities ?? {},
    maxFinancialImpactMinor: p?.maxFinancialImpactMinor != null ? String(p.maxFinancialImpactMinor) : '',
    maxAffectedUsers: p?.maxAffectedUsers != null ? String(p.maxAffectedUsers) : '',
    twoPersonThresholdMinor: p?.twoPersonThresholdMinor != null ? String(p.twoPersonThresholdMinor) : '',
    secondApproverCapabilities: p?.secondApproverCapabilities ?? [],
  };
}

/**
 * Global AI governance policy editor — operating mode, per-capability toggles, financial /
 * affected-user caps, two-person threshold, second-approver capabilities. Saving is sensitive
 * (ai.configure → recent auth); the typed reason flows into the audit event.
 */
export function AiPolicyEditor({ policy }: { policy?: AiPolicyDto }) {
  const upsert = useUpsertAiPolicy();
  const [form, setForm] = useState<Form>(() => fromPolicy(policy));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capEnabled = (key: string) => form.capabilities[key] !== false;
  const toggleCap = (key: string) =>
    setForm((f) => ({ ...f, capabilities: { ...f.capabilities, [key]: !capEnabled(key) } }));
  const toggleSecond = (key: string) =>
    setForm((f) => ({
      ...f,
      secondApproverCapabilities: f.secondApproverCapabilities.includes(key)
        ? f.secondApproverCapabilities.filter((k) => k !== key)
        : [...f.secondApproverCapabilities, key],
    }));

  function save(reason: string) {
    setError(null);
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    upsert.mutate(
      {
        scope: 'global',
        scopeId: null,
        enabled: true,
        mode: form.mode,
        capabilities: form.capabilities,
        maxFinancialImpactMinor: num(form.maxFinancialImpactMinor),
        maxAffectedUsers: num(form.maxAffectedUsers),
        twoPersonThresholdMinor: num(form.twoPersonThresholdMinor),
        secondApproverCapabilities: form.secondApproverCapabilities,
        reason,
        version: policy?.version,
      },
      {
        onSuccess: () => setOpen(false),
        onError: (e) => setError(errorMessage(e, 'Could not save the policy.')),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Global AI policy</CardTitle>
          <CardDescription>
            The platform-wide baseline. More specific scopes (plan/institution/campus/user/role)
            override per field; the kill switch always wins.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>Save changes</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="pe-mode">Operating mode</Label>
          <Select id="pe-mode" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} className={fieldClass + ' max-w-xs'} options={MODES.map((m) => ({ value: m.key, label: m.label }))} />
          <p className="mt-1 text-xs text-text-muted">{MODES.find((m) => m.key === form.mode)?.hint}</p>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Capabilities</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={capEnabled(c.key)} onChange={() => toggleCap(c.key)} className="h-4 w-4 rounded border-border" />
                <span>{c.label}</span>
                {c.mutating && <span className="text-[10px] uppercase text-text-muted">mutates</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="pe-fin">Max financial impact (minor)</Label>
            <input id="pe-fin" type="number" value={form.maxFinancialImpactMinor} onChange={(e) => setForm((f) => ({ ...f, maxFinancialImpactMinor: e.target.value }))} placeholder="no cap" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="pe-aff">Max affected users</Label>
            <input id="pe-aff" type="number" value={form.maxAffectedUsers} onChange={(e) => setForm((f) => ({ ...f, maxAffectedUsers: e.target.value }))} placeholder="no cap" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="pe-twop">Two-person threshold (minor)</Label>
            <input id="pe-twop" type="number" value={form.twoPersonThresholdMinor} onChange={(e) => setForm((f) => ({ ...f, twoPersonThresholdMinor: e.target.value }))} placeholder="none" className={fieldClass} />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Always require a second approver
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {CAPABILITIES.filter((c) => c.mutating).map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={form.secondApproverCapabilities.includes(c.key)} onChange={() => toggleSecond(c.key)} className="h-4 w-4 rounded border-border" />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={open}
        title="Save global AI policy"
        description="Updates the platform-wide AI guardrails. Sensitive action — logged to the audit trail."
        confirmLabel="Save policy"
        loading={upsert.isPending}
        error={error}
        onConfirm={save}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}
