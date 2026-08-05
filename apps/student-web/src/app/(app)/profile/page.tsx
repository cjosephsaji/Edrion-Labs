'use client';

import { BookOpen, CalendarRange, GraduationCap, Layers3, Mail, Settings, ShieldCheck, UsersRound } from 'lucide-react';
import { ActionLink, PageHeader } from '@/components/design-system';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { useStudentMe } from '@/lib/hooks';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S';
}

function accountLabel(kind: 'institutional' | 'independent') {
  return kind === 'institutional' ? 'Institution student' : 'Independent learner';
}

export default function Page() {
  const me = useStudentMe();

  return (
    <QueryPage query={me} loadingLabel="Loading your profile…">
      {(item) => (
        <div className={`${styles.page} animate-block-in`}>
          <PageHeader
            eyebrow="Student record"
            title="Profile"
            description="Your identity, class placement, and current academic enrolment."
            actions={<ActionLink href="/settings" variant="secondary"><Settings aria-hidden="true" size={17} /> Settings</ActionLink>}
          />

          <section className={styles.profileHero}>
            <div className={styles.avatar} aria-hidden="true">{initials(item.fullName)}</div>
            <div>
              <h2 className={styles.profileName}>{item.fullName}</h2>
              <div className={styles.profileSubline}>
                {item.email ? <span><Mail aria-hidden="true" size={15} />{item.email}</span> : null}
                {item.academicYearName ? <span><CalendarRange aria-hidden="true" size={15} />{item.academicYearName}</span> : null}
              </div>
            </div>
            <span className={styles.profileBadge}>{accountLabel(item.kind)}</span>
          </section>

          <div className={styles.splitLayout}>
            <section>
              <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Academic profile</h2></div>
              <dl className={styles.detailGrid}>
                <Meta icon={GraduationCap} label="Programme" value={item.programmeName ?? item.className?.split('–')[0]?.trim()} />
                <Meta icon={UsersRound} label="Class" value={item.className} />
                <Meta icon={Layers3} label="Section" value={item.sectionName} />
                <Meta icon={BookOpen} label="Current term" value={item.termName} />
                <Meta icon={CalendarRange} label="Academic year" value={item.academicYearName} />
                <Meta icon={ShieldCheck} label="Account type" value={accountLabel(item.kind)} />
              </dl>
            </section>

            <aside>
              <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Account</h2></div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><h3 className={styles.panelTitle}>Student access</h3></div>
                <ul className={styles.sideList}>
                  <li className={styles.sideItem}><span>Status</span><span className={styles.sideValue}>Active</span></li>
                  <li className={styles.sideItem}><span>Portal</span><span className={styles.sideValue}>Student</span></li>
                  <li className={styles.sideItem}><span>Term</span><span className={styles.sideValue}>{item.termName ?? '—'}</span></li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      )}
    </QueryPage>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof GraduationCap; label: string; value?: string | null }) {
  return (
    <div className={styles.detailItem}>
      <dt className={styles.detailLabel}><Icon aria-hidden="true" size={15} />{label}</dt>
      <dd className={styles.detailValue}>{value ?? 'Not provided'}</dd>
    </div>
  );
}
