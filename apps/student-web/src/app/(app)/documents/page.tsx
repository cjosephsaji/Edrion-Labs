'use client';

import { useState } from 'react';
import { Award, FileBadge2, FileText, FolderOpen, IdCard, Search, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';

type Document = {
  id: string;
  title: string;
  docType: string | null;
  issuedAt: string | null;
  contentType: string | null;
};
type Response = { items: Document[] };

function typeLabel(value: string | null) {
  return (value ?? 'other').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function documentIcon(value: string | null): LucideIcon {
  if (value === 'certificate') return Award;
  if (value === 'id_card') return IdCard;
  if (value === 'report_card') return FileBadge2;
  return FileText;
}

export default function Page() {
  const query = useStudentList<Response>('documents', '/student/documents');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  return (
    <QueryPage query={query} loadingLabel="Loading documents…">
      {(data) => {
        const items = data.items ?? [];
        const types = [...new Set(items.map((item) => item.docType ?? 'other'))];
        const queryText = search.trim().toLowerCase();
        const visibleItems = items.filter((item) =>
          (filter === 'all' || (item.docType ?? 'other') === filter) &&
          (!queryText || item.title.toLowerCase().includes(queryText) || typeLabel(item.docType).toLowerCase().includes(queryText)),
        );

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Student vault"
              title="Documents"
              description="Your issued reports, certificates, and official student records."
            />

            {items.length === 0 ? (
              <EmptyState icon={FolderOpen} title="No documents issued" description="Official records will appear here after they are published." />
            ) : (
              <>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>All documents</span><strong className={styles.summaryValue}>{items.length}</strong><span className={styles.summarySupporting}>Published to your vault</span></div>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Certificates</span><strong className={styles.summaryValue}>{items.filter((item) => item.docType === 'certificate').length}</strong><span className={styles.summarySupporting}>Awards and participation</span></div>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Latest issue</span><strong className={styles.summaryValue}>{items[0]?.issuedAt ? new Date(items[0].issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</strong><span className={styles.summarySupporting}>{items[0]?.title ?? 'No recent document'}</span></div>
                </div>

                <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Document library</h2><span className={styles.sectionMeta}>{visibleItems.length} shown</span></div>
                <div className={styles.toolbar}>
                  <div className={styles.filters} aria-label="Filter documents">
                    <button className={styles.filterButton} type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                    {types.map((type) => <button className={styles.filterButton} type="button" aria-pressed={filter === type} onClick={() => setFilter(type)} key={type}>{typeLabel(type)}</button>)}
                  </div>
                  <label className={styles.searchBox}>
                    <span className="sr-only">Search documents</span>
                    <Search aria-hidden="true" />
                    <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" />
                  </label>
                </div>

                {visibleItems.length === 0 ? (
                  <EmptyState icon={Search} title="No matching documents" description="Try a different document type or search." />
                ) : (
                  <div className={styles.resourceGrid}>
                    {visibleItems.map((item, index) => {
                      const Icon = documentIcon(item.docType);
                      return (
                        <article
                          className={styles.resourceCard}
                          key={item.id}
                          data-petros-target={index === 0 ? 'primary' : undefined}
                          data-petros-title={index === 0 ? item.title : undefined}
                          data-petros-message={index === 0 ? 'This is the first document in your current view.' : undefined}
                        >
                          <span className={styles.resourceIcon}><Icon aria-hidden="true" size={22} /></span>
                          <div>
                            <h3 className={styles.resourceTitle}>{item.title}</h3>
                            <p className={styles.resourceDescription}>{typeLabel(item.docType)}</p>
                            <div className={styles.resourceFooter}>
                              <span className={styles.resourceTag}>{item.contentType === 'application/pdf' ? 'PDF' : 'Document'}</span>
                              <span>{item.issuedAt ? `Issued ${new Date(item.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Issue date unavailable'}</span>
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
