'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkUnderline } from '@edrion/ui';
import { PageHeader } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { useStudentApi } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';

type Attachment = {
  id: string;
  filename: string | null;
  mimeType: string;
  sizeBytes: number | null;
};

type Note = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  topicKey: string | null;
  weekNo: number | null;
  publishedAt: string | null;
  attachments: Attachment[];
};

function fileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const api = useStudentApi();
  const query = useStudentList<Note>(`note:${id}`, `/student/notes/${id}`);

  usePetrosPage(
    query.data
      ? {
          title: query.data.title,
          summary: query.data.summary ?? 'A note from your teacher',
          candidates: [
            {
              ref: query.data.id,
              entityType: 'note' as const,
              entityId: query.data.id,
              title: query.data.title,
              summary: query.data.summary ?? undefined,
              href: `/notes/${query.data.id}`,
            },
          ],
        }
      : null,
  );

  return (
    <QueryPage query={query} loadingLabel="Loading note…">
      {(note) => (
        <div className={styles.page}>
          <Link href="/notes" className={styles.deepLink}>
            <ArrowLeft aria-hidden="true" size={14} /> All notes
          </Link>

          <PageHeader
            eyebrow={note.weekNo ? `Week ${note.weekNo}` : 'Lesson note'}
            title={note.title}
            description={note.summary ?? undefined}
          />

          <article className={styles.panel}>
            <div className={styles.noteBody}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkUnderline]}>
                {note.body}
              </ReactMarkdown>
            </div>
            <footer className={styles.noteFooter}>
              {note.publishedAt && (
                <span className={styles.noteFooterMeta}>
                  <CalendarDays aria-hidden="true" size={15} />
                  Published{' '}
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(note.publishedAt))}
                </span>
              )}
              <PetrosAskButton candidateRef={note.id} label={note.title} />
            </footer>
          </article>

          {note.attachments.length > 0 && (
            <section>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Attachments</h2>
                <span className={styles.sectionMeta}>{note.attachments.length}</span>
              </div>
              <div className={styles.panel}>
                <ul className={styles.sideList}>
                  {note.attachments.map((file) => (
                    <li className={styles.sideItem} key={file.id}>
                      <span>
                        <Paperclip aria-hidden="true" size={14} /> {file.filename ?? 'Attachment'}
                      </span>
                      <a
                        className={styles.deepLink}
                        href={api.fileUrl(`/student/notes/${note.id}/attachments/${file.id}`)}
                      >
                        Download {fileSize(file.sizeBytes)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}
    </QueryPage>
  );
}
