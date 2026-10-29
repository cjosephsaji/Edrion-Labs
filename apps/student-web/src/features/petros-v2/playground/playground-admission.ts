import { z } from 'zod';

/** Server admission uses existing authenticated metadata only. No dev-header impersonation. */
const testerSchema = z.object({ kind: z.literal('institutional'), studentId: z.string().uuid(), passwordChangeRequired: z.boolean().optional(), permissions: z.array(z.string()).max(200) }).passthrough();
export function playgroundEnabled(value: string | undefined) { return value === 'true' || value === '1'; }
export function authorizedPlaygroundTester(raw: unknown, allowlist: string | undefined): string | null {
  const me = testerSchema.safeParse(raw);
  if (!me.success || me.data.passwordChangeRequired) return null;
  const ids = (allowlist ?? '').split(',').map(s => s.trim()).filter(s => z.string().uuid().safeParse(s).success).slice(0, 32);
  return ids.includes(me.data.studentId) && (me.data.permissions.includes('student.learn.use') || me.data.permissions.includes('*')) ? me.data.studentId : null;
}
