import { describe, expect, it } from 'vitest';
import { IncrementalJsonArrayParser, findBalancedObjectEnd } from './incremental-json-array';

describe('findBalancedObjectEnd', () => {
  it('ignores braces inside strings', () => {
    const text = '{"a":"{not a brace}","b":1}';
    expect(findBalancedObjectEnd(text, 0)).toBe(text.length - 1);
  });
});

describe('IncrementalJsonArrayParser', () => {
  const payload = '{"blocks":[{"id":1,"t":"a"},{"id":2,"t":"b"}],"meta":true}';
  const chunks = ['{"blocks":[', '{"id":1,"t":"a"},', '{"id":2,"t":"b"}]', ',"meta":true}'];

  it('emits elements before the full input completes', () => {
    const parser = new IncrementalJsonArrayParser('blocks');
    const emitted: string[] = [];
    for (const chunk of chunks) {
      emitted.push(...parser.feed(chunk));
    }
    expect(emitted).toHaveLength(2);
    expect(JSON.parse(emitted[0]!)).toEqual({ id: 1, t: 'a' });
    expect(JSON.parse(emitted[1]!)).toEqual({ id: 2, t: 'b' });
  });

  it('handles random chunk boundaries', () => {
    const parser = new IncrementalJsonArrayParser('blocks');
    const emitted: string[] = [];
    for (let i = 0; i < payload.length; i += 7) {
      emitted.push(...parser.feed(payload.slice(i, i + 7)));
    }
    expect(emitted).toHaveLength(2);
    expect(JSON.parse(emitted[1]!)).toEqual({ id: 2, t: 'b' });
  });
});
