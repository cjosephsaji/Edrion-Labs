import { Inject, Injectable, Logger } from '@nestjs/common';
import { generateVisualSchema, graphSpecSchema, regenerateVisualSchema, saveVisualSchema } from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../student.types';
import { LibraryRepository } from '../library/library.repository';

@Injectable()
export class LabVisualService {
  private readonly logger = new Logger(LabVisualService.name);

  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    private readonly library: LibraryRepository,
  ) {}

  async generate(principal: StudentPrincipal, body: unknown) {
    const parsed = generateVisualSchema.parse(body);
    if (!this.ai.available) {
      return this.stubSpec(parsed.topic, parsed.format);
    }

    await this.budgets.spend(principal, 'visual', 2000);
    try {
      const system =
        parsed.format === 'diagram'
          ? 'Return a labeled diagram spec (layout: diagram). Include 5–12 parts as nodes with id, label, detail (one-sentence description), shape (rect|ellipse), x and y (0–100 percent positions). Add edges showing containment or flow between parts. Clean structure only — no decorative content.'
          : 'Return a graph spec for mind map or flowchart layout.';
      const { result, usage } = await this.ai.completeJson({
        purpose: 'visual',
        tier: 'large',
        system,
        user: `Topic: ${parsed.topic}\nFormat: ${parsed.format}`,
        schema: graphSpecSchema,
        schemaName: 'graph',
        maxOutputTokens: 3000,
      });
      await this.callLog.log(principal, 'visual', usage);
      return result;
    } catch (err) {
      this.logger.error(`Visual AI failed for ${parsed.format} — using stub: ${(err as Error).message}`);
      return this.stubSpec(parsed.topic, parsed.format);
    }
  }

  async regenerate(principal: StudentPrincipal, body: unknown) {
    const parsed = regenerateVisualSchema.parse(body);
    if (!this.ai.available) return parsed.spec;
    await this.budgets.spend(principal, 'visual', 2000);
    try {
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
    } catch (err) {
      this.logger.error(`Visual regenerate AI failed — returning prior spec: ${(err as Error).message}`);
      return parsed.spec;
    }
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

  private stubSpec(topic: string, format: 'mind_map' | 'flowchart' | 'diagram') {
    if (format === 'diagram') {
      return {
        layout: 'diagram' as const,
        nodes: [
          { id: '1', label: topic, detail: 'Central structure of the topic.', x: 50, y: 18, shape: 'ellipse' as const },
          { id: '2', label: 'Part A', detail: 'A key component and its role.', x: 22, y: 52, shape: 'rect' as const },
          { id: '3', label: 'Part B', detail: 'Another labeled element.', x: 78, y: 52, shape: 'rect' as const },
          { id: '4', label: 'Part C', detail: 'How parts connect downstream.', x: 36, y: 82, shape: 'rect' as const },
          { id: '5', label: 'Part D', detail: 'Supporting structure.', x: 64, y: 82, shape: 'rect' as const },
        ],
        edges: [
          { from: '1', to: '2' },
          { from: '1', to: '3' },
          { from: '2', to: '4' },
          { from: '3', to: '5' },
          { from: '4', to: '5' },
        ],
      };
    }

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
