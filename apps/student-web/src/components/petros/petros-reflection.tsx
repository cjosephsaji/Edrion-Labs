'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleDot,
  Clock3,
  EyeOff,
  FileText,
  Focus,
  HelpCircle,
  List,
  Map as MapIcon,
  Maximize2,
  MessageSquareOff,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  ZoomIn,
  ZoomOut,
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
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import {
  formatApiError,
  newIdempotencyKey,
  useStudentApi,
} from '@/lib/api-client';
import styles from './petros-reflection.module.css';

const STATE_LABELS = {
  solid: 'Solid',
  shaky: 'Shaky',
  untouched: 'Not attempted',
  insufficient_evidence: 'Insufficient evidence',
} as const;

export function PetrosReflection() {
  const api = useStudentApi();
  const [data, setData] = useState<PetrosReflectionSurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'map' | 'list'>('map');
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

  const rebuild = async () => {
    setRebuilding(true);
    setError('');
    try {
      const result = await api.post<PetrosReflectionSurface>('/student/petros/reflection/rebuild', {
        idempotencyKey: newIdempotencyKey(),
      });
      setData(result);
      setNotice('Reflection rebuilt from current learner evidence.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) return <LoadingBlock label="Building your evidence map…" />;
  if (error && !data) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!data) return null;

  const selected = data.map.topics.find((topic) => topic.conceptId === selectedConceptId) ?? null;
  const activeCalibration = data.calibration?.status === 'active' ? data.calibration : null;
  const activeAlarms = data.alarms.filter(
    (alarm) =>
      alarm.status === 'active' ||
      (alarm.status === 'snoozed' && alarm.snoozedUntil && Date.parse(alarm.snoozedUntil) <= Date.now()),
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p><MapIcon aria-hidden="true" /> Learning progress</p>
        <h1>What should I do next?</h1>
        <p className={styles.heroCopy}>
          A syllabus map built from your evidence. “Not attempted” is kept separate from “not
          mastered,” and every action says why it appears.
        </p>
        <div className={styles.heroMeta}>
          <span><Clock3 aria-hidden="true" />{data.rebuiltAt ? `Updated ${formatAge(data.rebuiltAt)}` : 'Not built yet'}</span>
          <span><BrainCircuit aria-hidden="true" />{data.algorithmVersion}</span>
          <button type="button" onClick={() => void rebuild()} disabled={rebuilding}>
            <RefreshCw aria-hidden="true" className={rebuilding ? styles.spin : ''} />
            {rebuilding ? 'Rebuilding…' : 'Rebuild from evidence'}
          </button>
        </div>
      </header>

      {data.stale ? (
        <section className={styles.stale} role="status">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>This reflection may be behind the latest evidence.</strong>
            <p>Rebuild before relying on a next action. No state is silently treated as current.</p>
          </div>
        </section>
      ) : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}

      <section className={styles.nextSection} aria-labelledby="next-actions-heading">
        <div className={styles.sectionHead}>
          <div><p>Finite next steps</p><h2 id="next-actions-heading">Highest-value actions</h2></div>
          <span>{data.recommendations.length} shown at most</span>
        </div>
        {data.recommendations.length ? (
          <div className={styles.recommendationGrid}>
            {data.recommendations.slice(0, 4).map((recommendation, index) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                rank={index + 1}
                stale={data.stale}
                onStart={(intent) => setNotice(`Preview ready: ${intent.goal}`)}
                onChanged={() => void load()}
                onError={setError}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title="No ranked next action yet"
            description="The map will not invent a weakness. Try a syllabus topic or complete a checked response to create useful evidence."
            action={<a href="/learning-path">Open learning path</a>}
          />
        )}
      </section>

      <section className={styles.mapSection} aria-labelledby="knowledge-map-heading">
        <div className={styles.mapToolbar}>
          <div>
            <p>Syllabus evidence</p>
            <h2 id="knowledge-map-heading">Knowledge map</h2>
          </div>
          <div role="group" aria-label="Knowledge map view">
            <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
              <MapIcon aria-hidden="true" /> Visual map
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <List aria-hidden="true" /> Accessible list
            </button>
          </div>
        </div>
        <Legend coverage={data.map.coverage} />
        {!data.map.topics.length ? (
          <EmptyState
            icon={MapIcon}
            title="No published syllabus topics are linked"
            description="Nothing is labelled weak. A published curriculum/topic link or owned learning path is needed before a map can be drawn."
          />
        ) : view === 'map' ? (
          <VisualKnowledgeMap
            topics={data.map.topics}
            selectedConceptId={selectedConceptId}
            onSelect={setSelectedConceptId}
          />
        ) : (
          <KnowledgeMapList
            topics={data.map.topics}
            selectedConceptId={selectedConceptId}
            onSelect={setSelectedConceptId}
          />
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
        <details className={styles.thresholds}>
          <summary>How the map decides each state</summary>
          <ul>
            <li>Not attempted: zero learner evidence.</li>
            <li>Insufficient evidence: fewer than {data.thresholds.mapMinimumEvidence} independent evidence items.</li>
            <li>Solid: mastery at least {formatPercent(data.thresholds.solidMasteryBasisPoints)}, uncertainty no more than {formatPercent(data.thresholds.maximumSolidUncertaintyBasisPoints)}, and evidence no older than {data.thresholds.staleDays} days.</li>
            <li>Shaky: enough evidence exists, but one or more solid conditions is not met.</li>
          </ul>
        </details>
      </section>

      <div className={styles.reflectionGrid}>
        {activeCalibration ? (
          <CalibrationMirror
            insight={activeCalibration}
            stale={data.stale}
            onChanged={() => void load()}
            onError={setError}
          />
        ) : (
          <section className={styles.quietCard} aria-labelledby="calibration-heading">
            <EyeOff aria-hidden="true" />
            <div>
              <h2 id="calibration-heading">Calibration mirror is quiet</h2>
              <p>
                {data.calibration?.eligible
                  ? 'You quieted or dismissed this optional insight. Core learning remains unchanged.'
                  : `It stays hidden until at least ${data.thresholds.calibrationMinimumEvidence} confidence-and-outcome pairs exist.`}
              </p>
            </div>
          </section>
        )}
        <section className={styles.recapSection} aria-labelledby="recaps-heading">
          <div className={styles.cardHead}>
            <span><FileText aria-hidden="true" /></span>
            <div><p>Session history</p><h2 id="recaps-heading">How you learned</h2></div>
          </div>
          {data.recaps.filter((recap) => recap.status !== 'dismissed').length ? (
            <div className={styles.recapList}>
              {data.recaps.filter((recap) => recap.status !== 'dismissed').slice(0, 4).map((recap) => (
                <RecapCard key={recap.id} recap={recap} onChanged={() => void load()} onError={setError} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>Close a learning session to see observations about that session’s process. One session never becomes a permanent preference.</p>
          )}
        </section>
      </div>

      <section className={styles.alarmSection} aria-labelledby="gap-alarms-heading">
        <div className={styles.sectionHead}>
          <div><p>Prerequisite hypotheses</p><h2 id="gap-alarms-heading">Gap alarms</h2></div>
          <span>Shown only after minimum independent evidence</span>
        </div>
        {activeAlarms.length ? (
          <div className={styles.alarmGrid}>
            {activeAlarms.map((alarm) => (
              <GapAlarmCard key={alarm.id} alarm={alarm} stale={data.stale} onChanged={() => void load()} onError={setError} />
            ))}
          </div>
        ) : (
          <div className={styles.noAlarm}>
            <Check aria-hidden="true" />
            <div><strong>No supported prerequisite cluster right now.</strong><p>Unrelated doubts and small samples stay unlabelled.</p></div>
          </div>
        )}
      </section>

      <footer className={styles.disclosure}>
        <Focus aria-hidden="true" />
        <p>
          Reflection uses structured learning evidence, not personality profiling. Voice is optional
          elsewhere and is never required here. This surface is not a score, rank, feed, or public comparison.
        </p>
      </footer>
    </main>
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
    <article className={styles.recommendation}>
      <span className={styles.rank}>#{rank}</span>
      <p>{recommendation.sessionType} · {recommendation.evidenceAgeDays == null ? 'no prior evidence' : `${recommendation.evidenceAgeDays}d evidence age`}</p>
      <h3>{recommendation.title}</h3>
      <details>
        <summary><HelpCircle aria-hidden="true" /> Why this?</summary>
        <ol>{recommendation.reasons.map((reason) => <li key={reason.code}><strong>{reason.code.replaceAll('_', ' ')}</strong> — {reason.label}</li>)}</ol>
        <p>Transparent rank total: {recommendation.score} points.</p>
      </details>
      <button type="button" disabled={loading || stale} onClick={() => void start()}>
        <Sparkles aria-hidden="true" />{loading ? 'Preparing preview…' : recommendation.actionLabel}
      </button>
      <button type="button" className={styles.dismissAction} disabled={loading} onClick={() => void dismiss()}>
        <EyeOff aria-hidden="true" /> Dismiss this suggestion
      </button>
      {preview ? (
        <div className={styles.intentPreview} role="status">
          <strong>Stage 8 preview created</strong>
          <p>{preview.goal}</p>
          <button type="button" onClick={() => void confirmStart()} disabled={loading}>Start this scoped session <ArrowRight aria-hidden="true" /></button>
        </div>
      ) : null}
    </article>
  );
}

function Legend({ coverage }: { coverage: Record<string, number> }) {
  return (
    <ul className={styles.legend} aria-label="Knowledge state legend">
      {(Object.keys(STATE_LABELS) as Array<keyof typeof STATE_LABELS>).map((state) => (
        <li key={state} data-state={state}><span aria-hidden="true" />{STATE_LABELS[state]} <strong>{coverage[state] ?? 0}</strong></li>
      ))}
    </ul>
  );
}

function VisualKnowledgeMap({
  topics,
  selectedConceptId,
  onSelect,
}: {
  topics: PetrosKnowledgeMapTopic[];
  selectedConceptId: string | null;
  onSelect: (conceptId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const bySubject = useMemo(() => {
    const groups = new Map<string, PetrosKnowledgeMapTopic[]>();
    for (const topic of topics) groups.set(topic.subjectLabel, [...(groups.get(topic.subjectLabel) ?? []), topic]);
    return [...groups.entries()];
  }, [topics]);
  const focusTopic = (direction: number) => {
    const index = Math.max(0, topics.findIndex((topic) => topic.conceptId === selectedConceptId));
    const next = topics[(index + direction + topics.length) % topics.length];
    if (!next) return;
    onSelect(next.conceptId);
    viewportRef.current?.querySelector<HTMLButtonElement>(`[data-concept="${CSS.escape(next.conceptId)}"]`)?.focus();
  };
  return (
    <div className={styles.visualShell}>
      <div className={styles.zoomControls} role="group" aria-label="Map zoom controls">
        <button type="button" onClick={() => setZoom((value) => Math.max(.75, value - .25))} aria-label="Zoom out"><ZoomOut aria-hidden="true" /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.5, value + .25))} aria-label="Zoom in"><ZoomIn aria-hidden="true" /></button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom"><Maximize2 aria-hidden="true" /></button>
      </div>
      <p className={styles.keyboardHelp}>Arrow keys move between topics. The map scrolls normally and does not capture Tab.</p>
      <div
        ref={viewportRef}
        className={styles.visualViewport}
        tabIndex={0}
        aria-label="Scrollable knowledge map. Use arrow keys to move between topic buttons."
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); focusTopic(1); }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); focusTopic(-1); }
        }}
      >
        <div className={styles.visualMap} style={{ '--map-zoom': zoom } as React.CSSProperties}>
          {bySubject.map(([subject, items]) => (
            <section key={subject} className={styles.subjectLane} aria-labelledby={`subject-${safeId(subject)}`}>
              <h3 id={`subject-${safeId(subject)}`}>{subject}</h3>
              <div>
                {items.map((topic, index) => (
                  <div key={topic.conceptId} className={styles.nodeStep}>
                    {index ? <ArrowDown aria-hidden="true" /> : null}
                    <button
                      type="button"
                      data-concept={topic.conceptId}
                      data-state={topic.state}
                      aria-pressed={selectedConceptId === topic.conceptId}
                      aria-label={`${topic.title}: ${STATE_LABELS[topic.state]}, ${topic.stateExplanation}`}
                      onClick={() => onSelect(topic.conceptId)}
                    >
                      <span aria-hidden="true"><CircleDot /></span>
                      <strong>{topic.title}</strong>
                      <small>{STATE_LABELS[topic.state]} · {topic.freshness}</small>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
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
        <caption className="sr-only">Knowledge map list equivalent</caption>
        <thead><tr><th scope="col">Topic</th><th scope="col">State</th><th scope="col">Evidence</th><th scope="col">Age</th><th scope="col">Relationships</th></tr></thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.conceptId} data-selected={selectedConceptId === topic.conceptId}>
              <th scope="row"><button type="button" onClick={() => onSelect(topic.conceptId)}>{topic.title}</button><small>{topic.subjectLabel}</small></th>
              <td><span className={styles.statePill} data-state={topic.state}>{STATE_LABELS[topic.state]}</span></td>
              <td>{topic.evidenceCount}</td>
              <td>{topic.evidenceAgeDays == null ? 'None' : `${topic.evidenceAgeDays}d`}</td>
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
        <div><dt>Freshness</dt><dd>{topic.freshness}{topic.evidenceAgeDays == null ? '' : ` · ${topic.evidenceAgeDays} days`}</dd></div>
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
      <div className={styles.cardHead}><span><Target aria-hidden="true" /></span><div><p>Occasional, optional</p><h2 id="calibration-heading">{insight.headline}</h2></div></div>
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
function safeId(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
