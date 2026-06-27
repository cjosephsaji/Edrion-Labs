'use client';
import { Skeleton, EmptyState, ErrorState } from '@edrion/ui';
import { useInstitutionUsers } from '@edrion/api-client';
import { InstitutionUsersTable } from './institution-users-table';
import { InviteUserDialog } from './invite-user-dialog';

/** Users tab inside institution detail — directory scoped to one institution + invite. */
export function InstitutionUsersTab({
  institutionId,
  institutionName,
}: {
  institutionId: string;
  institutionName: string;
}) {
  const { data, isLoading, isError, refetch } = useInstitutionUsers({ institutionId, pageSize: 100 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Users belong to this institution only. Campus grants never cross institutions.
        </p>
        <InviteUserDialog
          institutionId={institutionId}
          institutionName={institutionName}
          onInvited={() => void refetch()}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError || !data ? (
        <ErrorState description="Could not load this institution’s users." />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Invite the institution’s first user to get started."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <InstitutionUsersTable users={data.items} />
        </div>
      )}
    </div>
  );
}
