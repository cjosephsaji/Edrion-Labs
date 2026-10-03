'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PetrosTeachingBlockPreview } from '@edrion/ui';
import type { PetrosDocumentRetrieval, PetrosSessionBlock } from '@edrion/schemas';
import { useStudentList } from '@/lib/hooks';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { PetrosDocumentDoor } from './petros-door-button';
import styles from './petros-input-modes.module.css';

type Source = {id: string; title: string; kind: string; pageCount: number | null; extractionReady: boolean};
type Selected = {sourceId: string; title: string; sourceVersion: string; pages: number[]};
type Comparison = {comparisonId: string; question: string; status: string; uncertainty: string;
  sources: Array<PetrosDocumentRetrieval & {title: string}>; studyPlan: {block: PetrosSessionBlock}};

export function PetrosDocumentStudy() {
  const api = useStudentApi();
  const sources = useStudentList<{items: Source[]}>('petros-sources', '/student/petros/sources');
  const [selected, setSelected] = useState<Selected[]>([]);
  const [pageInputs,setPageInputs] = useState<Record<string,string>>({});
  const [question, setQuestion] = useState('');
  const [synthesisDraft,setSynthesisDraft] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestGeneration = useRef(0);
  useEffect(() => {if(!comparison)setSynthesisDraft('');}, [comparison]);
  // A backgrounded comparison must recheck current access before showing source text again.
  useEffect(() => {
    const clear = () => {requestGeneration.current++; setComparison(null);};
    const onVisibility = () => {if (document.hidden) clear();};
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {window.removeEventListener('blur', clear);document.removeEventListener('visibilitychange', onVisibility);};
  }, []);
  useEffect(() => {
    if (!comparison) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void Promise.all(selected.map(source => api.get<Selected>(`/student/petros/documents/${source.sourceId}/scope`)))
        .then(current => {
          if (!cancelled && current.some((scope, index) => scope.sourceVersion !== selected[index]?.sourceVersion)) {
            requestGeneration.current++;setComparison(null);setSelected([]);setError('A selected source changed. Select its current version before comparing again.');
          }
        }).catch(() => {if (!cancelled) {requestGeneration.current++;setComparison(null);setSelected([]);setError('Current access to a selected source is unavailable. Select accessible sources again.');}});
    }, 15000);
    return () => {cancelled = true;window.clearInterval(timer);};
  }, [api, comparison, selected]);
  useEffect(() => {
    if (sources.error) {requestGeneration.current++;setComparison(null);setSelected([]);}
  }, [sources.error]);
  async function toggle(source: Source) {
    setComparison(null); setError('');
    if (selected.some(item => item.sourceId === source.id)) {
      setSelected(items => items.filter(item => item.sourceId !== source.id)); return;
    }
    if (selected.length >= 3 || busy) return;
    setBusy(true);
    try {
      const scope = await api.get<Selected>(`/student/petros/documents/${source.id}/scope`);
      setSelected(items => [...items, scope]);
    } catch (cause) { setError(formatApiError(cause)); }
    finally { setBusy(false); }
  }
  async function compare() {
    if (busy || selected.length < 2 || question.trim().length < 2) return;
    setBusy(true); setError(''); setComparison(null);
    const generation = ++requestGeneration.current;
    try {
      const scopes=selected.map(source => {
        const raw=pageInputs[source.sourceId]??source.pages.join(',');
        if(!/^\s*[1-9]\d*(\s*,\s*[1-9]\d*)*\s*$/.test(raw)) throw new Error('Choose positive page numbers separated by commas.');
        const pages=raw.split(',').map(value=>Number(value.trim()));
        if(new Set(pages).size!==pages.length)throw new Error('Select each page only once.');
        return {...source,pages};
      });
      const result = await api.post<Comparison>('/student/petros/documents/compare', {
      schemaVersion: 'petros.source-comparison.v1', question: question.trim(),
      sources: scopes.map(({sourceId, sourceVersion, pages}) => ({sourceId, sourceVersion, pages})),
    }); if (generation === requestGeneration.current && !document.hidden) {setSelected(scopes);setComparison(result);} }
    catch (cause) { setError(formatApiError(cause)); }
    finally { setBusy(false); }
  }
  return <section id="mode-documents" role="tabpanel" aria-labelledby="mode-tab-documents" className={styles.panel}>
    <h2>Start with your sources</h2>
    <p>Choose a document, check its readable pages and prepare a focused lesson. To study across documents, explicitly select two or three sources for comparison.</p>
    {sources.isPending ? <p role="status">Loading your sources…</p> : sources.error ?
      <div role="alert"><p>{formatApiError(sources.error)}</p><button type="button" onClick={() => void sources.refetch()}>Retry sources</button></div> :
      sources.data?.items.length ? <ul className={styles.documentSources} aria-label="Available learning sources">
        {sources.data.items.map(source => <li key={source.id}>
          <div><strong>{source.title}</strong><small>{source.kind.toUpperCase()}{source.pageCount ? ` · ${source.pageCount} pages` : ''} · {source.extractionReady ? 'Text available; check before teaching' : 'Preparation required'}</small></div>
          <PetrosDocumentDoor sourceId={source.id} title={source.title} pageCount={source.pageCount} ready={source.extractionReady && source.kind === 'pdf'} />
          <button type="button" aria-pressed={selected.some(item => item.sourceId === source.id)}
            disabled={busy || !source.extractionReady || source.kind !== 'pdf' || (selected.length >= 3 && !selected.some(item => item.sourceId === source.id))}
            onClick={() => void toggle(source)}>{selected.some(item => item.sourceId === source.id) ? 'Remove from comparison' : 'Select for comparison'}</button>
        </li>)}
      </ul> : <div className={styles.documentEmpty}><h3>Your source library is empty</h3><p>Teacher materials appear here when shared and prepared for your account.</p><Link href="/materials">Open materials</Link></div>}
    {selected.length > 0 && <div className={styles.comparisonPreparation}>
      <h3>Compare selected sources · {selected.length} of 3</h3>
      <p>Each source keeps its own claims and citations. Different passages are shown together; Petros does not decide that one source overrides the others.</p>
      {selected.map(source => <details key={source.sourceId}><summary>{source.title} · selected page scope</summary>
        <p>Version {source.sourceVersion}</p><label>Pages (comma separated)<input disabled={busy} value={pageInputs[source.sourceId]??source.pages.join(', ')} onChange={event => {
          setComparison(null);setPageInputs(inputs=>({...inputs,[source.sourceId]:event.target.value}));
        }} /></label></details>)}
      <label htmlFor="comparison-question">What do you want to compare?</label>
      <textarea id="comparison-question" value={question} disabled={busy} maxLength={2000} onChange={event => {setQuestion(event.target.value);setComparison(null);}} placeholder="Name the concept or claim to inspect across your sources" />
      <button type="button" className={styles.button} disabled={busy || selected.length < 2 || question.trim().length < 2} onClick={() => void compare()}>{busy ? 'Checking selected sources…' : 'Compare source passages'}</button>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {comparison && <section className={styles.comparisonResult} aria-label="Source comparison results">
      <h3>{comparison.question}</h3><p role="status">{comparison.status === 'missing_support' ? 'Some selected sources have no matching passage.' : comparison.status === 'different_passages' ? 'The passages differ. Inspect their claims and assumptions.' : 'Matching passages found; correctness remains unverified.'}</p>
      <div className={styles.comparisonColumns}>{comparison.sources.map(source => <article key={source.sourceId}>
        <h4>{source.title}</h4>{source.hits.length ? source.hits.map(hit => <figure key={hit.spanId}>
          <blockquote>{hit.source.text}</blockquote><figcaption>Page {hit.source.locator.page} · characters {hit.source.locator.start}–{hit.source.locator.end}
          <details><summary>Exact source reference</summary><p>Version {source.sourceVersion}</p><p>Text hash {hit.source.locator.textSha256}</p></details></figcaption>
        </figure>) : <p>No support found in the selected text.</p>}
        <p>Searched {source.trace.searchedPages.length} of {source.trace.totalPages} pages. Figures, tables and formulas need inspection in the original.</p>
        <PetrosDocumentDoor sourceId={source.sourceId} title={source.title} pageCount={source.trace.totalPages} ready />
      </article>)}</div><p>{comparison.uncertainty}</p><PetrosTeachingBlockPreview key={comparison.comparisonId} block={comparison.studyPlan.block} interactive heading="Guided synthesis · exploratory" /><label htmlFor="source-synthesis-draft">Your qualified synthesis · unsaved<textarea id="source-synthesis-draft" maxLength={6000} value={synthesisDraft} onChange={event=>setSynthesisDraft(event.target.value)} placeholder="Describe agreement, disagreements, assumptions and what remains uncertain. Name the source for each claim." /></label><p>This draft stays in this view and clears when the comparison closes or is rechecked. It is not submitted, saved or assessed.</p><small>Comparison only. No learning evidence or shared draft is recorded. Access is checked every 15 seconds while open; returning from another window clears the passages for a fresh check.</small>
    </section>}
  </section>;
}
