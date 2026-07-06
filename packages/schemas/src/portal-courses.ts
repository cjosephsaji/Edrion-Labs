import { z } from 'zod';
import { versionSchema } from './common';

export const gradingSchemeRowSchema = z.object({
  component: z.string(),
  weightPct: z.number().min(0).max(100),
});

export const createCourseSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  credits: z.number().int().min(0).max(30).nullish(),
  professorTeacherId: z.string().uuid().nullish(),
  termId: z.string().uuid().nullish(),
  officeHours: z.string().max(500).nullish(),
  gradingScheme: z.array(gradingSchemeRowSchema).default([]),
  attendanceRequiredPct: z.number().int().min(0).max(100).default(75),
});

export const updateCourseSchema = createCourseSchema.partial().extend({ version: versionSchema });

export const syllabusModuleInputSchema = z.object({
  weekNo: z.number().int().min(1).max(52),
  title: z.string().trim().min(1).max(200),
  topics: z.array(z.string().trim().min(1)).default([]),
  covered: z.boolean().default(false),
});

export const upsertSyllabusSchema = z.object({
  modules: z.array(syllabusModuleInputSchema),
});

export const courseEnrollmentSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type UpsertSyllabusInput = z.infer<typeof upsertSyllabusSchema>;
