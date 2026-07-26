import { describe, expect, it } from 'vitest';
import { compactToolResult, estimateTokens } from './compact';
import { costMicroUsd, familyOf, parseRateOverrides, rateFor } from './pricing';

/** A student row exactly as `PortalCrudEngine.list` hands it to a Petros tool today. */
const studentRow = (n: number) => ({
  id: `3f8a1c2d-0000-4000-8000-00000000000${n}`,
  institutionId: '9c2b1a44-1111-4111-8111-111111111111',
  campusId: '7b1e0f33-2222-4222-8222-222222222222',
  admissionNo: `S00${n}`,
  firstName: 'Aarav',
  lastName: 'Sharma',
  dateOfBirth: '2010-05-02T00:00:00.000Z',
  gender: 'male',
  classId: 'a2f5c700-3333-4333-8333-333333333333',
  className: 'Grade 5A',
  status: 'active',
  email: null,
  phone: null,
  address: null,
  bloodGroup: null,
  guardianPhone: '+919876543210',
  createdAt: '2026-01-05T10:22:31.456Z',
  updatedAt: '2026-02-11T08:00:00.000Z',
  createdBy: 'cc0f1122-4444-4444-8444-444444444444',
  updatedBy: null,
  version: 0,
});

const listResult = (rows: number) => ({
  items: Array.from({ length: rows }, (_, i) => studentRow(i + 1)),
  total: 143,
  page: 1,
  pageSize: rows,
  hasMore: true,
});

describe('compactToolResult', () => {
  it('drops tenant and audit columns the model can neither see nor act on', () => {
    const out = compactToolResult(listResult(3));
    for (const noise of ['institutionId', 'campusId', 'createdBy', 'updatedBy', 'updatedAt', 'version']) {
      expect(out).not.toContain(noise);
    }
  });

  it('keeps every field that carries signal, including foreign keys the model needs to act', () => {
    const out = compactToolResult(listResult(3));
    for (const kept of ['id', 'admissionNo', 'firstName', 'className', 'status', 'guardianPhone', 'classId']) {
      expect(out).toContain(kept);
    }
    expect(out).toContain('3f8a1c2d-0000-4000-8000-000000000001');
    expect(out).toContain('+919876543210');
  });

  it('preserves the pagination truth so the model cannot pass a page off as the whole set', () => {
    expect(compactToolResult(listResult(10))).toContain('143 total, showing 10');
  });

  it('writes column names once in a header rather than once per row', () => {
    const out = compactToolResult(listResult(10));
    expect(out.split('admissionNo')).toHaveLength(2); // header only
    expect(out.split('\n').filter((l) => l.includes('Aarav'))).toHaveLength(10);
  });

  it('drops nulls instead of spending tokens saying nothing', () => {
    expect(compactToolResult(listResult(2))).not.toContain('bloodGroup');
  });

  it('compresses timestamps, and keeps createdAt only when the row has no other date', () => {
    expect(compactToolResult(listResult(2))).toContain('2010-05-02');
    expect(compactToolResult(listResult(2))).not.toContain('T00:00:00.000Z');
    // A row whose only temporal anchor IS createdAt keeps it.
    const bare = compactToolResult({ id: 'x', title: 'Note', createdAt: '2026-01-05T10:22:31.456Z' });
    expect(bare).toContain('2026-01-05 10:22');
  });

  it('cuts a realistic student list by more than 70%', () => {
    const raw = JSON.stringify(listResult(10));
    const compact = compactToolResult(listResult(10));
    const saved = 1 - estimateTokens(compact) / estimateTokens(raw);
    expect(saved).toBeGreaterThan(0.7);
  });

  it('renders nested sections (the academics structure) without flattening them together', () => {
    const out = compactToolResult({
      years: [{ id: 'y1', name: '2025-26', isCurrent: true }],
      classes: [
        { id: 'c1', name: '5A', className: null, gradeLevelName: 'Grade 5' },
        { id: 'c2', name: '5B', className: null, gradeLevelName: 'Grade 5' },
      ],
    });
    expect(out).toContain('## years');
    expect(out).toContain('## classes (2)');
    expect(out).not.toContain('className');
  });

  it('never lets a tab or newline inside a value break the table', () => {
    const out = compactToolResult([
      { id: 'a', body: 'line one\nline two\twith a tab' },
      { id: 'b', body: 'plain' },
    ]);
    const rows = out.split('\n');
    expect(rows).toHaveLength(3); // header + 2 rows, no smuggled newline
    for (const row of rows) expect(row.split('\t')).toHaveLength(2);
  });

  it('marks truncation rather than silently losing text', () => {
    const out = compactToolResult([
      { id: 'a', body: 'x'.repeat(3000) },
      { id: 'b', body: 'short' },
    ]);
    expect(out).toContain('[+2000 chars]');
  });

  it('says so plainly when there is nothing to report', () => {
    expect(compactToolResult({ items: [], total: 0 })).toBe('(no results)');
    expect(compactToolResult([])).toBe('(no results)');
    expect(compactToolResult(null)).toBe('(no results)');
  });

  it('keeps an empty nested list visible — "none exist" must not look like "lookup failed"', () => {
    const out = compactToolResult({ years: [{ id: 'y1', name: '2025-26' }], subjects: [] });
    expect(out).toContain('## subjects (0)');
    expect(out).toContain('(none)');
  });

  it('leaves a small mutation ack legible', () => {
    expect(compactToolResult({ id: 'ann1', status: 'draft' })).toBe('id: ann1\nstatus: draft');
  });
});

describe('pricing', () => {
  it('maps a model id to its family', () => {
    expect(familyOf('gpt-5.4-nano')).toBe('nano');
    expect(familyOf('gpt-5.4-mini')).toBe('mini');
    expect(familyOf('gpt-5.4-2026-03-05')).toBe('full');
  });

  it('bills the cached slice of input at the cache rate, not the full rate', () => {
    const cold = costMicroUsd({ inputTokens: 10_000, outputTokens: 0, cachedInputTokens: 0 }, 'gpt-5.4-mini');
    const warm = costMicroUsd({ inputTokens: 10_000, outputTokens: 0, cachedInputTokens: 9_000 }, 'gpt-5.4-mini');
    expect(cold).toBe(2500); // 10k * $0.25/1M = $0.0025
    expect(warm).toBeLessThan(cold / 3);
  });

  it('never lets cached tokens exceed total input', () => {
    const cost = costMicroUsd({ inputTokens: 100, outputTokens: 0, cachedInputTokens: 999 }, 'gpt-5.4-mini');
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('takes an env override, and shrugs off a malformed one', () => {
    const rates = parseRateOverrides('{"gpt-5.4-mini":{"input":9,"output":9}}');
    expect(rateFor('gpt-5.4-mini', rates).input).toBe(9);
    expect(rateFor('gpt-5.4-mini', rates).cachedInput).toBe(0.9); // defaulted to input/10
    expect(parseRateOverrides('not json')).toBeUndefined();
    expect(parseRateOverrides('')).toBeUndefined();
  });
});
