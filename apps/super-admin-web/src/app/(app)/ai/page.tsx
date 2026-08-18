'use client';
import { Card, CardContent, StatCard, Skeleton, ErrorState } from '@edrion/ui';
import { useAiOverview, useAiPolicies, useAiRules } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { KillSwitchCard } from '@/components/ai/kill-switch-card';
import { AiPolicyEditor } from '@/components/ai/ai-policy-editor';
import { AiActionRules } from '@/components/ai/ai-action-rules';
import { GuardrailPreview } from '@/components/ai/guardrail-preview';
import { CAPABILITY_LABEL, MODES } from '@/components/ai/labels';

const MODE_LABEL: Record<string, string> = Object.fromEntries(MODES.map((m) => [m.key, m.label]));

export default function AiControlCentrePage() {
  const overview = useAiOverview();
  const policies = useAiPolicies();
  const rules = useAiRules();

  const globalPolicy = policies.data?.items.find((p) => p.scope === 'global');
  const o = overview.data;
  const capList = o ? Object.entries(o.capabilities).filter(([, v]) => v !== false).map(([k]) => k) : [];

  return (
    <>
      <Topbar title="AI Control Centre" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <p className="max-w-3xl text-sm text-text-secondary">
          Govern what Copilot may do. Every state-changing action still requires explicit human
          confirmation — these policies decide whether an action is allowed, needs confirmation,
          needs a second approver, or is blocked outright.
        </p>

        {overview.isLoading ? (
          <Skeleton className="h-24" />
        ) : overview.isError || !o ? (
          <ErrorState description="Could not load AI governance. Confirm the API is running on :3007." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Global mode" value={MODE_LABEL[o.globalMode] ?? o.globalMode} />
              <StatCard
                label="Kill switch"
                value={o.killSwitchActive ? 'ACTIVE' : 'Off'}
                hint={o.killSwitchActive ? `${o.killSwitchScopes.length} scope(s)` : undefined}
              />
              <StatCard label="Scope policies" value={o.policyCount} />
              <StatCard label="Action rules" value={o.ruleCount} />
            </div>

            <KillSwitchCard overview={o} />

            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
                <span className="text-text-muted">Enabled capabilities:</span>
                {capList.length === 0 ? (
                  <span className="text-text-muted">none</span>
                ) : (
                  capList.map((k) => (
                    <span key={k} className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                      {CAPABILITY_LABEL[k] ?? k}
                    </span>
                  ))
                )}
              </CardContent>
            </Card>

            {policies.isLoading ? (
              <Skeleton className="h-64" />
            ) : (
              <AiPolicyEditor policy={globalPolicy} />
            )}

            <AiActionRules rules={rules.data ?? []} />

            <GuardrailPreview />
          </>
        )}
      </div>
    </>
  );
}
