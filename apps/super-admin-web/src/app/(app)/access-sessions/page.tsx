'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, TableSkeleton, ErrorState } from '@edrion/ui';
import { useSupportSessions } from '@edrion/api-client';
import { SupportAccessSessionStatus } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { SupportSessionsTable } from '@/components/support/support-sessions-table';

const PAGE_SIZE = 50;
const STATUS_FILTERS = ['', ...Object.values(SupportAccessSessionStatus)];

/**
 * Global support-access session directory. Every entry into an institution portal — live or
 * historical — with status filtering. The audit/correlation story made visible.
 */
export default function AccessSessionsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get('status') ?? '';

  const setParam = useCallback(
    (next: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`/access-sessions?${sp.toString()}`);
    },
    [params, router],
  );

  const { data, isLoading, isError, isFetching } = useSupportSessions({
    status: status || undefined,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <Topbar title="Access Sessions" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <p className="max-w-2xl text-sm text-text-secondary">
          Time-boxed, audited support-access sessions. Employees act as themselves inside an
          institution portal; every action is recorded against the session.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setParam({ status: e.target.value })}
            className="h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {isFetching && <span className="text-xs text-text-muted">Updating…</span>}
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : isError || !data ? (
            <div className="p-6">
              <ErrorState description="Could not load access sessions. Confirm the API is running on :3001." />
            </div>
          ) : (
            <div className="p-1">
              <SupportSessionsTable sessions={data.items} showInstitution />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
