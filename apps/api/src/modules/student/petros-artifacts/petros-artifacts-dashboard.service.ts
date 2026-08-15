import { Inject, Injectable } from '@nestjs/common';
import type { AuditWriter } from '@edrion/audit';
import type { PetrosArtifactDashboardQuery } from '@edrion/schemas';
import { AUDIT_WRITER } from '../../../common/tokens';
import { baseAudit, type ActionContext } from '../../../common/action-context';
import { PetrosArtifactsRepository } from './petros-artifacts.repository';

@Injectable()
export class PetrosArtifactsDashboardService {
  constructor(
    private readonly repo: PetrosArtifactsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async read(query: PetrosArtifactDashboardQuery, ctx: ActionContext) {
    const aggregate = await this.repo.dashboard({
      institutionId: query.institutionId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.artifacts.dashboard.view',
      module: 'petros',
      entityType: 'petros_artifact_aggregate',
      entityId: query.institutionId ?? 'platform',
      newState: { filters: query, eventBuckets: aggregate.events.length },
    } as Parameters<AuditWriter['logAudit']>[0]);
    const counts = Object.fromEntries(aggregate.events.map((event) => [event.type, event.count]));
    const funnelByKind = ['flashcard', 'rule_card', 'note', 'diagram'].map((kind) => ({
      kind,
      proposed: aggregate.byKind.find((row) => row.type === 'proposal.created' && row.kind === kind)?.count ?? 0,
      edited: aggregate.byKind.find((row) => row.type === 'proposal.edited' && row.kind === kind)?.count ?? 0,
      saved: aggregate.byKind.find((row) => row.type === 'artifact.saved' && row.kind === kind)?.count ?? 0,
      failed: aggregate.byKind.find((row) => row.type === 'artifact.save_failed' && row.kind === kind)?.count ?? 0,
    }));
    const reviewTotal = aggregate.reviewGrades.reduce((sum, row) => sum + row.count, 0);
    const retained = aggregate.reviewGrades.filter((row) => row.grade !== 'again').reduce((sum, row) => sum + row.count, 0);
    return {
      privacy: 'aggregate_only',
      contentExposed: false,
      funnel: {
        proposed: counts['proposal.created'] ?? 0,
        edited: counts['proposal.edited'] ?? 0,
        saved: counts['artifact.saved'] ?? 0,
        saveFailures: counts['artifact.save_failed'] ?? 0,
        averageCommitLatencyMs: Math.round(Number(aggregate.latency?.averageMs ?? 0)),
        maximumCommitLatencyMs: Number(aggregate.latency?.maximumMs ?? 0),
        completedCommits: Number(aggregate.latency?.completed ?? 0),
        byKind: funnelByKind,
      },
      reviews: {
        completed: counts['review.completed'] ?? 0,
        retentionPercent: reviewTotal ? Math.round((retained / reviewTotal) * 1000) / 10 : null,
        grades: aggregate.reviewGrades,
        schedulerVersions: aggregate.schedules,
      },
      integrity: {
        duplicatePreventions: counts['artifact.duplicate_prevented'] ?? 0,
        sanitizationFailures: counts['artifact.sanitization_failed'] ?? 0,
        sourceUnavailable: counts['source.unavailable'] ?? 0,
      },
      storage: {
        artifacts: Number(aggregate.storage?.artifacts ?? 0),
        estimatedBytes: Number(aggregate.storage?.estimatedBytes ?? 0),
        orphanedArtifacts: Number(aggregate.storage?.orphaned ?? 0),
        failedOperations: Number(aggregate.latency?.storageFailures ?? 0),
      },
      jobs: {
        export: counts['job.export'] ?? 0,
        transfer: counts['job.transfer'] ?? 0,
        deletion: counts['job.deletion'] ?? 0,
        statuses: aggregate.jobs,
      },
    };
  }
}
