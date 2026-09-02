'use client';

import Link from 'next/link';
import { NotebookPen } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';
import type { PetrosSavedArtifact } from '@edrion/schemas';

type Note = {
  id: string;
  title: string;
  summary: string | null;
  topicKey: string | null;
  weekNo: number | null;
  contextName: string | null;
  subjectName: string | null;
  author: string | null;
  publishedAt: string | null;
};

type Response = { items: Note[] };

function publishedOn(value: string | null) {
  if (!value) return 'Not dated';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(value),
  );
}

export default function Page() {
  const query = useStudentList<Response>('notes', '/student/notes');
  const savedQuery = useStudentList<PetrosSavedArtifact[]>(
    'petros-saved-notes',
    '/student/petros/artifacts?kind=note&limit=100',
  );
  const savedNotes = (savedQuery.data ?? []).filter((artifact) => artifact.content.kind === 'note');

  usePetrosPage(
    query.data
      ? {
          title: 'Notes',
          summary: `${savedNotes.length} personal notes and ${query.data.items?.length ?? 0} notes from your teachers`,
          candidates: [
            ...savedNotes.map((artifact) => ({
              ref: `petros-note-${artifact.id}`,
              entityType: 'note' as const,
              entityId: artifact.id,
              title: artifact.content.title,
              summary: artifact.content.kind === 'note' ? artifact.content.body.slice(0, 180) : '',
              href: `/notes#petros-note-${artifact.id}`,
            })),
            ...(query.data.items ?? []).map((item) => ({
            ref: item.id,
            entityType: 'note' as const,
            entityId: item.id,
            title: item.title,
            summary: [item.subjectName, item.weekNo ? `Week ${item.weekNo}` : null]
              .filter(Boolean)
              .join(' · '),
            href: `/notes/${item.id}`,
            })),
          ],
        }
      : null,
  );

  return (
    <>
      <QueryPage query={query} loadingLabel="Loading notes…">
      {(data) => {
        const items = data.items ?? [];
        const bySubject = new Map<string, number>();
        for (const item of items) {
          const key = item.subjectName ?? item.contextName ?? 'General';
          bySubject.set(key, (bySubject.get(key) ?? 0) + 1);
        }

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Your learning library"
              title="Notes"
              description="Your saved Petros notes and lesson notes published for your class, together in one place."
            />

            <section id="my-notes" aria-labelledby="my-notes-title">
              <div className={styles.sectionHeader}>
                <h2 id="my-notes-title" className={styles.sectionTitle}>My Petros notes</h2>
                <span className={styles.sectionMeta}>{savedNotes.length} saved</span>
              </div>
              <div className={styles.panel}>
                {savedQuery.isLoading ? <p className={styles.feedCopy}>Loading your saved notes…</p> : null}
                {!savedQuery.isLoading && savedNotes.length === 0 ? (
                  <p className={styles.feedCopy}>Save an explanation during a Petros lesson and it will appear here immediately.</p>
                ) : null}
                {savedNotes.length ? (
                  <ul className={styles.feedList}>
                    {savedNotes.map((artifact) => artifact.content.kind === 'note' ? (
                      <li id={`petros-note-${artifact.id}`} className={styles.noteListItem} key={artifact.id}>
                        <Link href={`/petros/artifacts#artifact-${artifact.id}`} className={styles.noteCard}>
                          <span className={styles.feedIcon}><NotebookPen aria-hidden="true" size={19} /></span>
                          <article>
                            <h3 className={styles.feedTitle}>{artifact.content.title}</h3>
                            <p className={styles.feedCopy}>{artifact.content.body}</p>
                            <div className={styles.metaRow}><span>Saved with Petros</span><span>{publishedOn(artifact.createdAt)}</span></div>
                          </article>
                        </Link>
                      </li>
                    ) : null)}
                  </ul>
                ) : null}
              </div>
            </section>

            {items.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title="No notes yet"
                description="When a teacher publishes a note for your class, it appears here."
              />
            ) : (
              <div className={styles.splitLayout}>
                <section>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>All notes</h2>
                    <span className={styles.sectionMeta}>{items.length} published</span>
                  </div>
                  <div className={styles.panel}>
                    <ul className={styles.feedList}>
                      {items.map((item) => (
                        <li className={styles.noteListItem} key={item.id}>
                          <Link href={`/notes/${item.id}`} className={styles.noteCard}>
                            <span className={styles.feedIcon}>
                              <NotebookPen aria-hidden="true" size={19} />
                            </span>
                            <article>
                              <h3 className={styles.feedTitle}>{item.title}</h3>
                              {item.summary && <p className={styles.feedCopy}>{item.summary}</p>}
                              <div className={styles.metaRow}>
                                {item.subjectName && <span>{item.subjectName}</span>}
                                {item.weekNo && <span>Week {item.weekNo}</span>}
                                <span>{publishedOn(item.publishedAt)}</span>
                                {item.author && <span>{item.author}</span>}
                              </div>
                            </article>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <aside>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>By subject</h2>
                  </div>
                  <div className={styles.panel}>
                    <ul className={styles.sideList}>
                      {[...bySubject].map(([name, count]) => (
                        <li className={styles.sideItem} key={name}>
                          <span>{name}</span>
                          <span className={styles.sideValue}>{count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              </div>
            )}
          </div>
        );
      }}
      </QueryPage>
    </>
  );
}
