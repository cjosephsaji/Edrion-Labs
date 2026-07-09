'use client';
import Link from 'next/link';
import { useAssignment } from '@/lib/hooks';
import { aiPolicyPill } from '@/lib/ai-policy';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import { Card } from '@/components/ui/card';
import { PillButton } from '@/components/ui/pill-button';

export default function AssignmentDetailPage({ params }: { params: { id: string } }) {
  const { data: item, isLoading } = useAssignment(params.id);

  if (isLoading || !item) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  if (item.deliveryMode === 'quiz') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
        <Link href="/assignments" className="text-sm text-st-muted hover:text-st-accent">← Assignments</Link>
        <div className="mt-4">
          <h1 className="font-display text-2xl font-semibold text-st-ink">{item.title}</h1>
          {item.instructions && <p className="mt-2 text-sm text-st-muted">{item.instructions}</p>}
          <p className="mt-1 text-xs text-st-faint">
            Quiz · Max {item.maxPoints} points
            {item.dueDate && ` · Due ${item.dueDate}`}
          </p>
        </div>
        <div className="mt-8 flex justify-center">
          <Link href={`/assignments/${params.id}/quiz`}>
            <PillButton>Open quiz</PillButton>
          </Link>
        </div>
      </div>
    );
  }

  const policy = aiPolicyPill(item.aiPolicy);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/assignments" className="text-sm text-st-muted hover:text-st-accent">← Assignments</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold text-st-ink">{item.title}</h1>
        <GovernancePill label={policy.label} tone={policy.tone} />
      </div>
      {item.instructions && <p className="mt-2 text-sm text-st-muted">{item.instructions}</p>}
      <p className="mt-1 text-xs text-st-faint">Max {item.maxPoints} points</p>
      {item.feedback && (
        <Card className="mt-6">
          <p className="text-xs font-semibold text-st-faint">FEEDBACK</p>
          <p className="mt-1 text-sm text-st-ink">{item.feedback}</p>
          {item.pointsAwarded != null && (
            <p className="mt-2 text-sm font-semibold text-st-accent">{item.pointsAwarded}/{item.maxPoints}</p>
          )}
        </Card>
      )}
      {item.versions.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-st-faint">SUBMISSIONS</p>
          <ul className="mt-2 space-y-2">
            {item.versions.map((v) => (
              <li key={v.versionNo} className="text-sm text-st-muted">
                v{v.versionNo} · {new Date(v.submittedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
