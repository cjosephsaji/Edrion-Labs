'use client';
import { useState } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import { Badge, Button, StatusBadge } from '@edrion/ui';
import {
  ApiClientError,
  usePublishPlanVersion,
  type PlanDetailDto,
  type PlanVersionDto,
} from '@edrion/api-client';
import { diffPlanVersions, type PlanVersionSnapshot } from '@edrion/schemas';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatMinor } from '@/lib/format';

function snapshot(v: PlanVersionDto): PlanVersionSnapshot {
  return {
    currency: v.currency,
    monthlyPriceMinor: v.monthlyPriceMinor,
    annualPriceMinor: v.annualPriceMinor,
    baseCampusAllowance: v.baseCampusAllowance,
    perCampusPriceMinor: v.perCampusPriceMinor,
    trialDays: v.trialDays,
    supportTier: v.supportTier,
    usageLimits: v.usageLimits,
    featureEntitlements: v.featureEntitlements,
  };
}

/** Render a diff value — money fields format as currency; everything else verbatim. */
function renderDiffValue(field: string, value: string | number | boolean | null, currency: string): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (field.endsWith('PriceMinor')) return formatMinor(Number(value), currency);
  return String(value);
}

export function PlanVersionHistory({ plan }: { plan: PlanDetailDto }) {
  const publishMut = usePublishPlanVersion(plan.id);
  const [publishing, setPublishing] = useState<PlanVersionDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Newest first for display; diff each against the version one number lower.
  const ascending = [...plan.versions].sort((a, b) => a.version - b.version);
  const display = [...ascending].reverse();
  const archived = plan.status === 'archived';

  function runPublish(reason: string) {
    if (!publishing) return;
    setError(null);
    publishMut.mutate(
      { versionId: publishing.id, reason },
      {
        onSuccess: () => setPublishing(null),
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not publish this version.'),
      },
    );
  }

  if (display.length === 0) {
    return <p className="text-sm text-text-muted">No versions yet.</p>;
  }

  return (
    <>
      <ol className="space-y-3">
        {display.map((v) => {
          const idx = ascending.findIndex((x) => x.id === v.id);
          const prev = idx > 0 ? ascending[idx - 1] : null;
          const changes = diffPlanVersions(prev ? snapshot(prev) : null, snapshot(v));
          return (
            <li key={v.id} className="relative rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">v{v.version}</span>
                  <StatusBadge status={v.status} />
                  {plan.publishedVersionId === v.id && <Badge tone="success">Live</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">
                    {v.publishedAt
                      ? `Published ${new Date(v.publishedAt).toLocaleDateString()}`
                      : `Created ${new Date(v.createdAt).toLocaleDateString()}`}
                  </span>
                  {v.status === 'draft' && !archived && (
                    <Button
                      size="sm"
                      onClick={() => { setError(null); setPublishing(v); }}
                    >
                      <Upload className="h-3.5 w-3.5" /> Publish
                    </Button>
                  )}
                </div>
              </div>

              {v.note && <p className="mt-2 text-sm italic text-text-secondary">“{v.note}”</p>}

              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                <Field label="Monthly" value={formatMinor(v.monthlyPriceMinor, v.currency)} />
                <Field label="Annual" value={formatMinor(v.annualPriceMinor, v.currency)} />
                <Field label="Per campus" value={formatMinor(v.perCampusPriceMinor, v.currency)} />
                <Field label="Base campuses" value={String(v.baseCampusAllowance)} />
                <Field label="Trial" value={`${v.trialDays} days`} />
                <Field label="Support" value={v.supportTier} />
              </dl>

              {(Object.keys(v.featureEntitlements).length > 0 ||
                Object.keys(v.usageLimits).length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(v.featureEntitlements)
                    .filter(([, on]) => on)
                    .map(([k]) => (
                      <Badge key={k} tone="info">{k}</Badge>
                    ))}
                  {Object.entries(v.usageLimits).map(([k, n]) => (
                    <Badge key={k} tone="neutral">{k}: {n}</Badge>
                  ))}
                </div>
              )}

              {changes.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Changes from v{prev?.version}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {changes.map((c) => (
                      <li key={c.field} className="flex flex-wrap items-center gap-2">
                        <span className="text-text-secondary">{c.label}</span>
                        <span className="text-text-muted line-through">
                          {renderDiffValue(c.field, c.before, v.currency)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-text-muted" />
                        <span className="font-medium text-text-primary">
                          {renderDiffValue(c.field, c.after, v.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <ConfirmDialog
        open={Boolean(publishing)}
        title={publishing ? `Publish v${publishing.version} of ${plan.name}?` : ''}
        description="Publishing makes this version the live plan and supersedes the current published version. This is a sensitive action, logged to the audit trail and may require recent authentication."
        confirmLabel="Publish version"
        loading={publishMut.isPending}
        error={error}
        onConfirm={runPublish}
        onClose={() => setPublishing(null)}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="capitalize text-text-primary tabular-nums">{value}</dd>
    </div>
  );
}
