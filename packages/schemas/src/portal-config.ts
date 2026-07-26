import { z } from 'zod';

export const studentModuleKeys = [
  'timetable','attendance','results','registration','exam_prep','fees','documents','transport',
  'hostel','campus_library','health','id_card','diary','clubs','events','placements','grievance',
  'announcements','learn','library','lab','planner','progress',
] as const;
export const studentModuleKeySchema = z.enum(studentModuleKeys);
export type StudentModuleKey = z.infer<typeof studentModuleKeySchema>;

export const terminologyKeys = [
  'term_period','term_period_plural','group_unit','internal_assessment','marks_word','teacher_title',
  'head_role','student_id_word','timetable_word','exam_word','homework_word','holiday_word','fee_word','campus_word',
] as const;
export const terminologyKeySchema = z.enum(terminologyKeys);
export const terminologyPackSchema = z.record(terminologyKeySchema, z.string().trim().min(1).max(30));
export type PortalTerminologyPack = z.infer<typeof terminologyPackSchema>;

export const studentPortalPresetKeySchema = z.enum([
  'indian_college','cbse_k12','us_k12','us_higher_ed','custom',
]);

const moduleValuesSchema = z.record(studentModuleKeySchema, z.boolean());
const labelOverridesSchema = z.record(studentModuleKeySchema, z.string().trim().min(1).max(24));

export const putStudentPortalConfigSchema = z.object({
  revision: z.number().int().min(0),
  scope: z.union([
    z.literal('institution'),
    z.object({ campus_id: z.string().uuid() }),
  ]),
  modules: moduleValuesSchema,
  cleared_overrides: z.array(studentModuleKeySchema).default([]),
  terminology: terminologyPackSchema.optional(),
  label_overrides: labelOverridesSchema.optional(),
  attendance_threshold: z.number().int().min(1).max(100).optional(),
  grading_scheme: z.string().trim().min(1).max(80).optional(),
});
export type PutStudentPortalConfigInput = z.infer<typeof putStudentPortalConfigSchema>;

export interface EffectiveStudentModule {
  key: StudentModuleKey;
  label: string;
  icon: string;
  category: 'academics' | 'money' | 'campus' | 'life' | 'learning';
}

export interface StudentPortalConfigResponse {
  modules: EffectiveStudentModule[];
  terminology: PortalTerminologyPack;
  tier: 'individual' | 'school' | 'college';
  config_fingerprint: string;
}
