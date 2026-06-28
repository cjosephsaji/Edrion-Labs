import { BadRequestException, Injectable } from '@nestjs/common';
import { AiCapability, RiskLevel } from '@edrion/shared-types';
import type { AiResolutionContext } from '@edrion/copilot';
import { PeopleService } from './people.service';
import { AnnouncementsService } from './announcements.service';
import type { PortalActionContext } from './portal-action-context';

/** The exact-impact preview a portal tool produces at preparation time (the confirmation payload). */
export interface PortalToolPreparation {
  summary: string;
  targetType: string;
  targetId: string | null;
  dataChanges: { before: Record<string, unknown>; after: Record<string, unknown> } | null;
  financialImpactMinor: number;
  affectedUsers: number;
  reversible: boolean;
  requiredPermission: string;
  riskLevel: RiskLevel;
  /** The audit record that WILL be written when this executes. */
  auditPreview: { action: string; module: string; entityType: string };
  resolutionContext: AiResolutionContext;
}

export interface PortalCopilotTool {
  key: string;
  capability: AiCapability;
  requiredPermission: string;
  reversible: boolean;
  /** Read-only inspection: build the exact-impact preview. Never mutates. */
  prepare(args: Record<string, unknown>, ctx: PortalActionContext): Promise<PortalToolPreparation>;
  /**
   * Execute via the SAME audited portal service a human uses. The service's own audit event carries
   * the institution-user actor + the run id context — there is no bypass path.
   */
  execute(args: Record<string, unknown>, ctx: PortalActionContext): Promise<Record<string, unknown>>;
}

/**
 * Institution-portal Copilot tool catalogue (Phase 10). Each tool maps to an EXISTING audited portal
 * service — the AI reuses the human path (same scope assertions, FK pre-checks, version guards + audit),
 * it does not get its own. Read-only tools (search/analysis) ALLOW and auto-run; state-changing tools
 * (Communications) always require a human confirmation before the service is dispatched.
 */
@Injectable()
export class PortalCopilotToolRegistry {
  private readonly tools = new Map<string, PortalCopilotTool>();

  constructor(
    private readonly people: PeopleService,
    private readonly announcements: AnnouncementsService,
  ) {
    this.register(this.studentSearchTool());
    this.register(this.announcementDraftTool());
    this.register(this.announcementPublishTool());
    this.register(this.analysisTool());
  }

  private register(tool: PortalCopilotTool) {
    this.tools.set(tool.key, tool);
  }

  keys(): string[] {
    return [...this.tools.keys()];
  }

  get(key: string): PortalCopilotTool | undefined {
    return this.tools.get(key);
  }

  // --- Tools ---------------------------------------------------------------------------------

  /** Read-only student lookup — no state change, so it ALLOWs and auto-runs without confirmation. */
  private studentSearchTool(): PortalCopilotTool {
    return {
      key: 'students.search',
      capability: AiCapability.Search,
      requiredPermission: 'students.view',
      reversible: true,
      prepare: (args, ctx) => {
        const search = String(args.query ?? '').trim();
        return Promise.resolve({
          summary: `Find students${search ? ` matching "${search}"` : ''} (read-only).`,
          targetType: 'students',
          targetId: null,
          dataChanges: null,
          financialImpactMinor: 0,
          affectedUsers: 0,
          reversible: true,
          requiredPermission: 'students.view',
          riskLevel: RiskLevel.Low,
          auditPreview: { action: 'ai.students_search', module: 'portal-copilot', entityType: 'analysis' },
          resolutionContext: { institutionId: ctx.principal.institutionId },
        });
      },
      execute: async (args, ctx) => {
        const search = String(args.query ?? '').trim();
        const page = await this.people.listStudents(ctx, { page: 1, pageSize: 10, sortDir: 'desc', search: search || undefined });
        return {
          matched: page.total,
          students: page.items.map((s) => ({ id: (s as { id: string }).id, name: (s as { fullName?: string }).fullName })),
          note: 'Read-only — no state was changed.',
        };
      },
    };
  }

  /** Draft an announcement (state-changing) — always needs confirmation before it is created. */
  private announcementDraftTool(): PortalCopilotTool {
    return {
      key: 'announcements.draft',
      capability: AiCapability.Communications,
      requiredPermission: 'announcements.send',
      reversible: true,
      prepare: async (args, ctx) => {
        const title = this.requireTitle(args);
        const audience = String(args.audience ?? 'all');
        return {
          summary: `Create a draft announcement: "${title}" for ${audience}`,
          targetType: 'announcement',
          targetId: null,
          dataChanges: { before: {}, after: { title, audience, status: 'draft' } },
          financialImpactMinor: 0,
          affectedUsers: 0,
          reversible: true,
          requiredPermission: 'announcements.send',
          riskLevel: RiskLevel.Medium,
          auditPreview: { action: 'announcement.create', module: 'portal-announcements', entityType: 'announcement' },
          resolutionContext: { institutionId: ctx.principal.institutionId },
        };
      },
      execute: async (args, ctx) => {
        const title = this.requireTitle(args);
        const audience = (String(args.audience ?? 'all')) as 'all' | 'teachers' | 'students' | 'parents' | 'staff';
        const referenceCode = String(args.referenceCode ?? `AI-${Date.now().toString(36).toUpperCase()}`);
        const row = await this.announcements.create(ctx, {
          title,
          body: typeof args.body === 'string' ? args.body : null,
          referenceCode,
          audience,
          category: 'copilot',
          status: 'draft',
          pinned: false,
          publishAt: null,
        });
        return { id: (row as { id: string }).id, referenceCode: (row as { referenceCode: string }).referenceCode, status: (row as { status: string }).status };
      },
    };
  }

  /** Publish an existing draft announcement (state-changing) — fans out a notification on execute. */
  private announcementPublishTool(): PortalCopilotTool {
    return {
      key: 'announcements.publish',
      capability: AiCapability.Communications,
      requiredPermission: 'announcements.send',
      reversible: false,
      prepare: async (args, ctx) => {
        const id = this.requireAnnouncementId(args);
        return {
          summary: `Publish announcement ${id} and notify its audience`,
          targetType: 'announcement',
          targetId: id,
          dataChanges: { before: { status: 'draft' }, after: { status: 'published' } },
          financialImpactMinor: 0,
          affectedUsers: 0,
          reversible: false,
          requiredPermission: 'announcements.send',
          riskLevel: RiskLevel.Medium,
          auditPreview: { action: 'announcement.publish', module: 'portal-announcements', entityType: 'announcement' },
          resolutionContext: { institutionId: ctx.principal.institutionId },
        };
      },
      execute: async (args, ctx) => {
        const id = this.requireAnnouncementId(args);
        const result = await this.announcements.publish(ctx, id, {});
        return result as unknown as Record<string, unknown>;
      },
    };
  }

  /** Read-only analysis — no state change, so it ALLOWs and auto-runs without confirmation. */
  private analysisTool(): PortalCopilotTool {
    return {
      key: 'analysis.summarize',
      capability: AiCapability.Analysis,
      requiredPermission: 'portal.dashboard.view',
      reversible: true,
      prepare: (_args, ctx) =>
        Promise.resolve({
          summary: 'Summarise the requested information (read-only).',
          targetType: 'analysis',
          targetId: null,
          dataChanges: null,
          financialImpactMinor: 0,
          affectedUsers: 0,
          reversible: true,
          requiredPermission: 'portal.dashboard.view',
          riskLevel: RiskLevel.Low,
          auditPreview: { action: 'ai.analysis', module: 'portal-copilot', entityType: 'analysis' },
          resolutionContext: { institutionId: ctx.principal.institutionId },
        }),
      execute: (args) =>
        Promise.resolve({
          summary: `Read-only analysis prepared for: ${String(args.prompt ?? '').slice(0, 200)}`,
          note: 'No state was changed.',
        }),
    };
  }

  private requireTitle(args: Record<string, unknown>): string {
    const title = String(args.title ?? '').trim();
    if (!title) throw new BadRequestException({ code: 'MISSING_TITLE', message: 'A title is required to draft an announcement.' });
    return title;
  }

  private requireAnnouncementId(args: Record<string, unknown>): string {
    const id = String(args.announcementId ?? '').trim();
    if (!id) throw new BadRequestException({ code: 'MISSING_ANNOUNCEMENT', message: 'An announcement id is required to publish.' });
    return id;
  }
}
