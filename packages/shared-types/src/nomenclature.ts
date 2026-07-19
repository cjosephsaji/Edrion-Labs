import type { InstitutionType } from './enums';

/** Canonical term keys — never change; only display labels vary per institution type / override. */
export const TERM_KEYS = [
  'academicYear',
  'department',
  'gradeLevel',
  'class',
  'section',
  'subject',
  'term',
  'student',
  'teacher',
  'staff',
  'admission',
  'enrolment',
  'programmeStructure',
] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export interface TermLabel {
  singular: string;
  plural: string;
}

/** Tenant override — either or both sides may be set; blanks fall back to the type preset. */
export type TermLabelOverride = Partial<TermLabel>;

export type ResolvedNomenclature = Record<TermKey, TermLabel>;
export type NomenclatureOverrides = Partial<Record<TermKey, TermLabelOverride>>;

const school: ResolvedNomenclature = {
  academicYear: { singular: 'Academic Year', plural: 'Academic Years' },
  department: { singular: 'Department', plural: 'Departments' },
  gradeLevel: { singular: 'Grade', plural: 'Grades' },
  class: { singular: 'Class', plural: 'Classes' },
  section: { singular: 'Section', plural: 'Sections' },
  subject: { singular: 'Subject', plural: 'Subjects' },
  term: { singular: 'Term', plural: 'Terms' },
  student: { singular: 'Student', plural: 'Students' },
  teacher: { singular: 'Teacher', plural: 'Teachers' },
  staff: { singular: 'Staff member', plural: 'Staff' },
  admission: { singular: 'Admission', plural: 'Admissions' },
  enrolment: { singular: 'Enrolment', plural: 'Enrolments' },
  programmeStructure: { singular: 'Class Structure', plural: 'Class Structures' },
};

const college: ResolvedNomenclature = {
  academicYear: { singular: 'Academic Year', plural: 'Academic Years' },
  department: { singular: 'Programme', plural: 'Programmes' },
  gradeLevel: { singular: 'Year', plural: 'Years' },
  class: { singular: 'Section', plural: 'Sections' },
  section: { singular: 'Section', plural: 'Sections' },
  subject: { singular: 'Course', plural: 'Courses' },
  term: { singular: 'Semester', plural: 'Semesters' },
  student: { singular: 'Student', plural: 'Students' },
  teacher: { singular: 'Lecturer', plural: 'Lecturers' },
  staff: { singular: 'Staff member', plural: 'Staff' },
  admission: { singular: 'Enrolment', plural: 'Enrolments' },
  enrolment: { singular: 'Enrolment', plural: 'Enrolments' },
  programmeStructure: { singular: 'Programme Structure', plural: 'Programme Structures' },
};

const university: ResolvedNomenclature = {
  academicYear: { singular: 'Academic Year', plural: 'Academic Years' },
  department: { singular: 'Faculty', plural: 'Faculties' },
  gradeLevel: { singular: 'Year', plural: 'Years' },
  class: { singular: 'Section', plural: 'Sections' },
  section: { singular: 'Section', plural: 'Sections' },
  subject: { singular: 'Course', plural: 'Courses' },
  term: { singular: 'Semester', plural: 'Semesters' },
  student: { singular: 'Student', plural: 'Students' },
  teacher: { singular: 'Lecturer', plural: 'Lecturers' },
  staff: { singular: 'Staff member', plural: 'Staff' },
  admission: { singular: 'Admission', plural: 'Admissions' },
  enrolment: { singular: 'Enrolment', plural: 'Enrolments' },
  programmeStructure: { singular: 'Programme Structure', plural: 'Programme Structures' },
};

const trainingCenter: ResolvedNomenclature = {
  academicYear: { singular: 'Training Year', plural: 'Training Years' },
  department: { singular: 'Department', plural: 'Departments' },
  gradeLevel: { singular: 'Level', plural: 'Levels' },
  class: { singular: 'Batch', plural: 'Batches' },
  section: { singular: 'Group', plural: 'Groups' },
  subject: { singular: 'Module', plural: 'Modules' },
  term: { singular: 'Session', plural: 'Sessions' },
  student: { singular: 'Trainee', plural: 'Trainees' },
  teacher: { singular: 'Trainer', plural: 'Trainers' },
  staff: { singular: 'Staff member', plural: 'Staff' },
  admission: { singular: 'Registration', plural: 'Registrations' },
  enrolment: { singular: 'Enrolment', plural: 'Enrolments' },
  programmeStructure: { singular: 'Programme Structure', plural: 'Programme Structures' },
};

/** Default label map per institution type before tenant overrides. */
export const NOMENCLATURE_PRESETS: Record<InstitutionType, ResolvedNomenclature> = {
  school,
  college,
  university,
  training_center: trainingCenter,
};

/** Overlay tenant overrides on the type preset; missing keys fall back to the preset. */
export function resolveNomenclature(
  type: InstitutionType,
  overrides?: NomenclatureOverrides | null,
  programme?: { termSystem?: string | null } | null,
): ResolvedNomenclature {
  const preset = NOMENCLATURE_PRESETS[type] ?? school;
  const resolved = { ...preset };
  if (!overrides) {
    if (programme?.termSystem) {
      const label = termLabelFromSystem(programme.termSystem, preset.term.singular);
      resolved.term = { singular: label, plural: `${label}s` };
    }
    return resolved;
  }
  for (const key of TERM_KEYS) {
    const o = overrides[key];
    if (!o) continue;
    resolved[key] = {
      singular: o.singular?.trim() || preset[key].singular,
      plural: o.plural?.trim() || preset[key].plural,
    };
  }
  if (programme?.termSystem) {
    const label = termLabelFromSystem(programme.termSystem, resolved.term.singular);
    resolved.term = { singular: label, plural: `${label}s` };
  }
  return resolved;
}

function termLabelFromSystem(system: string, fallback: string): string {
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
