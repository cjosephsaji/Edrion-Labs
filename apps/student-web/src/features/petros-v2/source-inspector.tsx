import type { SharedCanvasState } from '@edrion/schemas';
import type { PublicTeachingFixture } from './playground/teaching-fixtures';
import styles from './playground/companion-playground.module.css';

export function SourceInspector({ fixture, canvas, selectedId, select }: { fixture: PublicTeachingFixture; canvas: SharedCanvasState; selectedId: string | null; select: (id: string) => void }) {
  const selected = canvas.elements.find(e => e.id === selectedId);
  const phrase = selected?.kind === 'text' ? selected.text : null;
  return <details className={styles.source}><summary>Source preview <span>Public fixture</span></summary>
    <h3>{fixture.source.title}</h3>
    {fixture.source.paragraphs.map((text, i) => {
      const start = phrase ? text.indexOf(phrase) : -1;
      const target = canvas.elements.find(e => e.sourceId === fixture.source.id && e.kind === 'text' && text.includes(e.text));
      return <p key={i} data-source-unit={`${fixture.source.id}-paragraph-${i + 1}`} data-selected={Boolean(target && target.id === selectedId)} role={target ? 'button' : undefined} tabIndex={target ? 0 : undefined}
        aria-label={target ? `Select source passage: ${target.label}` : undefined} aria-pressed={target ? target.id === selectedId : undefined}
        onClick={() => { if (target) select(target.id); }} onKeyDown={e => { if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(target.id); } }}>{start >= 0 && phrase ? <>{text.slice(0, start)}<mark>{phrase}</mark>{text.slice(start + phrase.length)}</> : text}</p>;
    })}
    <small>{fixture.source.review}</small>
  </details>;
}
