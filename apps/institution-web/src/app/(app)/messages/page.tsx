'use client';
import { useMemo, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ThreadPostsDrawer } from '@/components/messages/thread-posts-drawer';
import { useMessagesList, useMessagesMutations } from '@/lib/messages';
import type { MessageThreadRow } from '@/lib/messaging-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'messages.use',
  create: 'messages.use',
  update: 'messages.use',
  delete: 'messages.use',
};

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function MessagesPage() {
  const [postsFor, setPostsFor] = useState<MessageThreadRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'e.g. Year 5 parent group' },
      { name: 'referenceCode', label: 'Reference code', type: 'text', required: true, placeholder: 'e.g. MSG-2026-001' },
      { name: 'category', label: 'Category', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<MessageThreadRow>[]>(
    () => [
      { key: 'subject', header: 'Subject', sortable: true, render: (r) => <span className="font-medium">{r.subject}</span> },
      { key: 'referenceCode', header: 'Code', sortable: true, render: (r) => <span className="tabular-nums">{r.referenceCode}</span> },
      { key: 'postCount', header: 'Messages', align: 'right', render: (r) => <span className="tabular-nums">{r.postCount}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<MessageThreadRow>
        resource="messages/threads"
        title="Messages"
        noun="thread"
        columns={columns}
        fields={fields}
        defaultSortBy="createdAt"
        defaultSortDir="desc"
        permissions={PERMISSIONS}
        useList={useMessagesList}
        useMutations={useMessagesMutations}
        rowLabel={(r) => r.subject}
        toFormValues={(r) => ({
          subject: r.subject,
          referenceCode: r.referenceCode,
          category: r.category ?? '',
          status: r.status,
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Messages"
            title="Messages"
            onClick={() => setPostsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <MessagesSquare className="h-4 w-4" />
          </button>
        )}
      />

      <ThreadPostsDrawer thread={postsFor} open={!!postsFor} onClose={() => setPostsFor(null)} />
    </>
  );
}
