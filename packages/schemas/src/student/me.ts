import { z } from 'zod';

export const studentPreferencesSchema = z.object({
  theme: z.enum(['standard', 'dim', 'dark']),
  matchSystem: z.boolean(),
  textSize: z.enum(['S', 'M', 'L']),
  reducedMotion: z.boolean(),
  hintGenerosity: z.enum(['gentle', 'balanced', 'direct']),
  celebration: z.enum(['warm', 'calm']),
  weeklyGoal: z.number().int().min(4).max(14),
  quietHours: z.object({ start: z.string(), end: z.string() }).nullable(),
  notifSessionReminders: z.boolean(),
  notifRevisionDue: z.boolean(),
  notifAnnouncements: z.boolean(),
  language: z.enum(['en', 'hi', 'es', 'bn']),
  expertMode: z.boolean(),
});

export const studentMeSchema = z.object({
  kind: z.enum(['institutional', 'independent']),
  id: z.string().uuid(),
  fullName: z.string(),
  initial: z.string(),
  institution: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      type: z.string(),
    })
    .optional(),
  campusId: z.string().uuid().nullable().optional(),
  student: z
    .object({
      id: z.string().uuid(),
      admissionNo: z.string(),
      classId: z.string().uuid().nullable(),
      className: z.string().nullable(),
      gradeLevel: z.string().nullable(),
      curriculumLabel: z.string().nullable(),
    })
    .optional(),
  permissions: z.array(z.string()),
  surfaces: z.record(z.string(), z.boolean()),
  flags: z.object({
    expertModeAvailable: z.boolean(),
  }),
  preferences: studentPreferencesSchema,
  persona: z.enum(['school', 'college', 'independent']),
});

export const homeTileSchema = z.object({
  key: z.string(),
  eyebrow: z.string(),
  title: z.string(),
  meta: z.string().optional(),
  route: z.string(),
});

export const studentHomeSchema = z.object({
  tiles: z.array(homeTileSchema),
  learnBanner: z.object({
    title: z.string(),
    subtitle: z.string(),
  }),
});

export type StudentPreferencesDto = z.infer<typeof studentPreferencesSchema>;
export type StudentMeDto = z.infer<typeof studentMeSchema>;
export type HomeTileDto = z.infer<typeof homeTileSchema>;
export type StudentHomeDto = z.infer<typeof studentHomeSchema>;
