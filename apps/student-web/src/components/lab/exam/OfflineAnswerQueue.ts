import type { SaveExamAnswerInput } from '@edrion/schemas';

/**
 * localStorage-backed durable queue for exam answer saves. When a PUT fails
 * (offline / server hiccup) the answer is enqueued and flushed on reconnect.
 * Keyed per exam so concurrent attempts never collide.
 */

export type QueuedAnswer = {
  questionId: string;
  body: SaveExamAnswerInput;
  enqueuedAt: string;
};

type SaveFn = (questionId: string, body: SaveExamAnswerInput) => Promise<void>;

const keyFor = (examId: string) => `edrion:exam:${examId}:answer-queue`;

function read(examId: string): QueuedAnswer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(keyFor(examId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedAnswer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(examId: string, items: QueuedAnswer[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (items.length === 0) window.localStorage.removeItem(keyFor(examId));
    else window.localStorage.setItem(keyFor(examId), JSON.stringify(items));
  } catch {
    /* storage full / unavailable — best effort */
  }
}

export class OfflineAnswerQueue {
  private flushing = false;

  constructor(
    private readonly examId: string,
    private readonly save: SaveFn,
  ) {}

  get size(): number {
    return read(this.examId).length;
  }

  /** Replace the queued entry for a question (latest answer wins). */
  enqueue(questionId: string, body: SaveExamAnswerInput): void {
    const items = read(this.examId).filter((q) => q.questionId !== questionId);
    items.push({ questionId, body, enqueuedAt: new Date().toISOString() });
    write(this.examId, items);
  }

  /** Attempt to flush all queued saves. Returns the number still pending afterwards. */
  async flush(): Promise<number> {
    if (this.flushing) return this.size;
    this.flushing = true;
    try {
      let items = read(this.examId);
      for (const item of [...items]) {
        try {
          await this.save(item.questionId, item.body);
          items = items.filter((q) => q.questionId !== item.questionId);
          write(this.examId, items);
        } catch {
          break; // still offline — keep the rest for the next flush
        }
      }
      return read(this.examId).length;
    } finally {
      this.flushing = false;
    }
  }

  clear(): void {
    write(this.examId, []);
  }
}
