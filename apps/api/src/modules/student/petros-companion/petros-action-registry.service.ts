import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import {
  PETROS_MUTATING_ACTIONS,
  resolvePetrosRoute,
  type PetrosActionKey,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosSessionIntentService } from '../petros-session-intent/petros-session-intent.service';
import type { ResolvedPageContext } from './petros-student-context.service';

/** A model-proposed action after the service validated its arguments. */
export type ValidatedAction = {
  actionKey: PetrosActionKey;
  title: string;
  preview: string[];
  arguments: Record<string, unknown>;
  confirmationRequired: boolean;
};

export type ActionExecution = {
  href: string | null;
  message: string;
  resultRef: string | null;
};

/** Furthest ahead a companion-proposed study block may be placed. */
const MAX_PLAN_HORIZON_DAYS = 180;
/** Small grace window so "in five minutes" is not rejected by clock skew. */
const PLAN_PAST_GRACE_MS = 60 * 60_000;

const isoDateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected an ISO date-time');

/**
 * A model can and does hallucinate dates. A proposed study time is only usable when it
 * is genuinely in the near future, so an invented date is rejected here rather than
 * being written to the student's calendar.
 */
const futureDateTime = isoDateTime.refine((value) => {
  const time = Date.parse(value);
  const now = Date.now();
  return time > now - PLAN_PAST_GRACE_MS && time < now + MAX_PLAN_HORIZON_DAYS * 86_400_000;
}, 'Expected a date-time within the next six months');

const ARGUMENT_SCHEMAS = {
  'navigate.open': z.object({ href: z.string().trim().startsWith('/').max(500) }).strict(),
  'session.preview_and_start': z
    .object({
      sourceRef: z.string().trim().min(1).max(160),
      question: z.string().trim().min(3).max(600),
      minutes: z.number().int().min(5).max(45).default(15),
    })
    .strict(),
  'session.resume': z.object({ sessionId: z.string().uuid() }).strict(),
  'planner.create': z
    .object({
      items: z
        .array(
          z
            .object({
              title: z.string().trim().min(2).max(120),
              startsAt: futureDateTime,
              minutes: z.number().int().min(10).max(240),
            })
            .strict(),
        )
        .min(1)
        .max(6),
    })
    .strict(),
  'planner.update': z
    .object({
      itemId: z.string().uuid(),
      title: z.string().trim().min(2).max(120).optional(),
      startsAt: futureDateTime.optional(),
    })
    .strict(),
  'review.open_due': z.object({ artifactId: z.string().uuid().optional() }).strict(),
  'reflection.open_recommendation': z
    .object({ recommendationId: z.string().uuid().optional() })
    .strict(),
  'artifact.open': z.object({ artifactId: z.string().uuid() }).strict(),
  'teach_back.start': z
    .object({ topic: z.string().trim().min(2).max(160), sourceRef: z.string().trim().max(160).optional() })
    .strict(),
} satisfies Record<PetrosActionKey, z.ZodTypeAny>;

/** Permission each action needs on top of `student.learn.use`. */
const ACTION_PERMISSIONS: Partial<Record<PetrosActionKey, string>> = {
  'session.preview_and_start': 'student.learn.use',
  'session.resume': 'student.learn.use',
  'review.open_due': 'student.learn.use',
  'reflection.open_recommendation': 'student.learn.use',
  'artifact.open': 'student.learn.use',
  'teach_back.start': 'student.learn.use',
};

/**
 * The registry owns arguments, permissions, confirmation policy and execution.
 * The model may only name a key and propose bounded inputs; everything it proposes is
 * re-validated here and again at confirmation time.
 */
@Injectable()
export class PetrosActionRegistryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly intents: PetrosSessionIntentService,
  ) {}

  private assertPermission(principal: InstitutionalStudentPrincipal, actionKey: PetrosActionKey) {
    const required = ACTION_PERMISSIONS[actionKey];
    if (!required) return;
    if (principal.permissions.includes(required) || principal.permissions.includes('*')) return;
    throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
  }

  /**
   * Validates one model-proposed action against the registry.
   * Returns `null` instead of throwing when the proposal is unusable, so a bad model
   * suggestion degrades to a plain answer rather than failing the whole turn.
   */
  async validate(
    principal: InstitutionalStudentPrincipal,
    context: ResolvedPageContext,
    proposal: { actionKey: string; arguments: unknown },
  ): Promise<ValidatedAction | null> {
    if (!(proposal.actionKey in ARGUMENT_SCHEMAS)) return null;
    const actionKey = proposal.actionKey as PetrosActionKey;
    try {
      this.assertPermission(principal, actionKey);
    } catch {
      return null;
    }
    const parsed = ARGUMENT_SCHEMAS[actionKey].safeParse(proposal.arguments ?? {});
    if (!parsed.success) return null;
    const args = parsed.data as Record<string, unknown>;
    const confirmationRequired = PETROS_MUTATING_ACTIONS.includes(actionKey);

    switch (actionKey) {
      case 'navigate.open': {
        const href = String(args.href);
        // The model never invents a destination: it must be a real portal route
        // Petros is allowed to talk about.
        const rule = resolvePetrosRoute(href);
        if (rule.support === 'hidden') return null;
        return {
          actionKey,
          title: `Open ${rule.label}`,
          preview: [`Go to ${rule.label} (${href})`],
          arguments: { href },
          confirmationRequired,
        };
      }

      case 'session.preview_and_start': {
        const candidate = context.candidates.find((item) => item.ref === args.sourceRef);
        if (!candidate?.entityId) return null;
        return {
          actionKey,
          title: `Work through ${candidate.title}`,
          preview: [
            `Opens a guided Petros session on ${candidate.title}`,
            `About ${args.minutes} minutes`,
            'Your question is carried into the session',
          ],
          arguments: {
            sourceId: candidate.entityId,
            question: args.question,
            minutes: args.minutes,
            route: context.route,
          },
          confirmationRequired,
        };
      }

      case 'session.resume': {
        const session = await this.ownedSession(principal, String(args.sessionId));
        if (!session) return null;
        return {
          actionKey,
          title: `Resume ${session.topic}`,
          preview: [`Reopens your ${session.status} session on ${session.topic}`],
          arguments: { sessionId: session.id },
          confirmationRequired,
        };
      }

      case 'planner.create': {
        const items = args.items as Array<{ title: string; startsAt: string; minutes: number }>;
        return {
          actionKey,
          title: items.length === 1 ? 'Add a study block' : `Add ${items.length} study blocks`,
          preview: items.map(
            (item) =>
              `${item.title} — ${formatWhen(item.startsAt, context.timeZone)} for ${item.minutes} min`,
          ),
          arguments: { items },
          confirmationRequired,
        };
      }

      case 'planner.update': {
        const existing = await this.ownedPlannerItem(principal, String(args.itemId));
        if (!existing) return null;
        const nextTitle = (args.title as string | undefined) ?? existing.title;
        const nextStart = (args.startsAt as string | undefined) ?? existing.dueAt.toISOString();
        return {
          actionKey,
          title: `Update ${existing.title}`,
          preview: [
            `Was: ${existing.title} — ${formatWhen(existing.dueAt.toISOString(), context.timeZone)}`,
            `Now: ${nextTitle} — ${formatWhen(nextStart, context.timeZone)}`,
          ],
          arguments: { itemId: existing.id, title: nextTitle, startsAt: nextStart },
          confirmationRequired,
        };
      }

      case 'review.open_due':
        return {
          actionKey,
          title: 'Open a due review',
          preview: ['Opens your next due spaced review'],
          arguments: { ...(args.artifactId ? { artifactId: args.artifactId } : {}) },
          confirmationRequired,
        };

      case 'reflection.open_recommendation':
        return {
          actionKey,
          title: 'Open your next recommendation',
          preview: ['Opens the evidence-linked recommendation on your progress page'],
          arguments: {},
          confirmationRequired,
        };

      case 'artifact.open': {
        const artifact = await this.ownedArtifact(principal, String(args.artifactId));
        if (!artifact) return null;
        return {
          actionKey,
          title: `Open ${artifact.title}`,
          preview: [`Opens your saved artifact “${artifact.title}”`],
          arguments: { artifactId: artifact.id },
          confirmationRequired,
        };
      }

      case 'teach_back.start':
        return {
          actionKey,
          title: `Teach back: ${args.topic}`,
          preview: [`Starts a teach-it-back round on ${args.topic}`, 'You explain, Petros asks'],
          arguments: { topic: args.topic },
          confirmationRequired,
        };

      default:
        return null;
    }
  }

  /**
   * Re-parses stored arguments against the live schema before anything is written.
   *
   * Student requests run inside one institution-scoped transaction, so a statement that
   * violates a database constraint aborts the whole request and no later write — including
   * a "mark this proposal failed" write — can succeed. Everything that can be checked must
   * therefore be checked before the first write.
   */
  revalidate(actionKey: PetrosActionKey, args: Record<string, unknown>) {
    const schema = ARGUMENT_SCHEMAS[actionKey];
    if (!schema) return null;
    const parsed = schema.safeParse(args);
    return parsed.success ? (parsed.data as Record<string, unknown>) : null;
  }

  /**
   * Executes a confirmed proposal. Re-checks ownership, permission and freshness here —
   * validation at proposal time is not trusted at execution time.
   */
  async execute(
    principal: InstitutionalStudentPrincipal,
    actionKey: PetrosActionKey,
    args: Record<string, unknown>,
    executionKey: string,
  ): Promise<ActionExecution> {
    this.assertPermission(principal, actionKey);
    const revalidated = this.revalidate(actionKey, args);
    if (!revalidated) throw new BadRequestException({ code: 'PETROS_ACTION_STALE' });
    args = revalidated;

    switch (actionKey) {
      case 'navigate.open': {
        const href = String(args.href);
        if (resolvePetrosRoute(href).support === 'hidden') {
          throw new BadRequestException({ code: 'PETROS_ACTION_UNAVAILABLE' });
        }
        return { href, message: 'Opening that now.', resultRef: null };
      }

      case 'session.preview_and_start': {
        const intent = await this.intents.resolve(principal, {
          door: 'assistant_handoff',
          sourceId: String(args.sourceId),
          idempotencyKey: derive(executionKey, 'resolve'),
          timeBudgetSeconds: Number(args.minutes ?? 15) * 60,
          question: String(args.question),
          route: String(args.route ?? '/home'),
          language: 'en',
          accessibility: [],
        } as never);
        const started = await this.intents.start(principal, intent.id, {
          idempotencyKey: derive(executionKey, 'start'),
        } as never);
        const sessionId = (started as { session: { id: string } }).session.id;
        return {
          href: `/petros/session?session=${sessionId}`,
          message: 'Session ready.',
          resultRef: sessionId,
        };
      }

      case 'session.resume': {
        const session = await this.ownedSession(principal, String(args.sessionId));
        if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
        return {
          href: `/petros/session?session=${session.id}`,
          message: `Picking up ${session.topic} where you stopped.`,
          resultRef: session.id,
        };
      }

      case 'planner.create': {
        const items = args.items as Array<{ title: string; startsAt: string; minutes: number }>;
        const rows = await this.db
          .insert(schema.userObligations)
          .values(
            items.map((item, index) => ({
              institutionId: principal.institutionId,
              studentId: principal.studentId,
              source: 'plan_engine',
              kind: 'study_block',
              title: item.title,
              dueAt: new Date(item.startsAt),
              status: 'pending',
              deepLink: '/calendar',
              // One key per item derived from the single confirmed execution key, so a
              // retried confirmation cannot double-insert.
              idempotencyKey: derive(executionKey, `planner-${index}`),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: schema.userObligations.id });
        return {
          href: '/calendar',
          message:
            rows.length === items.length
              ? `Added ${rows.length === 1 ? 'that block' : `${rows.length} blocks`} to your calendar.`
              : 'Those blocks were already on your calendar.',
          resultRef: rows[0]?.id ?? null,
        };
      }

      case 'planner.update': {
        const existing = await this.ownedPlannerItem(principal, String(args.itemId));
        if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
        const [row] = await this.db
          .update(schema.userObligations)
          .set({
            title: String(args.title ?? existing.title),
            dueAt: new Date(String(args.startsAt ?? existing.dueAt.toISOString())),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.userObligations.id, existing.id),
              eq(schema.userObligations.studentId, principal.studentId),
            ),
          )
          .returning({ id: schema.userObligations.id });
        return { href: '/calendar', message: 'Updated.', resultRef: row?.id ?? null };
      }

      case 'review.open_due':
        return {
          href: args.artifactId ? `/petros/artifacts?artifact=${args.artifactId}` : '/petros/artifacts?due=1',
          message: 'Opening your review queue.',
          resultRef: (args.artifactId as string | undefined) ?? null,
        };

      case 'reflection.open_recommendation':
        return { href: '/progress', message: 'Opening your progress page.', resultRef: null };

      case 'artifact.open': {
        const artifact = await this.ownedArtifact(principal, String(args.artifactId));
        if (!artifact) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
        return {
          href: `/petros/artifacts?artifact=${artifact.id}`,
          message: `Opening ${artifact.title}.`,
          resultRef: artifact.id,
        };
      }

      case 'teach_back.start':
        return {
          href: `/petros?mode=teach-back&topic=${encodeURIComponent(String(args.topic))}`,
          message: 'Teach-back ready when you are.',
          resultRef: null,
        };

      default:
        throw new BadRequestException({ code: 'PETROS_ACTION_UNKNOWN' });
    }
  }

  private ownedSession(principal: InstitutionalStudentPrincipal, sessionId: string) {
    return this.db
      .select({
        id: schema.petrosLearningSessions.id,
        topic: schema.petrosLearningSessions.topic,
        status: schema.petrosLearningSessions.status,
      })
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.studentId, principal.studentId),
          eq(schema.petrosLearningSessions.institutionId, principal.institutionId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  private ownedPlannerItem(principal: InstitutionalStudentPrincipal, itemId: string) {
    return this.db
      .select({
        id: schema.userObligations.id,
        title: schema.userObligations.title,
        dueAt: schema.userObligations.dueAt,
      })
      .from(schema.userObligations)
      .where(
        and(
          eq(schema.userObligations.id, itemId),
          eq(schema.userObligations.studentId, principal.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  private ownedArtifact(principal: InstitutionalStudentPrincipal, artifactId: string) {
    return this.db
      .select({ id: schema.petrosSavedArtifacts.id, content: schema.petrosSavedArtifacts.content })
      .from(schema.petrosSavedArtifacts)
      .where(
        and(
          eq(schema.petrosSavedArtifacts.id, artifactId),
          eq(schema.petrosSavedArtifacts.studentId, principal.studentId),
          eq(schema.petrosSavedArtifacts.institutionId, principal.institutionId),
        ),
      )
      .limit(1)
      .then((rows) => {
        const row = rows[0];
        return row ? { id: row.id, title: row.content.title } : undefined;
      });
  }

  /** Next due spaced review the student owns, used by the briefing and `review.open_due`. */
  nextDueReview(principal: InstitutionalStudentPrincipal) {
    return this.db
      .select({
        id: schema.petrosSavedArtifacts.id,
        content: schema.petrosSavedArtifacts.content,
        dueAt: schema.petrosSavedArtifacts.dueAt,
      })
      .from(schema.petrosSavedArtifacts)
      .where(
        and(
          eq(schema.petrosSavedArtifacts.studentId, principal.studentId),
          eq(schema.petrosSavedArtifacts.institutionId, principal.institutionId),
          eq(schema.petrosSavedArtifacts.lifecycle, 'saved'),
        ),
      )
      .orderBy(schema.petrosSavedArtifacts.dueAt)
      .limit(1)
      .then((rows) => {
        const row = rows[0];
        if (!row?.dueAt || row.dueAt.getTime() > Date.now()) return undefined;
        return { id: row.id, title: row.content.title, dueAt: row.dueAt };
      });
  }

  /** Latest owned session, used by the briefing and by "continue where we stopped". */
  activeSession(principal: InstitutionalStudentPrincipal) {
    return this.db
      .select({
        id: schema.petrosLearningSessions.id,
        topic: schema.petrosLearningSessions.topic,
        status: schema.petrosLearningSessions.status,
        updatedAt: schema.petrosLearningSessions.updatedAt,
      })
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.studentId, principal.studentId),
          eq(schema.petrosLearningSessions.institutionId, principal.institutionId),
        ),
      )
      .orderBy(desc(schema.petrosLearningSessions.updatedAt))
      .limit(1)
      .then((rows) => rows.find((row) => row.status === 'active' || row.status === 'paused'));
  }
}

/** Deterministic child key so one confirmation produces one write per sub-step on retry. */
function derive(executionKey: string, salt: string) {
  const hex = createHash('sha256').update(`${executionKey}:${salt}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Renders a proposal time in the student's own timezone, never in UTC. */
function formatWhen(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }
}
