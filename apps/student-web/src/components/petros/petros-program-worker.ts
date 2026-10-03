/// <reference lib="webworker" />

import {
  boundEngineInput,
  createEngineViewEvaluator,
  engineSnapshotSchema,
} from '@edrion/schemas';

type Request = { id: number; snapshot: unknown; time: number };
let cached: { key: string; evaluate: ReturnType<typeof createEngineViewEvaluator> } | null = null;

self.onmessage = (event: MessageEvent<Request>) => {
  const id = event.data?.id;
  try {
    boundEngineInput(event.data);
    if (!event.data || Object.keys(event.data).sort().join(',') !== 'id,snapshot,time')
      throw new Error('Invalid worker request');
    if (!Number.isSafeInteger(id) || id < 0 || !Number.isFinite(event.data.time))
      throw new Error('Invalid worker request');
    const snapshot = engineSnapshotSchema.parse(event.data.snapshot);
    // A full pinned wire identity prevents stale results after a branch, draft or parameter change.
    const key = JSON.stringify(snapshot);
    if (cached?.key !== key) cached = { key, evaluate: createEngineViewEvaluator(snapshot) };
    const result = cached.evaluate(event.data.time);
    // Resolved optional fields can be undefined; worker messages use the JSON wire shape.
    self.postMessage({ id, ok: true, snapshot: result.snapshot, views: JSON.parse(JSON.stringify(result.views)) });
  } catch (error) {
    self.postMessage({ id: Number.isSafeInteger(id) ? id : -1, ok: false,
      error: error instanceof Error ? error.message.slice(0, 180) : 'Unable to evaluate scene' });
  }
};
