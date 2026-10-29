'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Card, PageHeader } from '@/components/design-system';
import { QueryPage } from '@/components/query-page';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentMe, type StudentMe } from '@/lib/hooks';
import { TeachingStudioLauncher } from '@/features/learning-studio/teaching-studio-launcher';
import { usePetrosPage, type PetrosCandidateInput } from './petros-companion-context';
import { PetrosInputModes } from './petros-input-modes';
import styles from './petros-input-modes.module.css';
import homeStyles from './petros-home.module.css';

type SharedItem = {
  id: string;
  title: string;
  subjectName: string | null;
  description?: string | null;
  summary?: string | null;
  kindLabel?: string;
};
type SharedItems = { items: SharedItem[] };

export function PetrosHome() {
  const me = useStudentMe();
  return (
    <QueryPage query={me} loadingLabel="Opening Petros…">
      {(account) =>
        account.kind === 'institutional' ? (
          <InstitutionalPetrosHome
            key={`${account.institutionId}:${account.studentId}`}
            account={account}
          />
        ) : (
          <>
            <TeachingStudioLauncher />
            <PetrosInputModes />
          </>
        )
      }
    </QueryPage>
  );
}

function InstitutionalPetrosHome({ account }: { account: StudentMe }) {
  const api = useStudentApi();
  const hasPermission = (permission: string) =>
    account.permissions.includes('*') || account.permissions.includes(permission);
  const canLearn = hasPermission('student.learn.use');
  const canRead = hasPermission('student.classes.view');
  const ownerKey = [account.institutionId, account.studentId];
  const goals = useQuery({
    queryKey: ['student', 'assignments', 'learning-goals', ...ownerKey],
    queryFn: () => api.get<SharedItems>('/student/assignments/learning-goals'),
    enabled: canLearn,
  });
  const materials = useQuery({
    queryKey: ['student', 'materials', ...ownerKey],
    queryFn: () => api.get<SharedItems>('/student/materials'),
    enabled: canRead,
  });
  const notes = useQuery({
    queryKey: ['student', 'notes', ...ownerKey],
    queryFn: () => api.get<SharedItems>('/student/notes'),
    enabled: canRead,
  });
  const sections = [
    {
      title: 'Learning goals',
      query: goals,
      enabled: canLearn,
      entityType: 'assignment' as const,
      href: (item: SharedItem) => `/learn/goals/${item.id}`,
      action: 'View goal and guidance',
    },
    {
      title: 'Study materials',
      query: materials,
      enabled: canRead,
      entityType: 'material' as const,
      href: () => '/materials',
      action: 'Open materials',
    },
    {
      title: 'Lesson notes',
      query: notes,
      enabled: canRead,
      entityType: 'note' as const,
      href: (item: SharedItem) => `/notes/${item.id}`,
      action: 'Read lesson note',
    },
  ].filter((section) => section.enabled);
  const pending = sections.some(({ query }) => query.isPending);
  const failed = sections.some(({ query }) => query.isError);
  const count = sections.reduce(
    (total, { query }) => total + (query.isError ? 0 : (query.data?.items.length ?? 0)),
    0,
  );
  const candidates: PetrosCandidateInput[] = sections.flatMap(({ query, entityType, href }) =>
    (query.isError ? [] : (query.data?.items ?? [])).map((item) => ({
      ref: `${entityType}:${item.id}`,
      entityType,
      entityId: item.id,
      title: item.title,
      summary: item.summary ?? item.description ?? item.subjectName ?? '',
      href: href(item),
    })),
  );
  usePetrosPage({
    title: 'Learn with Petros',
    summary: 'Learning goals, materials and notes shared by your institution.',
    candidates,
  });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Petros · from your institution"
        title="Learn with Petros"
        description="Work on the learning goals, materials and lesson notes your teachers share with you."
      />
      <section
        className={styles.teacherStage}
        aria-label="Petros teaching invitation"
        data-petros-target="petros:start"
      >
        <div className={styles.avatarStage}>
          <Image
            src="/petros/states/petros-point-right.png"
            alt="Petros points toward your shared learning content"
            width={384}
            height={512}
            priority
            unoptimized
          />
        </div>
        <div className={styles.thoughtCloud}>
          <span>
            <Sparkles aria-hidden="true" /> From your teachers
          </span>
          <h2>
            {pending
              ? 'Checking your shared content…'
              : count
                ? 'Choose what to work on'
                : failed
                  ? 'Shared content is unavailable'
                  : 'Ready when your teacher shares'}
          </h2>
          <p>
            Start with a teacher’s learning goal, study a shared resource or revisit a lesson note.
          </p>
        </div>
      </section>
      {pending && (
        <p className={homeStyles.status} role="status">
          Loading content shared with you…
        </p>
      )}
      {sections.length === 0 ? (
        <Card className={homeStyles.section}>
          <h2>Learning content is not enabled</h2>
          <p>Your institution manages access to teacher-shared learning content.</p>
        </Card>
      ) : !pending && !failed && count === 0 ? (
        <Card className={homeStyles.section}>
          <h2>No learning content shared yet</h2>
          <p>
            Your teacher’s learning goals, uploaded materials and published notes will appear here
            when they are shared with you.
          </p>
        </Card>
      ) : null}
      {sections
        .filter(({ query }) => query.isError || query.data?.items.length)
        .map(({ title, query, entityType, href, action }) => (
          <section key={entityType} className={homeStyles.section} aria-label={title}>
            {query.isError ? (
              <Card>
                <h2>{title}</h2>
                <p role="alert">
                  Could not load {title.toLowerCase()}. {formatApiError(query.error)}
                </p>
                <button
                  type="button"
                  className={homeStyles.retry}
                  onClick={() => void query.refetch()}
                >
                  Try again
                </button>
              </Card>
            ) : query.data?.items.length ? (
              <>
                <h2>{title}</h2>
                <ul className={homeStyles.grid}>
                  {query.data.items.map((item) => (
                    <li key={item.id}>
                      <Card
                        as="article"
                        className={homeStyles.item}
                        data-petros-target={`entity:${entityType}:${item.id}`}
                      >
                        {item.subjectName && (
                          <span className={homeStyles.subject}>{item.subjectName}</span>
                        )}
                        <h3>{item.title}</h3>
                        {(item.summary || item.description) && (
                          <p>{item.summary || item.description}</p>
                        )}
                        {item.kindLabel && <small>{item.kindLabel}</small>}
                        <Link href={href(item)} className={homeStyles.action}>
                          {action}
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ))}
    </div>
  );
}
