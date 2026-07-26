'use client';
import { Skeleton, ErrorState } from '@edrion/ui';
import { useSupportSessions } from '@edrion/api-client';
import { SupportSessionsTable } from './support-sessions-table';

/** Access-sessions tab inside an institution detail — its support-access history. */
export function InstitutionAccessSessions({ institutionId }: { institutionId: string }) {
  const { data, isLoading, isError } = useSupportSessions({ institutionId, pageSize: 50 });

  if (isLoading) return <Skeleton className="h-40" />;
  if (isError || !data) return <ErrorState description="Could not load access sessions." />;
  return <SupportSessionsTable sessions={data.items} showInstitution={false} />;
}
