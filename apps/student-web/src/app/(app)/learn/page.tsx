'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleDashed,
  Compass,
  FileText,
  Layers3,
  PenLine,
  Route as RouteIcon,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type {
  PetrosBriefing,
  PetrosBriefingKind,
  PetrosReflectionSurface,
  PetrosSavedArtifact,
} from '@edrion/schemas';
import { PageHeader, Skeleton } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import {
  usePetrosPage,
  type PetrosCandidateInput,
} from '@/components/petros/petros-companion-context';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { useStudentApi } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';
import { LearnCrossLinks } from './learn-links';
import styles from './learn.module.css';

/* ------------------------------------------------------------------ *
 * Wire shapes. Only the fields this hub reads are typed; the reflection
 * surface and saved artifacts reuse the published schema types.
 * ------------------------------------------------------------------ */

type PathItem = {
  id: string;
  topicId: string;
  title: string;
  subjectLabel: string;
  sequence: number;
  whyHere: string | null;
  status: string;
  completedAt: string | null;
  version: number;
};

type LearningPath = {
  id: string;
  title: string;
  subjectLabel: string;
  metaLine: string | null;
  version: number;
  items: PathItem[];
} | null;

type Material = {
  id: string;
  title: string;
  description: string | null;
  kindLabel: string;
  weekNo: number | null;
  className: string | null;
  publishedAt: string;
};
type MaterialsResponse = { items: Material[] };

/** One row of "do this next", whatever produced it. */
type NextAction = {
  key: string;
  /** Where this came from. Stated so a suggestion never looks like it appeared by magic. */
  eyebrow: string;
  title: string;
  detail: string;
  href: string | null;
  actionLabel: string;
  /** Set when the row is a live path step: opens the Petros session preview instead. */
  pathStepId?: string;
};

const pageTitle = 'Learn';
const pageDescription =
  'Your learning path, what the evidence says you know, and everything you and your teachers have made — in one place.';

const BRIEFING_LABELS: Record<PetrosBriefingKind, string> = {
  active_session: 'Session still open',
  due_work: 'Due work',
  exam: 'Upcoming exam',
  review: 'Review due',
  reflection: 'Evidence-ranked',
  timetable: 'Today',
  feedback: 'New feedback',
  attendance: 'Attendance',
  planner: 'Your plan',
};

const COVERAGE_BANDS: Array<{ key: string; label: string }> = [
  { key: 'solid', label: 'Solid' },
  { key: 'shaky', label: 'Shaky' },
  { key: 'untouched', label: 'Not started' },
  { key: 'insufficient_evidence', label: 'Not enough evidence yet' },
];

const ARTIFACT_KINDS: Record<PetrosSavedArtifact['kind'], { label: string; icon: LucideIcon }> = {
  flashcard: { label: 'Flashcard', icon: Layers3 },
  rule_card: { label: 'Rule card', icon: Layers3 },
  diagram: { label: 'Diagram', icon: RouteIcon },
  note: { label: 'Note', icon: PenLine },
};

function shortDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(parsed);
}

export default function LearnPage() {
  const api = useStudentApi();

  /*
   * Five reads, one screen. `petros-path` and `petros-reflection-context` deliberately reuse
   * the keys the learning-path page uses so moving between the two costs nothing — the
   * reflection payload alone is over 100KB, and only its recommendations and coverage counts
   * are read here.
   */
  const pathQuery = useStudentList<LearningPath>('petros-path', '/student/petros/path');
  const reflectionQuery = useStudentList<PetrosReflectionSurface>(
    'petros-reflection-context',
    '/student/petros/reflection',
  );
  const materialsQuery = useStudentList<MaterialsResponse>('learn-materials', '/student/materials');
  const artifactsQuery = useStudentList<PetrosSavedArtifact[]>(
    'petros-artifacts',
    '/student/petros/artifacts?limit=100',
  );
  // Same key and staleness as the dashboard strip, so the hub never re-asks for a briefing
  // the student already saw this session.
  const briefingQuery = useQuery({
    queryKey: ['student', 'petros', 'briefing'],
    queryFn: () => api.get<PetrosBriefing>('/student/petros/companion/briefing'),
    staleTime: 5 * 60_000,
  });

  const path = pathQuery.data ?? null;
  const steps = useMemo(() => path?.items ?? [], [path]);
  const currentStep = useMemo(
    () => steps.find((step) => step.status === 'current') ?? null,
    [steps],
  );
  const completedSteps = steps.filter((step) => step.status === 'completed').length;

  const recommendations = useMemo(
    () =>
      (reflectionQuery.data?.recommendations ?? []).filter(
        (item) => item.status === 'active' || item.status === 'started',
      ),
    [reflectionQuery.data],
  );
  const coverage = reflectionQuery.data?.map.coverage ?? null;

  const materials = useMemo(() => materialsQuery.data?.items ?? [], [materialsQuery.data]);
  const savedArtifacts = useMemo(
    () => (artifactsQuery.data ?? []).filter((artifact) => artifact.lifecycle === 'saved'),
    [artifactsQuery.data],
  );
  const dueArtifacts = useMemo(() => {
    const now = Date.now();
    return savedArtifacts.filter(
      (artifact) => artifact.dueAt !== null && Date.parse(artifact.dueAt) <= now,
    );
  }, [savedArtifacts]);
  const recentArtifacts = useMemo(
    () =>
      [...savedArtifacts]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 4),
    [savedArtifacts],
  );

  /*
   * `mutedBy` is not the same as an empty briefing: the student switched proactive help off,
   * so nothing derived from it may appear anywhere on this page.
   */
  const briefing = briefingQuery.data && !briefingQuery.data.mutedBy ? briefingQuery.data : null;

  const nextActions = useMemo<NextAction[]>(() => {
    const actions: NextAction[] = [];
    const briefingItems = briefing?.items ?? [];

    const openSession = briefingItems.find((item) => item.kind === 'active_session');
    if (openSession?.href) {
      actions.push({
        key: `briefing:${openSession.kind}:${openSession.entityId ?? openSession.title}`,
        eyebrow: BRIEFING_LABELS.active_session,
        title: openSession.title,
        detail: openSession.detail,
        href: openSession.href,
        actionLabel: 'Resume session',
      });
    }

    if (currentStep) {
      actions.push({
        key: `step:${currentStep.id}`,
        eyebrow: `Learning path · step ${currentStep.sequence} of ${steps.length}`,
        title: currentStep.title,
        detail:
          currentStep.whyHere ?? `The next topic in ${currentStep.subjectLabel} on your path.`,
        href: '/learning-path',
        actionLabel: 'Start this topic',
        pathStepId: currentStep.id,
      });
    }

    const topRecommendation = recommendations[0];
    if (topRecommendation) {
      actions.push({
        key: `recommendation:${topRecommendation.id}`,
        eyebrow: `Evidence-ranked · ${topRecommendation.sessionType}`,
        title: topRecommendation.actionLabel,
        detail: topRecommendation.whyThis,
        href: '/progress',
        actionLabel: 'See the evidence',
      });
    }

    for (const item of briefingItems) {
      if (actions.length >= 4) break;
      if (item.kind === 'active_session' || !item.href) continue;
      actions.push({
        key: `briefing:${item.kind}:${item.entityId ?? item.title}`,
        eyebrow: BRIEFING_LABELS[item.kind],
        title: item.title,
        detail: item.detail,
        href: item.href,
        actionLabel: 'Open',
      });
    }

    return actions.slice(0, 4);
  }, [briefing, currentStep, recommendations, steps.length]);

  const shelfMaterials = useMemo(() => materials.slice(0, 4), [materials]);

  /*
   * Registered before any conditional render. Only entity types the API can actually resolve
   * are offered — a candidate without a resolvable id makes Petros claim knowledge he cannot
   * confirm, and PetrosAskButton hides itself rather than allow that.
   */
  const candidates = useMemo<PetrosCandidateInput[]>(() => {
    const list: PetrosCandidateInput[] = steps.map((step) => ({
      ref: `step:${step.id}`,
      entityType: 'learning_path_step' as const,
      entityId: step.id,
      title: step.title,
      summary: [`step ${step.sequence}`, step.status, step.subjectLabel].filter(Boolean).join(' · '),
      href: '/learning-path',
    }));
    for (const artifact of recentArtifacts) {
      list.push({
        ref: `artifact:${artifact.id}`,
        entityType: 'artifact' as const,
        entityId: artifact.id,
        title: artifact.content.title,
        summary: [ARTIFACT_KINDS[artifact.kind].label, artifact.dueAt ? 'review due' : null]
          .filter(Boolean)
          .join(' · '),
        href: '/petros/artifacts',
      });
    }
    for (const material of shelfMaterials) {
      list.push({
        ref: `material:${material.id}`,
        entityType: 'material' as const,
        entityId: material.id,
        title: material.title,
        summary: [material.kindLabel, material.className, material.weekNo ? `week ${material.weekNo}` : null]
          .filter(Boolean)
          .join(' · '),
        href: '/materials',
      });
    }
    return list;
  }, [recentArtifacts, shelfMaterials, steps]);

  usePetrosPage(
    pathQuery.data === undefined
      ? null
      : { title: pageTitle, summary: pageDescription, candidates },
  );

  const lead = nextActions[0] ?? null;
  const rest = nextActions.slice(1);
  const coverageTotal = coverage
    ? COVERAGE_BANDS.reduce((sum, band) => sum + (coverage[band.key] ?? 0), 0)
    : 0;

  return (
    <QueryPage query={pathQuery} loadingLabel="Loading your learning hub…">
      {() => {
        const nothingAtAll =
          steps.length === 0 &&
          nextActions.length === 0 &&
          savedArtifacts.length === 0 &&
          materials.length === 0 &&
          !materialsQuery.isPending &&
          !artifactsQuery.isPending;

        return (
          <div className={styles.page}>
            <PageHeader eyebrow="Learning" title={pageTitle} description={pageDescription} />

            {nothingAtAll ? (
              <EmptyState
                icon={Compass}
                title="Nothing to learn from yet"
                description="Once your teachers publish material, or you start a Petros session, this page fills in with what to do next and what you have made."
                actionHref="/petros"
                actionLabel="Bring in your own material"
              />
            ) : (
              <>
                {/* The three questions, answered before anything scrolls. */}
                <section className={styles.compass} aria-label="Where you stand">
                  <div className={styles.compassCell}>
                    <span className={styles.eyebrow}>
                      {lead ? lead.eyebrow : 'Do this next'}
                    </span>
                    {lead ? (
                      <>
                        <h2 className={styles.leadTitle}>{lead.title}</h2>
                        <p className={styles.leadDetail}>{lead.detail}</p>
                        <div className={styles.leadActions}>
                          {lead.pathStepId ? (
                            <PetrosDoorButton
                              door="learning_path"
                              sourceId={lead.pathStepId}
                              label={lead.actionLabel}
                              className={`${styles.open} ${styles.openStrong}`}
                            />
                          ) : lead.href ? (
                            <Link href={lead.href} className={`${styles.open} ${styles.openStrong}`}>
                              {lead.actionLabel}
                              <ArrowRight aria-hidden="true" />
                            </Link>
                          ) : null}
                          {lead.pathStepId ? (
                            <PetrosAskButton
                              candidateRef={`step:${lead.pathStepId}`}
                              label={lead.title}
                            />
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className={styles.leadTitle}>Nothing is pressing</h2>
                        <p className={styles.leadDetail}>
                          No open session, no ranked next step. A good moment to get ahead on
                          something below.
                        </p>
                      </>
                    )}
                  </div>

                  <div className={styles.compassCell}>
                    <span className={styles.eyebrow}>Where you are</span>
                    <strong className={styles.figure}>
                      {steps.length === 0
                        ? '—'
                        : `${Math.min(completedSteps + 1, steps.length)} / ${steps.length}`}
                    </strong>
                    <span className={styles.figureSub}>
                      {path ? `${path.title} · ${path.subjectLabel}` : 'No active learning path'}
                    </span>
                    {steps.length > 0 ? (
                      <div
                        className={styles.track}
                        role="img"
                        aria-label={`${completedSteps} of ${steps.length} steps complete`}
                      >
                        <span
                          className={styles.fill}
                          style={{ width: `${(completedSteps / steps.length) * 100}%` }}
                        />
                      </div>
                    ) : null}
                    <Link href="/learning-path" className={styles.bandLink}>
                      Open learning path
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>

                  <div className={styles.compassCell}>
                    <span className={styles.eyebrow}>What you&rsquo;ve made</span>
                    {artifactsQuery.isPending ? (
                      <Skeleton width="60%" height={30} />
                    ) : (
                      <strong className={styles.figure}>{savedArtifacts.length}</strong>
                    )}
                    <span className={styles.figureSub}>
                      {savedArtifacts.length === 1 ? 'saved artifact' : 'saved artifacts'}
                      {dueArtifacts.length > 0 ? ` · ${dueArtifacts.length} due for review` : ''}
                    </span>
                    <Link href="/petros/artifacts" className={styles.bandLink}>
                      Open saved work
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                </section>

                {rest.length > 0 ? (
                  <section className={styles.band} aria-labelledby="learn-queue-heading">
                    <div className={styles.bandHead}>
                      <h2 className={styles.bandTitle} id="learn-queue-heading">
                        Also worth doing
                      </h2>
                      <span className={styles.bandMeta}>ranked, not guessed</span>
                    </div>
                    <ol className={styles.queue}>
                      {rest.map((action, index) => (
                        <li className={styles.queueRow} key={action.key}>
                          <span className={styles.rank} aria-hidden="true">
                            {index + 2}
                          </span>
                          <div className={styles.queueBody}>
                            <span className={styles.eyebrow}>{action.eyebrow}</span>
                            <h3 className={styles.queueTitle}>{action.title}</h3>
                            {action.detail ? (
                              <p className={styles.queueDetail}>{action.detail}</p>
                            ) : null}
                          </div>
                          <div className={styles.rowAction}>
                            {action.pathStepId ? (
                              <PetrosDoorButton
                                door="learning_path"
                                sourceId={action.pathStepId}
                                label={action.actionLabel}
                                className={styles.open}
                              />
                            ) : action.href ? (
                              <Link href={action.href} className={styles.open}>
                                {action.actionLabel}
                                <ArrowRight aria-hidden="true" />
                              </Link>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className={styles.note}>
                      This order is fixed by rules, not by a model: an open session first, then
                      your current path step, then the highest-scoring evidence-ranked repair.
                    </p>
                  </section>
                ) : null}

                <div className={styles.split}>
                  <section className={styles.band} aria-labelledby="learn-path-heading">
                    <div className={styles.bandHead}>
                      <h2 className={styles.bandTitle} id="learn-path-heading">
                        Your learning path
                      </h2>
                      <Link href="/learning-path" className={styles.bandLink}>
                        Full path
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </div>
                    {steps.length === 0 ? (
                      <div className={styles.empty}>
                        <strong>No active learning path</strong>
                        <p>
                          A path appears here once your institution builds one from your
                          syllabus, or once Petros has enough evidence to sequence one.
                        </p>
                      </div>
                    ) : (
                      <ol className={styles.steps} aria-label="Learning path steps">
                        {steps.map((step) => {
                          const state =
                            step.status === 'completed'
                              ? 'completed'
                              : step.status === 'current'
                                ? 'current'
                                : 'upcoming';
                          return (
                            <li className={styles.step} key={step.id} data-state={state}>
                              <span className={styles.stepMark} aria-hidden="true">
                                {state === 'completed' ? (
                                  <Check />
                                ) : state === 'current' ? (
                                  <RouteIcon />
                                ) : (
                                  <CircleDashed />
                                )}
                              </span>
                              <div className={styles.stepBody}>
                                <h3 className={styles.stepTitle}>
                                  {step.sequence}. {step.title}
                                </h3>
                                <p className={styles.stepWhy}>
                                  {step.whyHere ?? `${step.subjectLabel} · ${step.status}`}
                                </p>
                              </div>
                              <div className={styles.rowAction}>
                                <PetrosAskButton
                                  candidateRef={`step:${step.id}`}
                                  label={step.title}
                                  variant="icon"
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </section>

                  <section className={styles.band} aria-labelledby="learn-knowledge-heading">
                    <div className={styles.bandHead}>
                      <h2 className={styles.bandTitle} id="learn-knowledge-heading">
                        What you know
                      </h2>
                      <Link href="/progress" className={styles.bandLink}>
                        Knowledge map
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </div>
                    {reflectionQuery.isPending ? (
                      <div className={styles.loading} role="status" aria-live="polite">
                        <Skeleton height={10} />
                        <Skeleton width="70%" height={14} />
                        <Skeleton width="55%" height={14} />
                      </div>
                    ) : reflectionQuery.error || !coverage || coverageTotal === 0 ? (
                      <div className={styles.empty}>
                        <strong>No mastery picture yet</strong>
                        <p>
                          Petros only claims to know something once there is evidence behind it.
                          Finish a session or two and the coverage appears here.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div
                          className={styles.coverageBar}
                          role="img"
                          aria-label={COVERAGE_BANDS.filter((band) => coverage[band.key])
                            .map((band) => `${coverage[band.key] ?? 0} ${band.label}`)
                            .join(', ')}
                        >
                          {COVERAGE_BANDS.map((band) => {
                            const value = coverage[band.key] ?? 0;
                            if (!value) return null;
                            return (
                              <span
                                key={band.key}
                                className={styles.coverageSlice}
                                data-band={band.key}
                                style={{ width: `${(value / coverageTotal) * 100}%` }}
                              />
                            );
                          })}
                        </div>
                        <ul className={styles.legend}>
                          {COVERAGE_BANDS.map((band) => (
                            <li className={styles.legendRow} key={band.key}>
                              <span className={styles.swatch} data-band={band.key} aria-hidden="true" />
                              <span className={styles.legendLabel}>{band.label}</span>
                              <span className={styles.legendValue}>{coverage[band.key] ?? 0}</span>
                            </li>
                          ))}
                        </ul>
                        {recommendations.length > 0 ? (
                          <p className={styles.note}>
                            {recommendations.length}{' '}
                            {recommendations.length === 1 ? 'topic is' : 'topics are'} ranked for
                            repair right now. Each one shows its evidence on the progress page.
                          </p>
                        ) : null}
                      </>
                    )}
                  </section>
                </div>

                <section className={styles.band} aria-labelledby="learn-made-heading">
                  <div className={styles.bandHead}>
                    <h2 className={styles.bandTitle} id="learn-made-heading">
                      What you&rsquo;ve made
                    </h2>
                    {dueArtifacts.length > 0 ? (
                      <span className={styles.bandMeta}>
                        {dueArtifacts.length} due for review
                      </span>
                    ) : null}
                    <Link href="/petros/artifacts" className={styles.bandLink}>
                      All saved work
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                  {artifactsQuery.isPending ? (
                    <div className={styles.loading} role="status" aria-live="polite">
                      <Skeleton height={72} />
                    </div>
                  ) : recentArtifacts.length === 0 ? (
                    <div className={styles.empty}>
                      <strong>Nothing saved yet</strong>
                      <p>
                        Flashcards, notes and diagrams you keep from a Petros session collect
                        here and come back for review on a schedule.
                      </p>
                      <p>
                        <Link href="/petros" className={styles.bandLink}>
                          Bring in your own material
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <>
                      <ul className={styles.shelf} aria-label="Recently saved artifacts">
                        {recentArtifacts.map((artifact) => {
                          const kind = ARTIFACT_KINDS[artifact.kind];
                          const KindIcon = kind.icon;
                          const due = artifact.dueAt
                            ? Date.parse(artifact.dueAt) <= Date.now()
                            : false;
                          return (
                            <li
                              className={styles.tile}
                              key={artifact.id}
                              data-due={due ? 'true' : undefined}
                            >
                              <span className={styles.tileKind}>
                                <KindIcon aria-hidden="true" />
                                {kind.label}
                              </span>
                              <h3 className={styles.tileTitle}>{artifact.content.title}</h3>
                              {artifact.dueAt ? (
                                <span className={due ? styles.tileDue : styles.tileMeta}>
                                  {due ? 'Review due now' : `Review ${shortDate(artifact.dueAt)}`}
                                </span>
                              ) : (
                                <span className={styles.tileMeta}>No review scheduled</span>
                              )}
                              <div className={styles.tileFoot}>
                                <PetrosAskButton
                                  candidateRef={`artifact:${artifact.id}`}
                                  label={artifact.content.title}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <p className={styles.note}>
                        <Link href="/petros" className={styles.bandLink}>
                          <Upload aria-hidden="true" />
                          Photograph, upload or type something new for Petros
                        </Link>
                      </p>
                    </>
                  )}
                </section>

                <section className={styles.band} aria-labelledby="learn-materials-heading">
                  <div className={styles.bandHead}>
                    <h2 className={styles.bandTitle} id="learn-materials-heading">
                      From your teachers
                    </h2>
                    {materials.length > shelfMaterials.length ? (
                      <span className={styles.bandMeta}>{materials.length} in total</span>
                    ) : null}
                    <Link href="/materials" className={styles.bandLink}>
                      All study materials
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                  {materialsQuery.isPending ? (
                    <div className={styles.loading} role="status" aria-live="polite">
                      <Skeleton height={72} />
                    </div>
                  ) : shelfMaterials.length === 0 ? (
                    <div className={styles.empty}>
                      <strong>No material published yet</strong>
                      <p>Notes, worksheets and resources appear here as your teachers share them.</p>
                    </div>
                  ) : (
                    <ul className={styles.shelf} aria-label="Recent study materials">
                      {shelfMaterials.map((material) => (
                        <li className={styles.tile} key={material.id}>
                          <span className={styles.tileKind}>
                            {material.kindLabel.toLowerCase().includes('note') ? (
                              <FileText aria-hidden="true" />
                            ) : (
                              <BookOpen aria-hidden="true" />
                            )}
                            {material.kindLabel}
                          </span>
                          <h3 className={styles.tileTitle}>{material.title}</h3>
                          <span className={styles.tileMeta}>
                            {[
                              material.className,
                              material.weekNo ? `Week ${material.weekNo}` : null,
                              shortDate(material.publishedAt),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          <div className={styles.tileFoot}>
                            <PetrosAskButton
                              candidateRef={`material:${material.id}`}
                              label={material.title}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            <LearnCrossLinks />
          </div>
        );
      }}
    </QueryPage>
  );
}
