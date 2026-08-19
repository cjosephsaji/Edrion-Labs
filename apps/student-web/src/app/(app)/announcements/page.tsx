'use client';

import { CalendarDays, Megaphone, Pin } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';

type Announcement = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  category: string | null;
  pinned: boolean;
  publishedAt: string | null;
};

type Response = { items: Announcement[] };

function dateParts(value: string | null) {
  if (!value) return { day: '--', month: 'Notice', full: 'Date not available' };
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat('en-IN', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date),
    full: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date),
  };
}

function label(value: string | null) {
  return (value ?? 'General').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function Page() {
  const query = useStudentList<Response>('announcements', '/student/announcements');

  usePetrosPage(
    query.data
      ? {
          title: 'Announcements',
          summary: `${query.data.items?.length ?? 0} published notices`,
          candidates: (query.data.items ?? []).map((item) => ({
            ref: item.id,
            entityType: 'announcement' as const,
            entityId: item.id,
            title: item.title,
            summary: [label(item.category), item.pinned ? 'pinned' : null].filter(Boolean).join(' · '),
            href: '/announcements',
          })),
        }
      : null,
  );

  return (
    <QueryPage query={query} loadingLabel="Loading announcements…">
      {(data) => {
        const items = [...(data.items ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned));
        const featured = items.find((item) => item.pinned) ?? items[0];
        const remaining = featured ? items.filter((item) => item.id !== featured.id) : [];
        const categories = new Map<string, number>();
        for (const item of items) categories.set(label(item.category), (categories.get(label(item.category)) ?? 0) + 1);

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="School noticeboard"
              title="Announcements"
              description="Updates, notices, and important information from Greenwood Academy."
            />

            {!featured ? (
              <EmptyState
                icon={Megaphone}
                title="No announcements"
                description="Institution notices will appear here when published."
              />
            ) : (
              <>
                <article className={styles.featureNotice}>
                  <div className={styles.featureDate}>
                    <strong>{dateParts(featured.publishedAt).day}</strong>
                    <span>{dateParts(featured.publishedAt).month}</span>
                  </div>
                  <div className={styles.featureBody}>
                    <div className={styles.featureKicker}>
                      {featured.pinned ? <Pin aria-hidden="true" size={14} /> : <Megaphone aria-hidden="true" size={14} />}
                      {featured.pinned ? 'Pinned notice' : label(featured.category)}
                    </div>
                    <h2 className={styles.featureTitle}>{featured.title}</h2>
                    <p className={styles.featureCopy}>{featured.body ?? featured.summary}</p>
                    <div className={styles.metaRow}>
                      <span className={styles.metaItem}><CalendarDays aria-hidden="true" size={14} />{dateParts(featured.publishedAt).full}</span>
                      <span>{label(featured.category)}</span>
                      <PetrosAskButton candidateRef={featured.id} label={featured.title} />
                    </div>
                  </div>
                </article>

                <div className={styles.splitLayout}>
                  <section>
                    <div className={styles.sectionHeader}>
                      <h2 className={styles.sectionTitle}>Latest notices</h2>
                      <span className={styles.sectionMeta}>{remaining.length} more</span>
                    </div>
                    <div className={styles.panel}>
                      <ul className={styles.feedList}>
                        {remaining.map((item) => (
                          <li className={styles.feedItem} key={item.id}>
                            <span className={styles.feedIcon}><Megaphone aria-hidden="true" size={19} /></span>
                            <article>
                              <h3 className={styles.feedTitle}>{item.title}</h3>
                              <p className={styles.feedCopy}>{item.body ?? item.summary}</p>
                              <div className={styles.metaRow}>
                                <span>{label(item.category)}</span>
                                <span>{dateParts(item.publishedAt).full}</span>
                              </div>
                            </article>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>

                  <aside>
                    <div className={styles.sectionHeader}>
                      <h2 className={styles.sectionTitle}>At a glance</h2>
                    </div>
                    <div className={styles.panel}>
                      <div className={styles.panelHeader}><h3 className={styles.panelTitle}>Noticeboard</h3></div>
                      <ul className={styles.sideList}>
                        <li className={styles.sideItem}><span>Published notices</span><span className={styles.sideValue}>{items.length}</span></li>
                        <li className={styles.sideItem}><span>Pinned</span><span className={styles.sideValue}>{items.filter((item) => item.pinned).length}</span></li>
                        {[...categories].map(([name, count]) => (
                          <li className={styles.sideItem} key={name}><span>{name}</span><span className={styles.sideValue}>{count}</span></li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
