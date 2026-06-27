'use client';
import { Skeleton, EmptyState, ErrorState } from '@edrion/ui';
import { useCampuses } from '@edrion/api-client';
import { CampusBillingStatus } from '@edrion/shared-types';
import { formatMinor } from '@/lib/format';
import { CampusesTable } from './campuses-table';
import { AddCampusDialog } from './add-campus-dialog';

/** Campuses tab inside institution detail — scoped list + the add-campus charge flow. */
export function CampusesTab({
  institutionId,
  institutionName,
}: {
  institutionId: string;
  institutionName: string;
}) {
  const { data, isLoading, isError, refetch } = useCampuses({ institutionId, pageSize: 100 });

  const items = data?.items ?? [];
  const included = items.filter((c) => c.billingStatus === CampusBillingStatus.Included).length;
  const paid = items.filter((c) => c.billingStatus === CampusBillingStatus.PaidAddon).length;
  const addonRevenue = items
    .filter((c) => c.isActive && c.billingStatus === CampusBillingStatus.PaidAddon)
    .reduce((sum, c) => sum + (c.addonPriceMinor ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Campuses are subdivisions of this institution. Additional campuses beyond the base
          allowance are chargeable.
          {items.length > 0 && (
            <span className="ml-1 text-text-muted">
              {included} included · {paid} paid · add-on {formatMinor(addonRevenue)}
            </span>
          )}
        </p>
        <AddCampusDialog
          institutionId={institutionId}
          institutionName={institutionName}
          onAdded={() => void refetch()}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError || !data ? (
        <ErrorState description="Could not load this institution’s campuses." />
      ) : items.length === 0 ? (
        <EmptyState
          title="No campuses yet"
          description="Add the institution’s first campus. You’ll review the charge before it’s created."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <CampusesTable campuses={items} />
        </div>
      )}
    </div>
  );
}
