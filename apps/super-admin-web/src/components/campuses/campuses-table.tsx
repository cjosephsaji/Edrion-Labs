'use client';
import Link from 'next/link';
import { Badge, type BadgeTone } from '@edrion/ui';
import type { CampusDto } from '@edrion/api-client';
import { formatMinor } from '@/lib/format';

const BILLING_TONE: Record<string, BadgeTone> = {
  included: 'success',
  paid_addon: 'primary',
  trial: 'info',
  suspended: 'danger',
};

function billingLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BillingStatusBadge({ status }: { status: string }) {
  return <Badge tone={BILLING_TONE[status] ?? 'neutral'} dot>{billingLabel(status)}</Badge>;
}

/**
 * Shared campus table — the global directory and the institution detail tab both render it.
 * The institution column is shown only in the global directory (pass `institutionNames`).
 */
export function CampusesTable({
  campuses,
  institutionNames,
}: {
  campuses: CampusDto[];
  /** id → display name. When provided, an Institution column is rendered (global view). */
  institutionNames?: Map<string, string>;
}) {
  const showInstitution = Boolean(institutionNames);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
          <th className="px-4">Campus</th>
          {showInstitution && <th className="px-4">Institution</th>}
          <th className="px-4">Billing</th>
          <th className="px-4 text-right">Users</th>
          <th className="px-4 text-right">Add-on price</th>
          <th className="px-4 text-right">Active</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {campuses.map((c) => (
          <tr key={c.id} className="h-table-row transition-colors hover:bg-background-secondary">
            <td className="px-4">
              <div className="font-medium text-text-primary">{c.name}</div>
              <div className="text-xs text-text-muted">{c.code}</div>
            </td>
            {showInstitution && (
              <td className="px-4 text-text-secondary">
                <Link
                  href={`/institutions/${c.institutionId}?tab=campuses`}
                  className="hover:text-primary"
                >
                  {institutionNames?.get(c.institutionId) ?? c.institutionId.slice(0, 8)}
                </Link>
              </td>
            )}
            <td className="px-4">
              <BillingStatusBadge status={c.billingStatus} />
            </td>
            <td className="px-4 text-right tabular-nums text-text-secondary">{c.currentUserCount}</td>
            <td className="px-4 text-right tabular-nums text-text-secondary">
              {c.addonPriceMinor != null ? formatMinor(c.addonPriceMinor) : <span className="text-text-muted">—</span>}
            </td>
            <td className="px-4 text-right">
              {c.isActive ? (
                <span className="text-success">●</span>
              ) : (
                <span className="text-text-muted">○</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
