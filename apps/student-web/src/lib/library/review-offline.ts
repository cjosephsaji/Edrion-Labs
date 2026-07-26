import { createStore, del, get, set } from 'idb-keyval';

const store = createStore('library-review', 'grade-outbox');
const CACHE_KEY = 'session-cache';

export type PendingGrade = {
  client_review_id: string;
  card_id: string;
  grade: 'again' | 'hard' | 'good' | 'easy';
  elapsed_ms: number;
  reviewed_at: string;
};

export type ReviewSessionCache = {
  session_id: string;
  cards: unknown[];
  remaining: number;
  cached_at: string;
};

export async function loadSessionCache(): Promise<ReviewSessionCache | null> {
  return (await get<ReviewSessionCache>(CACHE_KEY, store)) ?? null;
}

export async function saveSessionCache(cache: ReviewSessionCache) {
  await set(CACHE_KEY, cache, store);
}

export async function loadGradeOutbox(): Promise<PendingGrade[]> {
  return (await get<PendingGrade[]>('outbox', store)) ?? [];
}

export async function queueGrade(grade: PendingGrade) {
  const box = await loadGradeOutbox();
  if (box.some((g) => g.client_review_id === grade.client_review_id)) return;
  await set('outbox', [...box, grade], store);
}

export async function removeGrade(clientReviewId: string) {
  const box = await loadGradeOutbox();
  await set(
    'outbox',
    box.filter((g) => g.client_review_id !== clientReviewId),
    store,
  );
}

export async function clearGradeOutbox() {
  await del('outbox', store);
}
