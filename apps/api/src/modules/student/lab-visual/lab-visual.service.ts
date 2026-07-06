import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { generateVisualSchema, graphSpecSchema, regenerateVisualSchema, saveVisualSchema } from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../student.types';
import { LibraryRepository } from '../library/library.repository';

@Injectable()
export class LabVisualService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    private readonly library: LibraryRepository,
  ) {}

  async generate(principal: StudentPrincipal, body: unknown) {
    const parsed = generateVisualSchema.parse(body);
    if (parsed.format === 'diagram') {
      throw new HttpException({ comingSoon: true, message: 'Diagram mode is coming soon.' }, HttpStatus.NOT_IMPLEMENTED);
    }
    if (!this.ai.available) {
      return this.stubSpec(parsed.topic, parsed.format);
    }
    await this.budgets.spend(principal, 'visual', 2000);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual',
      tier: 'large',
      system: 'Return a graph spec for mind map or flowchart layout.',
      user: `Topic: ${parsed.topic}\nFormat: ${parsed.format}`,
      schema: graphSpecSchema,
      schemaName: 'graph',
      maxOutputTokens: 3000,
    });
    await this.callLog.log(principal, 'visual', usage);
    return result;
  }

  async regenerate(principal: StudentPrincipal, body: unknown) {
    const parsed = regenerateVisualSchema.parse(body);
    if (!this.ai.available) return parsed.spec;
    await this.budgets.spend(principal, 'visual', 2000);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual',
      tier: 'large',
      system: 'Regenerate graph spec following the direction.',
      user: `Prior spec: ${JSON.stringify(parsed.spec)}\nDirection: ${parsed.direction}`,
      schema: graphSpecSchema,
      schemaName: 'graph',
      maxOutputTokens: 3000,
    });
    await this.callLog.log(principal, 'visual', usage);
    return result;
  }

  async save(principal: StudentPrincipal, body: unknown) {
    const parsed = saveVisualSchema.parse(body);
    let collection = await this.library.findCollectionByName(principal, 'Visuals');
    if (!collection) {
      collection = await this.library.insertCollection({
        ...this.library.owner(principal),
        name: 'Visuals',
        color: '#C4A882',
        sequence: 0,
      });
    }
    return this.library.insertArtifact({
      ...this.library.owner(principal),
      itemId: null,
      kind: 'visual',
      title: parsed.title,
      content: parsed.spec,
      fromLabel: parsed.topic ? `Visual · ${parsed.topic}` : 'Visual Studio',
    });
  }

  private stubSpec(topic: string, format: 'mind_map' | 'flowchart') {
    return {
      layout: format,
      center: { label: topic },
      nodes: [
        { id: '1', label: topic, detail: 'Central idea' },
        { id: '2', label: 'Branch A', detail: 'Related concept' },
        { id: '3', label: 'Branch B', detail: 'Another angle' },
      ],
      edges: [
        { from: '1', to: '2' },
        { from: '1', to: '3' },
      ],
    };
  }
}
