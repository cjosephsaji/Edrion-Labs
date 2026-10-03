import type { PetrosQueuedNote } from '@edrion/schemas';

const DATABASE = 'edrion-student-private-work-v1';
const VERSION = 1;
const NOTES = 'queued-notes';
const META = 'owner-meta';
const JOURNEYS = 'journey-cache';
const MAX_QUEUED_NOTES_PER_OWNER = 50;

type QueueMeta = { ownerKey: string; deviceId: string; sequence: number };
type CachedJourney = {
  id: string;
  version: number;
  source: { sourceVersion: string };
  policyVersion: string;
  returnPoint: { sessionId: string; blockId: string | null; workspace: { blockId: string; checkpointId: string; programRevision: number; experimentVersion: number; draftVersion: number; branchId: string } | null };
  workspace: { blockId: string; checkpointId: string; programRevision: number; experimentVersion: number; draftVersion: number; branchId: string } | null;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Durable browser storage is unavailable.'));
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES)) {
        const store = db.createObjectStore(NOTES, { keyPath: 'commandId' });
        store.createIndex('ownerKey', 'ownerKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'ownerKey' });
      if (!db.objectStoreNames.contains(JOURNEYS)) db.createObjectStore(JOURNEYS, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open durable browser storage.'));
    request.onblocked = () => reject(new Error('Browser storage update is blocked by another open tab.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage transaction was cancelled.'));
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function hashQueuedPayload(payload: PetrosQueuedNote['payload']) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(payload)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function ownerQueueKey(owner: PetrosQueuedNote['owner']) {
  return `${owner.institutionId}:${owner.studentId}`;
}

export async function saveQueuedNote(owner: PetrosQueuedNote['owner'], note: Omit<PetrosQueuedNote, 'owner' | 'deviceId' | 'sequence' | 'payloadHash'>) {
  const payloadHash = await hashQueuedPayload(note.payload);
  const db = await openDatabase();
  const ownerKey = ownerQueueKey(owner);
  const transaction = db.transaction([NOTES, META], 'readwrite');
  const done = transactionDone(transaction);
  const notes = transaction.objectStore(NOTES);
  const metaStore = transaction.objectStore(META);
  let queued: PetrosQueuedNote & { ownerKey: string };
  try { queued = await new Promise<PetrosQueuedNote & { ownerKey: string }>((resolve, reject) => {
    const request = metaStore.get(ownerKey);
    request.onerror = () => reject(request.error ?? new Error('Could not read private note queue metadata.'));
    request.onsuccess = () => {
      try {
        const previous = request.result as QueueMeta | undefined;
        const meta: QueueMeta = previous ?? { ownerKey, deviceId: crypto.randomUUID(), sequence: 0 };
        const countRequest = notes.index('ownerKey').count(ownerKey);
        countRequest.onerror = () => reject(countRequest.error ?? new Error('Could not count queued notes.'));
        countRequest.onsuccess = () => {
          if (countRequest.result >= MAX_QUEUED_NOTES_PER_OWNER) {
            reject(new Error('The private note queue is full. Reconnect and reconcile saved notes before adding another.'));
            transaction.abort();
            return;
          }
          const sequence = meta.sequence + 1;
          const item: PetrosQueuedNote & { ownerKey: string } = {
            ...note,
            owner,
            deviceId: meta.deviceId,
            sequence,
            payloadHash,
            ownerKey,
          };
          metaStore.put({ ...meta, sequence });
          notes.put(item);
          resolve(item);
        };
      } catch (error) { reject(error); }
    };
  }); } catch (error) {
    await done.catch(() => undefined);
    db.close();
    throw error;
  }
  await done;
  db.close();
  return queued;
}

export async function listQueuedNotes(owner: PetrosQueuedNote['owner']): Promise<PetrosQueuedNote[]> {
  const db = await openDatabase();
  const transaction = db.transaction(NOTES, 'readonly');
  const rows = await requestResult(transaction.objectStore(NOTES).index('ownerKey').getAll(ownerQueueKey(owner))) as Array<PetrosQueuedNote & { ownerKey: string }>;
  await transactionDone(transaction);
  db.close();
  return rows.sort((left, right) => left.sequence - right.sequence).map(({ ownerKey: _ownerKey, ...note }) => note);
}

export async function removeQueuedNotes(commandIds: string[]) {
  if (!commandIds.length) return;
  const db = await openDatabase();
  const transaction = db.transaction(NOTES, 'readwrite');
  const store = transaction.objectStore(NOTES);
  commandIds.forEach((id) => store.delete(id));
  await transactionDone(transaction);
  db.close();
}

export async function clearQueuedNotes() {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  const transaction = db.transaction([NOTES, META, JOURNEYS], 'readwrite');
  transaction.objectStore(NOTES).clear();
  transaction.objectStore(META).clear();
  transaction.objectStore(JOURNEYS).clear();
  await transactionDone(transaction);
  db.close();
}

export async function cacheJourneyForOwner(owner: PetrosQueuedNote['owner'], journey: unknown) {
  const safeJourney = sanitizeCachedJourney(journey);
  const db = await openDatabase();
  const transaction = db.transaction(JOURNEYS, 'readwrite');
  transaction.objectStore(JOURNEYS).put({ key: ownerQueueKey(owner), journey: safeJourney });
  await transactionDone(transaction);
  db.close();
}

export function sanitizeCachedJourney(raw: unknown): CachedJourney {
  const journey = raw as {
    id?: unknown; version?: unknown; source?: { sourceVersion?: unknown };
    policyVersion?: unknown; returnPoint?: { sessionId?: unknown; blockId?: unknown; workspace?: unknown };
    workspace?: unknown;
  } | null;
  const workspaceRaw = journey?.workspace ?? journey?.returnPoint?.workspace;
  const workspace = workspaceRaw && typeof workspaceRaw === 'object'
    ? workspaceRaw as Record<string, unknown> : null;
  const sourceVersion = journey?.source?.sourceVersion;
  const sessionId = journey?.returnPoint?.sessionId;
  const branchId = workspace?.branchId;
  const metadata = workspace && typeof workspace.blockId === 'string' && typeof workspace.checkpointId === 'string'
    && Number.isInteger(workspace.programRevision) && Number.isInteger(workspace.experimentVersion)
    && Number.isInteger(workspace.draftVersion) && typeof branchId === 'string'
    ? { blockId: workspace.blockId, checkpointId: workspace.checkpointId, programRevision: workspace.programRevision as number,
        experimentVersion: workspace.experimentVersion as number, draftVersion: workspace.draftVersion as number, branchId }
    : null;
  if (typeof journey?.id !== 'string' || !Number.isInteger(journey.version) || typeof sourceVersion !== 'string'
    || typeof journey.policyVersion !== 'string' || typeof sessionId !== 'string' || !metadata)
    throw new Error('A current, versioned workspace return point is unavailable for private note recovery.');
  return {
    id: journey.id,
    version: journey.version as number,
    source: { sourceVersion },
    policyVersion: journey.policyVersion,
    returnPoint: { sessionId, blockId: typeof journey.returnPoint?.blockId === 'string' ? journey.returnPoint.blockId : null, workspace: metadata },
    workspace: metadata,
  };
}

export async function readCachedJourney(owner: PetrosQueuedNote['owner'], journeyId?: string) {
  const db = await openDatabase();
  const transaction = db.transaction(JOURNEYS, 'readonly');
  const store = transaction.objectStore(JOURNEYS);
  const row = await requestResult(store.get(ownerQueueKey(owner))) as { journey?: unknown } | undefined;
  await transactionDone(transaction);
  db.close();
  const journey = row?.journey as { id?: string } | undefined;
  return journeyId && journey?.id !== journeyId ? null : journey ?? null;
}

export async function clearQueuedNotesForOwner(owner: PetrosQueuedNote['owner']) {
  const db = await openDatabase();
  const transaction = db.transaction([NOTES, META, JOURNEYS], 'readwrite');
  const notes = transaction.objectStore(NOTES);
  const index = transaction.objectStore(NOTES).index('ownerKey');
  const request = index.openKeyCursor(IDBKeyRange.only(ownerQueueKey(owner)));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    notes.delete(cursor.primaryKey);
    cursor.continue();
  };
  transaction.objectStore(META).delete(ownerQueueKey(owner));
  const journeyCursor = transaction.objectStore(JOURNEYS).openCursor();
  journeyCursor.onsuccess = () => {
    const cursor = journeyCursor.result;
    if (!cursor) return;
    if (String(cursor.key) === ownerQueueKey(owner)) cursor.delete();
    cursor.continue();
  };
  await transactionDone(transaction);
  db.close();
}
