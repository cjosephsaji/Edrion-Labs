import { describe, expect, it } from 'vitest';
import { NOMENCLATURE_PRESETS } from '@edrion/shared-types';
import { ALL_INSTITUTION_PERMISSION_KEYS, getInstitutionPermission } from '@edrion/permissions/institution';
import { expandEffectiveKeys, type EvaluatedPermissions } from '@edrion/permissions';
import { buildInstructions } from '../petros-prompt';
import { buildDomainTools } from '../tools/domain-tools';
import { buildReportTools } from '../tools/report-tools';
import { buildRoleTools } from '../tools/role-tools';
import { compactToolResult, estimateTokens } from './compact';
import { costMicroUsd, formatUsd } from './pricing';

/**
 * What a Petros turn actually costs, before and after the context work — measured against the real
 * prompt builder, the real permission catalogue, the real tool catalogue and the real compactor, so
 * the number cannot drift away from the code. It doubles as a regression guard: if someone
 * re-fattens a tool result or puts the permission dump back, the assertions at the bottom fail.
 *
 * INPUT tokens only. Reasoning/output savings (effort=low, verbosity=low) are real but depend on
 * the model's behaviour, so they are not modelled here — they are measured live, per turn, via
 * `petros_messages.cost_micro_usd`.
 *
 * The chars/4 token estimate is CONSERVATIVE here: UUIDs tokenize at roughly 2.8 chars/token, and
 * the "before" arm carries five more of them per row (institutionId, campusId, createdBy, updatedBy
 * and friends). So the estimator understates the old cost more than the new one, and the real
 * saving is a little larger than what this prints.
 *
 * Run it and read the table:  pnpm vitest run cost-audit
 */

const MODEL = 'gpt-5.4-mini';

/**
 * The real tool schemas, sized from the real builders. Identical in both arms — a constant, not a
 * lever — but a big one, and the reason a stable, cacheable prompt prefix matters so much.
 * (`generate_document` is registered privately on the registry and is not counted here; it is one
 * tool, and it is in neither arm's favour.)
 */
const TOOL_SCHEMA_TOKENS = estimateTokens(
  JSON.stringify(
    [
      ...buildDomainTools({} as never),
      ...buildReportTools({} as never, {} as never),
      ...buildRoleTools({} as never, {} as never),
    ].map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      strict: false,
      parameters: t.parameters,
    })),
  ),
);

/** A `function_call` item echoed back into the input on the next iteration. */
const FUNCTION_CALL_TOKENS = 40;

// ── Fixtures: rows exactly as `PortalCrudEngine.list` (a bare `db.select()` + enrichment) hands them over ──

const studentRow = (n: number) => ({
  id: `3f8a1c2d-0000-4000-8000-${String(n).padStart(12, '0')}`,
  institutionId: '9c2b1a44-1111-4111-8111-111111111111',
  campusId: '7b1e0f33-2222-4222-8222-222222222222',
  admissionNo: `ADM-2026-0${n}`,
  firstName: 'Aarav',
  lastName: 'Sharma',
  gender: 'male',
  dateOfBirth: '2014-05-02T00:00:00.000Z',
  email: null,
  phone: null,
  gradeLevelId: 'd1e2f300-5555-4555-8555-555555555555',
  gradeLevelName: 'Grade 5',
  classId: 'a2f5c700-3333-4333-8333-333333333333',
  className: '5A',
  rollNo: n,
  institutionUserId: null,
  address: null,
  status: 'active',
  enrollmentDate: '2025-06-01T00:00:00.000Z',
  createdBy: 'cc0f1122-4444-4444-8444-444444444444',
  updatedBy: null,
  createdAt: '2025-06-01T09:12:44.120Z',
  updatedAt: '2026-02-11T08:00:00.000Z',
  version: 0,
});

const sessionRow = (n: number) => ({
  id: `b7c1d200-0000-4000-8000-${String(n).padStart(12, '0')}`,
  institutionId: '9c2b1a44-1111-4111-8111-111111111111',
  campusId: '7b1e0f33-2222-4222-8222-222222222222',
  classId: 'a2f5c700-3333-4333-8333-333333333333',
  className: '5A',
  subjectId: null,
  subjectName: null,
  date: `2026-07-${String(n).padStart(2, '0')}T00:00:00.000Z`,
  period: 'full_day',
  takenById: 'e5f6a700-6666-4666-8666-666666666666',
  takenByName: 'Meera Nair',
  notes: null,
  createdBy: 'cc0f1122-4444-4444-8444-444444444444',
  updatedBy: null,
  createdAt: '2026-07-01T04:02:10.000Z',
  updatedAt: '2026-07-01T04:02:10.000Z',
  version: 0,
});

const classRow = (n: number) => ({
  id: `a2f5c700-3333-4333-8333-${String(n).padStart(12, '0')}`,
  institutionId: '9c2b1a44-1111-4111-8111-111111111111',
  campusId: '7b1e0f33-2222-4222-8222-222222222222',
  academicYearId: 'f0e1d200-7777-4777-8777-777777777777',
  academicYearName: '2025-26',
  gradeLevelId: 'd1e2f300-5555-4555-8555-555555555555',
  gradeLevelName: `Grade ${(n % 12) + 1}`,
  programmeLevelId: null,
  termId: null,
  name: `${(n % 12) + 1}A`,
  section: 'A',
  classTeacherId: 'e5f6a700-6666-4666-8666-666666666666',
  teacherName: 'Meera Nair',
  room: `R${100 + n}`,
  capacity: 40,
  createdBy: 'cc0f1122-4444-4444-8444-444444444444',
  updatedBy: null,
  createdAt: '2025-06-01T09:12:44.120Z',
  updatedAt: '2026-02-11T08:00:00.000Z',
  version: 0,
});

const list = <T>(make: (n: number) => T, rows: number, total: number) => ({
  items: Array.from({ length: rows }, (_, i) => make(i + 1)),
  total,
  page: 1,
  pageSize: rows,
  hasMore: total > rows,
});

/** `academics_get_structure` — five lists at pageSize 50 in ONE tool result. */
const academicsStructure = {
  years: list(classRow, 2, 2).items,
  departments: Array.from({ length: 6 }, (_, i) => ({ id: `dep-${i}`, name: `Dept ${i}`, code: `D${i}` })),
  gradeLevels: Array.from({ length: 12 }, (_, i) => ({ id: `gl-${i}`, name: `Grade ${i + 1}`, sequence: i })),
  classes: Array.from({ length: 36 }, (_, i) => classRow(i + 1)),
  subjects: Array.from({ length: 24 }, (_, i) => ({
    id: `sub-${i}`,
    institutionId: '9c2b1a44-1111-4111-8111-111111111111',
    campusId: null,
    name: `Subject ${i}`,
    code: `S${i}`,
    departmentId: `dep-${i % 6}`,
    departmentName: `Dept ${i % 6}`,
    createdAt: '2025-06-01T09:12:44.120Z',
    updatedAt: '2025-06-01T09:12:44.120Z',
    createdBy: 'cc0f1122-4444-4444-8444-444444444444',
    updatedBy: null,
    version: 0,
  })),
};

// ── The prompt, both ways ────────────────────────────────────────────────────

const OWNER: EvaluatedPermissions = { keys: new Set(['*']), hasWildcard: true };

const promptContext = {
  institutionName: 'Greenwood International School',
  institutionType: 'school',
  nomenclature: NOMENCLATURE_PRESETS.school,
  fullName: 'Priya Menon',
  roleKeys: ['owner'],
  permissions: OWNER,
  tools: [],
  conversationSummary: null,
};

/** The permission block exactly as it was before — rebuilt from the real catalogue, not from memory. */
function legacyPermissionDump(): string {
  const grouped = new Map<string, string[]>();
  for (const key of expandEffectiveKeys(OWNER, ALL_INSTITUTION_PERMISSION_KEYS)) {
    const def = getInstitutionPermission(key);
    if (!def) continue;
    grouped.set(def.group, [...(grouped.get(def.group) ?? []), key]);
  }
  return [...grouped.entries()].map(([group, keys]) => `${group}: ${keys.join(', ')}`).join('\n');
}

// ── The turn ─────────────────────────────────────────────────────────────────

/**
 * "Show me the students in Grade 5A and how their attendance has been this month."
 *
 * Three model calls: lookup students → lookup attendance → answer. The agent loop echoes the whole
 * input array back on each one, so a tool result landing at iteration 1 is BILLED THREE TIMES.
 */
const TURN = [
  { user: 'Show me the students in Grade 5A and how their attendance has been this month.' },
  { tool: list(studentRow, 10, 143) },
  { tool: list(sessionRow, 10, 22) },
];

interface Arm {
  instructions: number;
  results: number[];
}

/**
 * Walk the three model calls the turn actually makes and split the input into fresh vs cached
 * tokens.
 *
 * The prefix (instructions + tool schemas + the user's message) is byte-identical on every
 * iteration, and the input array only ever grows at the tail — which is exactly the shape OpenAI's
 * automatic prefix caching rewards, and why `prompt_cache_key` is pinned to the conversation. So
 * from iteration 2 onwards the prefix is cached and what you pay full price for is THE TAIL: the
 * tool results. Which is the thing the compactor cuts.
 *
 * `cold` models the same turn with no cache hit at all — the honest worst case (first turn of a
 * conversation, or a cache eviction).
 */
function bill(arm: Arm, { cached }: { cached: boolean }) {
  const prefix = arm.instructions + TOOL_SCHEMA_TOKENS + estimateTokens(TURN[0]!.user!);
  let fresh = 0;
  let cachedTokens = 0;
  let carried = 0; // the tail: echoed function calls + tool results, accumulated
  let prevSent = 0; // everything iteration i-1 sent — and therefore everything iteration i can hit

  for (let i = 0; i < 3; i += 1) {
    const total = prefix + carried;
    // The input array is append-only, so iteration i's request opens with iteration i-1's request
    // verbatim. That whole span is the cache hit; only the newly appended items are fresh.
    const hit = cached ? Math.min(prevSent, total) : 0;
    cachedTokens += hit;
    fresh += total - hit;
    prevSent = total;
    if (i < arm.results.length) carried += FUNCTION_CALL_TOKENS + arm.results[i]!;
  }
  return { fresh, cached: cachedTokens, total: fresh + cachedTokens };
}

describe('Petros input-token cost', () => {
  const before: Arm = {
    instructions: estimateTokens(buildInstructions(promptContext) + legacyPermissionDump()),
    results: [
      estimateTokens(JSON.stringify(TURN[1]!.tool)),
      estimateTokens(JSON.stringify(TURN[2]!.tool)),
    ],
  };
  const after: Arm = {
    instructions: estimateTokens(buildInstructions(promptContext)),
    results: [
      estimateTokens(compactToolResult(TURN[1]!.tool)),
      estimateTokens(compactToolResult(TURN[2]!.tool)),
    ],
  };

  const pct = (b: number, a: number) => `${(((b - a) / b) * 100).toFixed(0)}%`;
  const micro = (u: { fresh: number; cached: number }, mult = 1) =>
    costMicroUsd(
      { inputTokens: (u.fresh + u.cached) * mult, cachedInputTokens: u.cached * mult, outputTokens: 0 },
      MODEL,
    );

  it('reports the saving', () => {
    const rawStructure = estimateTokens(JSON.stringify(academicsStructure));
    const compactStructure = estimateTokens(compactToolResult(academicsStructure));

    const coldB = bill(before, { cached: false });
    const coldA = bill(after, { cached: false });
    const warmB = bill(before, { cached: true });
    const warmA = bill(after, { cached: true });

    const col = (s: string | number) => String(s).padStart(11);
    const line = '  ' + '─'.repeat(64);
    const rows: [string, number, number][] = [
      ['instructions (owner)', before.instructions, after.instructions],
      ['students list (10 rows)', before.results[0]!, after.results[0]!],
      ['attendance list (10 rows)', before.results[1]!, after.results[1]!],
      ['academics structure', rawStructure, compactStructure],
      ['tool schemas (unchanged)', TOOL_SCHEMA_TOKENS, TOOL_SCHEMA_TOKENS],
    ];

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `  Petros input cost — ${MODEL}`,
        `  turn: "${TURN[0]!.user}"`,
        '  → 3 model calls: look up students, look up attendance, answer',
        line,
        `  ${'component (tokens)'.padEnd(26)}${col('before')}${col('after')}${col('saved')}`,
        line,
        ...rows.map(([n, b, a]) => `  ${n.padEnd(26)}${col(b)}${col(a)}${col(pct(b, a))}`),
        line,
        `  ${'input sent, no cache'.padEnd(26)}${col(coldB.total)}${col(coldA.total)}${col(pct(coldB.total, coldA.total))}`,
        `  ${'  → cost of the turn'.padEnd(26)}${col(formatUsd(micro(coldB)))}${col(formatUsd(micro(coldA)))}${col(pct(micro(coldB), micro(coldA)))}`,
        line,
        `  ${'input sent, warm cache'.padEnd(26)}${col(warmB.total)}${col(warmA.total)}`,
        `  ${'  → at full price'.padEnd(26)}${col(warmB.fresh)}${col(warmA.fresh)}${col(pct(warmB.fresh, warmA.fresh))}`,
        `  ${'  → at cache price'.padEnd(26)}${col(warmB.cached)}${col(warmA.cached)}`,
        `  ${'  → cost of the turn'.padEnd(26)}${col(formatUsd(micro(warmB)))}${col(formatUsd(micro(warmA)))}${col(pct(micro(warmB), micro(warmA)))}`,
        `  ${'  → per 10k turns'.padEnd(26)}${col(formatUsd(micro(warmB, 10_000)))}${col(formatUsd(micro(warmA, 10_000)))}`,
        line,
        '  Steady state is the warm-cache block. The prompt prefix is byte-identical on',
        '  every iteration and the input only grows at the tail, so what you pay FULL',
        '  price for, over and over, IS the tail — the tool results. Which is exactly',
        '  what the compactor cuts.',
        '',
        '  Tool schemas are the biggest thing left, and are deliberately untouched: a tool',
        '  the model cannot see is a tool it cannot call, so subsetting them is the one',
        '  lever here that can genuinely make Petros worse. Caching already discounts them.',
        '',
        '  Input only. Reasoning/output (effort=low, verbosity=low) saves on top of this,',
        '  and is measured live per turn via petros_messages.cost_micro_usd.',
        '',
      ].join('\n'),
    );

    // Regression guards — the claims, asserted. Headroom is deliberate: these catch a regression,
    // they do not pin the exact numbers.
    expect(before.instructions - after.instructions).toBeGreaterThan(700);
    expect(after.results[0]! / before.results[0]!).toBeLessThan(0.3);
    expect(compactStructure / rawStructure).toBeLessThan(0.35);
    expect(coldA.total / coldB.total).toBeLessThan(0.7);
    // The number that actually moves the bill in steady state.
    expect(warmA.fresh / warmB.fresh).toBeLessThan(0.65);
    expect(micro(warmA) / micro(warmB)).toBeLessThan(0.65);
  });
});
