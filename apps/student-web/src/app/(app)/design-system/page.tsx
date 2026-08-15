'use client';

import { useState } from 'react';
import { BookOpen, CalendarPlus, Check, RefreshCcw } from 'lucide-react';
import {
  ActionButton,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
  OfflineState,
  PageHeader,
  StatTile,
  StatusPill,
} from '@/components/design-system';
import styles from './preview.module.css';

export default function DesignSystemPreviewPage() {
  const [announcement, setAnnouncement] = useState('');

  const announce = (message: string) => {
    setAnnouncement(message);
    window.setTimeout(() => setAnnouncement(''), 2200);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Edrion interface system · preview"
        title="A clearer academic workspace"
        description="These are the proposed shared primitives. They establish hierarchy, system states, accessible interaction, and a strict 4/8px rhythm before any product screen is migrated."
        actions={<ActionButton onClick={() => announce('Primary action confirmed immediately.')}><Check size={18} aria-hidden="true" /> Test action</ActionButton>}
      />

      <section className={styles.section} aria-labelledby="type-heading">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="type-heading">Typography and rhythm</h2>
          <p className={styles.sectionDescription}>Newsreader gives headings warmth while Source Sans 3 keeps navigation, controls, and body copy easy to scan. Body copy never drops below 16px.</p>
        </div>
        <Card density="roomy">
          <div className={styles.specimen}>
            <div>
              <p className={styles.displaySample}>Study with clarity.</p>
              <p className={styles.bodySample}>Your timetable, deadlines, balances, and feedback should be easy to scan without making important information compete for attention. Long-form copy stays within a comfortable 60–75 character measure.</p>
            </div>
            <div>
              <p className={styles.mathSample}>∫₀¹ x² dx = ⅓</p>
              <ul className={styles.tokenList} aria-label="Foundation tokens">
                <li><span>Base space</span><strong>4px</strong></li>
                <li><span>Body text</span><strong>16px / 1.6</strong></li>
                <li><span>Reading width</span><strong>72ch</strong></li>
                <li><span>Press feedback</span><strong>80ms</strong></li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      <section className={styles.section} aria-labelledby="ranking-heading">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="ranking-heading">Ranked information</h2>
          <p className={styles.sectionDescription}>A screen gets one focal point. Urgent information dominates; healthy and complete states recede.</p>
        </div>
        <div className={styles.grid}>
          <div className={styles.primaryStat}><StatTile label="Payment overdue" value="₹12,500" supporting="Due 3 days ago · Late fee begins tomorrow" tone="critical" prominence="primary" /></div>
          <div className={styles.secondaryStat}><StatTile label="Homework" value="2 due" supporting="Next deadline today at 17:00" tone="warning" /></div>
          <div className={styles.secondaryStat}><StatTile label="Attendance" value="93%" supporting="Comfortably above the requirement" tone="positive" prominence="quiet" /></div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="cards-heading">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="cards-heading">Cards, statuses, and actions</h2>
          <p className={styles.sectionDescription}>Weight comes from context—not decorative shadows. Every interactive control includes hover, focus-visible, active, and disabled behavior.</p>
        </div>
        <div className={styles.pillRow} aria-label="Status examples">
          <StatusPill label="Submitted" tone="positive" />
          <StatusPill label="Due today" tone="warning" />
          <StatusPill label="Overdue" tone="critical" />
          <StatusPill label="Draft" tone="neutral" />
          <StatusPill label="New feedback" tone="info" />
        </div>
        <div className={styles.grid}>
          <Card className={styles.wide} variant="emphasis" density="roomy">
            <p className={styles.cardMeta}>Next class · 09:00</p>
            <h3 className={styles.cardTitle}>Mathematics</h3>
            <p className={styles.cardCopy}>Quadratic equations · Room 9A · Tina Teacher</p>
          </Card>
          <Card className={styles.narrow} variant="subtle">
            <p className={styles.cardMeta}>All clear</p>
            <h3 className={styles.cardTitle}>No missed work</h3>
            <p className={styles.cardCopy}>Nothing needs your attention right now.</p>
          </Card>
        </div>
        <div className={styles.actionRow}>
          <ActionButton onClick={() => announce('Saved. Screen readers receive this update through the live region.')}>Save changes</ActionButton>
          <ActionButton variant="secondary" onClick={() => announce('Secondary action selected.')}>Review later</ActionButton>
          <ActionButton disabled disabledReason="Select at least one invoice to continue.">Pay selected</ActionButton>
        </div>
        <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">{announcement}</div>
      </section>

      <section className={styles.section} aria-labelledby="empty-heading">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="empty-heading">Useful empty states</h2>
          <p className={styles.sectionDescription}>An empty surface explains why it is empty and offers the next-best action.</p>
        </div>
        <EmptyState icon={BookOpen} title="No study materials yet" description="Your teacher has not published anything for this class. Review the class schedule while you wait." action={<ActionButton variant="secondary"><CalendarPlus size={18} aria-hidden="true" /> View class schedule</ActionButton>} />
      </section>

      <section className={styles.section} aria-labelledby="system-heading">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="system-heading">Complete system states</h2>
          <p className={styles.sectionDescription}>Skeletons mirror the final card geometry. Error and offline states are explicit, recoverable, and announced politely.</p>
        </div>
        <div className={styles.stateGrid}>
          <CardSkeleton label="Loading assignment details" />
          <ErrorState onRetry={() => announce('Retry requested.')} />
          <OfflineState onRetry={() => announce('Connection check requested.')} />
          <Card variant="emphasis" density="roomy">
            <p className={styles.cardMeta}>Amount selected</p>
            <p className={styles.total}>₹24,800</p>
            <span className={styles.totalLabel}>Two invoices · fees included</span>
            <div className={styles.stateAction}><ActionButton onClick={() => announce('Payment review opened.')}><RefreshCcw size={18} aria-hidden="true" /> Review payment</ActionButton></div>
          </Card>
        </div>
      </section>
    </div>
  );
}
