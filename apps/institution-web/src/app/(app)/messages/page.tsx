'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BellOff,
  Bell,
  Download,
  Info,
  Mic,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  Square,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { Button, PermissionDenied } from '@edrion/ui';
import { usePortalClient } from '@/lib/portal-client';
import { Topbar } from '@/components/app-shell/topbar';
import { EntityRef } from '@/components/common/entity-ref';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { NewConversationDrawer } from '@/components/messaging/new-conversation-drawer';
import { usePermissions } from '@/lib/permissions';
import {
  useConversations,
  useConversation,
  useMessages,
  useConversationMutations,
  type ConversationSummary,
  type MessageDto,
} from '@/lib/conversations';
import type { Target } from '@/lib/recipients';

type Filter = 'all' | 'unread' | 'archived';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'archived', label: 'Archived' },
];

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

export default function MessagesPage() {
  const { can } = usePermissions();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const conversations = useConversations(filter, search);
  const active = useConversation(activeId);
  const messages = useMessages(activeId);
  const mut = useConversationMutations();

  // Mark read whenever a conversation is opened / gains messages.
  useEffect(() => {
    if (activeId) mut.markRead.mutate(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messages.data?.length]);

  // If the sidebar preview already shows a newer message, pull the thread immediately.
  useEffect(() => {
    if (!activeId) return;
    const summary = conversations.data?.items.find((c) => c.id === activeId);
    if (!summary?.lastMessageAt) return;
    const latest = messages.data?.at(-1)?.createdAt;
    if (!latest || new Date(summary.lastMessageAt).getTime() > new Date(latest).getTime()) {
      void messages.refetch();
    }
  }, [activeId, conversations.data?.items, messages.data, messages.refetch]);

  useEffect(() => { setReplyTo(null); }, [activeId]);

  if (!can('messages.use')) {
    return (
      <>
        <Topbar title="Messages" />
        <div className="p-6"><PermissionDenied description="You don’t have permission to use messages." /></div>
      </>
    );
  }

  const items = conversations.data?.items ?? [];

  return (
    <>
      <Topbar
        title="Messages"
        actions={<Button size="sm" onClick={() => setComposing(true)}><Plus className="h-4 w-4" />New</Button>}
      />
      <div className="page-enter flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-text-muted focus:border-border-strong"
              />
            </div>
            <div className="mt-2 flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-background-secondary text-text-secondary hover:text-text-primary')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-text-muted">{conversations.isLoading ? 'Loading…' : 'No conversations.'}</p>
            ) : (
              items.map((c) => <ConversationRow key={c.id} conv={c} active={c.id === activeId} onClick={() => { setActiveId(c.id); setShowInfo(false); }} />)
            )}
          </div>
        </aside>

        {/* Message pane */}
        <section className="flex min-w-0 flex-1 flex-col">
          {!active.data ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Select a conversation, or start a new one.</div>
          ) : (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-text-primary">{active.data.name}</p>
                  <p className="truncate text-xs text-text-muted">
                    {active.data.participantCount} participant{active.data.participantCount === 1 ? '' : 's'}
                    {active.data.closed && ' · Closed'}
                    {active.data.archived && ' · Archived'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn label={active.data.muted ? 'Unmute' : 'Mute'} onClick={() => mut.update.mutate({ id: active.data!.id, body: { muted: !active.data!.muted } })}>
                    {active.data.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </IconBtn>
                  <IconBtn label={active.data.archived ? 'Unarchive' : 'Archive'} onClick={() => mut.update.mutate({ id: active.data!.id, body: { archived: !active.data!.archived } })}>
                    <Archive className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label={active.data.closed ? 'Reopen' : 'Close'} onClick={() => mut.update.mutate({ id: active.data!.id, body: { closed: !active.data!.closed } })}>
                    <XCircle className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Details" onClick={() => setShowInfo((v) => !v)}><Info className="h-4 w-4" /></IconBtn>
                </div>
              </header>

              <MessageList key={active.data.id} conversationId={active.data.id} messages={messages.data ?? []} loading={messages.isLoading} onReply={(id) => setReplyTo(id)} />
              <Composer
                disabled={active.data.closed}
                onSend={async (body, replyToId, files) => {
                  const cid = active.data!.id;
                  const msg = await mut.send.mutateAsync({ id: cid, body, replyToId });
                  for (const file of files ?? []) {
                    await mut.uploadAttachment.mutateAsync({ id: cid, messageId: msg.id, file });
                  }
                  setReplyTo(null);
                }}
                sending={mut.send.isPending || mut.uploadAttachment.isPending}
                messages={messages.data ?? []}
                replyTo={replyTo}
                onClearReply={() => setReplyTo(null)}
              />
            </>
          )}
        </section>

        {/* Info panel */}
        {active.data && showInfo && (
          <InfoPanel conv={active.data} onClose={() => setShowInfo(false)} />
        )}
      </div>

      <NewConversationDrawer open={composing} onClose={() => setComposing(false)} onCreated={(id) => { setComposing(false); setActiveId(id); }} />
    </>
  );
}

function ConversationRow({ conv, active, onClick }: { conv: ConversationSummary; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors ' + (active ? 'bg-background-secondary' : 'hover:bg-background-secondary')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-text-primary">{conv.name}</span>
        {conv.lastMessageAt && <span className="shrink-0 text-[11px] text-text-muted">{day(conv.lastMessageAt)}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-text-muted">{conv.lastMessage?.body ?? (conv.isGroup ? 'Group' : 'Direct')}</span>
        {conv.unreadCount > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{conv.unreadCount}</span>}
      </div>
    </button>
  );
}

function MessageList({ conversationId, messages, loading, onReply }: { conversationId: string; messages: MessageDto[]; loading: boolean; onReply: (id: string) => void }) {
  const client = usePortalClient();
  const attachmentUrl = (attachmentId: string) => client.fileUrl(`/portal/conversations/${conversationId}/attachments/${attachmentId}`);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  return (
    <div key={conversationId} className="chat-open flex-1 space-y-3 overflow-y-auto bg-background-secondary/30 p-4">
      {loading && <p className="text-sm text-text-muted">Loading messages…</p>}
      {!loading && messages.length === 0 && <p className="text-sm text-text-muted">No messages yet. Say hello.</p>}
      {messages.map((m) => {
        const reply = m.replyToId ? byId.get(m.replyToId) : undefined;
        return (
          <div key={m.id} className={'message-in group flex items-center gap-1 ' + (m.mine ? 'justify-end' : 'justify-start')}>
            {m.mine && (
              <button aria-label="Reply" title="Reply" onClick={() => onReply(m.id)} className="opacity-0 transition-opacity group-hover:opacity-100"><Reply className="h-3.5 w-3.5 text-text-muted" /></button>
            )}
            <div className={'max-w-[70%] rounded-lg px-3 py-2 text-sm ' + (m.mine ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated border border-border text-text-primary')}>
              {!m.mine && <p className="mb-0.5 text-xs font-semibold opacity-80">{m.senderName}</p>}
              {reply && (
                <p className={'mb-1 border-l-2 pl-2 text-xs ' + (m.mine ? 'border-primary-foreground/40 opacity-80' : 'border-border text-text-muted')}>
                  {reply.senderName}: {reply.body.slice(0, 80)}
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.attachments.map((a) =>
                    !a.ready ? (
                      <span key={a.id} className="inline-flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 text-[11px]">
                        <Paperclip className="h-3 w-3" />{a.fileName} (pending)
                      </span>
                    ) : a.contentType?.startsWith('audio/') ? (
                      <audio key={a.id} controls preload="none" src={attachmentUrl(a.id)} className="h-9 w-56 max-w-full" onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <a
                        key={a.id}
                        href={attachmentUrl(a.id)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 text-[11px] hover:underline"
                        title={`Download ${a.fileName}`}
                      >
                        <Download className="h-3 w-3" />{a.fileName}
                      </a>
                    ),
                  )}
                </div>
              )}
              <p className={'mt-0.5 text-right text-[10px] ' + (m.mine ? 'text-primary-foreground/70' : 'text-text-muted')}>
                {time(m.createdAt)}{m.mine && (m.readByOthers ? ' · Read' : ' · Sent')}
              </p>
            </div>
            {!m.mine && (
              <button aria-label="Reply" title="Reply" onClick={() => onReply(m.id)} className="opacity-0 transition-opacity group-hover:opacity-100"><Reply className="h-3.5 w-3.5 text-text-muted" /></button>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function Composer({ onSend, sending, disabled, messages, replyTo, onClearReply }: { onSend: (body: string, replyToId?: string | null, files?: File[]) => void | Promise<void>; sending: boolean; disabled?: boolean; messages: MessageDto[]; replyTo: string | null; onClearReply: () => void }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const replyMsg = replyTo ? messages.find((m) => m.id === replyTo) : undefined;
  const canSend = !disabled && !sending && (text.trim().length > 0 || files.length > 0);

  // --- voice recording (MediaRecorder → a File appended to the same upload pipeline) ----------
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  useEffect(() => () => stopTracks(), []);

  function pickMime(): string {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return '';
    return cands.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
  }
  async function startRecording() {
    setRecError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecError('Voice recording isn’t supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: type.split(';')[0] });
        stopTracks();
        setRecording(false);
        if (blob.size > 0) setFiles((prev) => [...prev, new File([blob], `voice-${Date.now()}.${ext}`, { type: type.split(';')[0] })]);
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setRecError('Microphone access was blocked.');
      stopTracks();
    }
  }
  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }
  function cancelRecording() {
    const mr = recorderRef.current;
    if (mr) {
      mr.onstop = () => stopTracks(); // discard: no file appended
      if (mr.state !== 'inactive') mr.stop();
    }
    chunksRef.current = [];
    setRecording(false);
  }
  const recClock = `${Math.floor(recSecs / 60)}:${String(recSecs % 60).padStart(2, '0')}`;

  async function submit() {
    if (!canSend) return;
    // Body is required server-side; fall back to a summary when only files were attached.
    const body = text.trim() || `Sent ${files.length} attachment${files.length > 1 ? 's' : ''}`;
    const toSend = files;
    setText('');
    setFiles([]);
    await onSend(body, replyTo, toSend);
  }
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length) setFiles((prev) => [...prev, ...chosen]);
    e.target.value = ''; // allow re-picking the same file
  }
  return (
    <div className="border-t border-border p-3">
      {replyMsg && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-background-secondary px-2 py-1 text-xs text-text-secondary">
          <span className="truncate"><Reply className="mr-1 inline h-3 w-3" />Replying to {replyMsg.senderName}: {replyMsg.body.slice(0, 60)}</span>
          <button onClick={onClearReply} aria-label="Cancel reply"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded bg-background-secondary px-2 py-1 text-xs text-text-secondary">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {recError && <p className="mb-1 text-xs text-danger">{recError}</p>}
      {recording ? (
        <div className="flex items-center gap-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
          <span className="rec-pulse h-2.5 w-2.5 rounded-full bg-danger" />
          <span className="text-sm font-medium tabular-nums text-text-primary">Recording… {recClock}</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={cancelRecording} aria-label="Discard recording" title="Discard" className="text-text-muted transition-colors hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
            <Button size="sm" onClick={stopRecording}><Square className="h-4 w-4" /> Stop</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" multiple hidden onChange={pick} />
          <button
            type="button"
            title="Attach files"
            aria-label="Attach files"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
            className="mb-1 text-text-muted transition-colors hover:text-primary disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Record voice message"
            aria-label="Record voice message"
            disabled={disabled}
            onClick={startRecording}
            className="mb-1 text-text-muted transition-colors hover:text-primary disabled:opacity-50"
          >
            <Mic className="h-5 w-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? 'This conversation is closed' : 'Type a message… (Enter to send)'}
            className="max-h-32 flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-text-muted focus:border-border-strong disabled:opacity-50"
          />
          <Button size="sm" onClick={submit} loading={sending} disabled={!canSend}><Send className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

function InfoPanel({ conv, onClose }: { conv: ConversationSummary; onClose: () => void }) {
  const mut = useConversationMutations();
  const [adding, setAdding] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [width, setWidth] = useState(360);
  const resizing = useRef(false);

  const alreadyAddedKeys = useMemo(
    () => new Set(conv.participants.map((p) => `${p.participantType}:${p.participantId}`)),
    [conv.participants],
  );

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing.current) return;
      const next = Math.min(640, Math.max(280, window.innerWidth - e.clientX));
      setWidth(next);
    }
    function onUp() {
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-border" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details panel"
        onMouseDown={startResize}
        className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
      />
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-semibold text-text-primary">Details</span>
        <button onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-text-muted" /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{conv.participantCount} participants</p>
        <ul className="flex flex-col gap-2">
          {conv.participants.map((p) => (
            <li key={`${p.participantType}:${p.participantId}`} className="flex items-center justify-between gap-2">
              <EntityRef entity={{ id: p.participantId, label: p.label, sub: p.sub }} />
              {p.participantType !== 'user' && (
                <button aria-label="Remove" onClick={() => mut.removeParticipant.mutate({ id: conv.id, type: p.participantType, pid: p.participantId })} className="text-text-muted hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4">
          {!adding ? (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add participants</Button>
          ) : (
            <div className="flex flex-col gap-2">
              <RecipientPicker value={targets} onChange={setTargets} messaging alreadyAddedKeys={alreadyAddedKeys} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setAdding(false); setTargets([]); }}>Cancel</Button>
                <Button size="sm" loading={mut.addParticipants.isPending} disabled={targets.length === 0} onClick={async () => { await mut.addParticipants.mutateAsync({ id: conv.id, targets }); setAdding(false); setTargets([]); }}>Add</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary">
      {children}
    </button>
  );
}
