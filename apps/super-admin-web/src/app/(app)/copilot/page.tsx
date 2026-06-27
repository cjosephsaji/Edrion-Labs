'use client';
import { useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Skeleton } from '@edrion/ui';
import {
  useCreateRun,
  useRun,
  useConfirmRun,
  useRejectRun,
  useApproveRun,
  type CopilotContext,
  type AiRunDetailDto,
} from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { ToolCallCard } from '@/components/copilot/tool-call-card';
import { errorMessage } from '@/lib/errors';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const STATUS_TONE: Record<string, string> = {
  proposed: 'text-text-muted',
  awaiting_confirmation: 'text-warning',
  confirmed: 'text-warning',
  executed: 'text-success',
  rejected: 'text-text-muted',
  expired: 'text-text-muted',
  failed: 'text-danger',
};

export default function CopilotPage() {
  const [prompt, setPrompt] = useState('');
  const [ctx, setCtx] = useState<CopilotContext>({});
  const [runId, setRunId] = useState<string | null>(null);

  const create = useCreateRun();
  const runQuery = useRun(runId ?? '', !!runId);
  const detail = runQuery.data;

  function submit() {
    if (!prompt.trim()) return;
    create.mutate(
      { prompt: prompt.trim(), context: cleanCtx(ctx) },
      { onSuccess: (d) => setRunId(d.run.id) },
    );
  }

  return (
    <>
      <Topbar title="Copilot" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Ask Copilot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="e.g. Suspend this institution for non-payment"
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Ctx label="Institution ID" value={ctx.institutionId} onChange={(v) => setCtx((c) => ({ ...c, institutionId: v }))} />
              <Ctx label="Feature key" value={ctx.featureKey} onChange={(v) => setCtx((c) => ({ ...c, featureKey: v }))} />
              <Ctx label="Payment ID" value={ctx.paymentId} onChange={(v) => setCtx((c) => ({ ...c, paymentId: v }))} />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={submit} loading={create.isPending} disabled={!prompt.trim()}>
                Prepare action
              </Button>
              <span className="text-xs text-text-muted">
                Copilot never changes anything without your explicit confirmation.
              </span>
            </div>
            {create.isError && (
              <p className="text-sm text-danger">
                {errorMessage(create.error, 'Could not start the run.')}
              </p>
            )}
          </CardContent>
        </Card>

        {runId && (runQuery.isLoading || !detail ? <Skeleton className="h-48" /> : <RunView detail={detail} />)}
      </div>
    </>
  );
}

function RunView({ detail }: { detail: AiRunDetailDto }) {
  const { run, toolCalls, approvals } = detail;
  const confirm = useConfirmRun(run.id);
  const reject = useRejectRun(run.id);
  const approve = useApproveRun(run.id);
  const [reason, setReason] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const awaiting = run.status === 'awaiting_confirmation';
  const needsSecond = toolCalls.some((t) => t.decision === 'needs_second_approver' && t.status === 'awaiting_confirmation');
  const hasApproval = approvals.some((a) => a.approved);
  const critical = run.riskLevel === 'critical';

  function act(fn: () => void) {
    setError(null);
    if (reason.trim().length < 5) {
      setError('Provide a reason (min 5 characters).');
      return;
    }
    fn();
  }

  const onErr = (e: unknown) => setError(errorMessage(e));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{run.summary ?? 'Prepared run'}</CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            Status: <span className={STATUS_TONE[run.status] ?? ''}>{run.status.replace(/_/g, ' ')}</span>
            {run.riskLevel ? ` · risk ${run.riskLevel}` : ''} · model {run.model}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {toolCalls.length === 0 && <p className="text-sm text-text-muted">No actions were prepared for this prompt.</p>}
        {toolCalls.map((t) => (
          <ToolCallCard key={t.id} call={t} />
        ))}

        {needsSecond && (
          <div className="rounded-md border border-warning bg-warning-soft/40 p-3 text-xs text-text-secondary">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-warning" />
            This run needs a second approver (ai.approve_sensitive_action) before it can be confirmed.
            {hasApproval ? ' A valid approval is on file.' : ' No approval yet.'}
          </div>
        )}

        {awaiting && (
          <div className="space-y-3 border-t border-border pt-3">
            {critical && (
              <div>
                <Label htmlFor="cf-text">Type the confirmation phrase (critical action)</Label>
                <input id="cf-text" value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} placeholder="CONFIRM" className={fieldClass} />
              </div>
            )}
            <div>
              <Label htmlFor="cf-reason">Reason (recorded in the audit log)</Label>
              <textarea
                id="cf-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why are you authorising this?"
                className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={confirm.isPending}
                onClick={() =>
                  act(() =>
                    confirm.mutate(
                      { reason: reason.trim(), confirmationText: confirmationText.trim() || undefined },
                      { onError: onErr },
                    ),
                  )
                }
              >
                Confirm &amp; execute
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={reject.isPending}
                onClick={() => act(() => reject.mutate({ reason: reason.trim() }, { onError: onErr }))}
              >
                Reject
              </Button>
              {needsSecond && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={approve.isPending}
                  onClick={() => act(() => approve.mutate({ reason: reason.trim() }, { onError: onErr }))}
                >
                  Approve as second approver
                </Button>
              )}
            </div>
          </div>
        )}

        {run.status === 'executed' && (
          <p className="border-t border-border pt-3 text-sm text-success">✓ Run executed. Audit trail updated.</p>
        )}
        {run.status === 'failed' && (
          <p className="border-t border-border pt-3 text-sm text-danger">✗ {run.errorDetail ?? 'Run failed.'}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Ctx({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-muted">{label}</span>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="optional" className={fieldClass} />
    </label>
  );
}

function cleanCtx(ctx: CopilotContext): CopilotContext {
  const out: CopilotContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (v != null && String(v).trim() !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
