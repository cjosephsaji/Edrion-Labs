import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  ilike,
  lt,
  or,
  schema,
  type Database,
  type SQL,
} from '@edrion/database';
import type { ListRunsQuery } from '@edrion/schemas';
import type {
  AiApproval,
  AiConfirmation,
  AiRun,
  AiToolCall,
  AuditEvent,
  NewAiApproval,
  NewAiConfirmation,
  NewAiRun,
  NewAiToolCall,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class CopilotRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // --- Runs ---------------------------------------------------------------------------------

  async insertRun(values: NewAiRun): Promise<AiRun> {
    const [row] = await this.db.insert(schema.aiRuns).values(values).returning();
    return row!;
  }

  findRun(id: string): Promise<AiRun | undefined> {
    return this.db.select().from(schema.aiRuns).where(eq(schema.aiRuns.id, id)).limit(1).then((r) => r[0]);
  }

  async updateRun(id: string, patch: Partial<NewAiRun>): Promise<AiRun | undefined> {
    const [row] = await this.db
      .update(schema.aiRuns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.aiRuns.id, id))
      .returning();
    return row;
  }

  /** Cursor (keyset) list over runs, newest first — powers the AI audit surface. */
  async listRuns(q: ListRunsQuery): Promise<{ items: AiRun[]; nextCursor: string | null }> {
    const clauses: SQL[] = [];
    if (q.status) clauses.push(eq(schema.aiRuns.status, q.status));
    if (q.employeeId) clauses.push(eq(schema.aiRuns.employeeId, q.employeeId));
    if (q.riskLevel) clauses.push(eq(schema.aiRuns.riskLevel, q.riskLevel));
    if (q.search) {
      const s = or(
        ilike(schema.aiRuns.prompt, `%${q.search}%`),
        ilike(schema.aiRuns.summary, `%${q.search}%`),
        ilike(schema.aiRuns.employeeName, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.cursor) clauses.push(lt(schema.aiRuns.startedAt, new Date(q.cursor)));

    const where = clauses.length ? and(...clauses) : undefined;
    const rows = await this.db
      .select()
      .from(schema.aiRuns)
      .where(where)
      .orderBy(desc(schema.aiRuns.startedAt))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.startedAt.toISOString() : null;
    return { items, nextCursor };
  }

  // --- Tool calls ---------------------------------------------------------------------------

  async insertToolCall(values: NewAiToolCall): Promise<AiToolCall> {
    const [row] = await this.db.insert(schema.aiToolCalls).values(values).returning();
    return row!;
  }

  toolCallsForRun(runId: string): Promise<AiToolCall[]> {
    return this.db
      .select()
      .from(schema.aiToolCalls)
      .where(eq(schema.aiToolCalls.runId, runId))
      .orderBy(schema.aiToolCalls.createdAt);
  }

  async updateToolCall(id: string, patch: Partial<NewAiToolCall>): Promise<AiToolCall | undefined> {
    const [row] = await this.db
      .update(schema.aiToolCalls)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.aiToolCalls.id, id))
      .returning();
    return row;
  }

  // --- Confirmations / approvals ------------------------------------------------------------

  async insertConfirmation(values: NewAiConfirmation): Promise<AiConfirmation> {
    const [row] = await this.db.insert(schema.aiConfirmations).values(values).returning();
    return row!;
  }

  confirmationsForRun(runId: string): Promise<AiConfirmation[]> {
    return this.db
      .select()
      .from(schema.aiConfirmations)
      .where(eq(schema.aiConfirmations.runId, runId))
      .orderBy(desc(schema.aiConfirmations.createdAt));
  }

  async insertApproval(values: NewAiApproval): Promise<AiApproval> {
    const [row] = await this.db.insert(schema.aiApprovals).values(values).returning();
    return row!;
  }

  approvalsForRun(runId: string): Promise<AiApproval[]> {
    return this.db
      .select()
      .from(schema.aiApprovals)
      .where(eq(schema.aiApprovals.runId, runId))
      .orderBy(desc(schema.aiApprovals.createdAt));
  }

  // --- Audit linkage ------------------------------------------------------------------------

  /** Audit events written under this run (aiRunId), linking the run to the audit trail. */
  auditEventsForRun(runId: string): Promise<AuditEvent[]> {
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.aiRunId, runId))
      .orderBy(desc(schema.auditEvents.occurredAt));
  }

  /** The most recent audit event for a run + action — used to link an executed tool call. */
  latestAuditEvent(runId: string, action: string): Promise<AuditEvent | undefined> {
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.aiRunId, runId), eq(schema.auditEvents.action, action)))
      .orderBy(desc(schema.auditEvents.occurredAt))
      .limit(1)
      .then((r) => r[0]);
  }
}
