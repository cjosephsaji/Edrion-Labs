'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useStudentClient } from '@/lib/student-client';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function LibraryNotesPage() {
  const client = useStudentClient();
  const notes = useQuery({
    queryKey: ['student', 'library', 'notes'],
    queryFn: () => client.get<{ notes: Array<{ id: string; title: string; updatedAt: string }> }>('/library/notes'),
  });

  const create = useMutation({
    mutationFn: (title: string) =>
      client.post('/library/notes', { title, doc: { type: 'doc', content: [] } }),
    onSuccess: () => notes.refetch(),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <PageHeader
        backHref="/library"
        eyebrow={<Eyebrow>NOTES</Eyebrow>}
        title="Study notes"
        subtitle="Summaries and your own notes live here."
        right={
          <PillButton
            type="button"
            onClick={() => {
              const title = window.prompt('Note title');
              if (title?.trim()) create.mutate(title.trim());
            }}
          >
            New note
          </PillButton>
        }
      />
      {notes.isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (
        <ul className="mt-8 space-y-2">
          {(notes.data?.notes ?? []).map((note) => (
            <li key={note.id} className="rounded-[12px] border border-st-bd2 bg-st-card p-4">
              <p className="font-medium text-st-ink">{note.title}</p>
              <p className="mt-1 text-xs text-st-muted">
                Updated {new Date(note.updatedAt).toLocaleDateString()}
              </p>
            </li>
          ))}
          {!notes.data?.notes.length && (
            <p className="text-sm text-st-muted">No notes yet. Save a summary from a document or create one.</p>
          )}
        </ul>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/library" className="text-st-accent">
          Back to Library
        </Link>
      </p>
    </div>
  );
}
