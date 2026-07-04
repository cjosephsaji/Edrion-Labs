'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  FileText,
  Loader2,
  Paperclip,
  Pin,
  Plus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Skeleton, cn } from '@edrion/ui';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import {
  useCreatePetrosConversation,
  usePetrosCapabilities,
  usePetrosConversations,
  usePetrosDetail,
  usePetrosStream,
  useUpdatePetrosConversation,
  type PetrosBlock,
  type PetrosMessage,
  type PetrosStreamEvent,
} from '@/lib/petros';

/** Live streaming state for the in-flight assistant turn. */
interface LiveTurn {
  text: string;
  tool: { name: string; humanStatus: string } | null;
  question: { pendingTurnId: string; question: string; options: { id: string; label: string }[] } | null;
  confirmation: { runId: string; card: Record<string, unknown> } | null;
  artifacts: { artifactId: string; kind: string; title: string }[];
  error: string | null;
}

const EMPTY_TURN: LiveTurn = { text: '', tool: null, question: null, confirmation: null, artifacts: [], error: null };

export function PetrosShell({ conversationId }: { conversationId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const conversations = usePetrosConversations();
  const detail = usePetrosDetail(conversationId);
  const capabilities = usePetrosCapabilities();
  const createConversation = useCreatePetrosConversation();
  const updateConversation = useUpdatePetrosConversation();
  const stream = usePetrosStream();
  const client = usePortalClient();
  const { scope } = useScope();

  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [live, setLive] = useState<LiveTurn>(EMPTY_TURN);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail.data?.messages.length, live.text, streaming]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['petros'] });
  }, [qc]);

  const handleEvent = useCallback((e: PetrosStreamEvent) => {
    setLive((prev) => {
      switch (e.type) {
        case 'text_delta':
          return { ...prev, text: prev.text + String(e.delta ?? '') };
        case 'tool_started':
          return { ...prev, tool: { name: String(e.toolName), humanStatus: String(e.humanStatus) } };
        case 'tool_finished':
          return { ...prev, tool: null };
        case 'question':
          return {
            ...prev,
            question: {
              pendingTurnId: String(e.pendingTurnId),
              question: String(e.question),
              options: (e.options as { id: string; label: string }[]) ?? [],
            },
          };
        case 'confirmation_required':
          return { ...prev, confirmation: { runId: String(e.runId), card: (e.card as Record<string, unknown>) ?? {} } };
        case 'artifact':
          return {
            ...prev,
            artifacts: [...prev.artifacts, { artifactId: String(e.artifactId), kind: String(e.kind), title: String(e.title) }],
          };
        case 'error':
          return { ...prev, error: String(e.message ?? 'The turn failed.') };
        default:
          return prev;
      }
    });
  }, []);

  const runStream = useCallback(
    async (work: (onEvent: (e: PetrosStreamEvent) => void) => Promise<void>) => {
      setStreaming(true);
      setLive(EMPTY_TURN);
      try {
        await work(handleEvent);
      } catch (e) {
        setLive((prev) => ({ ...prev, error: e instanceof Error ? e.message : 'The turn failed.' }));
      } finally {
        setStreaming(false);
        setPendingUserText(null);
        refresh();
      }
    },
    [handleEvent, refresh],
  );

  async function send() {
    const message = draft.trim();
    if (!message || streaming) return;
    setDraft('');
    let id = conversationId;
    if (!id) {
      const created = await createConversation.mutateAsync({});
      id = created.id;
      router.replace(`/petros/${created.id}`);
    }
    const attachmentIds = attachments.map((a) => a.id);
    setAttachments([]);
    setPendingUserText(message);
    await runStream((onEvent) => stream.sendTurn(id!, message, attachmentIds, onEvent));
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    let id = conversationId;
    if (!id) {
      const created = await createConversation.mutateAsync({});
      id = created.id;
      router.replace(`/petros/${created.id}`);
    }
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const uploaded = await client.upload<{ id: string; filename: string }>(
          `/portal/petros/conversations/${id}/uploads`,
          scope,
          file,
        );
        setAttachments((prev) => [...prev, uploaded]);
      }
    } catch (e) {
      setLive((prev) => ({ ...prev, error: e instanceof Error ? e.message : 'Upload failed.' }));
    } finally {
      setUploading(false);
    }
  }

  const pending = detail.data?.pendingTurn ?? null;
  const messages = detail.data?.messages ?? [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Conversation rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="p-3">
          <Button
            size="sm"
            className="w-full"
            onClick={async () => {
              const created = await createConversation.mutateAsync({});
              router.push(`/petros/${created.id}`);
            }}
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {conversations.isLoading ? (
            <Skeleton className="m-2 h-24" />
          ) : (
            (conversations.data?.items ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/petros/${c.id}`)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                  c.id === conversationId ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-background-secondary',
                )}
              >
                {c.pinned && <Pin className="h-3 w-3 shrink-0" />}
                <span className="truncate">{c.title ?? 'New conversation'}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className="ml-auto hidden text-text-muted hover:text-primary group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateConversation.mutate({ id: c.id, pinned: !c.pinned, version: c.version });
                  }}
                >
                  <Pin className="h-3.5 w-3.5" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {!conversationId && !streaming ? (
              <PetrosEmptyState
                suggestions={capabilities.data?.suggestions ?? []}
                onPick={(s) => setDraft(s)}
              />
            ) : detail.isLoading && !streaming ? (
              <Skeleton className="h-40" />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}

            {pendingUserText && <UserBubble text={pendingUserText} />}

            {streaming || live.text || live.error || live.question || live.confirmation ? (
              <LiveBubble live={live} streaming={streaming} />
            ) : null}

            {/* Paused turn cards (from live stream or reload) */}
            {(live.question || (pending?.kind === 'question' && !streaming)) && (
              <QuestionChips
                question={
                  live.question ?? {
                    pendingTurnId: pending!.id,
                    question: String((pending!.payload as { question?: string }).question ?? 'Choose an option'),
                    options: ((pending!.payload as { options?: { id: string; label: string }[] }).options ?? []),
                  }
                }
                disabled={streaming && !live.question}
                onAnswer={(pendingTurnId, optionId) => runStream((onEvent) => stream.answer(pendingTurnId, optionId, onEvent))}
              />
            )}
            {(live.confirmation || (pending?.kind === 'confirmation' && !streaming)) && (
              <ConfirmationCard
                runId={live.confirmation?.runId ?? pending!.runId!}
                card={live.confirmation?.card ?? {}}
                onConfirm={(runId) => runStream((onEvent) => stream.confirm(runId, onEvent))}
                onReject={(runId) => runStream((onEvent) => stream.reject(runId, onEvent))}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-surface p-4">
          <div className="mx-auto max-w-3xl">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-1 text-xs">
                    <Paperclip className="h-3 w-3" /> {a.filename}
                    <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>
                      <X className="h-3 w-3 text-text-muted hover:text-danger" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              {capabilities.data?.canUploadFiles && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx"
                    onChange={(e) => void uploadFiles(e.target.files)}
                  />
                  <Button variant="outline" size="sm" disabled={uploading || streaming} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                </>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={Math.min(6, Math.max(1, draft.split('\n').length))}
                placeholder={streaming ? 'Petros is working…' : 'Message Petros…'}
                disabled={streaming || Boolean(pending) || Boolean(live.question) || Boolean(live.confirmation)}
                className="min-h-[42px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <Button onClick={() => void send()} disabled={streaming || !draft.trim()}>
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-text-muted">
              Petros can make mistakes — actions always require your confirmation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function PetrosEmptyState({ suggestions, onPick }: { suggestions: string[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Petros</h2>
        <p className="text-sm text-text-secondary">Your institution&apos;s assistant — lookups, drafting, documents and reports.</p>
      </div>
      <div className="flex max-w-md flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white">{text}</div>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none text-text-primary [&_table]:text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function MessageBubble({ message }: { message: PetrosMessage }) {
  if (message.role === 'user') {
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return <UserBubble text={text} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {message.content.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: PetrosBlock }) {
  switch (block.type) {
    case 'text':
      return <Markdown text={block.text ?? ''} />;
    case 'tool_activity':
      return (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {block.status === 'failed' || block.status === 'blocked' ? (
            <X className="h-3.5 w-3.5 text-danger" />
          ) : (
            <Check className="h-3.5 w-3.5 text-success" />
          )}
          {block.summary ?? block.toolName}
        </div>
      );
    case 'artifact_ref':
      return <ArtifactCard artifactId={block.artifactId!} />;
    case 'question':
      return (
        <div className="text-sm text-text-secondary">
          {block.question}
          {block.answeredOptionId && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {block.options?.find((o) => o.id === block.answeredOptionId)?.label ?? block.answeredOptionId}
            </span>
          )}
        </div>
      );
    case 'confirmation_ref':
      return null; // rendered by the pending-turn card while active; historic runs live in the audit page
    case 'attachment_ref':
      return (
        <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
          <Paperclip className="h-3 w-3" /> attachment
        </div>
      );
    default:
      return null;
  }
}

function LiveBubble({ live, streaming }: { live: LiveTurn; streaming: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {live.text && <Markdown text={live.text} />}
      {live.tool && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {live.tool.humanStatus}
        </div>
      )}
      {streaming && !live.text && !live.tool && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
        </div>
      )}
      {live.artifacts.map((a) => (
        <ArtifactCard key={a.artifactId} artifactId={a.artifactId} />
      ))}
      {live.error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{live.error}</div>}
    </div>
  );
}

function QuestionChips({
  question,
  disabled,
  onAnswer,
}: {
  question: { pendingTurnId: string; question: string; options: { id: string; label: string }[] };
  disabled?: boolean;
  onAnswer: (pendingTurnId: string, optionId: string) => void;
}) {
  return (
    <Card className="border-primary/30 p-4">
      <p className="mb-3 text-sm font-medium text-text-primary">{question.question}</p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((o) => (
          <Button key={o.id} variant="outline" size="sm" disabled={disabled} onClick={() => onAnswer(question.pendingTurnId, o.id)}>
            {o.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ConfirmationCard({
  runId,
  card,
  onConfirm,
  onReject,
}: {
  runId: string;
  card: Record<string, unknown>;
  onConfirm: (runId: string) => void;
  onReject: (runId: string) => void;
}) {
  const impact = (card.impact ?? {}) as Record<string, unknown>;
  const changes = (impact.dataChanges ?? null) as { after?: Record<string, unknown> } | null;
  return (
    <Card className="border-warning/40 p-4">
      <p className="text-sm font-semibold text-text-primary">Confirm this action</p>
      <p className="mt-1 text-sm text-text-secondary">{String(card.summary ?? impact.summary ?? 'Petros wants to make a change.')}</p>
      {changes?.after && (
        <table className="mt-3 w-full text-xs">
          <tbody>
            {Object.entries(changes.after).map(([k, v]) => (
              <tr key={k} className="border-t border-border">
                <td className="py-1 pr-3 font-medium text-text-muted">{k}</td>
                <td className="py-1 text-text-primary">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => onConfirm(runId)}>
          <Check className="h-4 w-4" /> Confirm
        </Button>
        <Button size="sm" variant="outline" onClick={() => onReject(runId)}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>
    </Card>
  );
}

/** PDF: download link. Chart SVG: sanitized inline render (server-drawn, no scripts). */
function ArtifactCard({ artifactId }: { artifactId: string }) {
  const client = usePortalClient();
  const { scope } = useScope();
  const [meta, setMeta] = useState<{ kind: string; title: string; meta: Record<string, unknown> } | null>(null);
  useEffect(() => {
    let alive = true;
    client
      .get<{ kind: string; title: string; meta: Record<string, unknown> }>(`/portal/petros/artifacts/${artifactId}`, scope)
      .then((m) => alive && setMeta(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [artifactId, client, scope]);
  if (!meta) return <Skeleton className="h-16 max-w-sm" />;
  if (meta.kind === 'chart_svg' && typeof meta.meta.svg === 'string') {
    const svg = meta.meta.svg.includes('<script') ? '' : meta.meta.svg;
    return (
      <Card className="max-w-xl p-3">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </Card>
    );
  }
  return (
    <a
      href={client.fileUrl(`/portal/petros/artifacts/${artifactId}/download`)}
      className="inline-flex max-w-sm items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary transition-colors hover:border-primary"
    >
      <FileText className="h-5 w-5 text-primary" />
      <span className="truncate">{meta.title}</span>
      <span className="ml-auto text-xs text-text-muted">{meta.kind === 'document_pdf' ? 'PDF' : meta.kind}</span>
    </a>
  );
}
