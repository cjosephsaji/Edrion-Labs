'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BellOff,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  ClipboardCheck,
  GraduationCap,
  type LucideIcon,
  WalletCards,
} from 'lucide-react';
import { ActionButton, PageHeader } from '@/components/design-system';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { EmptyState } from '@/components/ui/states';
import { useStudentApi } from '@/lib/api-client';

type Notification = {
  id: string;
  title: string | null;
  body: string | null;
  createdAt: string | null;
  readAt: string | null;
  deepLink: string | null;
  type: string | null;
  sourceModule?: string | null;
};

type Filter = 'all' | 'unread' | 'read';
const pageTitle = 'Notifications';
const pageDescription = 'Deadlines, results, payments, and school activity in one place.';

function notificationIcon(item: Notification): LucideIcon {
  if (item.sourceModule === 'grading' || item.type === 'marks_released') return GraduationCap;
  if (item.sourceModule === 'fees') return WalletCards;
  if (item.sourceModule === 'calendar' || item.type === 'announcement') return CalendarClock;
  if (item.sourceModule === 'homework') return ClipboardCheck;
  return BellRing;
}

function notificationType(item: Notification) {
  const value = item.sourceModule ?? item.type ?? 'Update';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function Page() {
  const api = useStudentApi();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({
    queryKey: ['student', 'notifications'],
    queryFn: () => api.get<{ items: Notification[] }>('/student/notifications'),
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['student', 'notifications'] });
    await qc.invalidateQueries({ queryKey: ['student', 'home'] });
  };
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/student/notifications/${id}/read`),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/student/notifications/read-all'),
    onSuccess: refresh,
  });

  return (
    <QueryPage query={query} loadingLabel="Loading notifications…">
      {(data) => {
        const items = data.items ?? [];
        const unreadCount = items.filter((item) => !item.readAt).length;
        const visibleItems = items.filter((item) => filter === 'all' || (filter === 'unread' ? !item.readAt : item.readAt));

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Inbox"
              title={pageTitle}
              description={pageDescription}
              actions={unreadCount > 0 ? (
                <ActionButton variant="secondary" loading={markAll.isPending} loadingLabel="Marking all…" onClick={() => markAll.mutate()}>
                  <CheckCheck aria-hidden="true" size={17} />
                  Mark all read
                </ActionButton>
              ) : undefined}
            />

            {items.length === 0 ? (
              <EmptyState icon={BellOff} title="You’re caught up" description="New school and class updates will appear here." />
            ) : (
              <>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Unread</span><strong className={styles.summaryValue}>{unreadCount}</strong><span className={styles.summarySupporting}>Needs your attention</span></div>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>This inbox</span><strong className={styles.summaryValue}>{items.length}</strong><span className={styles.summarySupporting}>Recent notifications</span></div>
                  <div className={styles.summaryItem}><span className={styles.summaryLabel}>Status</span><strong className={styles.summaryValue}>{unreadCount ? 'Active' : 'Clear'}</strong><span className={styles.summarySupporting}>{unreadCount ? 'New activity available' : 'Everything has been read'}</span></div>
                </div>

                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Recent activity</h2>
                  <div className={styles.filters} aria-label="Filter notifications">
                    {(['all', 'unread', 'read'] as const).map((value) => (
                      <button className={styles.filterButton} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} key={value}>
                        {value[0]!.toUpperCase() + value.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  {visibleItems.length === 0 ? (
                    <EmptyState icon={CheckCheck} title={`No ${filter} notifications`} description="Try another inbox filter." />
                  ) : (
                    <ul className={styles.inboxList}>
                      {visibleItems.map((item) => {
                        const Icon = notificationIcon(item);
                        const isUnread = !item.readAt;
                        return (
                          <li className={styles.inboxItem} data-unread={isUnread} key={item.id}>
                            <span className={styles.inboxIcon}><Icon aria-hidden="true" size={18} /></span>
                            <article>
                              <h3 className={styles.inboxTitle}>{item.title ?? 'School update'}</h3>
                              {item.body ? <p className={styles.inboxCopy}>{item.body}</p> : null}
                              <div className={styles.metaRow}>
                                <span>{notificationType(item)}</span>
                                <span>{formatDate(item.createdAt)}</span>
                                <span>{isUnread ? 'Unread' : 'Read'}</span>
                              </div>
                              {item.deepLink ? <Link className={styles.deepLink} href={item.deepLink}>Open update <ArrowUpRight aria-hidden="true" size={14} /></Link> : null}
                            </article>
                            {isUnread ? (
                              <button
                                className={styles.inboxAction}
                                type="button"
                                disabled={markRead.isPending && markRead.variables === item.id}
                                aria-busy={markRead.isPending && markRead.variables === item.id}
                                onClick={() => markRead.mutate(item.id)}
                              >
                                <Check aria-hidden="true" size={14} /> Mark read
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
