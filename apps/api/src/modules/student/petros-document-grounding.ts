const QUESTION_START =
  /^(?:why|what|how|which|when|where|who|compare|differentiate|explain|describe|discuss|define|list|draw|illustrate|identify|state|outline|evaluate|analyse|analyze)\b/i;

/** Pulls explicit study questions out of teacher-provided document text without inventing content. */
export function documentStudyQuestions(chunks: string[], limit = 12): string[] {
  const questions: string[] = [];

  const add = (raw: string) => {
    const candidate = raw
      .replace(/^\s*(?:q(?:uestion)?\s*)?\d{1,2}\s*[.):/-]?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate.length < 12 || candidate.length > 600 || !QUESTION_START.test(candidate)) return;
    const questionMark = candidate.indexOf('?');
    const prompt = (questionMark >= 0 ? candidate.slice(0, questionMark + 1) : candidate)
      .replace(/\s+/g, ' ')
      .trim();
    if (
      !questions.some((existing) => existing.toLocaleLowerCase() === prompt.toLocaleLowerCase())
    ) {
      questions.push(prompt);
    }
  };

  for (const chunk of chunks) {
    for (const line of chunk.split(/\r?\n/)) add(line);
    if (questions.length >= limit) break;

    for (const match of chunk.matchAll(
      /(?:^|\n|\s\d{1,2}\s*[.)-]\s*)((?:why|what|how|which|when|where|who|compare|differentiate|explain|describe|discuss|define|list|draw|illustrate|identify|state|outline|evaluate|analyse|analyze)\b[^?\n]{8,580}\?)/gi,
    )) {
      add(match[1] ?? '');
      if (questions.length >= limit) break;
    }
    if (questions.length >= limit) break;
  }

  return questions.slice(0, limit);
}

export function documentQuestionFromSourceContext(
  sourceContext: Record<string, unknown> | null | undefined,
  sequence = 1,
): string | null {
  if (sourceContext?.door !== 'uploaded_document' || !Array.isArray(sourceContext.citations)) {
    return null;
  }
  const excerpts = sourceContext.citations.flatMap((citation) => {
    if (!citation || typeof citation !== 'object' || Array.isArray(citation)) return [];
    const excerpt = (citation as Record<string, unknown>).excerpt;
    return typeof excerpt === 'string' ? [excerpt] : [];
  });
  const questions = documentStudyQuestions(excerpts);
  return questions.length ? questions[(Math.max(1, sequence) - 1) % questions.length]! : null;
}

/** Keeps retries tied to the teacher's question and removes internal ladder language. */
export function documentRetryPrompt(question: string): string {
  const whyRelationship = question.match(/^Why is (.+?) considered (.+?)\?$/i);
  if (whyRelationship) {
    return `What features of ${whyRelationship[1]} explain why it is considered ${whyRelationship[2]}?`;
  }
  if (/^(?:compare|differentiate)\b/i.test(question)) {
    return `Start with one clear difference, then build the comparison: ${question}`;
  }
  if (/^how\b/i.test(question)) {
    return `Break the process into its main steps: ${question}`;
  }
  if (/^why\b/i.test(question)) {
    return `Start with the cause-and-effect link: ${question}`;
  }
  return `Use one precise point from the document to answer this: ${question}`;
}
