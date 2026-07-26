import { Injectable } from '@nestjs/common';
import { AiCapability, RiskLevel } from '@edrion/shared-types';
import type { AiResolutionContext } from '@edrion/copilot';
import type { ActionContext } from '../../common/action-context';
import { InstitutionsService } from '../institutions/institutions.service';
import { FeatureControlsService } from '../feature-controls/feature-controls.service';

/** The exact-impact preview a tool produces at preparation time (the confirmation-screen payload). */
export interface ToolPreparation {
  summary: string;
  targetType: string;
  targetId: string | null;
  dataChanges: { before: Record<string, unknown>; after: Record<string, unknown> } | null;
  billingImpactMinor: number | null;
  financialImpactMinor: number;
  affectedUsers: number;
  reversible: boolean;
  requiredPermission: string;
  riskLevel: RiskLevel;
  /** The audit record that WILL be written when this executes. */
  auditPreview: { action: string; module: string; entityType: string };
  resolutionContext: AiResolutionContext;
}

export interface CopilotTool {
  key: string;
  capability: AiCapability;
  requiredPermission: string;
  reversible: boolean;
  /** Read-only inspection: load the target + build the exact-impact preview. Never mutates. */
  prepare(args: Record<string, unknown>, ctx: ActionContext): Promise<ToolPreparation>;
  /**
   * Execute via the SAME audited service a human uses. `ctx.ai.aiRunId` is set, so the service's
   * own audit event carries aiInvolved:true + the run id — there is no bypass path.
   */
  execute(args: Record<string, unknown>, ctx: ActionContext): Promise<Record<string, unknown>>;
}

/**
 * The catalogue of actions the Copilot may prepare + (after confirmation) dispatch. Each tool maps
 * to an existing audited service — the AI reuses the human path, it does not get its own.
 */
@Injectable()
export class CopilotToolRegistry {
  private readonly tools = new Map<string, CopilotTool>();

  constructor(
    private readonly institutions: InstitutionsService,
    private readonly features: FeatureControlsService,
  ) {
    this.register(this.institutionStatusTool('institutions.suspend', 'suspend', RiskLevel.High));
    this.register(this.institutionStatusTool('institutions.activate', 'activate', RiskLevel.Medium));
    this.register(this.featureKillSwitchTool());
    this.register(this.analysisTool());
  }

  private register(tool: CopilotTool) {
    this.tools.set(tool.key, tool);
  }

  keys(): string[] {
    return [...this.tools.keys()];
  }

  get(key: string): CopilotTool | undefined {
    return this.tools.get(key);
  }

  // --- Tools ---------------------------------------------------------------------------------

  private institutionStatusTool(
    key: string,
    action: 'suspend' | 'activate',
    risk: RiskLevel,
  ): CopilotTool {
    const permission = `institutions.${action}`;
    const nextStatus = action === 'suspend' ? 'suspended' : 'active';
    return {
      key,
      capability: AiCapability.InstitutionAccess,
      requiredPermission: permission,
      reversible: true,
      prepare: async (args) => {
        const id = String(args.institutionId);
        const inst = await this.institutions.get(id);
        return {
          summary: `${action === 'suspend' ? 'Suspend' : 'Reactivate'} ${inst.displayName}`,
          targetType: 'institution',
          targetId: inst.id,
          dataChanges: { before: { status: inst.status }, after: { status: nextStatus } },
          billingImpactMinor: null,
          financialImpactMinor: 0,
          affectedUsers: 0,
          reversible: true,
          requiredPermission: permission,
          riskLevel: risk,
          auditPreview: { action: `institution.${action}`, module: 'institutions', entityType: 'institution' },
          resolutionContext: { institutionId: inst.id },
        };
      },
      execute: async (args, ctx) => {
        const id = String(args.institutionId);
        const reason = String(args.reason ?? 'Confirmed via Copilot');
        // Re-load for the current version (optimistic concurrency), then dispatch the human path.
        const inst = await this.institutions.get(id);
        const result =
          action === 'suspend'
            ? await this.institutions.suspend(id, { reason, version: inst.version }, ctx)
            : await this.institutions.activate(id, { reason, version: inst.version }, ctx);
        return result as unknown as Record<string, unknown>;
      },
    };
  }

  private featureKillSwitchTool(): CopilotTool {
    return {
      key: 'feature.kill_switch',
      capability: AiCapability.Feature,
      requiredPermission: 'features.manage_global',
      reversible: true,
      prepare: async (args) => {
        const featureKey = String(args.featureKey);
        const def = await this.features.getByKey(featureKey);
        const enabled = args.enabled !== false;
        return {
          summary: `${enabled ? 'Activate' : 'Lift'} the kill switch for "${def.key}"`,
          targetType: 'feature',
          targetId: def.id,
          dataChanges: { before: { killSwitch: '(current)' }, after: { killSwitch: enabled } },
          billingImpactMinor: null,
          financialImpactMinor: 0,
          affectedUsers: 0,
          reversible: true,
          requiredPermission: 'features.manage_global',
          riskLevel: RiskLevel.Critical,
          auditPreview: { action: 'feature.kill_switch', module: 'feature-controls', entityType: 'feature' },
          resolutionContext: {},
        };
      },
      execute: async (args, ctx) => {
        const featureKey = String(args.featureKey);
        const enabled = args.enabled !== false;
        const reason = String(args.reason ?? 'Confirmed via Copilot');
        const def = await this.features.getByKey(featureKey);
        const result = await this.features.setKillSwitch(def.id, { enabled, reason }, ctx);
        return result as unknown as Record<string, unknown>;
      },
    };
  }

  /** Read-only analysis — no state change, so it ALLOWs and auto-runs without confirmation. */
  private analysisTool(): CopilotTool {
    return {
      key: 'analysis.summarize',
      capability: AiCapability.Analysis,
      requiredPermission: 'platform.dashboard.view',
      reversible: true,
      prepare: () =>
        Promise.resolve({
        summary: 'Summarise the requested information (read-only).',
        targetType: 'analysis',
        targetId: null,
        dataChanges: null,
        billingImpactMinor: null,
        financialImpactMinor: 0,
        affectedUsers: 0,
        reversible: true,
        requiredPermission: 'platform.dashboard.view',
        riskLevel: RiskLevel.Low,
        auditPreview: { action: 'ai.analysis', module: 'copilot', entityType: 'analysis' },
        resolutionContext: {},
      }),
      execute: (args) =>
        Promise.resolve({
          summary: `Read-only analysis prepared for: ${String(args.prompt ?? '').slice(0, 200)}`,
          note: 'No state was changed.',
        }),
    };
  }
}
