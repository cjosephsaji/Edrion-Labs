/** How a programme divides its calendar — drives slot generation. */
export const TERM_SYSTEMS = [
  'annual',
  'semester',
  'trimester',
  'quarter',
  'modular',
  'custom',
  'term',
] as const;
export type TermSystem = (typeof TERM_SYSTEMS)[number];

export const SLOT_KINDS = [
  'term',
  'semester',
  'trimester',
  'quarter',
  'phase',
  'module',
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export interface SlotOverride {
  levelSequence: number;
  sequenceInYear: number;
  name?: string;
  durationMonths?: number | null;
  isTerminal?: boolean;
  remove?: boolean;
}

export interface PlannedLevel {
  /** Existing row identity, retained when editing a saved structure. */
  id?: string;
  sequence: number;
  name: string;
  durationMonths: number | null;
}

export interface PlannedSlot {
  id?: string;
  levelSequence: number;
  sequenceInYear: number;
  absoluteSequence: number;
  name: string;
  kind: SlotKind;
  durationMonths: number | null;
  isTerminal: boolean;
}

export interface GenerateStructureInput {
  termSystem: TermSystem;
  durationMonths: number | null;
  termsPerYear?: number;
  /** School K–12: number of grades (default 12). */
  gradeCount?: number;
  overrides?: SlotOverride[];
}

export interface GeneratedStructure {
  levels: PlannedLevel[];
  slots: PlannedSlot[];
  totals: { years: number; slots: number };
}

/** Keep year, term and absolute positions contiguous after editing a preview. */
export function normalizeStructure(
  levels: PlannedLevel[],
  slots: PlannedSlot[],
): GeneratedStructure {
  const nextSlots: PlannedSlot[] = [];
  const nextLevels = levels.map((level, levelIndex) => {
    slots
      .filter((slot) => slot.levelSequence === level.sequence)
      .sort((a, b) => a.sequenceInYear - b.sequenceInYear)
      .forEach((slot, slotIndex) => {
        nextSlots.push({
          ...slot,
          levelSequence: levelIndex + 1,
          sequenceInYear: slotIndex + 1,
          absoluteSequence: nextSlots.length + 1,
        });
      });
    return { ...level, sequence: levelIndex + 1 };
  });
  return {
    levels: nextLevels,
    slots: nextSlots,
    totals: { years: nextLevels.length, slots: nextSlots.length },
  };
}

export interface StructurePreset extends GenerateStructureInput {
  id: string;
  label: string;
  /** Irregular grids (MBBS, BDS) — passed through to generateStructure. */
  preset?: string;
}

/** Default terms-per-year derived from the term system. */
export function termsPerYearForSystem(system: TermSystem, custom?: number): number {
  switch (system) {
    case 'annual':
      return 1;
    case 'semester':
      return 2;
    case 'trimester':
      return 3;
    case 'quarter':
      return 4;
    case 'modular':
      return 1;
    case 'term':
      return 3;
    case 'custom':
      return custom ?? 1;
    default:
      return 1;
  }
}

/** Slot kind label for a term system. */
export function slotKindForSystem(system: TermSystem): SlotKind {
  switch (system) {
    case 'semester':
      return 'semester';
    case 'trimester':
      return 'trimester';
    case 'quarter':
      return 'quarter';
    case 'modular':
      return 'module';
    case 'annual':
      return 'phase';
    default:
      return 'term';
  }
}

/** Default display label for a slot within a system. */
export function defaultSlotName(system: TermSystem, sequenceInYear: number): string {
  const kind = slotKindForSystem(system);
  const labels: Record<SlotKind, string> = {
    term: 'Term',
    semester: 'Semester',
    trimester: 'Trimester',
    quarter: 'Quarter',
    phase: 'Year',
    module: 'Module',
  };
  return `${labels[kind]} ${sequenceInYear}`;
}

function yearCount(durationMonths: number | null, gradeCount?: number): number {
  if (gradeCount != null && gradeCount > 0) return gradeCount;
  if (durationMonths == null || durationMonths <= 0) return 0;
  return Math.max(1, Math.round(durationMonths / 12));
}

/** Irregular preset grids — MBBS, BDS, etc. */
function presetGrid(preset: string): GeneratedStructure | null {
  switch (preset) {
    case 'mbbs':
      return buildIrregular([
        { name: 'Year 1', durationMonths: 12, slots: [{ name: 'First Professional', durationMonths: 12 }] },
        { name: 'Year 2', durationMonths: 12, slots: [{ name: 'Second Professional', durationMonths: 12 }] },
        { name: 'Year 3', durationMonths: 12, slots: [{ name: 'Third Professional', durationMonths: 12 }] },
        {
          name: 'Year 4',
          durationMonths: 18,
          slots: [{ name: 'Fourth Professional', durationMonths: 18 }],
        },
        {
          name: 'Internship',
          durationMonths: 12,
          slots: [{ name: 'Internship', durationMonths: 12, isTerminal: true }],
        },
      ], 'phase');
    case 'bds':
      return buildIrregular([
        { name: 'Year 1', durationMonths: 12, slots: [{ name: 'Year 1', durationMonths: 12 }] },
        { name: 'Year 2', durationMonths: 12, slots: [{ name: 'Year 2', durationMonths: 12 }] },
        { name: 'Year 3', durationMonths: 12, slots: [{ name: 'Year 3', durationMonths: 12 }] },
        { name: 'Year 4', durationMonths: 12, slots: [{ name: 'Year 4', durationMonths: 12 }] },
        {
          name: 'Internship',
          durationMonths: 12,
          slots: [{ name: 'Internship', durationMonths: 12, isTerminal: true }],
        },
      ], 'phase');
    default:
      return null;
  }
}

function buildIrregular(
  rows: {
    name: string;
    durationMonths: number | null;
    slots: { name: string; durationMonths: number | null; isTerminal?: boolean }[];
  }[],
  kind: SlotKind,
): GeneratedStructure {
  const levels: PlannedLevel[] = [];
  const slots: PlannedSlot[] = [];
  let abs = 0;
  rows.forEach((row, i) => {
    levels.push({ sequence: i + 1, name: row.name, durationMonths: row.durationMonths });
    row.slots.forEach((s, j) => {
      abs += 1;
      slots.push({
        levelSequence: i + 1,
        sequenceInYear: j + 1,
        absoluteSequence: abs,
        name: s.name,
        kind,
        durationMonths: s.durationMonths,
        isTerminal: s.isTerminal ?? false,
      });
    });
  });
  return { levels, slots, totals: { years: levels.length, slots: slots.length } };
}

function applyOverrides(
  levels: PlannedLevel[],
  slots: PlannedSlot[],
  overrides: SlotOverride[] | undefined,
): { levels: PlannedLevel[]; slots: PlannedSlot[] } {
  if (!overrides?.length) return { levels, slots };

  const nextLevels = [...levels];
  let nextSlots = [...slots];

  for (const o of overrides) {
    if (o.remove) {
      nextSlots = nextSlots.filter(
        (s) => !(s.levelSequence === o.levelSequence && s.sequenceInYear === o.sequenceInYear),
      );
      continue;
    }
    const idx = nextSlots.findIndex(
      (s) => s.levelSequence === o.levelSequence && s.sequenceInYear === o.sequenceInYear,
    );
    if (idx >= 0) {
      const cur = nextSlots[idx]!;
      nextSlots[idx] = {
        ...cur,
        name: o.name ?? cur.name,
        durationMonths: o.durationMonths !== undefined ? o.durationMonths : cur.durationMonths,
        isTerminal: o.isTerminal ?? cur.isTerminal,
      };
    }
  }

  // Re-number absolute sequences after removals.
  nextSlots = nextSlots
    .sort((a, b) => a.levelSequence - b.levelSequence || a.sequenceInYear - b.sequenceInYear)
    .map((s, i) => ({ ...s, absoluteSequence: i + 1 }));

  return { levels: nextLevels, slots: nextSlots };
}

/**
 * Pure structure generator — the single place where "4.5 years annual = 4 phases + internship"
 * is encoded. No I/O; identical output on API and institution-web preview.
 */
export function generateStructure(
  input: GenerateStructureInput & { preset?: string },
): GeneratedStructure {
  if (input.preset) {
    const fromPreset = presetGrid(input.preset);
    if (fromPreset) {
      const { levels, slots } = applyOverrides(fromPreset.levels, fromPreset.slots, input.overrides);
      return { levels, slots, totals: { years: levels.length, slots: slots.length } };
    }
  }

  const { termSystem, durationMonths, gradeCount } = input;
  const tpy = termsPerYearForSystem(termSystem, input.termsPerYear);
  const kind = slotKindForSystem(termSystem);

  // Open-ended / PhD — no levels or slots.
  if (termSystem === 'modular' && durationMonths == null) {
    return { levels: [], slots: [], totals: { years: 0, slots: 0 } };
  }

  // Short modular course — one level, one slot.
  if (termSystem === 'modular') {
    const levels: PlannedLevel[] = [{ sequence: 1, name: 'Level 1', durationMonths }];
    const slots: PlannedSlot[] = [
      {
        levelSequence: 1,
        sequenceInYear: 1,
        absoluteSequence: 1,
        name: defaultSlotName(termSystem, 1),
        kind,
        durationMonths,
        isTerminal: false,
      },
    ];
    const applied = applyOverrides(levels, slots, input.overrides);
    return {
      ...applied,
      totals: { years: applied.levels.length, slots: applied.slots.length },
    };
  }

  const years = yearCount(durationMonths, gradeCount);
  const levels: PlannedLevel[] = [];
  const slots: PlannedSlot[] = [];
  let abs = 0;

  for (let y = 1; y <= years; y++) {
    const levelName =
      termSystem === 'term' ? `Grade ${y}` : termSystem === 'annual' ? `Year ${y}` : `Year ${y}`;
    levels.push({
      sequence: y,
      name: levelName,
      durationMonths: durationMonths != null ? Math.round(durationMonths / years) : null,
    });

    for (let s = 1; s <= tpy; s++) {
      abs += 1;
      slots.push({
        levelSequence: y,
        sequenceInYear: s,
        absoluteSequence: abs,
        name: defaultSlotName(termSystem, s),
        kind,
        durationMonths: null,
        isTerminal: false,
      });
    }
  }

  const applied = applyOverrides(levels, slots, input.overrides);
  return {
    ...applied,
    totals: { years: applied.levels.length, slots: applied.slots.length },
  };
}

/** Named starting grids for the builder form — never written until the admin commits. */
export const STRUCTURE_PRESETS: StructurePreset[] = [
  { id: 'school', label: 'School K–12', termSystem: 'term', durationMonths: null, gradeCount: 12 },
  { id: 'mbbs', label: 'MBBS', termSystem: 'annual', durationMonths: 66, preset: 'mbbs' },
  { id: 'bds', label: 'BDS', termSystem: 'annual', durationMonths: 60, preset: 'bds' },
  { id: 'btech', label: 'B.Tech / BE', termSystem: 'semester', durationMonths: 48 },
  { id: 'bsc', label: 'BSc / BA / BCom', termSystem: 'semester', durationMonths: 36 },
  { id: 'integrated', label: 'Integrated MSc / 5-yr LLB', termSystem: 'semester', durationMonths: 60 },
  { id: 'diploma', label: 'Diploma / Polytechnic', termSystem: 'semester', durationMonths: 36 },
  { id: 'annual-degree', label: 'Annual-system degree', termSystem: 'annual', durationMonths: 36 },
  { id: 'mba', label: 'Trimester MBA', termSystem: 'trimester', durationMonths: 24 },
  { id: 'skill', label: 'Skill course', termSystem: 'modular', durationMonths: 6 },
  { id: 'phd', label: 'PhD (open-ended)', termSystem: 'modular', durationMonths: null },
  { id: 'custom', label: 'Custom', termSystem: 'custom', durationMonths: 36, termsPerYear: 2 },
];

/** Per-programme term label from term_system, falling back to institution nomenclature. */
export function termLabelForSystem(
  system: TermSystem | null | undefined,
  fallback: string,
): string {
  switch (system) {
    case 'semester':
      return 'Semester';
    case 'annual':
      return 'Year';
    case 'trimester':
      return 'Trimester';
    case 'quarter':
      return 'Quarter';
    case 'modular':
      return 'Module';
    case 'term':
      return 'Term';
    default:
      return fallback;
  }
}
