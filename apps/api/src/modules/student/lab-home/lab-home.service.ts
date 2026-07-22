import { Injectable } from '@nestjs/common';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { StudentPrincipal } from '../student.types';
import { VisualStudioRepository } from '../visual-studio/visual-studio.repository';

@Injectable()
export class LabHomeService {
  constructor(
    private readonly features: FeatureControlsService,
    private readonly visuals: VisualStudioRepository,
  ) {}

  async home(principal: StudentPrincipal) {
    const canvasEnabled = await this.resolveCanvasEnabled(principal);
    const cards: Array<{
      key: 'mock_exams' | 'mind_maps' | 'debate' | 'entrance_prep';
      label: string;
      href: string;
      status: 'ready' | 'coming_soon' | 'resume';
      resume_canvas_id?: string;
      resume_title?: string;
    }> = [];

    cards.push({
      key: 'mock_exams',
      label: 'Mock Exams',
      href: '/lab/mock-exams',
      status: 'ready',
    });

    if (canvasEnabled) {
      const resume = await this.latestCanvas(principal);
      cards.push({
        key: 'mind_maps',
        label: 'Mind Maps',
        href: resume ? `/lab/visual/${resume.id}` : '/lab/visual',
        status: resume ? 'resume' : 'ready',
        resume_canvas_id: resume?.id,
        resume_title: resume?.title,
      });
    }

    cards.push({
      key: 'debate',
      label: 'Debate',
      href: '/lab/debate',
      status: 'ready',
    });

    cards.push({
      key: 'entrance_prep',
      label: 'Entrance Prep',
      href: '/learn',
      status: 'ready',
    });

    return { cards, canvas_enabled: canvasEnabled };
  }

  private async resolveCanvasEnabled(principal: StudentPrincipal): Promise<boolean> {
    const ctx =
      principal.kind === 'institutional'
        ? {
            institutionId: principal.institutionId,
            campusId: principal.campusId ?? undefined,
            institutionUserId: principal.institutionUserId,
          }
        : { independentUserId: principal.independentUserId };
    try {
      const surface = await this.features.resolveByKey('student.surface.lab', ctx);
      if (!surface.value) return false;
      const capability = await this.features.resolveByKey('lab.canvas.enabled', ctx);
      return capability.value;
    } catch {
      return true;
    }
  }

  private async latestCanvas(principal: StudentPrincipal) {
    try {
      const { items } = await this.visuals.listCanvases(principal, { limit: 1 });
      const canvas = items[0];
      if (!canvas) return null;
      return { id: canvas.id, title: canvas.title };
    } catch {
      return null;
    }
  }
}
