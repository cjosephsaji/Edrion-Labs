'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useStudentClient } from '@/lib/student-client';
import { PillButton } from '@/components/ui/pill-button';

export function SubjectClassifyChip({ itemId }: { itemId: string }) {
  const client = useStudentClient();
  const classify = useQuery({
    queryKey: ['library', 'classify', itemId],
    queryFn: () =>
      client.get<{
        suggested?: { label?: string };
        status: string;
      } | null>(`/library/items/${itemId}/classify`),
  });

  const accept = useMutation({
    mutationFn: () => client.post(`/library/items/${itemId}/classify/accept`, {}),
    onSuccess: () => classify.refetch(),
  });

  const data = classify.data;
  if (!data || data.status === 'accepted') return null;
  const label = data.suggested?.label ?? 'General';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-st-bd2 bg-st-cardAlt px-3 py-2 text-sm">
      <span className="text-st-muted">File under</span>
      <span className="font-medium text-st-ink">{label}</span>
      <PillButton type="button" variant="soft" disabled={accept.isPending} onClick={() => accept.mutate()}>
        Accept
      </PillButton>
    </div>
  );
}
