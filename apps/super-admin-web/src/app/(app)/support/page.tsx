'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Card, StatusBadge, TableSkeleton, EmptyState, ErrorState, Button, Select } from '@edrion/ui';
import {
  useSupportCases,
  useCreateSupportCase,
  useChangeSupportCaseStatus,
  type SupportCaseDto,
} from '@edrion/api-client';
import { errorMessage } from '@/lib/errors';
import { Topbar } from '@/components/app-shell/topbar';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', 'open', 'pending', 'resolved', 'closed'];
const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export default function SupportCasesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [searchInput, setSearchInput] = useState(search);
  const create = useCreateSupportCase();

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/support?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const { data, isLoading, isError } = useSupportCases({
    search: search || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const onNew = () => {
    const subject = window.prompt('New support case — subject?');
    if (!subject || subject.trim().length < 3) return;
    create.mutate(
      { subject: subject.trim(), category: 'general', priority: 'normal' },
      { onError: (e) => window.alert(errorMessage(e)) },
    );
  };

  return (
    <>
      <Topbar title="Support Cases" />
      <div className="page-enter space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              className={`${selectClass} w-64 pl-9`}
              placeholder="Search subject…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search support cases"
            />
          </div>
          <Select
            className={`${selectClass} w-auto min-w-[10rem]`}
            value={status}
            onChange={(e) => setParam({ status: e.target.value, page: 1 })}
            aria-label="Filter by status"
            options={STATUS_FILTERS.map((s) => ({ value: s, label: s === '' ? 'All statuses' : s }))}
          />
          <Button size="sm" className="ml-auto" disabled={create.isPending} onClick={onNew}>
            New case
          </Button>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : isError || !data ? (
          <ErrorState description="Could not load support cases. Confirm the API is running on :3001." />
        ) : data.items.length === 0 ? (
          <EmptyState title="No support cases" description="Create one with “New case”." />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="p-3 font-medium">Case</th>
                  <th className="p-3 font-medium">Subject</th>
                  <th className="p-3 font-medium">Priority</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ c }: { c: SupportCaseDto }) {
  const change = useChangeSupportCaseStatus(c.id);
  const next = c.status === 'open' ? 'resolved' : c.status === 'resolved' ? 'closed' : null;
  const advance = () => {
    if (!next) return;
    change.mutate(
      { status: next, reason: `advance to ${next}` },
      { onError: (e) => window.alert(errorMessage(e)) },
    );
  };
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 font-mono text-text-muted">{c.publicId}</td>
      <td className="p-3 text-text-primary">{c.subject}</td>
      <td className="p-3 text-text-muted">{c.priority}</td>
      <td className="p-3">
        <StatusBadge status={c.status} />
      </td>
      <td className="p-3 text-right">
        {next && (
          <Button size="sm" variant="secondary" disabled={change.isPending} onClick={advance}>
            Mark {next}
          </Button>
        )}
      </td>
    </tr>
  );
}
