import {
  petrosKnowledgeAnswerSchema,
  type PetrosDocumentRetrieval,
  type PetrosKnowledgePolicy,
} from '@edrion/schemas';

/** Source-supported units are server-copied quotations, never a model's assertion of support. */
export function renderKnowledgeAnswer(
  raw: unknown,
  policy: PetrosKnowledgePolicy,
  retrieval: PetrosDocumentRetrieval,
) {
  const answer = petrosKnowledgeAnswerSchema.parse(raw);
  const citedSpanIds: string[] = [];
  const units = answer.units.map((unit) => {
    if (unit.basis === 'material_supported') {
      const hit = retrieval.hits.find((hit) => hit.spanId === unit.spanId);
      if (!hit) throw new Error('PETROS_KNOWLEDGE_CITATION_INVALID');
      citedSpanIds.push(hit.spanId);
      return {
        basis: unit.basis,
        spanId: hit.spanId,
        text: hit.source.text,
        sourceVersion: retrieval.sourceVersion,
        page: hit.source.locator.page,
      };
    }
    if (policy.mode === 'source_bound') throw new Error('PETROS_KNOWLEDGE_OUTSIDE_ANSWER');
    // Free text cannot provide a fabricated locator or impersonate a retrieved unit.
    if (/https?:\/\/|\b(?:source|physical pdf|pdf)\s*(?:page|:)|\[\d+\]/i.test(unit.text))
      throw new Error('PETROS_KNOWLEDGE_UNVERIFIED_CITATION');
    return unit;
  });
  const labels = {
    general_knowledge: 'General knowledge — outside your material; not source-verified',
    analogy: 'Analogy — outside your material',
    inference: 'Inference — not established by your material',
    uncertain: 'Uncertain — needs verification',
  };
  const text = units
    .map((unit) =>
      unit.basis === 'material_supported'
        ? `Material passage — physical PDF page ${unit.page}:\n“${unit.text}”\nRelevance to the question is unverified.`
        : `${labels[unit.basis]}:\n${unit.text}`,
    )
    .join('\n\n');
  return {
    text: `${policy.explanation}\n\n${!citedSpanIds.length ? 'No material passage supports the following explanation.\n\n' : ''}${text}\n\nSearched physical PDF pages ${retrieval.trace.searchedPages.join(', ') || 'none'}; ${retrieval.trace.unsearchedPageCount} other pages were not searched.`,
    knowledgePolicy: policy,
    knowledgeUnits: units,
    retrieval,
    citedSpanIds: [...new Set(citedSpanIds)],
    basis: 'knowledge_policy_answer' as const,
  };
}

export function knowledgeEvidenceFallback(
  policy: PetrosKnowledgePolicy,
  retrieval: PetrosDocumentRetrieval,
  generationFailed = false,
) {
  if (retrieval.hits.length) {
    const answer = renderKnowledgeAnswer(
      { units: [{ basis: 'material_supported', spanId: retrieval.hits[0]!.spanId }] },
      policy,
      retrieval,
    );
    if (generationFailed)
      answer.text = `I could not produce a validated explanation. Here is an exact passage instead; you can ask again.\n\n${answer.text}`;
    return answer;
  }
  return {
    text: `${policy.explanation}\n\nI could not find matching evidence in the selected source pages. This does not prove absence from the whole document. Try the source’s wording or ask your teacher for an allowed source. No outside explanation was generated.`,
    knowledgePolicy: policy,
    knowledgeUnits: [],
    retrieval,
    citedSpanIds: [],
    basis: 'missing_evidence' as const,
  };
}
