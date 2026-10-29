'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileText,
  MessageCircleQuestion,
  Play,
  TrendingUp,
} from 'lucide-react';
import type {
  PetrosBriefing,
  PetrosReflectionSurface,
  PetrosSavedArtifact,
} from '@edrion/schemas';
import { PageHeader, Skeleton } from '@/components/design-system';
import {
  usePetrosPage,
  type PetrosCandidateInput,
} from '@/components/petros/petros-companion-context';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { PetrosContinuityOverview } from '@/components/petros/petros-continuity';
import { PetrosTeacherGoals } from '@/components/petros/petros-teacher-goals';
import { QueryPage } from '@/components/query-page';
import { useStudentApi } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';
import styles from './learn.module.css';

type PathItem = {
  id: string;
  title: string;
  subjectLabel: string;
  sequence: number;
  whyHere: string | null;
  status: string;
};

type LearningPath = {
  title: string;
  subjectLabel: string;
  items: PathItem[];
} | null;

type Material = {
  id: string;
  title: string;
  kindLabel: string;
  className: string | null;
  weekNo: number | null;
  publishedAt: string;
};

type MaterialsResponse = { items: Material[] };

type SessionHistory = {
  items: Array<{
    id: string;
    topic: string;
    status: string;
    checkpointsComplete: number;
    checkpointsTotal: number;
    lastActivityAt: string;
    href: string;
    resumable: boolean;
  }>;
};

type NextAction = {
  key: string;
  eyebrow: string;
  title: string;
  detail: string;
  href: string | null;
  label: string;
  pathStepId?: string;
};

function shortDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(parsed);
}

export default function LearnPage() {
  const api = useStudentApi();
  const pathQuery = useStudentList<LearningPath>('petros-path', '/student/petros/path');
  const reflectionQuery = useStudentList<PetrosReflectionSurface>(
    'petros-reflection-context',
    '/student/petros/reflection',
  );
  const materialsQuery = useStudentList<MaterialsResponse>('learn-materials', '/student/materials');
  const historyQuery = useStudentList<SessionHistory>(
    'petros-session-history',
    '/student/petros/sessions/history',
  );
  const artifactsQuery = useStudentList<PetrosSavedArtifact[]>(
    'petros-artifacts',
    '/student/petros/artifacts?limit=100',
  );
  const briefingQuery = useQuery({
    queryKey: ['student', 'petros', 'briefing'],
    queryFn: () => api.get<PetrosBriefing>('/student/petros/companion/briefing'),
    staleTime: 5 * 60_000,
  });

  const path = pathQuery.data ?? null;
  const steps = useMemo(() => path?.items ?? [], [path]);
  const currentStep = steps.find((step) => step.status === 'current') ?? null;
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const materials = useMemo(() => materialsQuery.data?.items ?? [], [materialsQuery.data]);
  const sessions = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data]);
  const savedArtifacts = useMemo(
    () => (artifactsQuery.data ?? []).filter((artifact) => artifact.lifecycle === 'saved'),
    [artifactsQuery.data],
  );
  const recommendations = useMemo(
    () =>
      (reflectionQuery.data?.recommendations ?? []).filter(
        (item) => item.status === 'active' || item.status === 'started',
      ),
    [reflectionQuery.data],
  );
  const briefing = briefingQuery.data && !briefingQuery.data.mutedBy ? briefingQuery.data : null;
  const coverage = reflectionQuery.data?.map.coverage;
  const evidenceCount = (coverage?.solid ?? 0) + (coverage?.shaky ?? 0);

  const nextActions = useMemo<NextAction[]>(() => {
    const actions: NextAction[] = [];
    const activeSession = (briefing?.items ?? []).find(
      (item) => item.kind === 'active_session' && item.href,
    );

    if (activeSession?.href) {
      actions.push({
        key: `session:${activeSession.entityId ?? activeSession.title}`,
        eyebrow: 'Continue learning',
        title: activeSession.title,
        detail: activeSession.detail,
        href: activeSession.href,
        label: 'Resume',
      });
    }

    if (currentStep) {
      actions.push({
        key: `path:${currentStep.id}`,
        eyebrow: `Next topic · step ${currentStep.sequence} of ${steps.length}`,
        title: currentStep.title,
        detail: currentStep.whyHere ?? `Continue your ${currentStep.subjectLabel} path.`,
        href: '/learning-path',
        label: 'Start topic',
        pathStepId: currentStep.id,
      });
    }

    const recommendation = recommendations[0];
    if (recommendation) {
      actions.push({
        key: `recommendation:${recommendation.id}`,
        eyebrow: evidenceCount > 0 ? 'Worth reviewing' : 'From your syllabus',
        title: recommendation.actionLabel,
        detail: recommendation.whyThis,
        href: '/progress',
        label: 'View topic',
      });
    }

    for (const item of briefing?.items ?? []) {
      if (actions.length >= 4) break;
      if (!item.href || item.kind === 'active_session') continue;
      actions.push({
        key: `briefing:${item.kind}:${item.entityId ?? item.title}`,
        eyebrow: item.kind === 'due_work' ? 'Due work' : 'Recommended next',
        title: item.title,
        detail: item.detail,
        href: item.href,
        label: 'Open',
      });
    }

    return actions.slice(0, 4);
  }, [briefing, currentStep, evidenceCount, recommendations, steps.length]);

  const recentArtifacts = useMemo(
    () =>
      [...savedArtifacts]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 3),
    [savedArtifacts],
  );
  const recentMaterials = materials.slice(0, 3);
  const recentSessions = sessions.slice(0, 3);

  const candidates = useMemo<PetrosCandidateInput[]>(() => {
    const list: PetrosCandidateInput[] = steps.map((step) => ({
      ref: `step:${step.id}`,
      entityType: 'learning_path_step' as const,
      entityId: step.id,
      title: step.title,
      summary: `${step.subjectLabel} · step ${step.sequence} · ${step.status}`,
      href: '/learning-path',
    }));
    for (const material of recentMaterials) {
      list.push({
        ref: `material:${material.id}`,
        entityType: 'material' as const,
        entityId: material.id,
        title: material.title,
        summary: [material.kindLabel, material.className].filter(Boolean).join(' · '),
        href: '/materials',
      });
    }
    for (const artifact of recentArtifacts) {
      list.push({
        ref: `artifact:${artifact.id}`,
        entityType: 'artifact' as const,
        entityId: artifact.id,
        title: artifact.content.title,
        summary: artifact.kind,
        href: '/petros/artifacts',
      });
    }
    return list;
  }, [recentArtifacts, recentMaterials, steps]);

  usePetrosPage(
    pathQuery.data === undefined
      ? null
      : {
          title: 'Learn',
          summary: 'Continue learning, use study material, or review progress.',
          candidates,
        },
  );

  const lead = nextActions[0] ?? null;

  return (
    <div className={styles.page}>
      <QueryPage query={pathQuery} loadingLabel="Loading your learning workspace…">
        {() => (
          <>
            <PageHeader
              eyebrow="Learning workspace"
              title="Learn"
              description="Pick up where you stopped, or choose one clear way to begin."
            />

            <PetrosContinuityOverview />
            <PetrosTeacherGoals />

            <section className={styles.focus} aria-labelledby="learn-focus-title" data-petros-target="learning:focus">
              <div className={styles.focusBody}>
                <span className={styles.eyebrow}>{lead?.eyebrow ?? 'Ready when you are'}</span>
                <h2 id="learn-focus-title">{lead?.title ?? 'What do you want to learn?'}</h2>
                <p>
                  {lead?.detail ??
                    'Choose a class resource, ask about a topic, or review something that needs practice.'}
                </p>
                <div className={styles.focusActions}>
                  {lead?.pathStepId ? (
                    <PetrosDoorButton
                      door="learning_path"
                      sourceId={lead.pathStepId}
                      label={lead.label}
                      className={styles.primaryAction}
                    />
                  ) : lead?.href ? (
                    <Link href={lead.href} className={styles.primaryAction}>
                      <Play aria-hidden="true" />
                      {lead.label}
                    </Link>
                  ) : (
                    <Link href="/petros" className={styles.primaryAction}>
                      <MessageCircleQuestion aria-hidden="true" />
                      Ask Petros
                    </Link>
                  )}
                </div>
              </div>
              <div className={styles.focusProgress}>
                <span className={styles.eyebrow}>Your path</span>
                <strong>{steps.length ? `${completedSteps} of ${steps.length}` : 'Not started'}</strong>
                <span>{path?.title ?? 'Start with any topic or material'}</span>
                {steps.length ? (
                  <div className={styles.track} aria-label={`${completedSteps} of ${steps.length} steps complete`}>
                    <span style={{ width: `${(completedSteps / steps.length) * 100}%` }} />
                  </div>
                ) : null}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="learn-start-title">
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.eyebrow}>Start something new</span>
                  <h2 id="learn-start-title">Choose how you want to begin</h2>
                </div>
              </div>
              <div className={styles.startGrid}>
                <Link href="/materials" className={styles.startCard} data-petros-target="learning:materials">
                  <BookOpen aria-hidden="true" />
                  <span><strong>Use class material</strong><small>Open notes, files, and uploads</small></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link href="/petros" className={styles.startCard} data-petros-target="learning:ask">
                  <MessageCircleQuestion aria-hidden="true" />
                  <span><strong>Ask about a topic</strong><small>Type, photograph, or upload a question</small></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link href="/progress?focus=needs-practice#next-actions-heading" className={styles.startCard} data-petros-target="learning:progress">
                  <TrendingUp aria-hidden="true" />
                  <span><strong>Review what needs work</strong><small>See weak topics and your next step</small></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </section>

            <div className={styles.dashboard}>
              <section className={styles.section} aria-labelledby="learn-next-title">
                <div className={styles.sectionHead}><h2 id="learn-next-title">Next up</h2></div>
                {nextActions.slice(1).length ? (
                  <ul className={styles.list}>
                    {nextActions.slice(1).map((action) => (
                      <li key={action.key}>
                        <div>
                          <span className={styles.eyebrow}>{action.eyebrow}</span>
                          <strong>{action.title}</strong>
                          <small>{action.detail}</small>
                        </div>
                        {action.pathStepId ? (
                          <PetrosDoorButton
                            door="learning_path"
                            sourceId={action.pathStepId}
                            label={action.label}
                            className={styles.rowAction}
                          />
                        ) : action.href ? (
                          <Link href={action.href} className={styles.rowAction}>{action.label}</Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyCompact}>Nothing else is waiting. Choose any option above.</p>
                )}
              </section>

              <section className={styles.section} aria-labelledby="learn-progress-title">
                <div className={styles.sectionHead}>
                  <h2 id="learn-progress-title">Your progress</h2>
                  <Link href="/progress">See details <ArrowRight aria-hidden="true" /></Link>
                </div>
                {reflectionQuery.isPending ? (
                  <div className={styles.loading}><Skeleton height={70} /></div>
                ) : (
                  <div className={styles.progressStats}>
                    <div><strong>{coverage?.solid ?? 0}</strong><span>Solid</span></div>
                    <div><strong>{coverage?.shaky ?? 0}</strong><span>Needs practice</span></div>
                    <div><strong>{coverage?.untouched ?? 0}</strong><span>Not started</span></div>
                  </div>
                )}
                <p className={styles.progressNote}>
                  {evidenceCount
                    ? 'Built from the work you have completed, not a guess.'
                    : 'Your progress picture appears after you complete some learning.'}
                </p>
              </section>
            </div>

            <div className={styles.dashboard}>
              <section className={styles.section} aria-labelledby="learn-sessions-title">
                <div className={styles.sectionHead}><h2 id="learn-sessions-title">Recent sessions</h2></div>
                {historyQuery.isPending ? (
                  <div className={styles.loading}><Skeleton height={70} /></div>
                ) : recentSessions.length ? (
                  <ul className={styles.compactList}>
                    {recentSessions.map((session) => (
                      <li key={session.id}>
                        <Clock3 aria-hidden="true" />
                        <div><strong>{session.topic}</strong><small>{session.resumable ? 'Ready to continue' : `${session.checkpointsComplete} of ${session.checkpointsTotal} steps`}</small></div>
                        <Link href={session.href}>{session.resumable ? 'Resume' : 'Open'}</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyCompact}>Your completed and paused sessions will appear here.</p>
                )}
              </section>

              <section className={styles.section} aria-labelledby="learn-materials-title">
                <div className={styles.sectionHead}>
                  <h2 id="learn-materials-title">From your teachers</h2>
                  <Link href="/materials">Open library <ArrowRight aria-hidden="true" /></Link>
                </div>
                {materialsQuery.isPending ? (
                  <div className={styles.loading}><Skeleton height={70} /></div>
                ) : recentMaterials.length ? (
                  <ul className={styles.compactList}>
                    {recentMaterials.map((material) => (
                      <li key={material.id}>
                        <FileText aria-hidden="true" />
                        <div><strong>{material.title}</strong><small>{[material.className, material.weekNo ? `Week ${material.weekNo}` : null, shortDate(material.publishedAt)].filter(Boolean).join(' · ')}</small></div>
                        <Link href="/materials">Open</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyCompact}>Teacher files will appear here when they are shared.</p>
                )}
              </section>
            </div>

            <section className={styles.savedStrip} aria-label="Saved learning work">
              <div>
                <span className={styles.eyebrow}>Saved work</span>
                <strong>{savedArtifacts.length} {savedArtifacts.length === 1 ? 'item' : 'items'}</strong>
                <small>Notes and flashcards you chose to keep</small>
              </div>
              <Link href="/petros/artifacts">Open saved work <ArrowRight aria-hidden="true" /></Link>
            </section>
          </>
        )}
      </QueryPage>
    </div>
  );
}
