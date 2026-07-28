import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  toSelfDeclaredGoalV1,
  type CreatePathInput,
  type LearningPathDto,
  type PatchPathInput,
} from '@edrion/schemas';
import { LEARN_AI_PROVIDER, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import { PATH_SYSTEM_PROMPT } from '../learn-ai/prompts/path.prompt';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';
import { LearnRepository } from './learn.repository';
import { LearnProfileJobsService } from '../edrion-learn/learn-profile.jobs';
import { topicKeyForLearnTopic } from '../edrion-learn/topic-keys';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';

const pathPlanSchema = z.object({
  title: z.string(),
  subjectLabel: z.string(),
  metaLine: z.string().optional(),
  items: z.array(
    z.object({
      topicTitle: z.string(),
      whyHere: z.string().optional(),
      optionalBranch: z.boolean().optional(),
    }),
  ),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

@Injectable()
export class PathService {
  private readonly logger = new Logger(PathService.name);

  constructor(
    private readonly repo: LearnRepository,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
    private readonly profileJobs: LearnProfileJobsService,
    private readonly features: FeatureControlsService,
  ) {}

  async get(principal: StudentPrincipal): Promise<LearningPathDto | null> {
    let path = await this.repo.getPath(principal);
    if (!path && principal.kind === 'institutional') {
      path = await this.seedInstitutionalPath(principal);
    }
    if (!path) return null;
    return this.toDto(principal, path);
  }
  async create(principal: StudentPrincipal, input: CreatePathInput): Promise<LearningPathDto> {
    if (principal.kind === 'institutional') {
      throw new ForbiddenException('Institutional paths are seeded automatically');
    }

    const existingPath = await this.repo.getPath(principal);
    if (existingPath) {
      await this.repo.updatePath(existingPath.id, { status: 'archived' });
    }

    let plan: z.infer<typeof pathPlanSchema> = {
      title: 'Your learning path',
      subjectLabel: 'General',
      metaLine: 'Shaped by your goal',
      items: [{ topicTitle: input.goalStatement.slice(0, 80), whyHere: 'Starting point from your goal' }],
    };

    if (this.ai.available) {
      try {
        await this.budgets.spend(principal, 'session_plan', 2000);
        const { result, usage } = await this.ai.completeJson({
          purpose: 'session_plan',
          tier: 'large',
          system: PATH_SYSTEM_PROMPT,
          user: JSON.stringify(input),
          schema: pathPlanSchema,
          schemaName: 'learning_path',
          maxOutputTokens: 2000,
          reasoningEffort: 'low',
        });
        await this.callLog.log(principal, 'session_plan', usage);
        plan = result;
      } catch (err) {
        this.logger.error(`Path planner AI failed — using default plan: ${(err as Error).message}`);
      }
    }

    const path = await this.repo.createPath({
      independentUserId: principal.independentUserId,
      studentId: null,
      institutionId: null,
      title: plan.title,
      subjectLabel: plan.subjectLabel,
      source: 'ai_goal',
      metaLine: plan.metaLine ?? null,
      goal: toSelfDeclaredGoalV1({
        statement: input.goalStatement,
        constraints: input.constraints ? [input.constraints] : [],
        weeklyMinutes: input.weeklyMinutes,
      }),
      status: 'active',
    });

    if (!path) throw new Error('Failed to create path');
    let seq = 1;
    for (const item of plan.items) {
      const topicKey = slugify(item.topicTitle);
      const topic = await this.repo.upsertTopicByKey(topicKey, item.topicTitle, plan.subjectLabel, 'generic');
      if (!topic) continue;
      await this.repo.insertPathItem({
        pathId: path.id,
        topicId: topic.id,
        sequence: seq++,
        whyHere: item.whyHere ?? null,
        optionalBranch: item.optionalBranch ? 1 : 0,
        status: seq === 2 ? 'current' : 'upcoming',
      });
      // PM-003: pre-warm topic profiles on learning-path creation.
      void this.profileJobs.enqueueProfileTopic({
        principal,
        learnTopicId: topic.id,
        topicKey: topicKeyForLearnTopic(topic.id),
        title: topic.title,
        syllabusContext: plan.subjectLabel,
      });
    }

    await this.ledger.log({
      principal,
      eventType: 'path.created',
      payload: { pathId: path.id },
    });

    return (await this.toDto(principal, path))!;
  }

  async patch(principal: StudentPrincipal, input: PatchPathInput): Promise<LearningPathDto> {
    const path = await this.repo.getPath(principal);
    if (!path) throw new NotFoundException('No learning path');
    if (principal.kind === 'institutional') {
      throw new ForbiddenException('Institutional paths are not editable');
    }

    if (input.removeItemId) {
      await this.repo.updatePathItem(input.removeItemId, { status: 'removed' });
    }
    if (input.restoreItemId) {
      await this.repo.updatePathItem(input.restoreItemId, { status: 'upcoming' });
    }
    if (input.addItem) {
      const topicKey = slugify(input.addItem.topicTitle);
      const topic = await this.repo.upsertTopicByKey(
        topicKey,
        input.addItem.topicTitle,
        path.subjectLabel,
        'generic',
      );
      if (!topic) throw new NotFoundException('Failed to resolve topic');
      const items = await this.repo.listPathItems(path.id);
      const maxSeq = items.reduce((m, i) => Math.max(m, i.item.sequence), 0);
      await this.repo.insertPathItem({
        pathId: path.id,
        topicId: topic.id,
        sequence: maxSeq + 1,
        whyHere: 'Added by you',
        optionalBranch: 0,
        status: 'upcoming',
      });
    }
    if (input.reorder?.length) {
      let seq = 1;
      for (const itemId of input.reorder) {
        await this.repo.updatePathItem(itemId, { sequence: seq++ });
      }
    }

    await this.ledger.log({
      principal,
      eventType: 'path.edited',
      payload: { pathId: path.id, itemId: input.removeItemId ?? input.restoreItemId },
    });

    const refreshed = await this.repo.getPath(principal);
    return (await this.toDto(principal, refreshed!))!;
  }

  private async seedInstitutionalPath(principal: InstitutionalStudentPrincipal) {
    const subjects = await this.repo.listStudentSubjects(principal);
    const subjectNames = subjects.map((s) => s.name);
    const title = 'Your school learning path';
    const path = await this.repo.createPath({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      independentUserId: null,
      title,
      subjectLabel: subjectNames[0] ?? 'General',
      source: 'institution',
      metaLine: `${subjectNames.join(' · ') || 'Subjects'} · shaped by your syllabus`,
      status: 'active',
    });

    if (!path) throw new Error('Failed to seed path');
    let seq = 1;
    for (const name of subjectNames.length ? subjectNames : ['Getting started']) {
      const topicKey = slugify(name);
      const topic = await this.repo.upsertTopicByKey(
        topicKey,
        name,
        name,
        'institution',
        principal.institutionId,
      );
      if (!topic) continue;
      await this.repo.insertPathItem({
        pathId: path.id,
        topicId: topic.id,
        sequence: seq,
        whyHere: seq === 1 ? 'First topic from your grade subjects' : 'Builds on prior topics',
        optionalBranch: 0,
        status: seq === 1 ? 'current' : 'upcoming',
      });
      seq++;
    }

    await this.ledger.log({
      principal,
      eventType: 'path.created',
      payload: { pathId: path.id },
    });

    return path;
  }

  private async toDto(
    principal: StudentPrincipal,
    path: { id: string; title: string; subjectLabel: string; metaLine: string | null; source: string; status: string },
  ): Promise<LearningPathDto> {
    const rows = await this.repo.listPathItems(path.id);
    const revision = await this.repo.listRevisionStates(principal);
    const freshnessByTopic = new Map(revision.map((r) => [r.topic.id, r.state.freshness]));
    let orchestratorEnabled = true;
    try {
      const flagQuery =
        principal.kind === 'institutional'
          ? {
              institutionId: principal.institutionId,
              campusId: principal.campusId ?? undefined,
              institutionUserId: principal.institutionUserId,
            }
          : { independentUserId: principal.independentUserId };
      orchestratorEnabled = (await this.features.resolveByKey('learn.orchestrator', flagQuery)).value;
    } catch {
      orchestratorEnabled = false;
    }

    return {
      id: path.id,
      title: path.title,
      subjectLabel: path.subjectLabel,
      metaLine: path.metaLine,
      source: path.source as 'institution' | 'ai_goal',
      pathEditable: principal.kind === 'independent',
      status: path.status as 'active' | 'archived',
      orchestratorEnabled,
      items: rows
        .filter((r) => r.item.status !== 'removed')
        .map((r) => ({
          id: r.item.id,
          topicId: r.topic.id,
          topicKey: r.topic.topicKey,
          title: r.topic.title,
          sequence: r.item.sequence,
          whyHere: r.item.whyHere,
          optionalBranch: r.item.optionalBranch === 1,
          status: r.item.status as 'upcoming' | 'current' | 'completed' | 'removed',
          freshness: (freshnessByTopic.get(r.topic.id) as 'fresh' | 'fading' | 'due') ?? 'fresh',
          completedAt: r.item.completedAt?.toISOString() ?? null,
        })),
    };
  }
}
