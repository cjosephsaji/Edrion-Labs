'use client';

import { useMemo, useState } from 'react';
import type { PetrosSessionBlock } from '@edrion/schemas';
import { buildPetrosLessonNarration, petrosLessonTarget } from './petros-lesson-narration';

/**
 * Read-only rendering shared by the learner lesson, companion references, and
 * teacher previews. Preview controls reveal the same authored content as the
 * lesson renderer, but never submit answers or create learning evidence.
 */
export function PetrosTeachingBlockPreview({
  block,
  interactive = false,
  heading = 'Lesson preview',
  disclosure = true,
}: {
  block: PetrosSessionBlock;
  interactive?: boolean;
  heading?: string;
  disclosure?: boolean;
}) {
  const [interactionState, setInteractionState] = useState<Record<string, unknown>>(block.interactionState);
  const visibleBlock = useMemo(() => ({ ...block, interactionState }), [block, interactionState]);
  const segments = buildPetrosLessonNarration(visibleBlock).slice(1);
  const content = block.content;
  const canReveal = content.type === 'hook' || content.type === 'predict_then_reveal';
  const layers = content.type === 'layered_explanation' ? content.deeperLayers : [];
  const expanded = Array.isArray(interactionState.expandedLayerIds)
    ? interactionState.expandedLayerIds as string[]
    : [];

  function revealAll() {
    if (canReveal) setInteractionState((current) => ({ ...current, revealed: true }));
    if (content.type === 'layered_explanation')
      setInteractionState((current) => ({ ...current, expandedLayerIds: content.deeperLayers.map((layer) => layer.id) }));
    if (content.type === 'worked_example')
      setInteractionState((current) => ({ ...current, revealedStepCount: content.steps.length }));
    if (content.type === 'story')
      setInteractionState((current) => ({ ...current, revealedEventCount: content.events.length }));
    if (content.type === 'derivation')
      setInteractionState((current) => ({ ...current, revealedStepCount: content.steps.length }));
  }

  function toggleLayer(id: string) {
    setInteractionState((current) => {
      const ids = Array.isArray(current.expandedLayerIds) ? current.expandedLayerIds as string[] : [];
      return { ...current, expandedLayerIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] };
    });
  }

  const canRevealAll = canReveal || (content.type === 'layered_explanation' && layers.length > 0) ||
    content.type === 'worked_example' || content.type === 'story' || content.type === 'derivation';

  return (
    <article aria-label={`${heading}: ${block.content.title}`} className="grid gap-3 rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{heading}</p>
          <h3 data-petros-target={petrosLessonTarget(block.id, 'title')} className="mt-1 text-lg font-semibold text-text-primary">
            {block.content.title}
          </h3>
        </div>
        {interactive && canRevealAll ? (
          <button type="button" className="min-h-10 rounded-lg border border-border px-3 text-sm font-medium text-text-primary hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={revealAll}>
            Reveal lesson content
          </button>
        ) : null}
      </header>

      {interactive && content.type === 'layered_explanation' && layers.length > 0 ? (
        <fieldset className="grid gap-2 rounded-lg bg-surface-elevated p-3">
          <legend className="px-1 text-sm font-medium">Optional explanation layers</legend>
          {layers.map((layer) => (
            <label key={layer.id} className="flex min-h-10 items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={expanded.includes(layer.id)} onChange={() => toggleLayer(layer.id)} />
              {layer.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {segments.length ? (
        <div className="grid gap-3">
          {segments.map((segment) => (
            <section key={segment.id} aria-label={segment.label}>
              <h4 className="text-sm font-semibold text-text-primary">{segment.label}</h4>
              <p data-petros-target={segment.targetKey} className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                {segment.text}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <p role="status" className="text-sm text-text-muted">This block has no content visible in its current state.</p>
      )}
      {disclosure ? <p className="border-t border-border pt-2 text-xs text-text-muted">Read-only preview. Interactions here do not submit work or record learner progress.</p> : null}
    </article>
  );
}
