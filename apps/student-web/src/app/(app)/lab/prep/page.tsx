'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { useStudentClient } from '@/lib/student-client';

type Block = { id: string; title: string; blockDate: string; payload?: { completedAt?: string } };

export default function ExamPrepPage() {
  const client = useStudentClient();
  const qc = useQueryClient();
  const plan = useQuery({
    queryKey: ['prep', 'plan'],
    queryFn: () => client.get<{ plan: { id: string } | null; blocks: Block[] }>('/student/prep/plan'),
  });
  const replan = useMutation({
    mutationFn: () => client.post('/student/prep/plan/replan', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prep', 'plan'] }),
  });
  const complete = useMutation({
    mutationFn: (id: string) => client.post(`/student/prep/plan/blocks/${id}/complete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prep', 'plan'] }),
  });
  const examDay = useQuery({
    queryKey: ['prep', 'exam-day'],
    queryFn: () => client.get<Record<string, unknown>>('/student/prep/exam-day'),
  });

  const blocks = plan.data?.blocks ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>LAB</Eyebrow>} title="Exam prep" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-st-bd1 px-3 py-1 text-xs"
          onClick={() => replan.mutate()}
          disabled={replan.isPending}
        >
          Replan week
        </button>
        <Link href="/lab/mock-exams" className="rounded-full border border-st-bd1 px-3 py-1 text-xs">
          Mock exams
        </Link>
      </div>

      {plan.isLoading ? (
        <div className="mt-8 h-40 shimmer rounded-[15px]" />
      ) : blocks.length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO PLAN"
          title="No active study plan"
          description="Tap Replan week after enrolling in a prep profile."
        />
      ) : (
        <div className="mt-6 space-y-2">
          {blocks.map((b) => {
            const done = Boolean(b.payload?.completedAt);
            return (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3"
              >
                <div>
                  <span className="text-sm text-st-ink">{b.title}</span>
                  <p className="text-xs text-st-faint">{b.blockDate}</p>
                </div>
                {done ? (
                  <span className="font-mono-ui text-[10px] text-st-faint">DONE</span>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-st-accent"
                    onClick={() => complete.mutate(b.id)}
                  >
                    Complete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {examDay.data && (
        <div className="mt-8 rounded-[15px] border border-st-bd1 bg-st-card p-4">
          <p className="font-mono-ui text-[10px] font-semibold text-st-faint">EXAM DAY</p>
          <pre className="mt-2 overflow-x-auto text-xs text-st-muted">
            {JSON.stringify(examDay.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
