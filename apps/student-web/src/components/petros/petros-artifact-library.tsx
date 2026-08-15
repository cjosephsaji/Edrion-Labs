'use client';

import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, Check, Clock3, FileText, Layers3, LoaderCircle, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type {
  PetrosReviewQueue,
  PetrosArtifactSource,
  PetrosSavedArtifact,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import styles from './petros-artifact-library.module.css';

type Confidence = 'sure' | 'think_so' | 'guessing';

export function PetrosArtifactLibrary() {
  const api = useStudentApi();
  const [artifacts, setArtifacts] = useState<PetrosSavedArtifact[]>([]);
  const [queue, setQueue] = useState<PetrosReviewQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Record<string, Confidence>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [saved, due] = await Promise.all([
        api.get<PetrosSavedArtifact[]>('/student/petros/artifacts?limit=100'),
        api.get<PetrosReviewQueue>('/student/petros/artifacts/review/due?limit=30'),
      ]);
      setArtifacts(saved);
      setQueue(due);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const review = async (artifactId: string, grade: 'again' | 'hard' | 'good' | 'easy') => {
    const selectedConfidence = confidence[artifactId];
    if (!selectedConfidence) {
      setError('Choose how confident the answer felt before recording the result.');
      return;
    }
    setPending((current) => [...current, artifactId]);
    setError('');
    try {
      const result = await api.post<{ nextDueAt: string; scheduleExplanation: string }>(`/student/petros/artifacts/${artifactId}/reviews`, {
        clientReviewId: newIdempotencyKey(),
        grade,
        confidence: selectedConfidence,
        reviewedAt: new Date().toISOString(),
        elapsedMs: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      setNotice(`${result.scheduleExplanation} Next due ${formatDue(result.nextDueAt)}.`);
      await load();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setPending((current) => current.filter((id) => id !== artifactId));
    }
  };

  const remove = async (artifactId: string) => {
    setPending((current) => [...current, artifactId]);
    setError('');
    try {
      await api.del(`/student/petros/artifacts/${artifactId}`);
      setNotice('Artifact deleted from its product and from Petros. This deletion cannot be undone.');
      await load();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setPending((current) => current.filter((id) => id !== artifactId));
    }
  };

  if (loading) return <main className={styles.page}><LoaderCircle className={styles.spin} aria-hidden="true" /><p>Loading your artifacts…</p></main>;

  return (
    <main className={styles.page}>
      <header>
        <Link href="/petros/session"><ArrowLeft aria-hidden="true" /> Petros</Link>
        <p>LEARNER-OWNED</p>
        <h1>Your artifacts and review deck</h1>
        <span>Only explicitly saved, student-curated items appear here.</span>
      </header>

      {error && <div className={styles.error} role="alert">{error}<button onClick={() => void load()}><RotateCcw aria-hidden="true" /> Retry</button></div>}
      {notice && <div className={styles.notice} role="status"><Check aria-hidden="true" /> {notice}</div>}

      <section className={styles.review} aria-labelledby="review-title">
        <div className={styles.sectionTitle}>
          <Clock3 aria-hidden="true" />
          <div><h2 id="review-title">Due for review</h2><p>{queue?.mixingExplanation}</p></div>
        </div>
        {!queue?.cards.length && <p className={styles.empty}>Nothing is due right now. There is no artificial urgency.</p>}
        {queue?.cards.map(({ artifact, topic, dueAt, scheduleExplanation, examDate }) => {
          const content = artifact.content;
          if (content.kind !== 'flashcard' && content.kind !== 'rule_card') return null;
          const open = revealed.includes(artifact.id);
          return (
            <article key={artifact.id} className={styles.reviewCard}>
              <div className={styles.meta}><span>{topic}</span><span>Due {formatDue(dueAt)}</span>{examDate && <span>Exam {examDate}</span>}</div>
              <h3>{content.front}</h3>
              {open ? <div className={styles.answer}><p>{content.back}</p>{content.hint && <small>Hint: {content.hint}</small>}</div> : <button className={styles.reveal} onClick={() => setRevealed((current) => [...current, artifact.id])}>Reveal answer</button>}
              {open && (
                <>
                  <fieldset className={styles.confidence}>
                    <legend>How confident did it feel?</legend>
                    {(['sure', 'think_so', 'guessing'] as const).map((value) => <label key={value}><input type="radio" name={`confidence-${artifact.id}`} checked={confidence[artifact.id] === value} onChange={() => setConfidence((current) => ({ ...current, [artifact.id]: value }))} /> {value.replace('_', ' ')}</label>)}
                  </fieldset>
                  <div className={styles.grades} aria-label="Record review result">
                    <button disabled={pending.includes(artifact.id)} onClick={() => void review(artifact.id, 'again')}>Again</button>
                    <button disabled={pending.includes(artifact.id)} onClick={() => void review(artifact.id, 'hard')}>Hard</button>
                    <button disabled={pending.includes(artifact.id)} onClick={() => void review(artifact.id, 'good')}>Good</button>
                    <button disabled={pending.includes(artifact.id)} onClick={() => void review(artifact.id, 'easy')}>Easy</button>
                  </div>
                </>
              )}
              <small className={styles.explanation}>{scheduleExplanation}</small>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="library-title">
        <div className={styles.sectionTitle}>
          <BookOpen aria-hidden="true" />
          <div><h2 id="library-title">Saved artifacts</h2><p>{artifacts.length} authoritative {artifacts.length === 1 ? 'item' : 'items'}</p></div>
        </div>
        {!artifacts.length && <p className={styles.empty}>Your library is empty. AI proposals do not count until you explicitly save them.</p>}
        <div className={styles.grid}>
          {artifacts.map((artifact) => (
            <SavedArtifactCard
              key={artifact.id}
              artifact={artifact}
              busy={pending.includes(artifact.id)}
              onDelete={() => void remove(artifact.id)}
              onUpdated={(updated) => {
                setArtifacts((current) => current.map((item) => item.id === updated.id ? updated : item));
                setNotice(`Diagram revision ${updated.revision} saved to its editable canvas.`);
              }}
              onError={setError}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function SavedArtifactCard({
  artifact,
  busy,
  onDelete,
  onUpdated,
  onError,
}: {
  artifact: PetrosSavedArtifact;
  busy: boolean;
  onDelete: () => void;
  onUpdated: (artifact: PetrosSavedArtifact) => void;
  onError: (message: string) => void;
}) {
  const content = artifact.content;
  const Icon = content.kind === 'diagram' ? Layers3 : content.kind === 'note' ? FileText : BookOpen;
  return (
    <article className={styles.savedCard}>
      <div className={styles.savedHead}><Icon aria-hidden="true" /><span>{content.kind.replace('_', ' ')}</span><small>Revision {artifact.revision}</small></div>
      <h3>{content.title}</h3>
      {(content.kind === 'flashcard' || content.kind === 'rule_card') && <p>{content.front}</p>}
      {content.kind === 'note' && <p>{content.body.slice(0, 240)}{content.body.length > 240 ? '…' : ''}</p>}
      {content.kind === 'diagram' && (
        <>
          <p>{content.accessibleDescription}</p>
          <div className={styles.nodeList}>{content.nodes.map((node) => <span key={node.id}>{node.label}</span>)}</div>
          <DiagramCanvasEditor artifact={artifact} busy={busy} onUpdated={onUpdated} onError={onError} />
        </>
      )}
      <div className={styles.sourceList}>
        {artifact.sources.map((source, index) => (
          <ArtifactSourceLink
            key={`${source.kind}-${index}`}
            artifactId={artifact.id}
            source={source}
            sourceIndex={index}
          />
        ))}
      </div>
      {artifact.dueAt && <small>Next review: {formatDue(artifact.dueAt)}{artifact.examAware ? ' · tightened for exam' : ''}</small>}
      <button className={styles.delete} disabled={busy} onClick={onDelete}><Trash2 aria-hidden="true" /> Delete permanently</button>
    </article>
  );
}

type DiagramContent = Extract<PetrosSavedArtifact['content'], { kind: 'diagram' }>;

function DiagramCanvasEditor({
  artifact,
  busy,
  onUpdated,
  onError,
}: {
  artifact: PetrosSavedArtifact;
  busy: boolean;
  onUpdated: (artifact: PetrosSavedArtifact) => void;
  onError: (message: string) => void;
}) {
  const api = useStudentApi();
  const content = artifact.content.kind === 'diagram' ? artifact.content : null;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DiagramContent | null>(content);

  useEffect(() => { setDraft(content); }, [content, artifact.revision]);
  if (!content || !draft) return null;

  const save = async () => {
    setSaving(true);
    onError('');
    try {
      const updated = await api.put<PetrosSavedArtifact>(`/student/petros/artifacts/${artifact.id}`, {
        expectedRevision: artifact.revision,
        content: draft,
      });
      onUpdated(updated);
      setOpen(false);
    } catch (caught) {
      onError(formatApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={styles.canvasButton} onClick={() => setOpen(true)} disabled={busy}>
        <Pencil aria-hidden="true" /> Open editable canvas
      </button>
    );
  }

  return (
    <section className={styles.canvasEditor} aria-label={`Edit ${content.title} diagram`}>
      <div className={styles.canvasEditorHead}>
        <strong>Structured canvas</strong>
        <button type="button" onClick={() => { setDraft(content); setOpen(false); }} aria-label="Close diagram editor"><X aria-hidden="true" /></button>
      </div>
      <label>Diagram title<input maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Accessible description<textarea maxLength={4000} rows={3} value={draft.accessibleDescription} onChange={(event) => setDraft({ ...draft, accessibleDescription: event.target.value })} /></label>
      <fieldset>
        <legend>Nodes</legend>
        {draft.nodes.map((node, index) => (
          <div className={styles.canvasNode} key={node.id}>
            <label>Node {index + 1} label<input maxLength={160} value={node.label} onChange={(event) => setDraft({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, label: event.target.value } : item) })} /></label>
            <label>Node {index + 1} description<textarea maxLength={1000} rows={2} value={node.description} onChange={(event) => setDraft({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, description: event.target.value } : item) })} /></label>
          </div>
        ))}
      </fieldset>
      <fieldset>
        <legend>Connections</legend>
        {draft.edges.map((edge, index) => <label key={edge.id}>Connection {index + 1} label<input maxLength={120} value={edge.label} onChange={(event) => setDraft({ ...draft, edges: draft.edges.map((item) => item.id === edge.id ? { ...item, label: event.target.value } : item) })} /></label>)}
      </fieldset>
      <p className={styles.canvasSafety}>Text is rendered safely. Markup and executable content are rejected without changing your draft.</p>
      <div className={styles.canvasActions}>
        <button type="button" onClick={() => { setDraft(content); setOpen(false); }}><X aria-hidden="true" /> Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || busy || !draft.title.trim() || !draft.accessibleDescription.trim()}><Save aria-hidden="true" /> {saving ? 'Saving revision…' : 'Save canvas revision'}</button>
      </div>
    </section>
  );
}

function ArtifactSourceLink({ artifactId, source, sourceIndex }: { artifactId: string; source: PetrosArtifactSource; sourceIndex: number }) {
  const api = useStudentApi();
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const open = async () => {
    setResolving(true);
    setReason(null);
    try {
      const result = await api.get<{ available: boolean; href: string | null; reason: string | null }>(
        `/student/petros/artifacts/${artifactId}/sources/${sourceIndex}`,
      );
      if (result.available && result.href) router.push(result.href);
      else setReason(result.reason ?? 'This source is unavailable. The artifact remains yours.');
    } catch (caught) {
      setReason(formatApiError(caught));
    } finally {
      setResolving(false);
    }
  };

  return (
    <span className={styles.sourceReference}>
      <button type="button" onClick={() => void open()} disabled={resolving}>
        {resolving ? 'Opening source…' : source.label}
        {source.pageIndex == null ? '' : ` · page ${source.pageIndex + 1}`}
        {source.institutionRestricted ? ' · restricted source' : ''}
      </button>
      {reason && <small role="status">{reason}</small>}
    </span>
  );
}

function formatDue(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
