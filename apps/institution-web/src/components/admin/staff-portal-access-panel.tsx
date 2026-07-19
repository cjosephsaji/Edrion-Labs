'use client';
import { Skeleton } from '@edrion/ui';
import { usePortalUser } from '@/lib/users';
import type { ResourceFormExtraApi } from '@/components/academics/resource-form';
import { UserAccessPanel } from './user-access-panel';

/** Loads a portal user and embeds the roles/access editor (staff edit drawer, users edit drawer). */
export function PortalUserAccessPanel({
  institutionUserId,
  canManage,
  setSubmitPayload,
}: {
  institutionUserId: string;
  canManage: boolean;
  setSubmitPayload?: ResourceFormExtraApi['setSubmitPayload'];
}) {
  const { data: user, isLoading, isError } = usePortalUser(institutionUserId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Roles &amp; access</h3>
          <p className="text-xs text-text-muted">Loading portal access…</p>
        </div>
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }
  if (isError || !user) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Roles &amp; access</h3>
        <p className="text-sm text-text-muted">
          Could not load portal access. Restart the API if you recently updated, or edit from User Management.
        </p>
      </div>
    );
  }

  return (
    <UserAccessPanel user={user} canManage={canManage} embedded setSubmitPayload={setSubmitPayload} />
  );
}

/** @deprecated Use PortalUserAccessPanel */
export const StaffPortalAccessPanel = PortalUserAccessPanel;
