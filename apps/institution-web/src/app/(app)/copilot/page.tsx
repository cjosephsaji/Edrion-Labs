'use client';
import { useState } from 'react';
import { Sparkles, ShieldCheck, ShieldAlert, Check, X, Loader2 } from 'lucide-react';
import { Badge, Button, Card, type BadgeTone } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useCreateRun, useConfirmRun, useRejectRun, useCopilotRuns } from '@/lib/copilot';
import type { AiGuardrailDecision, CopilotRunDetail, CopilotToolCall } from '@/lib/copilot-types';

const DECISION_TONE: Record<AiGuardrailDecision, BadgeTone> = {
  allow: 'success',
  needs_confirmation: 'warning',
  needs_second_approver: 'warning',
  blocked: 'danger',
};
const DECISION_LABEL: Record<AiGuardrailDecision, string> = {
  allow: 'Auto-run (read-only)',
  needs_confirmation: 'Needs confirmation',
  needs_second_approver: 'Needs second approver',
  blocked: 'Blocked',
};

const SUGGESTIONS = [
  'Find students named Patel',
  'Draft an announcement "Parent-teacher meeting on Friday"',
  'Summarise this term\'s attendance',
];

export default function CopilotPage() {
  const { can } = usePermissions();
  const canUse = can('ai.use');
  const [prompt, setPrompt] = useState('');
  const [detail, setDetail] = useState<CopilotRunDetail | null>(null);
  const create = useCreateRun();
  const confirm = useConfirmRun();
  const reject = useRejectRun();
  const runs = useCopilotRuns();

  if (!canUse) {
    return (
      <>
        <Topbar title="AI Copilot" />
        <div className="page-enter p-8">
          <Card className="p-6 text-sm text-text-secondary">You don&apos;t have permission to use the AI Copilot.</Card>
        </div>
      </>
    );
  }

  const run = detail?.run;
  const awaiting = run?.status === 'awaiting_confirmation';
  const busy = create.isPending || confirm.isPending || reject.isPending;

  async function submit(text: string) {
    const value = text.trim();
    if (!value) return;
    const res = await create.mutateAsync({ prompt: value, context: {} });
    setDetail(res);
    setPrompt('');
  }

  async function onConfirm() {
    if (!run) return;
    const res = await confirm.mutateAsync({ id: run.id, reason: 'Confirmed via Copilot UI' });
    setDetail(res);
  }
  async function onReject() {
    if (!run) return;
    const res = await reject.mutateAsync({ id: run.id, reason: 'Rejected via Copilot UI' });
    setDetail(res);
  }

  return (
    <>
      <Topbar title="AI Copilot" />
      <div className="page-enter mx-auto w-full max-w-3xl space-y-6 p-6">
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2 text-text-primary">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-md font-semibold">Ask the Copilot</h2>
          </div>
          <p className="mb-4 text-sm text-text-secondary">
            The Copilot prepares actions and shows their exact impact. Anything that changes data requires your explicit
            confirmation — and it can never do more than your own permissions allow.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(prompt);
            }}
            className="space-y-3"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Draft an announcement “Sports day on Friday”"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
            />
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void submit(s)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Button type="submit" disabled={busy || !prompt.trim()}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ask'}
              </Button>
            </div>
          </form>
        </Card>

        {detail && run && (
          <Card className="p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-text-muted">You asked</p>
                <p className="text-sm font-medium text-text-primary">{run.prompt}</p>
                <p className="mt-2 text-sm text-text-secondary">{run.summary}</p>
              </div>
              <Badge tone={statusTone(run.status)}>{run.status.replace(/_/g, ' ')}</Badge>
            </div>

            <div className="space-y-3">
              {detail.toolCalls.map((t) => (
                <ToolCallRow key={t.id} call={t} />
              ))}
              {detail.toolCalls.length === 0 && (
                <p className="text-sm text-text-muted">No actions were prepared for this request.</p>
              )}
            </div>

            {awaiting && (
              <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                <Button onClick={() => void onConfirm()} disabled={busy}>
                  {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirm &amp; run
                </Button>
                <Button variant="outline" onClick={() => void onReject()} disabled={busy}>
                  <X className="h-4 w-4" />
                  Reject
                </Button>
                <span className="text-xs text-text-muted">Re-checked server-side before anything runs.</span>
              </div>
            )}
            {run.status === 'executed' && (
              <p className="mt-5 border-t border-border pt-4 text-sm text-success">✓ Done — the action(s) ran and were audited.</p>
            )}
          </Card>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-text-secondary">Recent runs</h3>
          <Card className="divide-y divide-border">
            {(runs.data?.items ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="truncate text-text-primary">{r.prompt}</span>
                <Badge tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</Badge>
              </div>
            ))}
            {(runs.data?.items?.length ?? 0) === 0 && (
              <div className="px-4 py-6 text-center text-sm text-text-muted">No runs yet.</div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function ToolCallRow({ call }: { call: CopilotToolCall }) {
  const blocked = call.decision === 'blocked';
  return (
    <div className="rounded-md border border-border bg-background-secondary/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {blocked ? <ShieldAlert className="h-4 w-4 text-danger" /> : <ShieldCheck className="h-4 w-4 text-primary" />}
          <span className="font-mono text-xs text-text-primary">{call.toolKey}</span>
        </div>
        <Badge tone={DECISION_TONE[call.decision]}>{DECISION_LABEL[call.decision]}</Badge>
      </div>
      {call.explanation && <p className="mt-1.5 text-sm text-text-secondary">{call.explanation}</p>}
      {call.decisionReason && <p className="mt-1 text-xs text-text-muted">{call.decisionReason}</p>}
      {call.impactPreview?.dataChanges && (
        <pre className="mt-2 overflow-x-auto rounded bg-surface-elevated p-2 text-xs text-text-muted">
          {JSON.stringify(call.impactPreview.dataChanges.after, null, 2)}
        </pre>
      )}
    </div>
  );
}

function statusTone(status: string): BadgeTone {
  if (status === 'executed') return 'success';
  if (status === 'awaiting_confirmation') return 'warning';
  if (status === 'rejected' || status === 'failed' || status === 'expired') return 'danger';
  return 'neutral';
}
