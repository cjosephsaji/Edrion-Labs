'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Landmark,
  Megaphone,
  PlayCircle,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Card, PageHeader } from '@/components/design-system';
import { ErrorState, LoadingBlock, UnauthorizedState } from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useDashboard, type StudentHomeCard, type StudentHomeCardKind } from '@/lib/hooks';
import styles from './home.module.css';

const CARD_ICONS: Record<StudentHomeCardKind, LucideIcon> = {
  exam: BookOpenCheck,
  due_work: ClipboardList,
  learning: PlayCircle,
  fees: WalletCards,
  attendance: Activity,
  schedule: Clock3,
  announcement: Megaphone,
  notification: Bell,
};

function PriorityCard({ card, index }: { card: StudentHomeCard; index: number }) {
  const Icon = CARD_ICONS[card.kind];
  return (
    <article
      className={styles.card}
      data-priority={card.priority}
      data-prominence={card.prominence}
      data-kind={card.kind}
      data-petros-target={index === 0 ? 'primary' : undefined}
      data-petros-title={index === 0 ? card.title : undefined}
      data-petros-message={index === 0 ? card.reason : undefined}
      data-petros-href={index === 0 ? card.href : undefined}
      style={{ '--card-order': index } as React.CSSProperties}
    >
      <div className={styles.cardTop}>
        <span className={styles.icon}><Icon aria-hidden="true" /></span>
        {card.metric ? <span className={styles.metric}>{card.metric}</span> : null}
      </div>
      <div className={styles.cardBody}>
        <p className={styles.eyebrow}>{card.eyebrow}</p>
        <h2 className={styles.title}>{card.title}</h2>
        <p className={styles.description}>{card.description}</p>
        {card.meta?.length ? (
          <ul className={styles.meta} aria-label="Details">
            {card.meta.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </div>
      <div className={styles.cardFoot}>
        <span className={styles.reason}>{card.reason}</span>
        <Link href={card.href} className={styles.action}>
          {card.actionLabel}<ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export default function HomePage() {
  const dash = useDashboard();

  if (dash.isLoading) return <LoadingBlock label="Opening your day…" />;
  if (dash.error instanceof StudentApiError && dash.error.status === 401) return <UnauthorizedState />;
  if (dash.error) return <ErrorState description={formatApiError(dash.error)} onRetry={() => void dash.refetch()} />;

  const data = dash.data!;
  const me = data.me;
  const firstName = me.fullName.split(' ')[0] || me.fullName;

  if (me.kind === 'independent') {
    return (
      <div className="mx-auto w-full max-w-[1120px]">
        <PageHeader title={`Hi ${firstName}.`} />
        <Card variant="emphasis" density="roomy">
          <Landmark className="h-7 w-7 text-[#a9c4ba]" aria-hidden="true" />
          <p className="mt-6 text-xs uppercase tracking-[.12em] text-[#a9c4ba]">Institutional portal</p>
          <h2 className="mt-2 max-w-2xl text-3xl leading-tight">Connect your school or college</h2>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-[#d6e1dc]">Attendance, classes, assignments, results, fees, and campus services appear after your institution invites this account.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader title={`Hi ${firstName}.`} />

      <div className={styles.sectionHead}>
        <div>
          <p>Today</p>
          <h2>Your priorities</h2>
        </div>
        <span>{data.priorityCards.length} in view</span>
      </div>

      {data.priorityCards.length ? (
        <section className={styles.grid} aria-label="Ranked student priorities">
          {data.priorityCards.map((card, index) => <PriorityCard key={card.id} card={card} index={index} />)}
        </section>
      ) : (
        <section className={styles.clearState}>
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>You’re all caught up</h2>
            <p>There is nothing requiring attention right now.</p>
          </div>
          <Link href="/calendar">Open calendar<ArrowUpRight aria-hidden="true" /></Link>
        </section>
      )}

      <p className={styles.recordNote}>Priorities use records published to your student account by your institution.</p>
    </div>
  );
}
