import { z } from 'zod';

/** Pinned merge payload shapes used by resolvers / render queue. */
export const commonMergeSchema = z.object({
  institution: z.object({
    name: z.string(),
    address: z.string().optional(),
    affiliation: z.string().optional(),
    logo: z.string().optional(),
  }),
  issue: z.object({ date: z.string() }),
  verify: z.object({
    code: z.string(),
    qr: z.string().optional(),
  }),
});

export const studentMergeSchema = z.object({
  name: z.string(),
  regNo: z.string().optional(),
  program: z.string().optional(),
  classSection: z.string().optional(),
  yearOrGrade: z.string().optional(),
  dob: z.string().optional(),
  guardianName: z.string().optional(),
  academicYear: z.string().optional(),
  photo: z.string().optional(),
});

export const reportCardMergeSchema = z.object({
  term: z.object({
    name: z.string(),
    academicYear: z.string().optional(),
  }),
  marks: z.object({
    scholasticTable: z.array(z.record(z.string(), z.unknown())).default([]),
    coScholasticTable: z.array(z.record(z.string(), z.unknown())).default([]),
    gradeLegend: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  result: z.object({
    total: z.number().optional(),
    percentage: z.number().optional(),
    grade: z.string().optional(),
    gpa: z.number().optional(),
    rank: z.number().optional(),
    standing: z.string().optional(),
  }),
  attendance: z
    .object({
      presentDays: z.number().optional(),
      totalDays: z.number().optional(),
      percent: z.number().optional(),
    })
    .optional(),
  remarks: z
    .object({
      classTeacher: z.string().optional(),
    })
    .optional(),
});

export type ReportCardMergeData = z.infer<typeof reportCardMergeSchema>;
