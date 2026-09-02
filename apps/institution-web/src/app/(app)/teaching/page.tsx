'use client';
import Link from 'next/link';
import { BookOpen, FileText, Paperclip, Users } from 'lucide-react';
import { Badge, EmptyState, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { useMyTeaching } from '@/lib/teaching';

export default function TeachingPage() {
  const { data, isLoading } = useMyTeaching();
  const items = data?.items ?? [];
  const actingForOthers = data?.scope === 'all';

  return (
    <>
      <Topbar title="Teaching" />
      <div className="page-enter flex flex-1 flex-col gap-5 p-5">
        <div className="max-w-2xl">
          <p className="text-sm text-text-secondary">
            {actingForOthers
              ? 'Every subject being taught this term. You are not the teacher of record for these, so anything you publish is posted on their behalf.'
              : 'The subjects you teach. Open one to publish notes and files to that class.'}
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No subjects assigned to you"
            description="Subjects are assigned per class under Programme Structure → Classes. Once someone assigns you a subject, it appears here."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((a) => (
              <Link
                key={`${a.classId}:${a.subjectId}`}
                href={`/teaching/${a.classId}/${a.subjectId}`}
                className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary focus-visible:border-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {a.subjectCode && (
                        <span className="font-mono text-xs font-semibold text-text-muted">{a.subjectCode}</span>
                      )}
                      {actingForOthers && a.teacherName && (
                        <Badge tone="neutral">{a.teacherName}</Badge>
                      )}
                    </div>
                    <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary group-hover:text-primary">
                      {a.subjectName}
                    </h2>
                    <p className="truncate text-xs text-text-muted">{a.className}</p>
                  </div>
                  <BookOpen aria-hidden="true" size={18} className="shrink-0 text-text-muted" />
                </div>

                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                  <div className="flex items-center gap-1.5">
                    <FileText aria-hidden="true" size={13} />
                    <dt className="sr-only">Published notes</dt>
                    <dd>
                      {a.counts.notes} {a.counts.notes === 1 ? 'note' : 'notes'}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Paperclip aria-hidden="true" size={13} />
                    <dt className="sr-only">Files</dt>
                    <dd>
                      {a.counts.materials} {a.counts.materials === 1 ? 'file' : 'files'}
                    </dd>
                  </div>
                  {a.counts.drafts > 0 && (
                    <Badge tone="warning">
                      {a.counts.drafts} draft{a.counts.drafts === 1 ? '' : 's'}
                    </Badge>
                  )}
                </dl>
              </Link>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <Users aria-hidden="true" size={13} />
            Students see published notes and files in their own portal, filed under the subject.
          </p>
        )}
      </div>
    </>
  );
}
