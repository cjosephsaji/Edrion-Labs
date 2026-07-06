import { Injectable } from '@nestjs/common';
import type { StudentPrincipal } from '../student.types';
import { LearnRepository } from './learn.repository';

@Injectable()
export class NotesService {
  constructor(private readonly repo: LearnRepository) {}

  async list(principal: StudentPrincipal) {
    const [strengths, growth] = await Promise.all([
      this.repo.listEvidenceTags(principal, 'strength'),
      this.repo.listEvidenceTags(principal, 'growth'),
    ]);

    const mapTag = (t: {
      label: string;
      note: string;
      evidenceEventIds: string[];
    }) => ({
      label: t.label,
      note: t.note,
      evidence: (t.evidenceEventIds ?? []).map((id) => ({
        label: 'Learning activity',
        meta: id,
      })),
    });

    return {
      strengths: strengths.map(mapTag),
      growth: growth.map(mapTag),
    };
  }
}
