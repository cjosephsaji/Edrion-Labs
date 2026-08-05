'use client';

import { useState } from 'react';
import { BookOpen, ClipboardCheck, FileText, FolderOpen, NotebookTabs, Search, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';

type Material = {
  id: string;
  title: string;
  description: string | null;
  kindLabel: string;
  weekNo: number | null;
  className: string | null;
  publishedAt: string;
};
type Response = { items: Material[] };
const pageTitle = 'Study materials';
const pageDescription = 'Notes, worksheets, and resources shared by your teachers.';

function materialIcon(kind: string): LucideIcon {
  const value = kind.toLowerCase();
  if (value.includes('check')) return ClipboardCheck;
  if (value.includes('note')) return NotebookTabs;
  if (value.includes('template')) return BookOpen;
  return FileText;
}

export default function Page() {
  const query = useStudentList<Response>('materials', '/student/materials');
  const [context, setContext] = useState('all');
  const [search, setSearch] = useState('');

  return (
    <QueryPage query={query} loadingLabel="Loading study materials…">
      {(data) => {
        const items = data.items ?? [];
        const contexts = [...new Set(items.map((item) => item.className ?? 'General'))];
        const queryText = search.trim().toLowerCase();
        const visibleItems = items.filter((item) =>
          (context === 'all' || (item.className ?? 'General') === context) &&
          (!queryText || [item.title, item.description, item.kindLabel, item.className].some((value) => value?.toLowerCase().includes(queryText))),
        );

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Learning library"
              title={pageTitle}
              description={pageDescription}
            />

            {items.length === 0 ? (
              <EmptyState icon={FolderOpen} title="No materials available" description="Shared class resources will appear here." />
            ) : (
              <>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Resources</span><strong className={styles.summaryValue}>{items.length}</strong><span className={styles.summarySupporting}>Available to study</span></div>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Collections</span><strong className={styles.summaryValue}>{contexts.length}</strong><span className={styles.summarySupporting}>Classes and courses</span></div>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Current week</span><strong className={styles.summaryValue}>{Math.max(...items.map((item) => item.weekNo ?? 0)) || '—'}</strong><span className={styles.summarySupporting}>Latest tagged material</span></div>
                </div>

                <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Resource library</h2><span className={styles.sectionMeta}>{visibleItems.length} shown</span></div>
                <div className={styles.toolbar}>
                  <div className={styles.filters} aria-label="Filter study materials">
                    <button className={styles.filterButton} type="button" aria-pressed={context === 'all'} onClick={() => setContext('all')}>All</button>
                    {contexts.map((name) => <button className={styles.filterButton} type="button" aria-pressed={context === name} onClick={() => setContext(name)} key={name}>{name}</button>)}
                  </div>
                  <label className={styles.searchBox}>
                    <span className="sr-only">Search study materials</span>
                    <Search aria-hidden="true" />
                    <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search materials" />
                  </label>
                </div>

                {visibleItems.length === 0 ? (
                  <EmptyState icon={Search} title="No matching materials" description="Try another collection or search." />
                ) : (
                  <div className={styles.resourceGrid}>
                    {visibleItems.map((item) => {
                      const Icon = materialIcon(item.kindLabel);
                      return (
                        <article className={styles.resourceCard} key={item.id}>
                          <span className={styles.resourceIcon}><Icon aria-hidden="true" size={22} /></span>
                          <div>
                            <h3 className={styles.resourceTitle}>{item.title}</h3>
                            {item.description ? <p className={styles.resourceDescription}>{item.description}</p> : null}
                            <div className={styles.resourceFooter}>
                              <span className={styles.resourceTag}>{item.kindLabel}</span>
                              <span>{item.className ?? 'General'}</span>
                              {item.weekNo ? <span>Week {item.weekNo}</span> : null}
                              <span>{new Date(item.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
