'use client';

import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, FilePenLine, Layers3, LoaderCircle, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  petrosArtifactBundleSchema,
  type PetrosArtifactBundle,
  type PetrosArtifactCommitResult,
  type PetrosArtifactContent,
  type PetrosArtifactProposal,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import styles from './petros-artifact-curation.module.css';

export interface PetrosArtifactCounts {
  proposed: number;
  saved: number;
  failed: number;
}

export function PetrosArtifactCuration({
  sessionId,
  onCounts,
}: {
  sessionId: string;
  onCounts: (counts: PetrosArtifactCounts) => void;
}) {
  const api = useStudentApi();
  const [bundle, setBundle] = useState<PetrosArtifactBundle | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PetrosArtifactContent>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const raw = await api.get<unknown>(`/student/petros/artifacts/sessions/${sessionId}/bundle`);
      const parsed = petrosArtifactBundleSchema.safeParse(raw);
      if (!parsed.success) throw new Error('The artifact bundle could not be verified. Reload the session and retry.');
      setBundle(parsed.data);
      setDrafts((current) => Object.fromEntries(parsed.data.proposals.map((proposal) => {
        const cached = readDraft(sessionId, proposal.id);
        return [proposal.id, cached ?? current[proposal.id] ?? proposal.content];
      })));
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [api, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (bundle) onCounts(bundle.counts);
  }, [bundle, onCounts]);

  const busy = pending.length > 0;
  const selected = bundle?.proposals.filter((proposal) => proposal.selected && proposal.state !== 'saved') ?? [];

  const setDraft = (proposalId: string, content: PetrosArtifactContent) => {
    setDrafts((current) => ({ ...current, [proposalId]: content }));
    try {
      sessionStorage.setItem(draftKey(sessionId, proposalId), JSON.stringify(content));
    } catch {
      // The in-memory draft still remains available if storage is restricted.
    }
  };

  const persist = async (proposal: PetrosArtifactProposal, selectedValue: boolean) => {
    const content = drafts[proposal.id] ?? proposal.content;
    setPending((current) => [...current, proposal.id]);
    setError('');
    try {
      const next = await api.put<PetrosArtifactBundle>(`/student/petros/artifacts/proposals/${proposal.id}`, {
        expectedVersion: proposal.version,
        selected: selectedValue,
        content,
      });
      setBundle(next);
      setDrafts((current) => ({ ...current, [proposal.id]: content }));
      setMessage(selectedValue ? 'Edits kept and selected for explicit save.' : 'Proposal kept, but not selected.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setPending((current) => current.filter((id) => id !== proposal.id));
    }
  };

  const bulkSelect = async (selectedValue: boolean) => {
    if (!bundle) return;
    for (const proposal of bundle.proposals) {
      if (proposal.state === 'saved' || proposal.state === 'discarded' || proposal.selected === selectedValue) continue;
      const latest = bundle.proposals.find((candidate) => candidate.id === proposal.id) ?? proposal;
      await persist(latest, selectedValue);
    }
  };

  const commit = async () => {
    if (!bundle || !selected.length || busy || !navigator.onLine) {
      if (!navigator.onLine) setError('Reconnect before saving. Your unsaved edits remain on this device.');
      return;
    }
    setPending((current) => [...current, 'commit']);
    setError('');
    setMessage('');
    try {
      const result = await api.post<PetrosArtifactCommitResult>(`/student/petros/artifacts/bundles/${bundle.id}/commit`, {
        idempotencyKey: newIdempotencyKey(),
        expectedBundleVersion: bundle.version,
        proposalIds: selected.map((proposal) => proposal.id),
      });
      setBundle(result.bundle);
      for (const item of result.results.filter((item) => item.status !== 'failed')) {
        sessionStorage.removeItem(draftKey(sessionId, item.proposalId));
      }
      const saved = result.results.filter((item) => item.status !== 'failed').length;
      const failed = result.results.length - saved;
      setMessage(failed ? `${saved} saved; ${failed} still needs attention. Your edits are intact.` : `${saved} ${saved === 1 ? 'artifact' : 'artifacts'} saved to your products.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setPending((current) => current.filter((id) => id !== 'commit'));
    }
  };

  const discard = async () => {
    if (!bundle || busy) return;
    setPending((current) => [...current, 'discard']);
    setError('');
    try {
      const next = await api.post<PetrosArtifactBundle>(`/student/petros/artifacts/bundles/${bundle.id}/discard`, { expectedVersion: bundle.version });
      setBundle(next);
      next.proposals.forEach((proposal) => sessionStorage.removeItem(draftKey(sessionId, proposal.id)));
      setMessage('Proposal bundle discarded. Nothing new was added to your deck, notes, canvas, search, or export.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setPending((current) => current.filter((id) => id !== 'discard'));
    }
  };

  if (loading) return (
    <section className={styles.panel} aria-label="Loading artifact proposals">
      <LoaderCircle className={styles.spin} aria-hidden="true" />
      <p>Preparing the review bundle…</p>
    </section>
  );

  if (!bundle) return (
    <section className={styles.panel} aria-labelledby="artifact-bundle-error">
      <h2 id="artifact-bundle-error">Artifact review needs a retry</h2>
      <p>{error || 'The proposal bundle is not available yet.'}</p>
      <button className={styles.secondary} onClick={() => void load()}><RotateCcw aria-hidden="true" /> Retry</button>
    </section>
  );

  return (
    <section className={styles.panel} aria-labelledby="artifact-curation-title">
      <div className={styles.heading}>
        <span><FilePenLine aria-hidden="true" /></span>
        <div>
          <h2 id="artifact-curation-title">Review saved study work</h2>
        </div>
      </div>

      <div className={styles.counts} aria-live="polite">
        <span><strong>{bundle.counts.proposed}</strong> unsaved</span>
        <span><strong>{bundle.counts.saved}</strong> saved</span>
        <span data-failed={bundle.counts.failed > 0}><strong>{bundle.counts.failed}</strong> failed</span>
      </div>

      {bundle.state !== 'discarded' && (
        <div className={styles.bulk}>
          <button disabled={busy} onClick={() => void bulkSelect(true)}>Select all after review</button>
          <button disabled={busy} onClick={() => void bulkSelect(false)}>Deselect all</button>
        </div>
      )}

      <div className={styles.proposals}>
        {bundle.proposals.map((proposal) => (
          <ProposalEditor
            key={proposal.id}
            proposal={proposal}
            content={drafts[proposal.id] ?? proposal.content}
            busy={pending.includes(proposal.id) || bundle.state === 'discarded'}
            onChange={(content) => setDraft(proposal.id, content)}
            onSelect={(value) => void persist(proposal, value)}
            onKeepEdits={() => void persist(proposal, proposal.selected)}
          />
        ))}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.success} role="status">{message}</p>}

      {bundle.state !== 'discarded' && (
        <div className={styles.actions}>
          <button className={styles.save} disabled={busy || selected.length === 0} onClick={() => void commit()}>
            {pending.includes('commit') ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            Save {selected.length || ''} selected {selected.length === 1 ? 'artifact' : 'artifacts'}
          </button>
          <button className={styles.discard} disabled={busy || bundle.state === 'saved'} onClick={() => void discard()}>
            <Trash2 aria-hidden="true" /> Discard unsaved proposals
          </button>
        </div>
      )}

      {bundle.forwardLink && <p className={styles.forward}><Layers3 aria-hidden="true" /> Next thread: {bundle.forwardLink}</p>}
      {bundle.counts.saved > 0 && <Link className={styles.libraryLink} href="/petros/artifacts">Open your artifacts and review deck</Link>}
    </section>
  );
}

function ProposalEditor({
  proposal,
  content,
  busy,
  onChange,
  onSelect,
  onKeepEdits,
}: {
  proposal: PetrosArtifactProposal;
  content: PetrosArtifactContent;
  busy: boolean;
  onChange: (content: PetrosArtifactContent) => void;
  onSelect: (value: boolean) => void;
  onKeepEdits: () => void;
}) {
  const saved = proposal.state === 'saved';
  return (
    <article className={styles.proposal} data-saved={saved} data-failed={proposal.state === 'failed'}>
      <div className={styles.proposalHead}>
        <label>
          <input type="checkbox" checked={proposal.selected || saved} disabled={busy || saved} onChange={(event) => onSelect(event.target.checked)} />
          <span>{saved ? <Check aria-hidden="true" /> : null}</span>
          <strong>{saved ? 'Saved' : 'Select for save'}</strong>
        </label>
        <div><b>Proposed by Petros</b><small>Edit before saving · {proposal.kind.replace('_', ' ')}</small></div>
      </div>

      <label className={styles.field}>
        Title
        <input value={content.title} maxLength={200} disabled={busy || saved} onChange={(event) => onChange({ ...content, title: event.target.value })} />
      </label>
      {(content.kind === 'flashcard' || content.kind === 'rule_card') && (
        <>
          <label className={styles.field}>Front<textarea value={content.front} maxLength={2000} disabled={busy || saved} onChange={(event) => onChange({ ...content, front: event.target.value })} /></label>
          <label className={styles.field}>Back<textarea value={content.back} maxLength={4000} disabled={busy || saved} onChange={(event) => onChange({ ...content, back: event.target.value })} /></label>
          <label className={styles.field}>Optional hint<input value={content.hint ?? ''} maxLength={1000} disabled={busy || saved} onChange={(event) => onChange({ ...content, hint: event.target.value || null })} /></label>
        </>
      )}
      {content.kind === 'note' && (
        <label className={styles.field}>Note<textarea value={content.body} maxLength={16000} disabled={busy || saved} onChange={(event) => onChange({ ...content, body: event.target.value })} /></label>
      )}
      {content.kind === 'diagram' && (
        <>
          <fieldset className={styles.nodes} disabled={busy || saved}>
            <legend>Editable diagram labels</legend>
            {content.nodes.map((node, index) => (
              <label key={node.id}>Node {index + 1}<input value={node.label} maxLength={160} onChange={(event) => onChange({ ...content, nodes: content.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, label: event.target.value } : candidate) })} /></label>
            ))}
          </fieldset>
          <label className={styles.field}>Accessible description<textarea value={content.accessibleDescription} maxLength={4000} disabled={busy || saved} onChange={(event) => onChange({ ...content, accessibleDescription: event.target.value })} /></label>
        </>
      )}
      <div className={styles.sources}>
        {proposal.sources.map((source, index) => <span key={`${source.kind}-${index}`}>{source.label}{source.pageIndex == null ? '' : ` · page ${source.pageIndex + 1}`}</span>)}
      </div>
      {!saved && <button className={styles.keep} disabled={busy} onClick={onKeepEdits}>Keep these edits</button>}
      {proposal.failureCode && <p className={styles.itemError}>Save failed: {proposal.failureCode}. Your edits remain available.</p>}
    </article>
  );
}

function draftKey(sessionId: string, proposalId: string) {
  return `petros:artifact-draft:${sessionId}:${proposalId}`;
}

function readDraft(sessionId: string, proposalId: string): PetrosArtifactContent | null {
  try {
    const raw = sessionStorage.getItem(draftKey(sessionId, proposalId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PetrosArtifactContent;
    return parsed;
  } catch {
    return null;
  }
}
