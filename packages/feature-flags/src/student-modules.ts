import type { InstitutionType } from '@edrion/shared-types';

export type StudentModuleCategory = 'academics' | 'money' | 'campus' | 'life' | 'learning';
export type StudentModuleTier = 'individual' | 'school' | 'college';

export interface StudentModuleDefinition {
  key: string;
  category: StudentModuleCategory;
  label: string;
  icon: string;
  minTier: StudentModuleTier;
  requiresInstitutionModule: string | null;
  defaultVisible: boolean;
  individualCapable: boolean;
}

/**
 * Deployment-controlled student surface catalogue. Existing repository surface defaults stay
 * unchanged; new surfaces use the product defaults declared here.
 */
export const STUDENT_MODULE_CATALOG = [
  { key: 'timetable', category: 'academics', label: 'Timetable', icon: 'calendar', minTier: 'school', requiresInstitutionModule: 'timetable', defaultVisible: true, individualCapable: false },
  { key: 'attendance', category: 'academics', label: 'Attendance', icon: 'clipboard-check', minTier: 'school', requiresInstitutionModule: 'attendance', defaultVisible: true, individualCapable: false },
  { key: 'results', category: 'academics', label: 'Results', icon: 'chart', minTier: 'school', requiresInstitutionModule: 'grading', defaultVisible: true, individualCapable: false },
  { key: 'registration', category: 'academics', label: 'Registration', icon: 'file-check', minTier: 'college', requiresInstitutionModule: 'registration', defaultVisible: false, individualCapable: false },
  { key: 'exam_prep', category: 'learning', label: 'Exam Prep', icon: 'target', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: false, individualCapable: true },
  { key: 'fees', category: 'money', label: 'Fees', icon: 'wallet', minTier: 'school', requiresInstitutionModule: 'fees', defaultVisible: false, individualCapable: false },
  { key: 'documents', category: 'campus', label: 'Documents', icon: 'file-text', minTier: 'school', requiresInstitutionModule: null, defaultVisible: false, individualCapable: false },
  { key: 'transport', category: 'campus', label: 'Transport', icon: 'bus', minTier: 'school', requiresInstitutionModule: 'transport', defaultVisible: false, individualCapable: false },
  { key: 'hostel', category: 'campus', label: 'Hostel', icon: 'building', minTier: 'college', requiresInstitutionModule: 'hostel', defaultVisible: false, individualCapable: false },
  { key: 'campus_library', category: 'campus', label: 'Campus Library', icon: 'library', minTier: 'school', requiresInstitutionModule: 'library', defaultVisible: false, individualCapable: false },
  { key: 'health', category: 'campus', label: 'Health', icon: 'heart-pulse', minTier: 'school', requiresInstitutionModule: 'health', defaultVisible: false, individualCapable: false },
  { key: 'id_card', category: 'campus', label: 'ID Card', icon: 'badge', minTier: 'school', requiresInstitutionModule: null, defaultVisible: true, individualCapable: false },
  { key: 'diary', category: 'life', label: 'Diary', icon: 'notebook', minTier: 'school', requiresInstitutionModule: 'diary', defaultVisible: false, individualCapable: false },
  { key: 'clubs', category: 'life', label: 'Clubs', icon: 'users', minTier: 'school', requiresInstitutionModule: 'clubs', defaultVisible: false, individualCapable: false },
  { key: 'events', category: 'life', label: 'Events', icon: 'calendar-days', minTier: 'school', requiresInstitutionModule: 'events', defaultVisible: false, individualCapable: false },
  { key: 'placements', category: 'life', label: 'Placements', icon: 'briefcase', minTier: 'college', requiresInstitutionModule: 'placements', defaultVisible: false, individualCapable: false },
  { key: 'grievance', category: 'life', label: 'Grievance', icon: 'message-circle-warning', minTier: 'school', requiresInstitutionModule: null, defaultVisible: false, individualCapable: false },
  { key: 'announcements', category: 'life', label: 'Announcements', icon: 'megaphone', minTier: 'school', requiresInstitutionModule: null, defaultVisible: true, individualCapable: false },
  { key: 'learn', category: 'learning', label: 'Learn', icon: 'sparkles', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: true, individualCapable: true },
  { key: 'library', category: 'learning', label: 'Library', icon: 'library', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: true, individualCapable: true },
  { key: 'lab', category: 'learning', label: 'The Lab', icon: 'flask', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: true, individualCapable: true },
  { key: 'planner', category: 'learning', label: 'Planner', icon: 'list-todo', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: false, individualCapable: true },
  { key: 'progress', category: 'learning', label: 'Progress', icon: 'trending-up', minTier: 'individual', requiresInstitutionModule: null, defaultVisible: false, individualCapable: true },
] as const satisfies readonly StudentModuleDefinition[];

export type StudentModuleKey = (typeof STUDENT_MODULE_CATALOG)[number]['key'];

export const TERMINOLOGY_KEYS = [
  'term_period', 'term_period_plural', 'group_unit', 'internal_assessment', 'marks_word',
  'teacher_title', 'head_role', 'student_id_word', 'timetable_word', 'exam_word',
  'homework_word', 'holiday_word', 'fee_word', 'campus_word',
] as const;
export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];
export type TerminologyPack = Record<TerminologyKey, string>;

export type StudentPortalPresetKey = 'indian_college' | 'cbse_k12' | 'us_k12' | 'us_higher_ed';
export interface StudentPortalPreset {
  key: StudentPortalPresetKey;
  label: string;
  modules: Record<StudentModuleKey, boolean>;
  terminology: TerminologyPack;
  defaults: { attendanceThreshold: number; gradingScheme: string };
}

const moduleSet = (enabled: readonly StudentModuleKey[]): Record<StudentModuleKey, boolean> =>
  Object.fromEntries(STUDENT_MODULE_CATALOG.map((m) => [m.key, enabled.includes(m.key)])) as Record<StudentModuleKey, boolean>;

export const STUDENT_PORTAL_PRESETS: Record<StudentPortalPresetKey, StudentPortalPreset> = {
  indian_college: {
    key: 'indian_college', label: 'Indian College',
    modules: moduleSet(['timetable','attendance','results','registration','fees','documents','transport','hostel','campus_library','health','id_card','clubs','events','placements','grievance','announcements','learn','library','lab','exam_prep']),
    terminology: { term_period:'Semester',term_period_plural:'Semesters',group_unit:'Section',internal_assessment:'Internal Marks',marks_word:'Marks',teacher_title:'Professor',head_role:'Registrar',student_id_word:'Register Number',timetable_word:'Timetable',exam_word:'Internal',homework_word:'Assignment',holiday_word:'Holiday',fee_word:'Fees',campus_word:'Campus' },
    defaults: { attendanceThreshold: 75, gradingScheme: 'cgpa_10' },
  },
  cbse_k12: {
    key: 'cbse_k12', label: 'Indian K-12 (CBSE)',
    modules: moduleSet(['timetable','attendance','results','fees','documents','transport','campus_library','health','id_card','diary','clubs','events','announcements','learn','library','lab']),
    terminology: { term_period:'Term',term_period_plural:'Terms',group_unit:'Class',internal_assessment:'CA Marks',marks_word:'Marks',teacher_title:'Teacher',head_role:'Principal',student_id_word:'Roll Number',timetable_word:'Timetable',exam_word:'Test',homework_word:'Homework',holiday_word:'Holiday',fee_word:'Fees',campus_word:'School' },
    defaults: { attendanceThreshold: 75, gradingScheme: 'cbse_grades' },
  },
  us_k12: {
    key: 'us_k12', label: 'US K-12',
    modules: moduleSet(['timetable','attendance','results','documents','transport','campus_library','health','id_card','clubs','events','announcements','learn','library','lab']),
    terminology: { term_period:'Semester',term_period_plural:'Semesters',group_unit:'Class',internal_assessment:'Progress Reports',marks_word:'Grades',teacher_title:'Teacher',head_role:'Principal',student_id_word:'Student ID',timetable_word:'Schedule',exam_word:'Test',homework_word:'Homework',holiday_word:'Break',fee_word:'Tuition',campus_word:'School' },
    defaults: { attendanceThreshold: 90, gradingScheme: 'letter_gpa_4' },
  },
  us_higher_ed: {
    key: 'us_higher_ed', label: 'US Higher-Ed',
    modules: moduleSet(['timetable','attendance','results','registration','fees','documents','campus_library','health','id_card','clubs','events','placements','grievance','announcements','learn','library','lab']),
    terminology: { term_period:'Semester',term_period_plural:'Semesters',group_unit:'Section',internal_assessment:'Grades',marks_word:'Grades',teacher_title:'Professor',head_role:'Registrar',student_id_word:'Student ID',timetable_word:'Schedule',exam_word:'Exam',homework_word:'Assignment',holiday_word:'Break',fee_word:'Tuition',campus_word:'Campus' },
    defaults: { attendanceThreshold: 80, gradingScheme: 'letter_gpa_4' },
  },
};

export const INDIVIDUAL_MODULES: readonly StudentModuleKey[] = ['learn','library','lab','planner','progress','exam_prep'];
export const INDIVIDUAL_TERMINOLOGY: TerminologyPack = {
  ...STUDENT_PORTAL_PRESETS.indian_college.terminology,
  timetable_word: 'Plan', exam_word: 'Exam', marks_word: 'Scores', homework_word: 'Task',
};

export const SUGGESTED_PRESET_BY_INSTITUTION_TYPE: Record<InstitutionType, StudentPortalPresetKey> = {
  school: 'cbse_k12', college: 'indian_college', university: 'indian_college', training_center: 'indian_college',
};
