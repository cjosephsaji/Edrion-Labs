import { Injectable } from '@nestjs/common';
import { orchestratorBlockV1Schema, type PlanV1 } from '@edrion/schemas';

@Injectable()
export class BlockRendererService {
  render(plan: PlanV1) {
    const body =
      plan.move === 'direct_explanation'
        ? '## Introduction\nWe will build understanding step by step.'
        : plan.move === 'retrieval_check'
          ? '## Quick check\nRecall the key idea from your last session.'
          : '## Lesson\nContinuing your learning path.';

    return orchestratorBlockV1Schema.parse({
      v: 1,
      kind: 'explanation',
      body_markdown: body,
      degraded: false,
    });
  }
}
