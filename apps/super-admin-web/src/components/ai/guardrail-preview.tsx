'use client';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Label } from '@edrion/ui';
import { useEvaluateGuardrail } from '@edrion/api-client';
import { CAPABILITIES, DECISION_META, GUARDRAIL_LAYER_LABEL } from './labels';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const toneClass: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/**
 * Guardrail explainer — runs a proposed action through the SAME server-side evaluator the 8b
 * confirmation lifecycle uses, and shows the deciding rule + reason + exact-impact summary. This
 * is the model for the confirmation screen (docs/AI-GUARDRAILS.md "show exact impact").
 */
export function GuardrailPreview() {
  const evaluate = useEvaluateGuardrail();
  const result = evaluate.data;

  const [capability, setCapability] = useState(CAPABILITIES[7]!.key); // billing
  const [action, setAction] = useState('billing.refund');
  const [financial, setFinancial] = useState('150000');
  const [affected, setAffected] = useState('1');
  const [institutionId, setInstitutionId] = useState('');

  function run() {
    evaluate.mutate({
      proposed: {
        capability,
        action: action.trim() || `${capability}.do`,
        financialImpactMinor: financial ? Number(financial) : undefined,
        affectedUsers: affected ? Number(affected) : undefined,
      },
      context: institutionId ? { institutionId: institutionId.trim() } : {},
    });
  }

  const meta = result ? DECISION_META[result.decision] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guardrail preview</CardTitle>
        <CardDescription>
          Run a proposed action through the live guardrail engine. Shows the deciding rule and the
          exact impact — the same evaluation enforced before any AI-prepared action executes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="gp-cap">Capability</Label>
            <select id="gp-cap" value={capability} onChange={(e) => setCapability(e.target.value)} className={fieldClass}>
              {CAPABILITIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="gp-action">Action key</Label>
            <input id="gp-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="billing.refund" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="gp-fin">Financial impact (minor)</Label>
            <input id="gp-fin" type="number" value={financial} onChange={(e) => setFinancial(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="gp-aff">Affected users</Label>
            <input id="gp-aff" type="number" value={affected} onChange={(e) => setAffected(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="gp-inst">Institution ID (optional)</Label>
            <input id="gp-inst" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} placeholder="uuid" className={fieldClass} />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={run} loading={evaluate.isPending} className="w-full">
              Evaluate
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background-secondary p-4">
          {evaluate.isError ? (
            <p className="text-sm text-danger">Could not evaluate. Confirm the API is running.</p>
          ) : !result || !meta ? (
            <p className="text-sm text-text-muted">Set a proposed action and evaluate.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold ${toneClass[meta.tone]}`}>
                  {meta.label}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{result.reason}</div>
                  <div className="text-xs text-text-muted">
                    Deciding rule: {GUARDRAIL_LAYER_LABEL[result.layer] ?? result.layer}
                    {result.killSwitchActive ? ' · kill switch ACTIVE' : ''}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs md:grid-cols-3">
                <Impact label="Risk" value={result.riskLevel} />
                <Impact label="Required permission" value={result.requiredPermission ?? '—'} />
                <Impact label="Second approver" value={result.requiresSecondApprover ? 'Required' : 'No'} />
                <Impact label="Effective mode" value={result.policy.mode} />
                <Impact label="Two-person threshold" value={fmtMinor(result.policy.twoPersonThresholdMinor)} />
                <Impact label="Financial cap" value={fmtMinor(result.policy.maxFinancialImpactMinor)} />
              </div>

              {result.trace.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Decision trace
                  </div>
                  <ul className="space-y-1 text-xs">
                    {result.trace.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={t.applied ? 'text-warning' : 'text-text-muted'}>{t.applied ? '●' : '○'}</span>
                        <span className="text-text-secondary">
                          <span className="font-medium text-text-primary">
                            {GUARDRAIL_LAYER_LABEL[t.layer] ?? t.layer}
                          </span>
                          {' — '}
                          {t.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Impact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="capitalize text-text-primary">{value}</span>
    </div>
  );
}

function fmtMinor(v: number | null): string {
  return v == null ? '—' : (v / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
}
