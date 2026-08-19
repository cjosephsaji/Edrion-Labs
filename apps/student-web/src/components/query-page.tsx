'use client';

import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  ErrorState,
  LoadingBlock,
  UnauthorizedState,
} from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';

export function QueryPage<T>({
  query,
  loadingLabel,
  children,
}: {
  query: UseQueryResult<T>;
  loadingLabel?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading || query.isPending) {
    return <LoadingBlock label={loadingLabel} />;
  }
  if (query.error instanceof StudentApiError && query.error.status === 401) {
    return <UnauthorizedState />;
  }
  if (
    query.error instanceof StudentApiError &&
    (query.error.status === 403 ||
      query.error.code === 'NO_PERMISSION' ||
      query.error.code === 'MODULE_DISABLED' ||
      query.error.code === 'PORTAL_DISABLED')
  ) {
    return (
      <ErrorState
        title="You don’t have access"
        description="This module isn’t enabled for your account. Ask your institution if you think it should be."
        retryable={false}
      />
    );
  }
  if (query.error) {
    return (
      <ErrorState
        description={formatApiError(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.data === undefined) {
    return <LoadingBlock label={loadingLabel} />;
  }
  return <>{children(query.data as T)}</>;
}
