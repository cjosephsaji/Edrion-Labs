'use client';
import type { AiToolCallDto } from '@edrion/api-client';
import { DECISION_META, GUARDRAIL_LAYER_LABEL, CAPABILITY_LABEL } from '@/components/ai/labels';

const toneClass: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

interface ImpactPreview {
  summary?: string;
  targetType?: string;
  targetId?: string | null;
  dataChanges?: { before: Record<string, unknown>; after: Record<string, unknown> } | null;
  financialImpactMinor?: number;
  affectedUsers?: number;
  reversible?: boolean;
  requiredPermission?: string;
  auditPreview?: { action: string; module: string; entityType: string };
}

/**
 * One prepared action with its exact-impact preview + guardrail decision — the confirmation-screen
 * row (docs/AI-GUARDRAILS.md: proposed action · target · exact data changes · billing impact ·
 * affected users · reversibility · required permission · risk · the audit record that will run).
 */
export function ToolCallCard({ call }: { call: AiToolCallDto }) {
  const meta = DECISION_META[call.decision] ?? { label: call.decision, tone: 'warning' as const };
  const impact = (call.impactPreview ?? {}) as ImpactPreview;
  const executed = call.status === 'executed';
  const failed = call.status === 'failed';

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-text-primary">
          {impact.summary ?? call.explanation ?? call.toolKey}
        </div>
        <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ${toneClass[meta.tone]}`}>
          {meta.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-text-muted">
        {CAPABILITY_LABEL[call.capability] ?? call.capability} · <span className="font-mono">{call.toolKey}</span>
      </p>

      {call.decisionReason && (
        <p className="mt-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">
            {GUARDRAIL_LAYER_LABEL[call.decisionLayer ?? ''] ?? call.decisionLayer}
          </span>
          {' — '}
          {call.decisionReason}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs md:grid-cols-3">
        <Field label="Target" value={impact.targetType ? `${impact.targetType}${impact.targetId ? ` · ${short(impact.targetId)}` : ''}` : '—'} />
        <Field label="Risk" value={call.riskLevel ?? '—'} />
        <Field label="Required permission" value={call.requiredPermission ?? '—'} />
        <Field label="Financial impact" value={fmtMinor(call.financialImpactMinor)} />
        <Field label="Affected users" value={String(call.affectedUsers ?? 0)} />
        <Field label="Reversible" value={call.reversible ? 'Yes' : 'No'} />
      </div>

      {impact.dataChanges && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-muted">Change:</span>
          <code className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">{fmtObj(impact.dataChanges.before)}</code>
          <span className="text-text-muted">→</span>
          <code className="rounded bg-success-soft px-1.5 py-0.5 text-success">{fmtObj(impact.dataChanges.after)}</code>
        </div>
      )}

      {impact.auditPreview && (
        <p className="mt-2 text-xs text-text-muted">
          Audit record that will be written: <span className="font-mono">{impact.auditPreview.action}</span> in {impact.auditPreview.module}
        </p>
      )}

      {executed && (
        <p className="mt-2 text-xs text-success">
          ✓ Executed{call.auditEventId ? ` · audit ${short(call.auditEventId)}` : ''}
        </p>
      )}
      {failed && <p className="mt-2 text-xs text-danger">✗ {call.errorDetail ?? 'Failed'}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="capitalize text-text-primary">{value}</span>
    </div>
  );
}

function fmtMinor(v: number | null | undefined): string {
  return v == null || v === 0 ? '—' : (v / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
}
function fmtObj(o: Record<string, unknown>): string {
  return Object.entries(o).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
}
function short(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
