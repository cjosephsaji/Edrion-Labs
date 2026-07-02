'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Card, StatusBadge, TableSkeleton, EmptyState, ErrorState, Button, countryName } from '@edrion/ui';
import { useIndependentUsers, useIndependentUserStatusAction, type IndependentUserDto } from '@edrion/api-client';
import { errorMessage } from '@/lib/errors';
import { Topbar } from '@/components/app-shell/topbar';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', 'active', 'disabled', 'locked', 'invited', 'pending_deletion'];
const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export default function IndependentUsersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [searchInput, setSearchInput] = useState(search);

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/independent-users?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const { data, isLoading, isError } = useIndependentUsers({
    search: search || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <Topbar title="Independent Users" />
      <div className="page-enter space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              className={`${selectClass} w-64 pl-9`}
              placeholder="Search name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search independent users"
            />
          </div>
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setParam({ status: e.target.value, page: 1 })}
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : isError || !data ? (
          <ErrorState description="Could not load independent users. Confirm the API is running on :3001." />
        ) : data.items.length === 0 ? (
          <EmptyState title="No independent users" description="No users match these filters." />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Email</th>
                  <th className="p-3 font-medium">Country</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Source</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <Row key={u.id} user={u} />
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>
              Page {page} · {data.total} users
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={!data.hasMore} onClick={() => setParam({ page: page + 1 })}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Row({ user }: { user: IndependentUserDto }) {
  const action = useIndependentUserStatusAction(user.id);
  const isDisabled = user.status === 'disabled';
  const onToggle = () => {
    const reason = window.prompt(isDisabled ? 'Reason to restore this user?' : 'Reason to disable this user?');
    if (!reason || reason.trim().length < 3) return;
    action.mutate(
      { action: isDisabled ? 'restore' : 'disable', reason: reason.trim(), version: user.version },
      { onError: (e) => window.alert(errorMessage(e)) },
    );
  };
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 text-text-primary">{user.fullName}</td>
      <td className="p-3 text-text-muted">{user.email}</td>
      <td className="p-3 text-text-muted">{user.country ? countryName(user.country) : '—'}</td>
      <td className="p-3">
        <StatusBadge status={user.status} />
      </td>
      <td className="p-3 text-text-muted">{user.signupSource ?? '—'}</td>
      <td className="p-3 text-right">
        <Button size="sm" variant="secondary" disabled={action.isPending} onClick={onToggle}>
          {isDisabled ? 'Restore' : 'Disable'}
        </Button>
      </td>
    </tr>
  );
}
