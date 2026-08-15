import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { PetrosSessionState } from '@edrion/schemas';
import {
  deterministicPlan,
  deterministicRender,
} from '../src/modules/student/petros-loop/petros-loop.policy';

const port = Number(process.env.PETROS_STAGE8_MOCK_PORT ?? 3999);

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Not found' } }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      messages?: Array<{ role?: string; content?: string | Array<{ type?: string; text?: string }> }>;
      response_format?: {
        json_schema?: { schema?: { properties?: Record<string, unknown> } };
      };
    };
    const user = [...(body.messages ?? [])].reverse().find((message) => message.role === 'user');
    const text = Array.isArray(user?.content)
      ? user.content.find((part) => part.type === 'text')?.text
      : user?.content;
    if (!text) throw new Error('QA request has no text payload.');
    const payload = JSON.parse(text) as Record<string, unknown>;
    let content: unknown;
    if (typeof payload.stateVersion === 'string') {
      content = deterministicPlan(payload as unknown as PetrosSessionState);
    } else if (payload.decision && payload.sessionState) {
      content = deterministicRender(
        payload.decision as Parameters<typeof deterministicRender>[0],
        payload.sessionState as PetrosSessionState,
      );
    } else {
      throw new Error('Only Stage 8 PLAN and RENDER contracts are supported.');
    }
    // The OpenAI-compatible adapter deliberately envelopes schemas containing
    // unsupported union constructs and unwraps `result` after the response.
    const envelope = body.response_format?.json_schema?.schema?.properties?.result;
    const serialized = JSON.stringify(envelope ? { result: content } : content);
    response.writeHead(200, {
      'content-type': 'application/json',
      'x-request-id': `stage8-local-${randomUUID()}`,
    });
    response.end(
      JSON.stringify({
        id: `stage8-local-${randomUUID()}`,
        choices: [{ message: { role: 'assistant', content: serialized } }],
        usage: {
          prompt_tokens: Math.ceil(text.length / 4),
          completion_tokens: Math.ceil(serialized.length / 4),
          prompt_tokens_details: { cached_tokens: 0 },
        },
      }),
    );
  } catch (error) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: { message: error instanceof Error ? error.message : 'QA provider failed.' },
      }),
    );
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Stage 8 local Petros QA provider listening on :${port}`);
});
