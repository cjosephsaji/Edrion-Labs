'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useThreadPostMutations, useThreadPosts } from '@/lib/messages';
import type { MessageThreadRow } from '@/lib/messaging-types';
import { PortalClientError } from '@/lib/portal-client';

const SENDER_TYPES = [
  { value: 'staff', label: 'Staff' },
  { value: 'parent', label: 'Parent' },
  { value: 'student', label: 'Student' },
  { value: 'system', label: 'System' },
];

/**
 * The messages within a thread (the messaging line items). The single `messages.use` key gates reading
 * and posting — the API re-checks. Mirrors the exam-papers drawer (a CRUD list).
 */
export function ThreadPostsDrawer({
  thread,
  open,
  onClose,
}: {
  thread: MessageThreadRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('messages.use');
  const { data: posts, isLoading } = useThreadPosts(open ? thread?.id ?? null : null);
  const { create, remove } = useThreadPostMutations(thread?.id ?? '');

  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [senderType, setSenderType] = useState('staff');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBody('');
    setAuthorName('');
    setSenderType('staff');
  }

  async function add() {
    if (!body.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({ body, authorName: authorName || null, senderType });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not post the message.');
    }
  }

  async function drop(id: string, version: number) {
    setError(null);
    try {
      await remove.mutateAsync({ id, version });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the message.');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Messages" description={thread?.subject ?? ''}>
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div>
              <Label htmlFor="post-body">Message</Label>
              <textarea
                id="post-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a message…"
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="post-author">Author</Label>
                <Input id="post-author" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label htmlFor="post-sender">Sender</Label>
                <Select
                  id="post-sender"
                  value={senderType}
                  onChange={(e) => setSenderType(e.target.value)}
                  options={SENDER_TYPES}
                />
              </div>
            </div>
            <Button onClick={add} loading={create.isPending} disabled={!body.trim()}>
              Post message
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (posts ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No messages in this thread yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(posts ?? []).map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{p.body}</p>
                  <p className="truncate text-xs text-text-muted">
                    {[p.authorName ?? p.senderType, p.postedDate].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove message"
                    onClick={() => drop(p.id, p.version)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
