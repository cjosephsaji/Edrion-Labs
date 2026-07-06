import { Injectable } from '@nestjs/common';
import type { LearnAiPurpose } from './provider';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class BudgetsService {
  async spend(_principal: StudentPrincipal, _purpose: LearnAiPurpose, _estTokens: number): Promise<void> {
    // v1 stub — Plan 02 wires Redis counters.
  }
}
