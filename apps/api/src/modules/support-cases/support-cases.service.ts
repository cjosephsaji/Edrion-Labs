import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType } from '@edrion/shared-types';
import type {
  AddSupportMessageInput,
  AssignSupportCaseInput,
  ChangeSupportCaseStatusInput,
  CreateSupportCaseInput,
  ListSupportCasesQuery,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { SupportCase } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { SupportCasesRepository } from './support-cases.repository';

const MODULE = 'support-cases';
const ENTITY = 'support_case';

@Injectable()
export class SupportCasesService {
  constructor(
    private readonly repo: SupportCasesRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  list(q: ListSupportCasesQuery) {
    return this.repo.list(q);
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  async get(id: string) {
    const supportCase = await this.requireCase(id);
    const messages = await this.repo.messagesForCase(id);
    return { case: supportCase, messages };
  }

  async create(input: CreateSupportCaseInput, ctx: ActionContext): Promise<SupportCase> {
    const actorId = ctx.principalContext.principal.employeeId;
    const created = await this.repo.insertCase({
      publicId: `CASE-${Date.now().toString(36).toUpperCase()}`,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      institutionId: input.institutionId ?? null,
      independentUserId: input.independentUserId ?? null,
      status: 'open',
      createdBy: actorId,
    });
    if (input.body) {
      await this.repo.insertMessage({
        caseId: created.id,
        authorType: ActorType.PlatformEmployee,
        authorId: actorId,
        body: input.body,
        internal: { note: false },
      });
    }
    await this.writeAudit(ctx, created.id, 'support_case.create', created.institutionId, {
      newState: { publicId: created.publicId, subject: created.subject, priority: created.priority },
    });
    return created;
  }

  async addMessage(id: string, input: AddSupportMessageInput, ctx: ActionContext) {
    const supportCase = await this.requireCase(id);
    const actorId = ctx.principalContext.principal.employeeId;
    const message = await this.repo.insertMessage({
      caseId: id,
      authorType: ActorType.PlatformEmployee,
      authorId: actorId,
      body: input.body,
      internal: { note: input.internal },
    });
    await this.writeAudit(ctx, id, 'support_case.add_message', supportCase.institutionId, {
      newState: { internal: input.internal },
    });
    return message;
  }

  async changeStatus(id: string, input: ChangeSupportCaseStatusInput, ctx: ActionContext): Promise<SupportCase> {
    const before = await this.requireCase(id);
    const updated = await this.repo.updateCase(
      id,
      { status: input.status, resolution: input.resolution ?? before.resolution },
      ctx.principalContext.principal.employeeId,
    );
    await this.writeAudit(ctx, id, 'support_case.change_status', before.institutionId, {
      reason: input.reason,
      previousState: { status: before.status },
      newState: { status: input.status },
    });
    return updated!;
  }

  async assign(id: string, input: AssignSupportCaseInput, ctx: ActionContext): Promise<SupportCase> {
    const before = await this.requireCase(id);
    const updated = await this.repo.updateCase(
      id,
      { assignedEmployeeId: input.assignedEmployeeId },
      ctx.principalContext.principal.employeeId,
    );
    await this.writeAudit(ctx, id, 'support_case.assign', before.institutionId, {
      reason: input.reason,
      previousState: { assignedEmployeeId: before.assignedEmployeeId },
      newState: { assignedEmployeeId: input.assignedEmployeeId },
    });
    return updated!;
  }

  private async requireCase(id: string): Promise<SupportCase> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Support case not found' });
    return row;
  }

  private async writeAudit(
    ctx: ActionContext,
    id: string,
    action: string,
    institutionId: string | null,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: id,
      institutionId: institutionId ?? undefined,
      ...extra,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}
