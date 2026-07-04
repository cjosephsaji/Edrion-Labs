import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PetrosAgentService } from './petros-agent.service';
import type { PetrosTool } from './tools/types';
import type { PortalActionContext } from '../portal-action-context';

const INST = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CONV = '33333333-3333-3333-3333-333333333333';

function ctx(permissionKeys: string[]): PortalActionContext {
  return {
    principal: {
      institutionUserId: USER,
      institutionId: INST,
      email: 't@x.test',
      fullName: 'Terry Teacher',
      roleKeys: ['teacher'],
      permissions: { keys: new Set(permissionKeys), hasWildcard: false },
      allowedCampusIds: [],
      isInstitutionWide: true,
      mfaEnrolled: false,
      lastAuthAt: new Date(),
    },
    scope: { mode: 'institution' },
    request: { requestId: 'r', correlationId: 'c', ip: '::1', userAgent: 'vitest', apiEndpoint: 'POST /petros' },
  } as never;
}

/** An async-iterable fake of one Responses API streamed response. */
function fakeStream(events: Record<string, unknown>[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  };
}

function textResponse(text: string) {
  return [
    { type: 'response.output_text.delta', delta: text },
    {
      type: 'response.completed',
      response: {
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
        usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 2 } },
      },
    },
  ];
}

function functionCallResponse(name: string, args: Record<string, unknown>, callId = 'call_1') {
  return [
    {
      type: 'response.completed',
      response: {
        output: [{ type: 'function_call', name, call_id: callId, arguments: JSON.stringify(args) }],
        usage: { input_tokens: 8, output_tokens: 3 },
      },
    },
  ];
}

function makeHarness(tools: PetrosTool[], streams: Record<string, unknown>[][]) {
  const conversation = { id: CONV, institutionId: INST, institutionUserId: USER, title: null, summary: null } as never;
  let messageSeq = 0;
  const messages: Record<string, unknown>[] = [];
  const pendingTurns: Record<string, unknown>[] = [];
  const repo = {
    institutionBasics: vi.fn().mockResolvedValue({ name: 'UIS', type: 'school' }),
    insertMessage: vi.fn().mockImplementation(async (v: Record<string, unknown>) => {
      const row = { ...v, id: `mmmmmmm${messageSeq += 1}`, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
      messages.push(row);
      return row;
    }),
    updateMessage: vi.fn().mockResolvedValue({}),
    updateConversation: vi.fn().mockResolvedValue({}),
    messagesForConversation: vi.fn().mockImplementation(async () => messages),
    activePendingTurnForConversation: vi.fn().mockResolvedValue(undefined),
    insertPendingTurn: vi.fn().mockImplementation(async (v: Record<string, unknown>) => {
      const row = { ...v, id: `pppppp${pendingTurns.length + 1}`, status: 'pending', expiresAt: new Date(Date.now() + 60000) };
      pendingTurns.push(row);
      return row;
    }),
    findPendingTurn: vi.fn().mockImplementation(async (id: string) => pendingTurns.find((p) => p.id === id)),
    findPendingTurnByRun: vi.fn().mockImplementation(async (runId: string) => pendingTurns.find((p) => p.runId === runId)),
    resolvePendingTurn: vi.fn().mockResolvedValue(undefined),
    findConversation: vi.fn().mockResolvedValue(conversation),
  };
  let streamIdx = 0;
  const openai = {
    modelFor: () => 'gpt-test',
    streamResponse: vi.fn().mockImplementation(async () => fakeStream(streams[streamIdx++] ?? textResponse('done'))),
    text: vi.fn().mockResolvedValue({ text: 'Test title', usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } }),
  };
  const registry = {
    tools: new Map(tools.map((t) => [t.name, t])),
    get(name: string) { return this.tools.get(name); },
    availableFor() { return tools; },
    toOpenAiTools(ts: PetrosTool[]) { return ts.map((t) => ({ type: 'function', name: t.name, parameters: t.parameters })); },
  };
  const runRows: Record<string, unknown>[] = [];
  const toolCallRows: Record<string, unknown>[] = [];
  const runs = {
    insertRun: vi.fn().mockImplementation(async (v: Record<string, unknown>) => {
      const row = { ...v, id: `rrrrrr${runRows.length + 1}` };
      runRows.push(row);
      return row;
    }),
    updateRun: vi.fn().mockResolvedValue({}),
    insertToolCall: vi.fn().mockImplementation(async (v: Record<string, unknown>) => {
      const row = { ...v, id: `ttttt${toolCallRows.length + 1}` };
      toolCallRows.push(row);
      return row;
    }),
    updateToolCall: vi.fn().mockResolvedValue({}),
    toolCallsForRun: vi.fn().mockImplementation(async () => toolCallRows),
    findRun: vi.fn().mockImplementation(async (id: string) => runRows.find((r) => r.id === id)),
    insertConfirmation: vi.fn().mockResolvedValue({}),
  };
  const attachments = { toInputBlocks: vi.fn().mockResolvedValue({ blocks: [], manifest: [] }) };
  const topicality = {
    shouldDecline: vi.fn().mockResolvedValue({ decline: false, category: null }),
    recordDecline: vi.fn(),
    declineMessage: 'declined',
  };
  const service = new PetrosAgentService(
    repo as never,
    openai as never,
    registry as never,
    runs as never,
    attachments as never,
    topicality as never,
  );
  return { service, repo, openai, runs, conversation, runRows, topicality };
}

const readTool: PetrosTool = {
  name: 'students_search',
  description: 'search',
  inputSchema: z.object({ query: z.string().optional() }),
  parameters: { type: 'object', properties: {} },
  requiredPermissions: ['students.view'],
  capability: 'read',
  humanStatus: 'Searching…',
  execute: vi.fn().mockResolvedValue({ matched: 1 }),
};

const mutationTool: PetrosTool = {
  name: 'announcement_draft',
  description: 'draft',
  inputSchema: z.object({ title: z.string() }),
  parameters: { type: 'object', properties: {} },
  requiredPermissions: ['announcements.send'],
  capability: 'mutation',
  humanStatus: 'Drafting…',
  impactPreview: vi.fn().mockResolvedValue({ summary: 'Create draft' }),
  execute: vi.fn().mockResolvedValue({ id: 'ann1' }),
};

describe('PetrosAgentService', () => {
  let events: { type: string }[];
  const emit = (e: { type: string }) => events.push(e);
  beforeEach(() => {
    events = [];
    vi.clearAllMocks();
  });

  it('streams a plain text turn to completion', async () => {
    const h = makeHarness([readTool], [textResponse('Hello!')]);
    await h.service.startTurn(ctx(['ai.use', 'students.view']), h.conversation, 'hi', emit as never);
    expect(events.map((e) => e.type)).toEqual(['message_start', 'text_delta', 'message_complete']);
  });

  it('executes an allowed read tool inline and continues the loop', async () => {
    const h = makeHarness([readTool], [functionCallResponse('students_search', { query: 'ria' }), textResponse('Found 1.')]);
    await h.service.startTurn(ctx(['ai.use', 'students.view']), h.conversation, 'find ria', emit as never);
    expect(readTool.execute).toHaveBeenCalled();
    expect(events.map((e) => e.type)).toContain('tool_started');
    expect(events.at(-1)?.type).toBe('message_complete');
    expect(h.runs.insertRun).not.toHaveBeenCalled(); // reads never create a run
  });

  it('INVARIANT: a mutation tool never executes without confirmation — it pauses on a run', async () => {
    const h = makeHarness([mutationTool], [functionCallResponse('announcement_draft', { title: 'PTM' })]);
    await h.service.startTurn(ctx(['ai.use', 'announcements.send']), h.conversation, 'announce ptm', emit as never);
    expect(mutationTool.execute).not.toHaveBeenCalled();
    expect(h.runs.insertRun).toHaveBeenCalled();
    expect(events.some((e) => e.type === 'confirmation_required')).toBe(true);
  });

  it('confirm executes the tool via the audited path and resumes the loop', async () => {
    const h = makeHarness(
      [mutationTool],
      [functionCallResponse('announcement_draft', { title: 'PTM' }), textResponse('Draft created.')],
    );
    const c = ctx(['ai.use', 'announcements.send']);
    await h.service.startTurn(c, h.conversation, 'announce ptm', emit as never);
    const runId = h.runRows[0]!.id as string;
    events = [];
    await h.service.confirmRun(c, runId, emit as never);
    expect(mutationTool.execute).toHaveBeenCalledTimes(1);
    expect(events.at(-1)?.type).toBe('message_complete');
  });

  it('reject resumes the loop with a rejected_by_user function output (no dead-end)', async () => {
    const h = makeHarness(
      [mutationTool],
      [functionCallResponse('announcement_draft', { title: 'PTM' }), textResponse('Okay, not doing that.')],
    );
    const c = ctx(['ai.use', 'announcements.send']);
    await h.service.startTurn(c, h.conversation, 'announce ptm', emit as never);
    const runId = h.runRows[0]!.id as string;
    events = [];
    await h.service.rejectRun(c, runId, emit as never);
    expect(mutationTool.execute).not.toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe('message_complete');
  });

  it('ask_user pauses the stream and an answer resumes it', async () => {
    const h = makeHarness(
      [readTool],
      [
        functionCallResponse('ask_user', { question: 'Which class?', options: [{ id: 'a', label: '5A' }, { id: 'b', label: '5B' }] }),
        textResponse('5A it is.'),
      ],
    );
    const c = ctx(['ai.use', 'students.view']);
    await h.service.startTurn(c, h.conversation, 'attendance please', emit as never);
    const q = events.find((e) => e.type === 'question') as { pendingTurnId: string } | undefined;
    expect(q).toBeDefined();
    events = [];
    await h.service.answer(c, q!.pendingTurnId, 'a', emit as never);
    expect(events.at(-1)?.type).toBe('message_complete');
  });

  it('high-confidence off-topic turn declines without invoking the main model', async () => {
    const h = makeHarness([readTool], [textResponse('never called')]);
    h.topicality.shouldDecline.mockResolvedValue({ decline: true, category: 'personal_shopping' });
    await h.service.startTurn(ctx(['ai.use', 'students.view']), h.conversation, 'buy me sneakers', emit as never);
    expect(h.openai.streamResponse).not.toHaveBeenCalled();
    expect(h.topicality.recordDecline).toHaveBeenCalledWith(expect.anything(), 'buy me sneakers', 'personal_shopping');
    expect(events.at(-1)?.type).toBe('message_complete');
  });

  it('a tool the user lacks permission for returns an error output, never executes', async () => {
    const h = makeHarness(
      [mutationTool],
      [functionCallResponse('announcement_draft', { title: 'PTM' }), textResponse('You cannot do that.')],
    );
    await h.service.startTurn(ctx(['ai.use']), h.conversation, 'announce', emit as never);
    expect(mutationTool.execute).not.toHaveBeenCalled();
    expect(h.runs.insertRun).not.toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe('message_complete');
  });
});
