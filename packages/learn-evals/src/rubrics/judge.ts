import type { SessionTranscript } from './structural';

export const JUDGE_PROMPT_VERSION = 'learn-eval-judge-v1';

export type JudgeScores = {
  pedagogical_fit: number;
  content_correctness: number;
  artifact_quality: number;
  answer_key_error: boolean;
  notes: string;
};

/**
 * LLM judge (hyperspec §1.4). Temperature 0, mid tier via OpenAI-compatible API.
 * Removing the judge (no key / outage) MUST fail the run — never silently pass content dims.
 */
export async function judgeTranscript(
  t: SessionTranscript,
  opts: { apiKey?: string; model?: string; baseUrl?: string },
): Promise<JudgeScores> {
  const apiKey = opts.apiKey ?? process.env.LEARN_EVAL_JUDGE_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'JUDGE_UNAVAILABLE: set LEARN_EVAL_JUDGE_API_KEY (or OPENAI_API_KEY). Structural-only runs are forbidden.',
    );
  }

  const model = opts.model ?? process.env.LEARN_EVAL_JUDGE_MODEL ?? 'gpt-4o-mini';
  const baseUrl = (opts.baseUrl ?? process.env.LEARN_EVAL_JUDGE_BASE_URL ?? 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  );

  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a strict pedagogy judge (${JUDGE_PROMPT_VERSION}). Score 1–5 integers.
Return JSON: {"pedagogical_fit":n,"content_correctness":n,"artifact_quality":n,"answer_key_error":bool,"notes":"..."}.
Rules: any factual/answer-key error ⇒ content_correctness ≤ 2 and answer_key_error true.
artifact_quality: if no cards, score ≤ 3 unless commit was offered.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          topic: t.topicKey,
          persona: t.persona,
          goal: t.goal,
          moves: t.moves,
          blocks: t.blocks.slice(0, 20).map((b) => ({
            move: b.moveType,
            type: b.blockType,
            degraded: b.degraded,
            content: b.content,
          })),
          cards: t.committedCards,
          artifact_commit_offered: t.artifactCommitOffered,
        }),
      },
    ],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`JUDGE_UNAVAILABLE: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error('JUDGE_UNAVAILABLE: empty response');
  const parsed = JSON.parse(raw) as JudgeScores;
  const clamp = (n: unknown) => Math.max(1, Math.min(5, Number(n) || 1));
  let content = clamp(parsed.content_correctness);
  if (parsed.answer_key_error) content = Math.min(content, 2);
  return {
    pedagogical_fit: clamp(parsed.pedagogical_fit),
    content_correctness: content,
    artifact_quality: clamp(parsed.artifact_quality),
    answer_key_error: Boolean(parsed.answer_key_error),
    notes: String(parsed.notes ?? ''),
  };
}
