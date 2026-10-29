import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import {
  assertRestrictedDatabaseRole,
  runInReadinessScope,
  schema,
  sql,
} from '@edrion/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import {
  m4EvaluationSchema,
  validateSharedCanvas,
  type SharedCanvasState,
  type M4Evaluation,
  type M4Response,
} from '@edrion/schemas';
import { API_ENV } from '../../../common/tokens';
import { m4Hash, m4InstrumentSchema, type M4Instrument } from './petros-v2-contracts.server';

/** Pure registered deterministic kernel; free text never passes an exact/keyword checker. */
export function evaluateM4Instrument(
  instrument: M4Instrument,
  response: M4Response,
  responseId: string,
  committedCanvas?: SharedCanvasState,
): M4Evaluation {
  const values: Record<string, unknown> =
    response.kind === 'structured'
      ? response.values
      : response.kind === 'choice'
        ? { answer: response.choiceId }
        : response.kind === 'number'
          ? { answer: response.value, unit: response.unit }
          : {};
  const criteria = instrument.criteria.map((c) => {
    const k = c.checker;
    if (k.kind === 'qualitative')
      return {
        criterionId: c.id,
        label: c.label,
        status: 'abstained' as const,
        origin: 'review_required' as const,
        feedback: 'This part of your response needs teacher review.',
      };
    if (k.kind === 'canvas_value' || k.kind === 'canvas_relation') {
      if (
        response.kind !== 'canvas_snapshot' ||
        !committedCanvas ||
        !committedCanvas.invitation?.submitted
      )
        throw new Error('M5_COMMITTED_CANVAS_REQUIRED');
      const satisfied =
        k.kind === 'canvas_relation'
          ? committedCanvas.elements.some(
              (e) =>
                e.kind === 'edge' &&
                e.from === k.from &&
                e.to === k.to &&
                e.relation === k.relation,
            )
          : committedCanvas.elements.some(
              (e) =>
                e.id === k.elementId &&
                (e.kind === 'equation'
                  ? e.value === k.expected
                  : 'text' in e && e.text === k.expected),
            );
      return {
        criterionId: c.id,
        label: c.label,
        target: {
          elementIds:
            k.kind === 'canvas_value'
              ? [k.elementId]
              : committedCanvas.elements
                  .filter((e) => e.kind === 'edge' && e.from === k.from)
                  .map((e) => e.id),
        },
        status: satisfied ? ('satisfied' as const) : ('not_satisfied' as const),
        origin: 'trusted_kernel' as const,
        feedback: satisfied
          ? 'Your committed work meets this bounded criterion.'
          : 'Your committed work does not yet meet this criterion.',
      };
    }
    const value = values[k.field];
    const satisfied =
      k.kind === 'exact'
        ? typeof value === 'string' && k.accepted.includes(value)
        : typeof value === 'number' &&
          Number.isFinite(value) &&
          Math.abs(value - k.expected) <= k.tolerance &&
          (k.unit === '' || values.unit === k.unit);
    return {
      criterionId: c.id,
      label: c.label,
      target: { fieldId: k.field },
      status: satisfied ? ('satisfied' as const) : ('not_satisfied' as const),
      origin: 'trusted_kernel' as const,
      feedback: satisfied
        ? 'Your response meets this criterion.'
        : 'Your response does not yet meet this criterion.',
    };
  });
  return m4EvaluationSchema.parse({
    id: randomUUID(),
    responseId,
    status: criteria.some((c) => c.status === 'abstained') ? 'review_required' : 'evaluated',
    criteria,
    evaluatorVersion: 'petros.m4.kernel.v1',
    supersedes: null,
    reason: null,
  });
}
@Injectable()
export class PetrosV2AssessmentService implements OnModuleInit, OnModuleDestroy {
  private client?: ReturnType<typeof postgres>;
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}
  async onModuleInit() {
    if (!this.env.PETROS_V2_SESSIONS_ENABLED || !this.env.PETROS_V2_EVALUATOR_DATABASE_URL)
      return;
    const url = new URL(this.env.PETROS_V2_EVALUATOR_DATABASE_URL);
    const host = url.searchParams.get('host');
    url.searchParams.delete('host');
    this.client = postgres(url.toString(), {
      ...(host ? { host } : {}),
      max: 3,
      prepare: false,
      connect_timeout: 3,
    });
    await assertRestrictedDatabaseRole(
      drizzle(this.client, { schema }),
      'edrion_petros_v2_evaluator',
    );
  }
  async onModuleDestroy() {
    await this.client?.end({ timeout: 3 });
    this.client = undefined;
  }
  async evaluate(input: {
    institutionId: string;
    studentId: string;
    sessionId: string;
    taskId: string;
    contractHash: string;
    responseId: string;
    response: M4Response;
  }) {
    if (!this.client) throw new Error('M4_EVALUATOR_UNAVAILABLE');
    // Private database read finishes before evaluation. No provider is invoked by M4.
    const raw = await runInReadinessScope(
      drizzle(this.client, { schema }),
      input,
      async (tx) => {
        const [r] = await tx.execute<{ contract: unknown }>(
          sql`select m4_private_instrument(${input.taskId}::uuid) as contract`,
        );
        const canvas =
          input.response.kind === 'canvas_snapshot'
            ? (
                await tx.execute<{ snapshot: unknown }>(
                  sql`select m5_committed_canvas(${input.responseId}::uuid) as snapshot`,
                )
              )[0]?.snapshot
            : null;
        return { contract: r?.contract, canvas };
      },
    );
    const instrument = m4InstrumentSchema.parse(raw.contract);
    if (m4Hash(instrument) !== input.contractHash) throw new Error('M4_CONTRACT_CHANGED');
    const work = raw.canvas as {
      snapshot: { canvas: unknown };
      expectedHash: string;
      response: unknown;
      responseHash: string;
    } | null;
    if (
      work &&
      (m4Hash(work.snapshot) !== work.expectedHash ||
        m4Hash(work.response) !== work.responseHash ||
        m4Hash(input.response) !== work.responseHash)
    )
      throw new Error('M5_IMMUTABLE_WORK_HASH_MISMATCH');
    return evaluateM4Instrument(
      instrument,
      input.response,
      input.responseId,
      work ? validateSharedCanvas(work.snapshot.canvas) : undefined,
    );
  }
}
