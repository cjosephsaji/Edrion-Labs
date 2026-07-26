'use client';

import { useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/app-shell/topbar';
import { PermissionDenied } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { RequestsInboxView } from '@/app/(app)/approvals/page';

/** Formal grievance lane — same inbox as Approvals, filtered and labelled for grievance officers. */
export default function GrievanceInboxPage() {
  const { can } = usePermissions();
  const search = useSearchParams();
  const canReview = can('requests.review');

  if (!canReview) {
    return (
      <>
        <Topbar title="Grievances" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to review grievances." />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Grievances" />
      <div className="page-enter flex min-h-0 flex-1 flex-col p-4 lg:p-6">
        <RequestsInboxView
          lockType="grievance"
          heading="Grievance inbox"
          initialRequestId={search.get('request')}
        />
      </div>
    </>
  );
}
