'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  LayoutGrid,
  Search,
  Clock3,
  EyeOff,
  FileText,
  Focus,
  HelpCircle,
  List,
  Map as MapIcon,
  MessageSquareOff,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import type {
  PetrosGapAlarm,
  PetrosKnowledgeMapTopic,
  PetrosReflectionRecommendation,
  PetrosReflectionSurface,
  PetrosLearningSessionDocument,
  PetrosSessionIntent,
  PetrosSessionRecap,
} from '@edrion/schemas';
import { PageHeader } from '@/components/design-system';
import { usePetrosPage } from './petros-companion-context';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import {
  formatApiError,
  newIdempotencyKey,
  useStudentApi,
} from '@/lib/api-client';
import styles from './petros-reflection.module.css';

const STATE_LABELS = {
  solid: 'Solid',
  shaky: 'Needs practice',
  untouched: 'Not attempted',
  insufficient_evidence: 'Still learning',
} as const;

export function PetrosReflection() {
  const api = useStudentApi();
  const needsPracticeFocus = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('focus') === 'needs-practice';
  const [data, setData] = useState<PetrosReflectionSurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'subjects' | 'list'>('subjects');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState(needsPracticeFocus ? 'shaky' : 'all');
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<PetrosReflectionSurface>('/student/petros/reflection');
      setData(result);
      setSelectedConceptId((current) =>
        current && result.map.topics.some((topic) => topic.conceptId === current)
          ? current
          : result.recommendations[0]?.conceptId ?? result.map.topics[0]?.conceptId ?? null,
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!needsPracticeFocus) return;
    setStateFilter('shaky');
    setNotice('These recommendations are based on places where your own work shows another pass would help.');
  }, [needsPracticeFocus]);

  const rebuild = async () => {
    setRebuilding(true);
    setError('');
    try {
      const result = await api.post<PetrosReflectionSurface>('/student/petros/reflection/rebuild', {
        idempotencyKey: newIdempotencyKey(),
      });
      setData(result);
      setNotice('Your progress is up to date.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setRebuilding(false);
    }
  };

  usePetrosPage(data ? {
    title: 'Learning progress',
    summary: `${data.map.topics.length} topics. ${data.map.coverage.solid ?? 0} solid, ${data.map.coverage.shaky ?? 0} need practice.${data.stale ? ' Progress needs refreshing before starting a recommendation.' : ''}`,
    candidates: data.recommendations.slice(0, 4).map((recommendation) => ({
      ref: recommendation.id,
      entityType: 'reflection_recommendation' as const,
      entityId: recommendation.id,
      title: recommendation.title,
      summary: recommendation.whyThis,
      href: '/progress',
    })),
  } : null);

  const topics = data?.map.topics ?? [];
  const filteredTopics = topics.filter((topic) =>
    (stateFilter === 'all' || topic.state === stateFilter) &&
    `${topic.title} ${topic.subjectLabel}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selected = filteredTopics.find((topic) => topic.conceptId === selectedConceptId) ?? null;
  const activeCalibration = data?.calibration?.status === 'active' ? data.calibration : null;
  const activeAlarms = data?.alarms.filter(
    (alarm) =>
      alarm.status === 'active' ||
      (alarm.status === 'snoozed' && alarm.snoozedUntil && Date.parse(alarm.snoozedUntil) <= Date.now()),
  ) ?? [];
  const recommendations = data?.recommendations.slice(0, 4) ?? [];
  const recaps = data?.recaps.filter((recap) => recap.status !== 'dismissed').slice(0, 4) ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Your learning"
        title="Progress"
        description="See what’s clicking, what needs practice, and where to go next."
        actions={data ? (
          <div className={styles.updateActions}>
            <span>{data.rebuiltAt ? `Updated ${formatAge(data.rebuiltAt)}` : 'Not updated yet'}</span>
            <button type="button" onClick={() => void rebuild()} disabled={rebuilding || loading} aria-busy={rebuilding} data-loading-indicator={rebuilding || undefined}>
              <RefreshCw aria-hidden="true" className={rebuilding ? styles.spin : ''} />
              {rebuilding ? 'Refreshing…' : 'Refresh progress'}
            </button>
          </div>
        ) : undefined}
      />
      {loading && !data ? <LoadingBlock label="Loading your progress…" /> : null}
      {error && !data ? <ErrorState description={error} onRetry={() => void load()} /> : null}
      {data ? <>
        {data.stale ? (
          <div className={styles.stale} role="status">
            <AlertTriangle aria-hidden="true" />
            <p>There’s newer learning activity. Refresh your progress to update these suggestions.</p>
            <button type="button" onClick={() => void rebuild()} disabled={rebuilding} aria-busy={rebuilding}>
              {rebuilding ? 'Refreshing…' : 'Refresh now'}<ArrowRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}

        <section className={styles.summary} aria-label="Topic progress summary">
          {(Object.keys(STATE_LABELS) as Array<keyof typeof STATE_LABELS>).map((state) => (
            <div key={state} data-state={state}>
              <span className={styles.statePill}>{STATE_LABELS[state]}</span>
              <strong>{data.map.coverage[state] ?? 0}</strong>
              <small>{state === 'solid' ? 'Backed by recent practice' : state === 'shaky' ? 'Worth another look' : state === 'untouched' ? 'Ready when you are' : 'A few more attempts will help'}</small>
            </div>
          ))}
        </section>

        <section className={styles.nextSection} aria-labelledby="next-actions-heading">
          <div className={styles.sectionHead}>
            <div><h2 id="next-actions-heading">Where to focus next</h2></div>
            <Link href="/learning-path">Your learning path <ArrowRight aria-hidden="true" /></Link>
          </div>
          {recommendations.length ? (
            <div className={styles.recommendationGrid}>
              {recommendations.map((recommendation, index) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  rank={index + 1}
                  stale={data.stale}
                  onStart={(intent) => setNotice(`Session ready: ${intent.goal}`)}
                  onChanged={() => void load()}
                  onError={setError}
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyPanel}>
              <Target aria-hidden="true" />
              <div><h3>Your next step starts with a little practice</h3><p>Try a topic with Petros. Your answers will help identify what to work on next.</p></div>
              <Link href="/learn">Start learning <ArrowRight aria-hidden="true" /></Link>
            </div>
          )}
        </section>

        <section className={styles.mapSection} aria-labelledby="knowledge-map-heading">
          <div className={styles.mapToolbar}>
            <div><h2 id="knowledge-map-heading">Your topics</h2></div>
            <div role="group" aria-label="Topic view">
              <button type="button" aria-pressed={view === 'subjects'} onClick={() => setView('subjects')}>
                <LayoutGrid aria-hidden="true" /> By subject
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                <List aria-hidden="true" /> List
              </button>
            </div>
          </div>
          {topics.length ? <>
            <div className={styles.topicFilters}>
              <label className={styles.search}><Search aria-hidden="true" /><input aria-label="Search topics or subjects" placeholder="Find a topic or subject…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <select aria-label="Filter topics by progress" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                <option value="all">All progress</option>
                {Object.entries(STATE_LABELS).map(([state, label]) => <option key={state} value={state}>{label}</option>)}
              </select>
            </div>
            {data.map.missingSyllabusLinks > 0 ? <p className={styles.contextNote}>Includes topics from your own sessions. This is your learning history, not a measure of syllabus completion.</p> : null}
            {!filteredTopics.length ? (
              <div className={styles.emptyPanel}>
                <Search aria-hidden="true" />
                <div><h3>No matching topics</h3><p>Try another name or show all progress.</p></div>
                <button type="button" onClick={() => { setSearch(''); setStateFilter('all'); }}>Clear filters</button>
              </div>
            ) : view === 'subjects' ? (
              <TopicGroups topics={filteredTopics} selectedConceptId={selectedConceptId} onSelect={setSelectedConceptId} />
            ) : (
              <KnowledgeMapList topics={filteredTopics} selectedConceptId={selectedConceptId} onSelect={setSelectedConceptId} />
            )}
            {selected ? (
              <TopicDetail
                topic={selected}
                relatedAlarms={activeAlarms.filter((alarm) =>
                  alarm.content.affectedTopics.some((topic) => topic.topicId === selected.topicId) ||
                  alarm.content.prerequisiteConceptId === selected.conceptId,
                )}
              />
            ) : null}
          </> : <EmptyState icon={MapIcon} title="Your progress starts here" description="Topics will appear as you learn with Petros or follow a learning path. Untried topics won’t be marked as weaknesses." action={<Link href="/learn">Start learning</Link>} />}
          <details className={styles.thresholds}>
            <summary>How progress is measured</summary>
            <ul>
              <li>Not attempted: no practice recorded yet. This does not mean you are weak at the topic.</li>
              <li>Still learning: fewer than {data.thresholds.mapMinimumEvidence} independent practice results. There is not enough evidence to judge understanding yet.</li>
              <li>Solid: mastery at least {formatPercent(data.thresholds.solidMasteryBasisPoints)}, uncertainty no more than {formatPercent(data.thresholds.maximumSolidUncertaintyBasisPoints)}, and practice within {data.thresholds.staleDays} days.</li>
              <li>Needs practice: enough evidence exists, but understanding or freshness needs another check.</li>
            </ul>
          </details>
        </section>

        <div className={styles.reflectionGrid} data-calibration={Boolean(activeCalibration)}>
          {activeCalibration ? <CalibrationMirror insight={activeCalibration} stale={data.stale} onChanged={() => void load()} onError={setError} /> : null}
          <section className={styles.recapSection} aria-labelledby="recaps-heading">
            <div className={styles.cardHead}>
              <span><FileText aria-hidden="true" /></span>
              <div><h2 id="recaps-heading">Recent learning</h2></div>
            </div>
            {recaps.length ? (
              <div className={styles.recapList}>{recaps.map((recap) => <RecapCard key={recap.id} recap={recap} onChanged={() => void load()} onError={setError} />)}</div>
            ) : <p className={styles.emptyCopy}>Finish a session with Petros to see what you tried, what helped, and what to try next.</p>}
          </section>
        </div>

        {activeAlarms.length ? <section className={styles.alarmSection} aria-labelledby="gap-alarms-heading">
          <div className={styles.sectionHead}><div><h2 id="gap-alarms-heading">A foundation to revisit</h2></div></div>
          <div className={styles.alarmGrid}>{activeAlarms.map((alarm) => <GapAlarmCard key={alarm.id} alarm={alarm} stale={data.stale} onChanged={() => void load()} onError={setError} />)}</div>
        </section> : null}

        <footer className={styles.disclosure}>
          <Focus aria-hidden="true" />
          <p>Based on your own work. Untried topics aren’t weaknesses, and a single session doesn’t define how you learn.</p>
        </footer>
      </> : null}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  rank,
  stale,
  onStart,
  onChanged,
  onError,
}: {
  recommendation: PetrosReflectionRecommendation;
  rank: number;
  stale: boolean;
  onStart: (intent: PetrosSessionIntent) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const api = useStudentApi();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PetrosSessionIntent | null>(null);
  const dismiss = async () => {
    setLoading(true);
    onError('');
    try {
      await api.post(`/student/petros/reflection/recommendations/${recommendation.id}/lifecycle`, {
        action: 'dismiss',
        idempotencyKey: newIdempotencyKey(),
      });
      onChanged();
    } catch (caught) {
      onError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  };
  const start = async () => {
    setLoading(true);
    onError('');
    try {
      const intent = await api.post<PetrosSessionIntent>(
        `/student/petros/reflection/recommendations/${recommendation.id}/intent`,
        { idempotencyKey: newIdempotencyKey() },
      );
      setPreview(intent);
      onStart(intent);
    } catch (caught) {
      onError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  };
  const confirmStart = async () => {
    if (!preview) return;
    setLoading(true);
    onError('');
    try {
      const response = await api.post<{
        intent: PetrosSessionIntent;
        session: PetrosLearningSessionDocument;
      }>(`/student/petros/intents/${preview.id}/start`, {
        idempotencyKey: newIdempotencyKey(),
      });
      router.push(`/petros/session?session=${response.session.id}`);
    } catch (caught) {
      onError(formatApiError(caught));
      setLoading(false);
    }
  };
  return (
    <article className={styles.recommendation} data-petros-target={`entity:reflection_recommendation:${recommendation.id}`}>
      <span className={styles.rank}>#{rank}</span>
      <p>
        {humanize(recommendation.sessionType)} ·{' '}
        {recommendation.evidenceAgeDays == null
          ? 'nothing recorded yet'
          : recommendation.evidenceAgeDays === 0
            ? 'from today'
            : `last worked on ${recommendation.evidenceAgeDays} ${recommendation.evidenceAgeDays === 1 ? 'day' : 'days'} ago`}
      </p>
      <h3>{recommendation.title}</h3>
      <p className={styles.recommendationReason}>{recommendation.whyThis}</p>
      <details>
        <summary><HelpCircle aria-hidden="true" /> Why this?</summary>
        <ol>{recommendation.reasons.map((reason) => <li key={reason.code}><strong>{reason.code.replaceAll('_', ' ')}</strong> — {reason.label}</li>)}</ol>
        <p>Transparent rank total: {recommendation.score} points.</p>
      </details>
      <button type="button" disabled={loading || stale} aria-busy={loading} onClick={() => void start()}>
        <Sparkles aria-hidden="true" />{loading ? 'Preparing preview…' : recommendation.actionLabel}
      </button>
      <button type="button" className={styles.dismissAction} disabled={loading} onClick={() => void dismiss()}>
        <EyeOff aria-hidden="true" /> Dismiss this suggestion
      </button>
      {preview ? (
        <div className={styles.intentPreview} role="status">
          <strong>Your session is ready</strong>
          <p>{preview.goal}</p>
          <button type="button" onClick={() => void confirmStart()} disabled={loading || stale}>Start session <ArrowRight aria-hidden="true" /></button>
        </div>
      ) : null}
    </article>
  );
}

function TopicGroups({ topics, selectedConceptId, onSelect }: {
  topics: PetrosKnowledgeMapTopic[];
  selectedConceptId: string | null;
  onSelect: (conceptId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => {
    const subjects = new Map<string, PetrosKnowledgeMapTopic[]>();
    for (const topic of topics) {
      const label = topic.subjectLabel.trim() || 'Other topics';
      subjects.set(label, [...(subjects.get(label) ?? []), topic]);
    }
    // Bring subjects with actual practice to the top, without calling untouched topics weak.
    return [...subjects.entries()].sort((a, b) =>
      Number(b[1].some((topic) => topic.evidenceCount > 0)) - Number(a[1].some((topic) => topic.evidenceCount > 0)) || a[0].localeCompare(b[0]),
    );
  }, [topics]);

  return (
    <div className={styles.subjectGroups}>
      {(showAll ? groups : groups.slice(0, 6)).map(([subject, items]) => (
        <details className={styles.subjectGroup} key={subject} open>
          <summary><span><strong>{subject}</strong><small>{items.length} {items.length === 1 ? 'topic' : 'topics'} · {items.filter((topic) => topic.state === 'solid').length} solid</small></span><ChevronDown aria-hidden="true" /></summary>
          <ul>
            {items.map((topic) => (
              <li key={topic.conceptId}>
                <button type="button" aria-pressed={selectedConceptId === topic.conceptId} aria-label={`${topic.title}: ${STATE_LABELS[topic.state]}`} onClick={() => onSelect(topic.conceptId)}>
                  <span className={styles.topicName}>{topic.title}<small>{topic.evidenceCount ? `${topic.evidenceCount} practice ${topic.evidenceCount === 1 ? 'result' : 'results'}` : 'No practice yet'}</small></span>
                  <span className={styles.statePill} data-state={topic.state}>{STATE_LABELS[topic.state]}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {groups.length > 6 ? <button type="button" className={styles.showSubjects} onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer subjects' : `Show all ${groups.length} subjects`}</button> : null}
    </div>
  );
}

function KnowledgeMapList({
  topics,
  selectedConceptId,
  onSelect,
}: {
  topics: PetrosKnowledgeMapTopic[];
  selectedConceptId: string | null;
  onSelect: (conceptId: string) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <caption className="sr-only">Topic progress list</caption>
        <thead><tr><th scope="col">Topic</th><th scope="col">Progress</th><th scope="col">Practice results</th><th scope="col">Last practiced</th><th scope="col">Relationships</th></tr></thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.conceptId} data-selected={selectedConceptId === topic.conceptId}>
              <th scope="row"><button type="button" onClick={() => onSelect(topic.conceptId)}>{topic.title}</button><small>{topic.subjectLabel}</small></th>
              <td><span className={styles.statePill} data-state={topic.state}>{STATE_LABELS[topic.state]}</span></td>
              <td>{topic.evidenceCount}</td>
              <td>{topic.evidenceAgeDays == null ? 'None' : `${topic.evidenceAgeDays} ${topic.evidenceAgeDays === 1 ? 'day' : 'days'}`}</td>
              <td>{topic.prerequisiteConceptIds.length} prerequisites · {topic.dependentConceptIds.length} dependents</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicDetail({ topic, relatedAlarms }: { topic: PetrosKnowledgeMapTopic; relatedAlarms: PetrosGapAlarm[] }) {
  return (
    <article className={styles.topicDetail} aria-live="polite">
      <div><p>{topic.curriculumLabel}</p><h3>{topic.title}</h3></div>
      <span className={styles.statePill} data-state={topic.state}>{STATE_LABELS[topic.state]}</span>
      <p>{topic.stateExplanation}</p>
      <dl>
        <div><dt>Uncertainty</dt><dd>{formatPercent(topic.uncertaintyBasisPoints)}</dd></div>
        <div><dt>Freshness</dt><dd>{topic.freshness}{topic.evidenceAgeDays == null ? '' : ` · ${topic.evidenceAgeDays} ${topic.evidenceAgeDays === 1 ? 'day' : 'days'} ago`}</dd></div>
        <div><dt>Prerequisites</dt><dd>{topic.prerequisiteConceptIds.length ? topic.prerequisiteConceptIds.map(humanize).join(', ') : 'None linked'}</dd></div>
        <div><dt>Unlocks</dt><dd>{topic.dependentConceptIds.length ? topic.dependentConceptIds.map(humanize).join(', ') : 'No dependents linked'}</dd></div>
      </dl>
      <details>
        <summary>Recent evidence ({topic.evidence.length})</summary>
        {topic.evidence.length ? <ul>{topic.evidence.map((link) => <li key={link.id}>{link.label}<small>{link.observedAt ? formatAge(link.observedAt) : 'Date unavailable'}</small></li>)}</ul> : <p>No learner evidence. This is not a weakness claim.</p>}
      </details>
      {relatedAlarms.length ? (
        <aside className={styles.relatedAlarm}>
          <strong>Related prerequisite hypothesis</strong>
          <p>{relatedAlarms[0]?.content.hypothesis}</p>
          <a href="#gap-alarms-heading">Review evidence and repair options</a>
        </aside>
      ) : null}
    </article>
  );
}

function CalibrationMirror({ insight, stale, onChanged, onError }: { insight: NonNullable<PetrosReflectionSurface['calibration']>; stale: boolean; onChanged: () => void; onError: (message: string) => void }) {
  const api = useStudentApi();
  const update = async (action: 'quiet' | 'dismiss') => {
    try {
      await api.post(`/student/petros/reflection/calibration/${insight.id}/lifecycle`, { action, quietDays: 30, idempotencyKey: newIdempotencyKey() });
      onChanged();
    } catch (caught) { onError(formatApiError(caught)); }
  };
  return (
    <section className={styles.calibrationCard} aria-labelledby="calibration-heading">
      <div className={styles.cardHead}><span><Target aria-hidden="true" /></span><div><h2 id="calibration-heading">{insight.headline}</h2></div></div>
      <p>{insight.explanation}</p>
      <dl>
        <div><dt>Sample</dt><dd>{insight.evidenceCount} predictions</dd></div>
        <div><dt>Direction</dt><dd>{insight.direction}</dd></div>
        <div><dt>Trend</dt><dd>{insight.trend.replaceAll('_', ' ')}</dd></div>
        <div><dt>Uncertainty</dt><dd>{formatPercent(insight.uncertaintyBasisPoints)}</dd></div>
      </dl>
      <details><summary>Why this appeared</summary><p>It uses only confidence tags paired with checked outcomes. At least {insight.minimumEvidence} pairs are required. It is not a permanent calibration score.</p></details>
      <div className={styles.quietActions}>
        {insight.actionRecommendationId ? <ReflectionIntentButton recommendationId={insight.actionRecommendationId} label="Open fragile-topic preview" disabled={stale} onError={onError} /> : null}
        <button type="button" onClick={() => void update('quiet')}><MessageSquareOff aria-hidden="true" /> Quiet for 30 days</button>
        <button type="button" onClick={() => void update('dismiss')}><EyeOff aria-hidden="true" /> Dismiss</button>
      </div>
    </section>
  );
}

function RecapCard({ recap, onChanged, onError }: { recap: PetrosSessionRecap; onChanged: () => void; onError: (message: string) => void }) {
  const api = useStudentApi();
  const [editing, setEditing] = useState(false);
  const [correction, setCorrection] = useState(recap.correctedText ?? '');
  const submit = async (action: 'correct' | 'dismiss') => {
    try {
      await api.post(`/student/petros/reflection/recaps/${recap.id}/feedback`, { action, correction: action === 'correct' ? correction : null, idempotencyKey: newIdempotencyKey() });
      onChanged();
    } catch (caught) { onError(formatApiError(caught)); }
  };
  return (
    <article className={styles.recapCard}>
      <p>{recap.topic} · {formatAge(recap.closedAt)}</p>
      <h3>{recap.content.headline}</h3>
      <h4>Observed in this session</h4>
      <ul>{recap.content.observedFacts.map((fact) => <li key={fact.text}>{fact.text}</li>)}</ul>
      {recap.content.tentativeInferences.length ? <><h4>Tentative inference</h4><ul>{recap.content.tentativeInferences.map((inference) => <li key={inference.text}><strong>{inference.label}:</strong> {inference.text}</li>)}</ul></> : null}
      <p className={styles.nextTry}><strong>Try next:</strong> {recap.content.nextTry}</p>
      <details><summary>Evidence and limits</summary><ul>{recap.evidence.map((link) => <li key={link.id}>{link.label}</li>)}</ul><p>One session cannot create a durable learning preference. Source: {recap.generation.source.replaceAll('_', ' ')}.</p></details>
      {editing ? <label className={styles.correction}>What should this recap say instead?<textarea rows={3} maxLength={1200} value={correction} onChange={(event) => setCorrection(event.target.value)} /><button type="button" disabled={correction.trim().length < 2} onClick={() => void submit('correct')}>Save correction</button></label> : null}
      <div className={styles.recapActions}><button type="button" onClick={() => setEditing((value) => !value)}><RotateCcw aria-hidden="true" /> Correct</button><button type="button" onClick={() => void submit('dismiss')}><EyeOff aria-hidden="true" /> Dismiss</button></div>
    </article>
  );
}

function GapAlarmCard({ alarm, stale, onChanged, onError }: { alarm: PetrosGapAlarm; stale: boolean; onChanged: () => void; onError: (message: string) => void }) {
  const api = useStudentApi();
  const update = async (action: 'snooze' | 'resolve' | 'dismiss' | 'false_positive') => {
    try {
      await api.post(`/student/petros/reflection/alarms/${alarm.id}/lifecycle`, { action, snoozeDays: 14, reason: action === 'false_positive' ? 'Student reports that the affected doubts are unrelated.' : null, idempotencyKey: newIdempotencyKey() });
      onChanged();
    } catch (caught) { onError(formatApiError(caught)); }
  };
  return (
    <article className={styles.alarmCard}>
      <p><AlertTriangle aria-hidden="true" />{alarm.content.uncertaintyLabel} · {formatPercent(alarm.content.confidenceBasisPoints)} confidence</p>
      <h3>{alarm.content.hypothesis}</h3>
      <p>{alarm.content.explanation}</p>
      <ul>{alarm.content.affectedTopics.map((topic) => <li key={topic.topicId}>{topic.label}</li>)}</ul>
      <p className={styles.repairScope}><Clock3 aria-hidden="true" />Estimated focused repair: about {alarm.content.practicalMinutes} minutes.</p>
      <details><summary>Why this alarm</summary><p>{alarm.content.independentEvidenceCount} independent recent evidence items share the published prerequisite {alarm.content.prerequisiteLabel}. The cluster is deduplicated by prerequisite and affected topics.</p><ul>{alarm.evidence.map((link) => <li key={link.id}>{link.label}</li>)}</ul></details>
      <div className={styles.alarmActions}>
        {alarm.recommendationId ? <ReflectionIntentButton recommendationId={alarm.recommendationId} label="Open Repair preview" disabled={stale} onError={onError} /> : null}
        <button type="button" onClick={() => void update('snooze')}>Snooze 14 days</button>
        <button type="button" onClick={() => void update('resolve')}>Mark resolved</button>
        <button type="button" onClick={() => void update('false_positive')}>These are unrelated</button>
        <button type="button" onClick={() => void update('dismiss')}>Dismiss</button>
      </div>
    </article>
  );
}

function ReflectionIntentButton({ recommendationId, label, disabled, onError }: { recommendationId: string; label: string; disabled: boolean; onError: (message: string) => void }) {
  const api = useStudentApi();
  const router = useRouter();
  const [intent, setIntent] = useState<PetrosSessionIntent | null>(null);
  const create = async () => {
    try {
      const intent = await api.post<PetrosSessionIntent>(`/student/petros/reflection/recommendations/${recommendationId}/intent`, { idempotencyKey: newIdempotencyKey() });
      setIntent(intent);
    } catch (caught) { onError(formatApiError(caught)); }
  };
  const start = async () => {
    if (!intent) return;
    try {
      const response = await api.post<{ session: PetrosLearningSessionDocument }>(`/student/petros/intents/${intent.id}/start`, { idempotencyKey: newIdempotencyKey() });
      router.push(`/petros/session?session=${response.session.id}`);
    } catch (caught) { onError(formatApiError(caught)); }
  };
  return intent ? <button type="button" onClick={() => void start()}>{label}<ArrowRight aria-hidden="true" /></button> : <button type="button" disabled={disabled} onClick={() => void create()}><Sparkles aria-hidden="true" />{label}</button>;
}

function formatPercent(basisPoints: number) { return `${Math.round(basisPoints / 100)}%`; }
function formatAge(value: string) { const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86_400_000)); return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`; }
function humanize(value: string) { return value.replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
