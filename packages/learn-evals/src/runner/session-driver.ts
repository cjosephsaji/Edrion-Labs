import type { EvalTopicFixture } from '../fixtures/topics';
import { PERSONA_POLICIES, sessionSeed, seededRandom, type PersonaPolicy } from '../personas';
import type { EvalPersona } from '../fixtures/topics';
import type { SessionTranscript, TranscriptBlock } from '../rubrics/structural';

export type EvalClientConfig = {
  apiBase: string;
  authCookie: string;
  evalSecret: string;
  /** Dev student email header if cookie auth is unavailable. */
  studentEmail?: string;
};

function headers(cfg: EvalClientConfig, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    ...(extra ?? {}),
  };
  if (cfg.authCookie) h.cookie = cfg.authCookie;
  if (cfg.studentEmail) h['x-student-email'] = cfg.studentEmail;
  return h;
}

async function readSseBlocks(
  cfg: EvalClientConfig,
  sessionId: string,
  timeoutMs = 120_000,
): Promise<{ blocks: TranscriptBlock[]; firstTokens: number[] }> {
  const blocks: TranscriptBlock[] = [];
  const firstTokens: number[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.apiBase}/learn/sessions/${sessionId}/stream`, {
      headers: headers(cfg, { accept: 'text/event-stream' }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let idleRounds = 0;
    while (idleRounds < 40) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      let got = false;
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          clearTimeout(timer);
          return { blocks, firstTokens };
        }
        got = true;
        try {
          const event = JSON.parse(data) as {
            type?: string;
            block?: {
              id: string;
              moveType?: string;
              block?: { block_type?: string };
              degraded?: boolean;
              reasoning?: string | null;
              interactionState?: Record<string, unknown>;
            };
            firstTokenMs?: number;
            blockId?: string;
          };
          if (event.type === 'block_delta' && typeof event.firstTokenMs === 'number') {
            firstTokens.push(event.firstTokenMs);
          }
          if (event.type === 'block' && event.block) {
            const b = event.block;
            blocks.push({
              id: b.id,
              moveType: b.moveType,
              blockType: b.block?.block_type,
              degraded: b.degraded,
              firstTokenMs: firstTokens[firstTokens.length - 1] ?? null,
              content: b.block,
              reasoning: b.reasoning,
            });
          }
        } catch {
          /* ignore non-JSON heartbeats */
        }
      }
      if (!got) idleRounds += 1;
      else idleRounds = 0;
      // Stop early once we have a few blocks and stream idles.
      if (blocks.length >= 1 && idleRounds > 8) break;
    }
  } finally {
    clearTimeout(timer);
  }
  return { blocks, firstTokens };
}

function pickAnswer(
  topic: EvalTopicFixture,
  policy: PersonaPolicy,
  rand: () => number,
): { text: string; correct: boolean } {
  const correct = rand() < policy.correctProbability;
  const pool = correct ? topic.answers.correct : topic.answers.incorrect;
  const text = pool[Math.floor(rand() * pool.length)] ?? (correct ? 'correct' : 'wrong');
  return { text, correct };
}

export async function seedFrozenProfile(cfg: EvalClientConfig, topic: EvalTopicFixture): Promise<void> {
  void cfg;
  void topic;
  throw new Error(
    'seed-profile is retired. Learn eval seeding was removed with the engine rebuild; use hand-written fixtures.',
  );
}

export async function runEvalSession(opts: {
  cfg: EvalClientConfig;
  topic: EvalTopicFixture;
  persona: EvalPersona;
  runSeed: number;
}): Promise<SessionTranscript> {
  const { cfg, topic, persona, runSeed } = opts;
  const policy = PERSONA_POLICIES[persona];
  const rand = seededRandom(sessionSeed(runSeed, topic.key, persona));
  const transcript: SessionTranscript = {
    topicKey: topic.key,
    persona,
    sessionId: '',
    goal: policy.goal,
    moves: [],
    blocks: [],
    constraintViolations: [],
    speculativeDiscards: 0,
    speculativePlans: 0,
    artifactCommitOffered: false,
    committedCards: [],
  };

  try {
    await seedFrozenProfile(cfg, topic);

    const createRes = await fetch(`${cfg.apiBase}/learn/sessions`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({
        entryPoint: 'goal',
        topicKey: topic.key,
        goal: policy.goal,
        timeBudgetMinutes: policy.timeBudgetMinutes,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!createRes.ok) {
      transcript.error = `create failed: ${createRes.status} ${await createRes.text()}`;
      return transcript;
    }
    const created = (await createRes.json()) as { session: { id: string } };
    transcript.sessionId = created.session.id;

    // Drive several plan/render cycles: stream → answer/interact → continue.
    for (let cycle = 0; cycle < 8; cycle += 1) {
      const { blocks, firstTokens } = await readSseBlocks(cfg, transcript.sessionId);
      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i]!;
        if (typeof firstTokens[i] === 'number') b.firstTokenMs = firstTokens[i];
        if (!transcript.blocks.some((x) => x.id === b.id)) {
          transcript.blocks.push(b);
          if (b.moveType) transcript.moves.push(b.moveType);
        }
        if (b.blockType === 'artifact_commit') transcript.artifactCommitOffered = true;

        const content = b.content as {
          block_type?: string;
          questions?: Array<{ id: string; type: string; options?: Array<{ id: string }> }>;
          steps?: unknown[];
        };

        if (content?.block_type === 'question_set' && content.questions?.[0]) {
          const q = content.questions[0];
          const ans = pickAnswer(topic, policy, rand);
          const response =
            q.type === 'mcq_single' && q.options?.length
              ? { optionId: ans.correct ? q.options[0]!.id : q.options[q.options.length - 1]!.id }
              : { text: ans.text };
          await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/blocks/${b.id}/answer`, {
            method: 'POST',
            headers: headers(cfg),
            body: JSON.stringify({
              questionId: q.id,
              response,
              hintsUsed: 0,
              idempotencyKey: crypto.randomUUID(),
            }),
          });
        } else if (content?.block_type === 'probe' && policy.probeEscape) {
          await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/blocks/${b.id}/interact`, {
            method: 'POST',
            headers: headers(cfg),
            body: JSON.stringify({
              action: 'probe_escape',
              expectedInteractionVersion: 1,
              idempotencyKey: crypto.randomUUID(),
            }),
          });
        } else if (content?.block_type === 'worked_example' && policy.alwaysShowStep) {
          await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/blocks/${b.id}/interact`, {
            method: 'POST',
            headers: headers(cfg),
            body: JSON.stringify({
              action: 'reveal_step',
              data: { stepIndex: 0 },
              expectedInteractionVersion: 1,
              idempotencyKey: crypto.randomUUID(),
            }),
          });
        } else if (content?.block_type === 'explanation') {
          if (policy.expandDeeperOnce && cycle === 1) {
            await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/blocks/${b.id}/interact`, {
              method: 'POST',
              headers: headers(cfg),
              body: JSON.stringify({
                action: 'expand_deeper',
                expectedInteractionVersion: 1,
                idempotencyKey: crypto.randomUUID(),
              }),
            });
          } else if (rand() < policy.expandDeeperProbability) {
            await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/blocks/${b.id}/interact`, {
              method: 'POST',
              headers: headers(cfg),
              body: JSON.stringify({
                action: 'expand_deeper',
                expectedInteractionVersion: 1,
                idempotencyKey: crypto.randomUUID(),
              }),
            });
          }
        } else if (content?.block_type === 'synthesis' && policy.skipSynthesis) {
          await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/blocks/${b.id}/interact`, {
            method: 'POST',
            headers: headers(cfg),
            body: JSON.stringify({
              action: 'synthesis_skip',
              expectedInteractionVersion: 1,
              idempotencyKey: crypto.randomUUID(),
            }),
          });
        } else if (content?.block_type === 'artifact_commit') {
          const commitRes = await fetch(
            `${cfg.apiBase}/learn/sessions/${transcript.sessionId}/commit-artifacts`,
            {
              method: 'POST',
              headers: headers(cfg),
              body: JSON.stringify({
                cardSelections: [],
                includeCanvas: false,
                idempotencyKey: crypto.randomUUID(),
              }),
            },
          );
          if (commitRes.ok) {
            transcript.committedCards.push({
              front: topic.title,
              back: topic.answers.correct[0] ?? 'takeaway',
            });
          }
        }
      }

      if (policy.askFreeQuestion && cycle === 2) {
        await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/ask`, {
          method: 'POST',
          headers: headers(cfg),
          body: JSON.stringify({
            text: `Quick question about ${topic.title}?`,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
      }

      const sessionRes = await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}`, {
        headers: headers(cfg),
      });
      if (sessionRes.ok) {
        const session = (await sessionRes.json()) as {
          orchestratorStatus?: string;
          blocks?: Array<{ moveType?: string; block?: { block_type?: string }; degraded?: boolean; id: string }>;
        };
        if (session.orchestratorStatus === 'closed') break;
        for (const b of session.blocks ?? []) {
          if (!transcript.blocks.some((x) => x.id === b.id)) {
            transcript.blocks.push({
              id: b.id,
              moveType: b.moveType,
              blockType: b.block?.block_type,
              degraded: b.degraded,
              content: b.block,
            });
            if (b.moveType) transcript.moves.push(b.moveType);
          }
        }
      }
    }

    await fetch(`${cfg.apiBase}/learn/sessions/${transcript.sessionId}/end`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ saveToLibrary: false, idempotencyKey: crypto.randomUUID() }),
    }).catch(() => undefined);
  } catch (e) {
    transcript.error = e instanceof Error ? e.message : String(e);
  }

  return transcript;
}
