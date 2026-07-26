'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStudentClient } from '@/lib/student-client';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function TransportRenewPage() {
  const client = useStudentClient();
  const qc = useQueryClient();
  const transport = useQuery({
    queryKey: ['campus', 'transport'],
    queryFn: () => client.get<{ assignment?: { id: string } }>('/student/campus/transport/assignment'),
  });
  const renew = useMutation({
    mutationFn: () =>
      client.post('/student/requests', {
        type: 'transport_renewal',
        payload: {
          assignment_id: transport.data?.assignment?.id,
          term_months: 12,
          reason: 'Annual renewal',
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'requests'] }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <PageHeader eyebrow={<Eyebrow>CAMPUS</Eyebrow>} title="Renew transport" />
      <p className="mt-2 text-sm text-st-muted">Submit a renewal request for staff approval and fee payment if required.</p>
      <button
        type="button"
        disabled={!transport.data?.assignment?.id || renew.isPending}
        className="mt-6 rounded-full bg-st-accent px-4 py-2 text-sm text-white disabled:opacity-50"
        onClick={() => renew.mutate()}
      >
        Request renewal
      </button>
    </div>
  );
}
