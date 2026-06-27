'use client';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@edrion/ui';
import { useResolveFeature, type ResolveFeatureContext } from '@edrion/api-client';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const LAYER_LABEL: Record<string, string> = {
  kill_switch: 'Kill switch',
  definition_inactive: 'Definition inactive',
  rollout_block_list: 'Rollout · block list',
  rollout_allow_list: 'Rollout · allow list',
  rollout_percentage: 'Rollout · percentage',
  assignment: 'Scope assignment',
  default: 'Global default',
};

/**
 * Effective-Value explainer. Resolve the feature against an arbitrary context and show the
 * winning layer + human reason + the full decision trace — so an admin can see exactly why a
 * given subject does or doesn't have the feature (per docs/FEATURE-RESOLUTION.md).
 */
export function EffectiveValuePreview({ featureId }: { featureId: string }) {
  const [ctx, setCtx] = useState<ResolveFeatureContext>({ environment: 'production' });
  const { data, isFetching, isError } = useResolveFeature(featureId, ctx);

  const set = (k: keyof ResolveFeatureContext) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCtx((prev) => ({ ...prev, [k]: e.target.value || undefined }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Effective value preview</CardTitle>
        <CardDescription>
          Resolve this feature for a specific subject. Shows the winning layer and the reason.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Field label="Institution ID"><input className={fieldClass} value={ctx.institutionId ?? ''} onChange={set('institutionId')} placeholder="uuid" /></Field>
          <Field label="Campus ID"><input className={fieldClass} value={ctx.campusId ?? ''} onChange={set('campusId')} placeholder="uuid" /></Field>
          <Field label="Plan ID"><input className={fieldClass} value={ctx.planId ?? ''} onChange={set('planId')} placeholder="uuid" /></Field>
          <Field label="Institution user ID"><input className={fieldClass} value={ctx.institutionUserId ?? ''} onChange={set('institutionUserId')} placeholder="uuid" /></Field>
          <Field label="Employee role keys"><input className={fieldClass} value={ctx.employeeRoleKeys ?? ''} onChange={set('employeeRoleKeys')} placeholder="comma,separated" /></Field>
          <Field label="Environment"><input className={fieldClass} value={ctx.environment ?? ''} onChange={set('environment')} placeholder="production" /></Field>
        </div>

        <div className="rounded-md border border-border bg-background-secondary p-4">
          {isError ? (
            <p className="text-sm text-danger">Could not resolve. Confirm the API is running.</p>
          ) : !data ? (
            <p className="text-sm text-text-muted">{isFetching ? 'Resolving…' : 'Enter a context above.'}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span
                  className={
                    'inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold ' +
                    (data.value ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')
                  }
                >
                  {data.value ? 'ON' : 'OFF'}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{data.reason}</div>
                  <div className="text-xs text-text-muted">
                    Winning layer: {LAYER_LABEL[data.layer] ?? data.layer}
                    {data.scope ? ` · scope ${data.scope}` : ''}
                    {data.killSwitchActive ? ' · kill switch ACTIVE' : ''}
                  </div>
                </div>
              </div>

              {data.trace.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Decision trace
                  </div>
                  <ul className="space-y-1 text-xs">
                    {data.trace.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className={t.applied ? 'text-success' : 'text-text-muted'}>
                          {t.applied ? '●' : '○'}
                        </span>
                        <span className="text-text-secondary">
                          <span className="font-medium text-text-primary">
                            {LAYER_LABEL[t.layer] ?? t.layer}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-muted">{label}</span>
      {children}
    </label>
  );
}
