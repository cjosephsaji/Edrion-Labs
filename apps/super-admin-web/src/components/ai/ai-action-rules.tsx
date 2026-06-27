'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from '@edrion/ui';
import {
  ApiClientError,
  useUpsertAiRule,
  useRemoveAiRule,
  type AiActionRuleDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CAPABILITIES, CAPABILITY_LABEL } from './labels';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const EFFECTS = [
  { key: 'allow', label: 'Allow' },
  { key: 'require_confirmation', label: 'Require confirmation' },
  { key: 'require_second_approver', label: 'Require second approver' },
  { key: 'block', label: 'Block' },
];
const RISKS = ['', 'low', 'medium', 'high', 'critical'];

const EFFECT_LABEL: Record<string, string> = Object.fromEntries(EFFECTS.map((e) => [e.key, e.label]));

/**
 * Per-capability / per-action governance overrides layered on top of the resolved policy.
 * Action-specific rules beat capability-wide ones; the strictest effect wins (see packages/copilot).
 */
export function AiActionRules({ rules }: { rules: AiActionRuleDto[] }) {
  const upsert = useUpsertAiRule();
  const remove = useRemoveAiRule();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AiActionRuleDto | null>(null);

  const [capability, setCapability] = useState(CAPABILITIES[7]!.key);
  const [action, setAction] = useState('');
  const [effect, setEffect] = useState('require_confirmation');
  const [riskLevel, setRiskLevel] = useState('');
  const [description, setDescription] = useState('');

  function openNew() {
    setError(null);
    setCapability(CAPABILITIES[7]!.key);
    setAction('');
    setEffect('require_confirmation');
    setRiskLevel('');
    setDescription('');
    setOpen(true);
  }

  function submit(reason: string) {
    setError(null);
    upsert.mutate(
      {
        capability,
        action: action.trim() || null,
        enabled: true,
        effect,
        riskLevel: riskLevel || null,
        description: description.trim() || null,
        reason,
      },
      {
        onSuccess: () => setOpen(false),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not save rule.'),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Action rules</CardTitle>
          <CardDescription>Per-capability / per-action overrides. Strictest effect wins.</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add rule
        </Button>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-sm text-text-muted">No action rules. The resolved policy decides every action.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="py-2">Capability</th>
                <th className="py-2">Action</th>
                <th className="py-2">Effect</th>
                <th className="py-2">Risk</th>
                <th className="py-2">Set by</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 text-text-secondary">{CAPABILITY_LABEL[r.capability] ?? r.capability}</td>
                  <td className="py-2 font-mono text-xs text-text-muted">{r.action ?? 'all'}</td>
                  <td className="py-2 text-text-secondary">{EFFECT_LABEL[r.effect] ?? r.effect}</td>
                  <td className="py-2 capitalize text-text-muted">{r.riskLevel ?? '—'}</td>
                  <td className="py-2 text-xs text-text-muted">{r.setByName ?? '—'}</td>
                  <td className="py-2 text-right">
                    <button className="text-text-muted hover:text-danger" onClick={() => setRemoveTarget(r)} aria-label="Remove rule">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <ConfirmDialog
        open={open}
        title="Set action rule"
        description="Override the decision for a capability or a specific action key. Logged to the audit trail."
        confirmLabel="Save rule"
        loading={upsert.isPending}
        error={error}
        onConfirm={submit}
        onClose={() => setOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="r-cap">Capability</Label>
            <select id="r-cap" value={capability} onChange={(e) => setCapability(e.target.value)} className={fieldClass}>
              {CAPABILITIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="r-action">Action key (blank = all)</Label>
            <input id="r-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="billing.refund" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="r-effect">Effect</Label>
            <select id="r-effect" value={effect} onChange={(e) => setEffect(e.target.value)} className={fieldClass}>
              {EFFECTS.map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="r-risk">Risk (optional)</Label>
            <select id="r-risk" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className={fieldClass}>
              {RISKS.map((rk) => (
                <option key={rk} value={rk}>{rk === '' ? 'unset' : rk}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Label htmlFor="r-desc">Description (optional)</Label>
            <input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this rule exists" className={fieldClass} />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove action rule"
        description={`Remove the rule for ${removeTarget ? CAPABILITY_LABEL[removeTarget.capability] ?? removeTarget.capability : ''}${removeTarget?.action ? ` · ${removeTarget.action}` : ''}?`}
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={(reason) => {
          if (!removeTarget) return;
          remove.mutate(
            { id: removeTarget.id, reason },
            { onSuccess: () => setRemoveTarget(null) },
          );
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </Card>
  );
}
