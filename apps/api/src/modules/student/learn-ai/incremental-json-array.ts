/**
 * Incrementally extracts complete JSON objects from a streaming array field
 * (e.g. `{"blocks":[{...},{...}]}`) without waiting for the full response.
 */
export class IncrementalJsonArrayParser {
  private buffer = '';
  private scanFrom = 0;
  private arrayStart: number | null = null;
  private emitted = 0;

  constructor(private readonly arrayKey: string) {}

  /** Feed a text delta; returns any newly completed array elements (raw JSON strings). */
  feed(chunk: string): string[] {
    if (!chunk) return [];
    this.buffer += chunk;
    if (this.arrayStart === null) {
      const marker = `"${this.arrayKey}"`;
      const keyIdx = this.buffer.indexOf(marker);
      if (keyIdx === -1) return [];
      const bracketIdx = this.buffer.indexOf('[', keyIdx + marker.length);
      if (bracketIdx === -1) return [];
      this.arrayStart = bracketIdx + 1;
      this.scanFrom = this.arrayStart;
    }
    return this.drainCompleteObjects();
  }

  private drainCompleteObjects(): string[] {
    const out: string[] = [];
    if (this.arrayStart === null) return out;

    let i = this.scanFrom;
    while (i < this.buffer.length) {
      while (i < this.buffer.length && /[\s,]/.test(this.buffer[i]!)) i += 1;
      if (i >= this.buffer.length) break;
      if (this.buffer[i] === ']') break;
      if (this.buffer[i] !== '{') break;

      const end = findBalancedObjectEnd(this.buffer, i);
      if (end === -1) break;

      const raw = this.buffer.slice(i, end + 1);
      out.push(raw);
      this.emitted += 1;
      i = end + 1;
      this.scanFrom = i;
    }
    return out;
  }
}

/** Returns the index of the closing `}` for an object starting at `start`, or -1 if incomplete. */
export function findBalancedObjectEnd(text: string, start: number): number {
  if (text[start] !== '{') return -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
