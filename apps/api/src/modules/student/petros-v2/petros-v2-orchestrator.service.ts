import { randomUUID } from 'node:crypto';
import {
  instructionalDecisionSchema,
  type InstructionalDecision,
  type InstructionalStrategy,
} from '@edrion/schemas';
import { validatePrerequisites, type PetrosTeachingContext } from './petros-v2-context';

const strategyFor = {
  conceptual: 'conceptual_contrast',
  terminology: 'vocabulary_repair',
  arithmetic: 'method_repair',
  assumption: 'assumption_comparison',
  missing_step: 'method_repair',
  unsupported_link: 'warrant_inspection',
  ambiguous: 'clarifying_question',
} as const;
/** Pure bounded policy. Subject names, student IDs and response strings are never selection features. */
export class PetrosV2OrchestratorService {
  decide(ctx: PetrosTeachingContext): InstructionalDecision {
    const base = {
      version: 'petros.m5.decision.v1',
      id: randomUUID(),
      objectiveId: ctx.objectiveId,
      evidenceIds: [] as string[],
      fragmentId: null,
      criterionId: null,
      hypothesis: null,
      uncertainty: 'no_evidence',
      origin: 'deterministic_policy',
      rejectedAlternatives: [] as string[],
      expectedObservation: 'No learning inference from presentation.',
    };
    const stop = (
      strategy: InstructionalStrategy,
      reason: string,
      termination: string,
      uncertainty = 'review_required',
    ) => instructionalDecisionSchema.parse({ ...base, strategy, reason, termination, uncertainty });
    if (
      !Object.values(ctx.authority).every(Boolean) ||
      ctx.objectiveId !== ctx.publication.lesson.objective.id
    )
      return stop(
        'unavailable',
        'Current source, scope, review or session authority is unavailable.',
        'scope_unavailable',
      );
    if (ctx.independentTaskOpen)
      return stop(
        'unavailable',
        'An independent task is open; answer-revealing teaching is unavailable.',
        'scope_unavailable',
      );
    if (ctx.budget.remainingDecisions <= 0 || Date.now() >= ctx.budget.deadline)
      return stop('unavailable', 'The bounded planning budget has ended.', 'budget');
    if (!ctx.accessibility.textAlternative)
      return stop(
        'unavailable',
        'An equivalent accessible presentation is unavailable.',
        'capability_unavailable',
      );
    try {
      validatePrerequisites(ctx.manifest);
    } catch {
      return stop('unavailable', 'The prerequisite graph requires review.', 'scope_unavailable');
    }
    const evidence = ctx.evidence.filter((e) => e.committed);
    const latest = evidence.at(-1);
    if (latest && ['unavailable', 'invalidated'].includes(latest.evaluation.status))
      return stop(
        'review_required',
        'The committed response has no current qualified evaluation.',
        'review_required',
      );
    let strategy: InstructionalStrategy = 'orientation';
    let criterion = null as PetrosTeachingContext['manifest']['criteria'][number] | null;
    let uncertainty: InstructionalDecision['uncertainty'] = 'no_evidence';
    const failed = latest?.evaluation.criteria.filter((c) => c.status === 'not_satisfied') ?? [];
    const ambiguous = latest?.evaluation.criteria.some((c) => c.status === 'abstained');
    // Preserve demonstrated method/concepts: only a failed, reviewed criterion can motivate repair.
    if (failed.length) {
      criterion =
        ctx.manifest.criteria.find((c) => failed.some((f) => f.criterionId === c.id)) ?? null;
      if (!criterion)
        return stop(
          'review_required',
          'A criterion has no reviewed pedagogical mapping.',
          'review_required',
        );
      strategy = strategyFor[criterion.category];
      uncertainty = 'candidate';
      const relevant = evidence.flatMap((e) =>
        e.evaluation.criteria
          .filter((c) => c.criterionId === criterion!.id)
          .map((c) => ({ ...c, family: e.equivalenceKey, assisted: e.assisted || e.repeated })),
      );
      if (relevant.some((c) => c.status === 'satisfied')) {
        strategy = 'clarifying_question';
        uncertainty = 'conflicting';
      } else if (
        criterion.distinguishes &&
        new Set(
          relevant.filter((c) => c.status === 'not_satisfied' && !c.assisted).map((c) => c.family),
        ).size >= 2
      )
        uncertainty = 'supported';
    } else if (ambiguous) {
      strategy = 'clarifying_question';
      uncertainty = 'review_required';
    } else if (latest) {
      strategy = latest.assisted || latest.repeated ? 'faded_support' : 'fresh_verification';
      uncertainty = 'observed';
    }
    if (ctx.requestedStrategy) strategy = ctx.requestedStrategy;
    const options = ctx.manifest.fragments.filter(
      (f) =>
        f.strategies.includes(strategy) &&
        ctx.capabilities.includes(f.capability) &&
        (!ctx.requestedCapability || f.capability === ctx.requestedCapability) &&
        f.accessibleAlternative.trim() &&
        (!criterion || f.criterionIds.includes(criterion.id)),
    );
    const fragment = options[0];
    if (!fragment)
      return stop(
        ambiguous ? 'review_required' : 'unavailable',
        `No reviewed accessible capability supports ${strategy}.`,
        ambiguous ? 'review_required' : 'capability_unavailable',
        uncertainty,
      );
    return instructionalDecisionSchema.parse({
      ...base,
      strategy,
      criterionId: criterion?.id ?? null,
      fragmentId: fragment.id,
      evidenceIds: evidence.map((e) => e.evaluation.id).slice(-64),
      hypothesis: criterion?.category ?? null,
      uncertainty,
      reason: criterion
        ? `The committed ${criterion.role} criterion needs attention; ${uncertainty === 'conflicting' ? 'counterevidence requires clarification' : 'the hypothesis remains evidence-limited'}.`
        : latest
          ? 'The next action reflects the evaluated response and its assistance conditions.'
          : 'Orient to the current reviewed source before requesting evidence.',
      expectedObservation: fragment.expectedObservation,
      rejectedAlternatives: criterion
        ? [
            'Do not repeat unrelated instruction for criteria already satisfied.',
            'A single error does not establish a permanent misconception.',
          ]
        : [],
      termination: fragment.checkpoint ? 'student_checkpoint' : 'fresh_check',
    });
  }
}
