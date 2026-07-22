import type { ExamSkin } from '../exam-blueprint';

/**
 * Render-time skin mapping (D-T2-017).
 * `nta` remains a reserved blueprint enum value but resolves to the standard player
 * until approved NTA reference assets land.
 */
export type RenderExamSkin = 'standard' | 'paper';

export function resolveRenderSkin(declared: ExamSkin | string | null | undefined): RenderExamSkin {
  if (declared === 'paper') return 'paper';
  // nta → standard (deferred frozen NTA skin)
  // standard and unknown → standard
  return 'standard';
}

/** True when the declared skin is the reserved NTA value (show coming-soon note). */
export function isReservedNtaSkin(declared: ExamSkin | string | null | undefined): boolean {
  return declared === 'nta';
}
