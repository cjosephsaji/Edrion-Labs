import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { StudentPrincipal } from '../student.types';

const moduleSubmitSchema = z.object({
  module_index: z.number().int().min(0).max(1),
  correct_count: z.number().int().min(0),
  total_count: z.number().int().min(1),
});

export type SatModuleRoute = {
  next_module_difficulty: 'standard' | 'harder' | 'easier';
  score_band: string;
  methodology: 'sat_digital_two_stage_v1';
};

@Injectable()
export class ExamPrepAdaptiveService {
  constructor(private readonly features: FeatureControlsService) {}

  async routeSatModule(principal: StudentPrincipal, body: unknown): Promise<SatModuleRoute> {
    const parsed = moduleSubmitSchema.parse(body);
    const flag = await this.features.resolveByKey('prep.adaptive_routing', {
      institutionId: principal.kind === 'institutional' ? principal.institutionId : undefined,
    });
    if (!flag.value) {
      throw new BadRequestException({ code: 'ADAPTIVE_OFF', message: 'Adaptive routing disabled.' });
    }
    const pct = parsed.correct_count / parsed.total_count;
    let next: SatModuleRoute['next_module_difficulty'] = 'standard';
    if (parsed.module_index === 0) {
      next = pct >= 0.65 ? 'harder' : pct < 0.4 ? 'easier' : 'standard';
    }
    const band =
      pct >= 0.8 ? '700-800' : pct >= 0.6 ? '600-700' : pct >= 0.4 ? '500-600' : '400-500';
    return {
      next_module_difficulty: next,
      score_band: band,
      methodology: 'sat_digital_two_stage_v1',
    };
  }
}
