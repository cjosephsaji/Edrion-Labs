'use client';
import { useState } from 'react';
import { Button, Drawer, Input, Label } from '@edrion/ui';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { useConversationMutations } from '@/lib/conversations';
import type { Target } from '@/lib/recipients';

/**
 * Start a new conversation: choose participants via the recipient targeting model (an individual for
 * a direct chat, or any mix/derived group for a group chat), optionally name the group, and send an
 * opening message. Reuses {@link RecipientPicker} so "message all parents of Class 5" is one action.
 */
export function NewConversationDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { create } = useConversationMutations();
  const [targets, setTargets] = useState<Target[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTargets([]);
    setTitle('');
    setBody('');
    setError(null);
  }

  async function submit() {
    if (targets.length === 0) {
      setError('Add at least one recipient.');
      return;
    }
    setError(null);
    try {
      const conv = await create.mutateAsync({ targets, title: title.trim() || null, body: body.trim() || null });
      reset();
      onCreated(conv.id);
    } catch {
      setError('Could not start the conversation. Try again.');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New conversation"
      className="sm:max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { reset(); onClose(); }} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Start conversation</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>}
        <div>
          <Label>Participants</Label>
          <div className="mt-1"><RecipientPicker value={targets} onChange={setTargets} /></div>
        </div>
        <div>
          <Label htmlFor="conv-title">Group name (optional)</Label>
          <Input id="conv-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Year 5 parents" />
        </div>
        <div>
          <Label htmlFor="conv-body">First message (optional)</Label>
          <textarea
            id="conv-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Type a message…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
      </div>
    </Drawer>
  );
}
