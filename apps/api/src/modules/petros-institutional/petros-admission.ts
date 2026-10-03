import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { petrosAdmissionDenialSchema, type PetrosAdmissionDenial } from '@edrion/schemas';

export function questionDenial(
  code: string,
  correlationId: string = randomUUID(),
): PetrosAdmissionDenial {
  const category =
    code === 'RATE_LIMITED' || code === 'PETROS_QUESTION_LIMIT'
      ? 'abuse_control'
      : /QUOTA|STUDENT_BUDGET/.test(code)
        ? 'product_plan_allowance'
        : /KNOWLEDGE|ASSIGNMENT/.test(code)
          ? 'pedagogical_attempt_policy'
          : 'safety_resource_limit';
  const message =
    category === 'abuse_control'
      ? 'Question generation is temporarily limited. Try later; contact your institution if this persists.'
      : category === 'product_plan_allowance'
        ? 'The configured AI allowance is exhausted. Prepared work remains available; contact your institution about the allowance.'
        : category === 'pedagogical_attempt_policy'
          ? 'This question cannot run under the current learning policy. Refresh the lesson or ask your teacher for an allowed path.'
          : 'Question generation is unavailable within the current resource or access limits. Refresh the lesson; previously prepared work remains subject to access checks.';
  return petrosAdmissionDenialSchema.parse({
    category,
    code,
    correlationId,
    message,
    retry:
      category === 'abuse_control'
        ? 'later'
        : category === 'product_plan_allowance' || category === 'pedagogical_attempt_policy'
          ? 'contact_institution'
          : 'refresh',
  });
}

export function knowledgeDenied(code: string) {
  const admission = questionDenial(code);
  return new ConflictException({ code, message: admission.message, meta: { admission } });
}
