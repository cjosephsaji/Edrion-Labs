import { z } from 'zod';

export const studentLoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  institutionCode: z.string().optional(),
});

export const studentActivateSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const studentResetRequestSchema = z.object({
  email: z.string().email(),
});

export const studentResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const studentChangePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(72),
  confirmPassword: z.string().min(8).max(72),
}).refine((input) => input.newPassword === input.confirmPassword, {
  path: ['confirmPassword'], message: 'Your new passwords do not match.',
});

export const independentSignupSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  country: z.string().optional(),
});

export const independentVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  password: z.string().min(8),
});

export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type StudentActivateInput = z.infer<typeof studentActivateSchema>;
export type StudentResetRequestInput = z.infer<typeof studentResetRequestSchema>;
export type StudentResetInput = z.infer<typeof studentResetSchema>;
export type StudentChangePasswordInput = z.infer<typeof studentChangePasswordSchema>;
export type IndependentSignupInput = z.infer<typeof independentSignupSchema>;
export type IndependentVerifyInput = z.infer<typeof independentVerifySchema>;
