'use client';

import { useEffect, useState } from 'react';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

type BlueprintRow = {
  id: string;
  blueprint: { title: string; durationMin: number };
  skin: string;
  isPublished: boolean;
  version: number;
};

export default function MockBlueprintsPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const [items, setItems] = useState<BlueprintRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void client
      .get<{ items: BlueprintRow[] }>('/lab/blueprints', scope)
      .then((r) => setItems(r.items ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client, scope]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Mock exam blueprints</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Publish your institution&apos;s real exam pattern — students practice in the exact format
        they&apos;ll face.
      </p>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <ul className="mt-6 divide-y border-t">
        {items.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{b.blueprint.title}</p>
              <p className="text-xs text-neutral-500">
                {b.skin} · v{b.version} · {b.blueprint.durationMin} min
              </p>
            </div>
            <span
              className={
                b.isPublished
                  ? 'rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800'
                  : 'rounded bg-neutral-100 px-2 py-0.5 text-xs'
              }
            >
              {b.isPublished ? 'Published' : 'Draft'}
            </span>
          </li>
        ))}
        {!items.length && !error && (
          <li className="py-8 text-sm text-neutral-500">No blueprints yet.</li>
        )}
      </ul>
    </div>
  );
}
