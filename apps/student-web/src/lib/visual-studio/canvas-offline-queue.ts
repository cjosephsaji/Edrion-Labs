import { createStore, del, get, set } from 'idb-keyval';
import type { VisualCanvasCreateInput, VisualCanvasPatchInput } from '@edrion/schemas';

const store = createStore('edrion-visual-v1', 'pending');

export type DraftRecord = {
  canvasId: string;
  title: string;
  archetype: string;
  graph: VisualCanvasPatchInput['graph'];
  serverVersion: number;
  updatedAt: string;
};

export type SaveRecord =
  | { kind: 'create'; payload: VisualCanvasCreateInput }
  | { kind: 'patch'; canvasId: string; payload: VisualCanvasPatchInput }
  | { kind: 'revision-queue'; canvasId: string; body: unknown };

export async function writeDraft(record: DraftRecord): Promise<void> {
  await set(`draft:${record.canvasId}`, record, store);
}

export async function readDraft(canvasId: string): Promise<DraftRecord | undefined> {
  return get<DraftRecord>(`draft:${canvasId}`, store);
}

export async function clearDraft(canvasId: string): Promise<void> {
  await del(`draft:${canvasId}`, store);
}

export async function queueSave(canvasId: string, record: SaveRecord): Promise<void> {
  await set(`save:${canvasId}`, record, store);
}

export async function readQueuedSave(canvasId: string): Promise<SaveRecord | undefined> {
  return get<SaveRecord>(`save:${canvasId}`, store);
}

export async function clearQueuedSave(canvasId: string): Promise<void> {
  await del(`save:${canvasId}`, store);
}

export async function queueMutation(clientMutationId: string, payload: unknown): Promise<void> {
  await set(`mutation:${clientMutationId}`, payload, store);
}

export async function readQueuedMutation<T>(clientMutationId: string): Promise<T | undefined> {
  return get<T>(`mutation:${clientMutationId}`, store);
}

export async function clearQueuedMutation(clientMutationId: string): Promise<void> {
  await del(`mutation:${clientMutationId}`, store);
}

export async function queueRevisionQueue(
  canvasId: string,
  body: unknown,
): Promise<void> {
  const key = `revisions:${canvasId}`;
  const existing = (await get<unknown[]>(key, store)) ?? [];
  await set(key, [...existing, body], store);
}

export async function drainRevisionQueue(canvasId: string): Promise<unknown[]> {
  const key = `revisions:${canvasId}`;
  const items = (await get<unknown[]>(key, store)) ?? [];
  await del(key, store);
  return items;
}
