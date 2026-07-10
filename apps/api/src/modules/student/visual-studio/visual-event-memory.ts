/** Process-local fallback when REDIS_ENABLED=false (local dev without Redis). */

type MemoryEntry = { value: string; expiresAt: number };

export class VisualEventMemory {
  private readonly kv = new Map<string, MemoryEntry>();
  private readonly lists = new Map<string, { items: string[]; expiresAt: number }>();

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.kv) {
      if (entry.expiresAt <= now) this.kv.delete(key);
    }
    for (const [key, entry] of this.lists) {
      if (entry.expiresAt <= now) this.lists.delete(key);
    }
  }

  get(key: string): string | null {
    this.purgeExpired();
    const entry = this.kv.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.kv.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds: number): void {
    this.kv.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  del(key: string): void {
    this.kv.delete(key);
    this.lists.delete(key);
  }

  incr(key: string, ttlSeconds: number): number {
    const current = Number(this.get(key) ?? '0');
    const next = current + 1;
    this.set(key, String(next), ttlSeconds);
    return next;
  }

  getInt(key: string): number | null {
    const raw = this.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  listAppend(key: string, value: unknown, ttlSeconds: number): number {
    this.purgeExpired();
    const serialized = JSON.stringify(value);
    const existing = this.lists.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      existing.items.push(serialized);
      existing.expiresAt = Date.now() + ttlSeconds * 1000;
      return existing.items.length;
    }
    this.lists.set(key, {
      items: [serialized],
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return 1;
  }

  listRange(key: string, start: number, end: number): unknown[] {
    this.purgeExpired();
    const entry = this.lists.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return [];
    const slice = entry.items.slice(start, end < 0 ? undefined : end + 1);
    return slice.map((row) => {
      try {
        return JSON.parse(row) as unknown;
      } catch {
        return row;
      }
    });
  }

  expire(key: string, ttlSeconds: number): void {
    const value = this.get(key);
    if (value !== null) this.set(key, value, ttlSeconds);
  }
}
