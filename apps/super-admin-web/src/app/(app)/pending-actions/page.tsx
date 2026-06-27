'use client';
import Link from 'next/link';
import { AlertTriangle, Clock, CalendarClock, Info, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, EmptyState, ErrorState } from '@edrion/ui';
import { usePendingActions, type PendingActionItemDto } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

const GROUPS = [
  { key: 'critical', label: 'Critical', icon: AlertTriangle, accent: 'text-danger', border: 'border-l-danger' },
  { key: 'today', label: 'Today', icon: Clock, accent: 'text-warning', border: 'border-l-warning' },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock, accent: 'text-primary', border: 'border-l-primary' },
  { key: 'informational', label: 'Informational', icon: Info, accent: 'text-text-muted', border: 'border-l-border' },
] as const;

export default function PendingActionsPage() {
  const { data, isLoading, isError } = usePendingActions();

  return (
    <>
      <Topbar title="Pending Actions" />
      <div className="page-enter space-y-5 p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : isError ? (
          <ErrorState description="Could not load pending actions. Confirm the API is running on :3001." />
        ) : (data?.total ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState title="Nothing pending" description="No actions need attention right now." />
            </CardContent>
          </Card>
        ) : (
          GROUPS.map(({ key, label, icon: Icon, accent, border }) => {
            const items = (data?.groups[key] ?? []) as PendingActionItemDto[];
            if (items.length === 0) return null;
            return (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${accent}`} />
                    {label}
                    <span className="rounded-full bg-background-secondary px-2 py-0.5 text-xs text-text-muted">
                      {items.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`flex items-center justify-between rounded-md border border-l-2 border-border ${border} bg-surface px-3 py-2.5 transition-colors hover:bg-background-secondary`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">{item.title}</div>
                        <div className="truncate text-xs text-text-muted">{item.description}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
