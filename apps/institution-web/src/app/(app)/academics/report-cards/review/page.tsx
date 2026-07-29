'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, PermissionDenied } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

type ReviewItem = {
  review: { id: string; batchId: string; sectionId: string; status: string; version: number };
  batch: { id: string; status: string; kind: string };
};

export default function ReportCardTeacherReviewPage() {
  const { can } = usePermissions();
  const client = usePortalClient();
  const { scope } = useScope();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!can('documents.issue')) return;
    void client
      .get<{ items: ReviewItem[] }>('/portal/report-cards/teacher-reviews', scope)
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(err.message));
  }, [can, client, scope]);

  if (!can('documents.issue')) {
    return (
      <>
        <Topbar title="Report card review" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to review report cards." />
        </div>
      </>
    );
  }

  async function markReviewed(item: ReviewItem) {
    setBusyId(item.review.id);
    setError(null);
    try {
      await client.post(
        `/portal/report-cards/runs/${item.review.batchId}/sections/${item.review.sectionId}/review`,
        scope,
        { version: item.review.version },
      );
      setItems((current) => current.filter((row) => row.review.id !== item.review.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark reviewed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Topbar title="Report card review" />
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p className="text-sm text-text-secondary">
          Sections assigned to you as class teacher. Resolve any flagged cards before marking reviewed.
        </p>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">No sections awaiting your review.</p>
        ) : (
          items.map((item) => (
            <div key={item.review.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="font-semibold">Section {item.review.sectionId.slice(0, 8)}…</p>
                <p className="text-xs text-text-secondary">Batch {item.batch.id.slice(0, 8)} · {item.batch.status}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="warning">Pending</Badge>
                <Button size="sm" disabled={busyId === item.review.id} onClick={() => void markReviewed(item)}>
                  Mark reviewed
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
