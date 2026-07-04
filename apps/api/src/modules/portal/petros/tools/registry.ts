import { Injectable } from '@nestjs/common';
import { canAll, type EvaluatedPermissions } from '@edrion/permissions';
import { PeopleService } from '../../people.service';
import { AttendanceService } from '../../attendance.service';
import { TimetableService } from '../../timetable.service';
import { ExamsService } from '../../exams.service';
import { GradebookService } from '../../gradebook.service';
import { AssignmentsService } from '../../assignments.service';
import { FeesService } from '../../fees.service';
import { LibraryService } from '../../library.service';
import { InventoryService } from '../../inventory.service';
import { HostelService } from '../../hostel.service';
import { AnnouncementsService } from '../../announcements.service';
import { AcademicsService } from '../../academics.service';
import { CounselingService } from '../../counseling.service';
import { FacilitiesService } from '../../facilities.service';
import { HealthService } from '../../health.service';
import { StudentProfileService } from '../../student-profile.service';
import { z } from 'zod';
import { can } from '@edrion/permissions';
import { DocumentsGenService } from '../../../documents/documents-gen.service';
import { DocumentRenderProcessor } from '../../../documents/document-render.processor';
import { PortalReportQueriesService } from '../../portal-report-queries.service';
import { PetrosRepository } from '../petros.repository';
import { RolesService } from '../../roles.service';
import { UsersService } from '../../users.service';
import { buildDomainTools } from './domain-tools';
import { buildReportTools } from './report-tools';
import { buildRoleTools } from './role-tools';
import { params, type PetrosTool } from './types';

/**
 * The Petros tool catalogue. One place registers every tool; `availableFor` filters by the
 * principal's effective permissions + institution type — guardrail layer 1 AND what keeps
 * per-role prompts small. Later phases register more tools (documents, reports, roles).
 */
@Injectable()
export class PetrosToolRegistry {
  private readonly tools = new Map<string, PetrosTool>();

  constructor(
    people: PeopleService,
    attendance: AttendanceService,
    timetable: TimetableService,
    exams: ExamsService,
    gradebook: GradebookService,
    assignments: AssignmentsService,
    fees: FeesService,
    library: LibraryService,
    inventory: InventoryService,
    hostel: HostelService,
    announcements: AnnouncementsService,
    academics: AcademicsService,
    counseling: CounselingService,
    facilities: FacilitiesService,
    health: HealthService,
    studentProfile: StudentProfileService,
    docsGen: DocumentsGenService,
    renderProcessor: DocumentRenderProcessor,
    reportQueries: PortalReportQueriesService,
    petrosRepo: PetrosRepository,
    roles: RolesService,
    users: UsersService,
  ) {
    for (const tool of buildDomainTools({
      people,
      attendance,
      timetable,
      exams,
      gradebook,
      assignments,
      fees,
      library,
      inventory,
      hostel,
      announcements,
      academics,
      counseling,
      facilities,
      health,
      studentProfile,
    })) {
      this.register(tool);
    }
    this.register(this.generateDocumentTool(docsGen, renderProcessor));
    for (const tool of buildReportTools(reportQueries, petrosRepo)) this.register(tool);
    for (const tool of buildRoleTools(roles, users)) this.register(tool);
  }

  /**
   * Phase 4: generate a formatted institution document (PDF via the render queue). Circulars
   * additionally require `circulars.issue`; AI-authored exam CONTENT requires
   * `ai.assessments.generate` — both enforced HERE in execute, not just in the prompt.
   */
  private generateDocumentTool(docsGen: DocumentsGenService, processor: DocumentRenderProcessor): PetrosTool {
    const inputSchema = z.object({
      docType: z.enum(['exam_paper', 'assignment', 'circular', 'certificate', 'letter', 'report']),
      title: z.string().trim().min(1).max(200),
      payload: z.record(z.string(), z.unknown()).default({}),
      /** True when Petros authored the question content itself (vs formatting the user's own). */
      aiAuthoredAssessmentContent: z.boolean().default(false),
    });
    return {
      name: 'generate_document',
      description:
        'Generate a formatted institution document (exam paper, assignment sheet, circular, certificate, letter, report) as a PDF on the institution letterhead. Put the drafted content fields in `payload` (e.g. body, questions[], subject, signatoryName). Set aiAuthoredAssessmentContent=true if YOU authored exam/assignment questions. State-changing — requires confirmation.',
      inputSchema,
      parameters: params(
        {
          docType: { type: 'string', enum: ['exam_paper', 'assignment', 'circular', 'certificate', 'letter', 'report'] },
          title: { type: 'string' },
          payload: { type: 'object', description: 'Template fields: body, questions, subject, signatoryName, …' },
          aiAuthoredAssessmentContent: { type: 'boolean' },
        },
        ['docType', 'title'],
      ),
      requiredPermissions: ['documents.generate'],
      capability: 'mutation',
      humanStatus: 'Preparing document…',
      impactPreview: async (_ctx, args) => ({
        summary: `Generate a ${String(args.docType).replace(/_/g, ' ')}: "${String(args.title)}" (PDF)`,
        targetType: 'document_render',
        dataChanges: { before: {}, after: { docType: args.docType, title: args.title, status: 'queued' } },
        reversible: true,
      }),
      execute: async (ctx, rawArgs) => {
        const args = inputSchema.parse(rawArgs);
        if (args.docType === 'circular' && !can(ctx.principal.permissions, 'circulars.issue')) {
          throw new Error('Issuing circulars requires the circulars.issue permission.');
        }
        if (
          (args.docType === 'exam_paper' || args.docType === 'assignment') &&
          args.aiAuthoredAssessmentContent &&
          !can(ctx.principal.permissions, 'ai.assessments.generate')
        ) {
          throw new Error(
            'This user may not have Petros author assessment questions (ai.assessments.generate). Format their own questions instead.',
          );
        }
        const conversationId =
          typeof (rawArgs as { __conversationId?: string }).__conversationId === 'string'
            ? (rawArgs as { __conversationId?: string }).__conversationId
            : undefined;
        const render = await docsGen.createRender(ctx, {
          docType: args.docType,
          title: args.title,
          payload: args.payload,
          conversationId,
        });
        if (!docsGen.queueEnabled) await processor.process(render.id);
        const final = await docsGen.getRender(ctx, render.id).catch(() => render);
        return { renderId: render.id, status: final.status, artifactId: final.artifactId ?? null, error: final.errorDetail ?? null };
      },
    };
  }

  register(tool: PetrosTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): PetrosTool | undefined {
    return this.tools.get(name);
  }

  all(): PetrosTool[] {
    return [...this.tools.values()];
  }

  /** Tools this principal may see, for this institution type. */
  availableFor(permissions: EvaluatedPermissions, institutionType: string): PetrosTool[] {
    return this.all().filter(
      (t) =>
        canAll(permissions, [...t.requiredPermissions]) &&
        (!t.institutionTypes || t.institutionTypes.includes(institutionType)),
    );
  }

  /** OpenAI function-tool definitions for a filtered tool set. */
  toOpenAiTools(tools: PetrosTool[]): Record<string, unknown>[] {
    return tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      strict: false,
      parameters: t.parameters,
    }));
  }
}
