import { describe, expect, it } from 'vitest';
import { audioSeamSchema } from '@edrion/schemas';
import { buildClashMapGraph } from './debate-clash-map.builder';
import { quoteMatchesTranscript, stripInvalidQuotes } from './debate-quote-validator';

describe('debate capture schemas', () => {
  it('validates audio seam chunks', () => {
    const seam = audioSeamSchema.parse({
      chunks: [{ idx: 0, storage_ref: '550e8400-e29b-41d4-a716-446655440000', bytes: 100, started_ms: 0, duration_ms: 5000 }],
    });
    expect(seam.chunks).toHaveLength(1);
  });
});

describe('debate quote validator', () => {
  it('accepts verbatim substring', () => {
    const words = [{ w: 'we', s_ms: 0, e_ms: 200, c: 1 }];
    expect(quoteMatchesTranscript({ verbatim: 'we should ban homework', start_ms: 0, end_ms: 2000 }, 'we should ban homework today', words)).toBe(true);
  });

  it('strips invalid quote refs', () => {
    const items = [{ text: 'fix', quote_ref: { argument_id: 'A1', verbatim: 'fabricated line', start_ms: 0, end_ms: 100 } }];
    const out = stripInvalidQuotes(items, 'real transcript only', []);
    expect(out[0]!.quote_ref).toBeNull();
  });
});

describe('buildClashMapGraph', () => {
  it('stays within node budget', () => {
    const graph = buildClashMapGraph({
      debateRoundId: '550e8400-e29b-41d4-a716-446655440001',
      motionTitle: 'Test motion',
      clashes: [
        {
          id: 'c1',
          title: 'Clash one',
          summary: 'Summary',
          winner: 'tied',
          weight: 1,
          propArgumentRefs: ['A1'],
          oppArgumentRefs: ['B1'],
        },
      ],
    });
    expect(graph.nodes.length).toBeLessThanOrEqual(40);
    expect(graph.graph_schema_version).toBe(1);
  });
});
