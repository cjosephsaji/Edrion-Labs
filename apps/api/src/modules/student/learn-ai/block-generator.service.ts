import { Inject, Injectable, Logger } from '@nestjs/common';

import {

  type BlockType,

  checkpointBlockSchema,

  conceptCardBlockSchema,

  practiceItemBlockSchema,

  reflectionSummaryBlockSchema,

  visualExplainerBlockSchema,

  workedExampleBlockSchema,

} from '@edrion/schemas';

import type { StudentPrincipal } from '../student.types';

import { LEARN_AI_PROVIDER } from '../../../common/tokens';

import type { LearnAiProvider } from './provider';

import { AtomCacheService } from './atom-cache.service';

import { BudgetsService } from './budgets.service';

import type { PedagogyDirectives } from './pedagogy-matrix';

import { LearnAiCallLogger } from './learn-ai-call.logger';

import { buildBlockSystemPrompt } from './prompts/blocks.prompt';

import { z } from 'zod';



const schemaForType: Record<BlockType, z.ZodType<Record<string, unknown>>> = {

  concept_card: conceptCardBlockSchema,

  visual_explainer: visualExplainerBlockSchema,

  worked_example: workedExampleBlockSchema,

  checkpoint: checkpointBlockSchema,

  practice_item: practiceItemBlockSchema,

  reflection_summary: reflectionSummaryBlockSchema,

  note_card: z.object({ question: z.string(), answer: z.string() }),

};



function fallbackBlock(blockType: BlockType, topicTitle: string, brief: string): Record<string, unknown> {

  switch (blockType) {

    case 'concept_card':

      return {

        title: topicTitle,

        summary: brief || `Let's explore ${topicTitle}.`,

        keyPoints: ['Core idea', 'Why it matters', 'What to watch for'],

        suggestedQuestions: [`What is ${topicTitle}?`, `Why does ${topicTitle} matter?`],

      };

    case 'visual_explainer':

      return {

        views: [

          {

            title: 'Overview',

            svgSpec: {

              viewBox: '0 0 200 120',

              elements: [

                { type: 'rect', x: 20, y: 20, width: 160, height: 80, fill: '#e8f5e9', stroke: '#2e7d32' },

                { type: 'text', x: 100, y: 65, text: topicTitle.slice(0, 24), fontSize: 12, fill: '#1b5e20' },

              ],

            },

          },

        ],

        suggestedQuestions: [],

      };

    case 'worked_example':

      return {

        problem: `Example: ${topicTitle}`,

        steps: [

          { label: 'Step 1', explanation: 'Identify what we know.', why: 'Starting points reduce confusion.' },

          { label: 'Step 2', explanation: 'Apply the method.', why: 'Each step builds on the last.' },

        ],

        suggestedQuestions: [],

      };

    case 'checkpoint':

      return {

        question: `Which best describes ${topicTitle}?`,

        options: [

          { key: 'a', label: 'A core concept in this topic', correct: true, feedbackWrong: 'Look for the definition in the concept card.' },

          { key: 'b', label: 'Unrelated to this lesson', correct: false, feedbackWrong: 'This topic is central to what we are learning.' },

          { key: 'c', label: 'Only used in advanced courses', correct: false, feedbackWrong: 'We are building foundations right now.' },

          { key: 'd', label: 'A memorization trick only', correct: false, feedbackWrong: 'Understanding matters more than tricks here.' },

        ],

        explainPrompt: 'Explain in your own words what this topic is about.',

        suggestedQuestions: [],

      };

    case 'practice_item':

      return {

        statement: `Practice: apply what you learned about ${topicTitle}.`,

        hints: [

          'Start by restating the problem in your own words.',

          'Break the problem into smaller steps.',

          'Check your answer against the worked example.',

        ],

        suggestedQuestions: [],

      };

    case 'reflection_summary':

      return {

        takeaways: [

          `You explored ${topicTitle} step by step.`,

          'Checkpoints help lock in understanding before practice.',

          'Practice builds confidence — hints are there when you need them.',

        ],

        suggestedQuestions: [],

      };

    case 'note_card':

      return { question: '', answer: '' };

    default:

      return {};

  }

}



@Injectable()

export class BlockGeneratorService {

  private readonly logger = new Logger(BlockGeneratorService.name);



  constructor(

    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,

    private readonly atoms: AtomCacheService,

    private readonly budgets: BudgetsService,

    private readonly callLog: LearnAiCallLogger,

  ) {}



  async generate(

    principal: StudentPrincipal,

    topicId: string,

    topicTitle: string,

    subjectLabel: string,

    blockType: BlockType,

    brief: string,

    directives: PedagogyDirectives,

    cacheable = true,

    groundingText?: string,

  ): Promise<Record<string, unknown>> {

    // Grounded blocks are document-specific — never share them through the topic atom cache.
    const cacheKinds: BlockType[] = groundingText
      ? []
      : ['concept_card', 'visual_explainer', 'worked_example', 'checkpoint'];

    if (cacheable && cacheKinds.includes(blockType)) {

      const cached = await this.atoms.get(topicId, blockType);

      if (cached) {

        await this.callLog.log(principal, 'block_gen', { inputTokens: 0, outputTokens: 0, model: 'cache', durationMs: 0 }, { cached: true });

        return cached;

      }

    }



    if (!this.ai.available) {

      return fallbackBlock(blockType, topicTitle, brief);

    }



    const schema = schemaForType[blockType];

    await this.budgets.spend(principal, 'block_gen', 2500);

    try {

      const groundingRule = groundingText

        ? '\nGround every fact, example, and question in the SOURCE TEXT the student uploaded (page markers [p.N]). Use its terminology and examples. If the source does not cover something, do not invent it.'

        : '';

      const groundingBlock = groundingText

        ? `\n\nSOURCE TEXT (with [p.N] page markers):\n${groundingText.slice(0, 12_000)}`

        : '';

      const { result, usage } = await this.ai.completeJson({

        purpose: 'block_gen',

        tier: 'nano',

        system: buildBlockSystemPrompt(blockType, directives) + groundingRule,

        user: `Topic: ${topicTitle}\nSubject: ${subjectLabel}\nThis block's brief: ${brief}${groundingBlock}`,

        schema,

        schemaName: blockType,

        maxOutputTokens: 4096,

        reasoningEffort: 'low',

      });

      await this.callLog.log(principal, 'block_gen', usage);



      if (cacheable && cacheKinds.includes(blockType)) {

        await this.atoms.put(topicId, blockType, result, usage.model);

      }

      return result;

    } catch (err) {

      this.logger.error(

        `FALLBACK_BLOCK blockType=${blockType} topic=${topicTitle} brief=${brief.slice(0, 80)} model=n/a — ${(err as Error).message}`,

      );

      return fallbackBlock(blockType, topicTitle, brief);

    }

  }



  async *generateStream(

    principal: StudentPrincipal,

    topicId: string,

    topicTitle: string,

    subjectLabel: string,

    specs: Array<{ blockType: BlockType; brief: string }>,

    directives: PedagogyDirectives,

    groundingText?: string,

  ): AsyncIterable<{ blockType: BlockType; content: Record<string, unknown> }> {

    for (const spec of specs) {

      const content = await this.generate(

        principal,

        topicId,

        topicTitle,

        subjectLabel,

        spec.blockType,

        spec.brief,

        directives,

        spec.blockType !== 'practice_item',

        groundingText,

      );

      yield { blockType: spec.blockType, content };

    }

  }

}


