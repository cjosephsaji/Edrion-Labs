'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
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
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage, type PetrosCandidateInput } from '@/components/petros/petros-companion-context';
import { ErrorState, LoadingBlock, UnauthorizedState } from '@/components/ui/states';
import { StudentApiError, formatApiError } from '@/lib/api-client';
import { useDashboard, useStudentList, type StudentHomeCard, type StudentHomeCardKind } from '@/lib/hooks';
import styles from './home.module.css';

/**
 * Home card ids are prefixed by the service (`due:assignment:<id>`, `exam:<id>`, …), so the
 * underlying record can be named without a second request. Cards that summarise a whole
 * surface rather than one record resolve to nothing, and Petros then says so rather than
 * inventing a source.
 */
function cardEntity(card: StudentHomeCard): Pick<PetrosCandidateInput, 'entityType' | 'entityId'> {
  const parts = card.id.split(':');
  if (parts[0] === 'due' && parts[2]) {
    return { entityType: parts[1] === 'homework' ? 'homework' : 'assignment', entityId: parts[2] };
  }
  if ((parts[0] === 'exam' || parts[0] === 'active-exam') && parts[1]) {
    return { entityType: 'exam_schedule', entityId: parts[1] };
  }
  if (parts[0] === 'announcement' && parts[1]) return { entityType: 'announcement', entityId: parts[1] };
  if (parts[0] === 'schedule' && parts[1]) return { entityType: 'timetable_slot', entityId: parts[1] };
  if (parts[0] === 'continuity' && parts[2]) return { entityType: 'petros_session', entityId: parts[2] };
  return { entityType: 'screen' };
}

type HomeMaterial = {
  id: string;
  title: string;
  description: string | null;
  kindLabel: string;
  weekNo: number | null;
  className: string | null;
  publishedAt: string;
};

type HomeMaterialsResponse = { items: HomeMaterial[] };

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
        <span className={styles.cardActions}>
          <PetrosAskButton candidateRef={card.id} label={card.title} />
          <Link href={card.href} className={styles.action}>
            {card.actionLabel}<ArrowUpRight aria-hidden="true" />
          </Link>
        </span>
      </div>
    </article>
  );
}

export default function HomePage() {
  const dash = useDashboard();
  const materials = useStudentList<HomeMaterialsResponse>(
    'home-materials',
    '/student/materials',
    dash.data?.me.kind === 'institutional',
  );
  const featuredMaterial = materials.data?.items?.[0] ?? null;

  usePetrosPage(
    dash.data
      ? {
          title: 'Your priorities',
          summary: `${dash.data.priorityCards.length} ranked items${featuredMaterial ? ' · teacher material available' : ''}`,
          candidates: [
            ...dash.data.priorityCards.map((card) => ({
              ref: card.id,
              title: card.title,
              summary: card.description,
              href: card.href,
              ...cardEntity(card),
            })),
            ...(materials.data?.items ?? []).slice(0, 5).map((material) => ({
              ref: `material:${material.id}`,
              entityType: 'material' as const,
              entityId: material.id,
              title: material.title,
              summary: [material.kindLabel, material.className].filter(Boolean).join(' · '),
              href: '/materials',
            })),
          ],
        }
      : null,
  );

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

      {featuredMaterial ? (
        <section className={styles.materialSection} aria-labelledby="home-material-heading">
          <div className={styles.materialSectionHead}>
            <div>
              <p>From your teachers</p>
              <h2 id="home-material-heading">A new place to learn from</h2>
            </div>
            <Link href="/materials" className={styles.materialBrowse}>
              All study materials <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
          <article className={styles.materialFeature}>
            <div className={styles.materialIcon} aria-hidden="true"><BookOpen /></div>
            <div className={styles.materialCopy}>
              <span className={styles.materialLabel}>{featuredMaterial.kindLabel} · {featuredMaterial.className ?? 'General'}</span>
              <h3>{featuredMaterial.title}</h3>
              <p>{featuredMaterial.description ?? 'A study resource shared by your teacher.'}</p>
            </div>
            <div className={styles.materialActions}>
              <PetrosAskButton candidateRef={`material:${featuredMaterial.id}`} label={featuredMaterial.title} />
              <Link href="/materials" className={styles.materialOpen}>Open in learning <ArrowUpRight aria-hidden="true" /></Link>
            </div>
          </article>
        </section>
      ) : null}
    </div>
  );
}
