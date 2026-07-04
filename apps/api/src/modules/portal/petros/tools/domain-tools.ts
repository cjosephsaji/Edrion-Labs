import { z } from 'zod';
import type { PeopleService } from '../../people.service';
import type { AttendanceService } from '../../attendance.service';
import type { TimetableService } from '../../timetable.service';
import type { ExamsService } from '../../exams.service';
import type { GradebookService } from '../../gradebook.service';
import type { AssignmentsService } from '../../assignments.service';
import type { FeesService } from '../../fees.service';
import type { LibraryService } from '../../library.service';
import type { InventoryService } from '../../inventory.service';
import type { HostelService } from '../../hostel.service';
import type { AnnouncementsService } from '../../announcements.service';
import type { AcademicsService } from '../../academics.service';
import type { CounselingService } from '../../counseling.service';
import type { FacilitiesService } from '../../facilities.service';
import type { HealthService } from '../../health.service';
import type { StudentProfileService } from '../../student-profile.service';
import { params, type PetrosTool } from './types';

export interface DomainToolDeps {
  people: PeopleService;
  attendance: AttendanceService;
  timetable: TimetableService;
  exams: ExamsService;
  gradebook: GradebookService;
  assignments: AssignmentsService;
  fees: FeesService;
  library: LibraryService;
  inventory: InventoryService;
  hostel: HostelService;
  announcements: AnnouncementsService;
  academics: AcademicsService;
  counseling: CounselingService;
  facilities: FacilitiesService;
  health: HealthService;
  studentProfile: StudentProfileService;
}

const page = (extra: Record<string, unknown> = {}) =>
  ({ page: 1, pageSize: 10, sortDir: 'desc', ...extra }) as never;

const searchParam = params({ query: { type: 'string', description: 'Search text' } });
const searchSchema = z.object({ query: z.string().trim().max(160).optional() });
const q = (args: Record<string, unknown>) =>
  typeof args.query === 'string' && args.query.trim() ? args.query.trim() : undefined;

/**
 * Phase 2 tool catalogue — Wave A reads (execute inline) + Wave B mutations (always confirm).
 * Every tool delegates to the EXISTING audited portal service; `requiredPermissions` are the SAME
 * keys the REST endpoint enforces.
 */
export function buildDomainTools(s: DomainToolDeps): PetrosTool[] {
  const read = (
    t: Omit<PetrosTool, 'capability' | 'inputSchema' | 'parameters'> &
      Partial<Pick<PetrosTool, 'inputSchema' | 'parameters'>>,
  ): PetrosTool => ({
    inputSchema: searchSchema,
    parameters: searchParam,
    ...t,
    capability: 'read',
  });

  return [
    // ── Wave A: reads ─────────────────────────────────────────────────────────
    read({
      name: 'student_get_profile',
      description:
        'Full student profile aggregation (academics, attendance, fees, conduct — each section permission-gated server-side).',
      inputSchema: z.object({ studentId: z.string().uuid() }),
      parameters: params({ studentId: { type: 'string', description: 'Student UUID' } }, ['studentId']),
      requiredPermissions: ['students.view'],
      humanStatus: 'Opening student profile…',
      execute: (ctx, args) => s.studentProfile.profile(ctx, String(args.studentId)) as Promise<unknown>,
    }),
    read({
      name: 'student_get_basic_profile',
      description: 'Reduced student projection (name, class, contact) for restricted roles. Never academic/financial/medical data.',
      inputSchema: searchSchema,
      parameters: searchParam,
      requiredPermissions: ['student_basic_profile.view'],
      humanStatus: 'Looking up student…',
      execute: async (ctx, args) => {
        const result = await s.people.listStudents(ctx, page({ search: q(args) }));
        return {
          matched: result.total,
          students: (result.items as unknown as Record<string, unknown>[]).map((r) => ({
            id: r.id,
            fullName: r.fullName,
            classId: r.classId,
            guardianPhone: r.guardianPhone ?? null,
          })),
        };
      },
    }),
    read({
      name: 'attendance_get_summary',
      description: 'Recent attendance sessions, optionally for one class.',
      inputSchema: z.object({ classId: z.string().uuid().optional() }),
      parameters: params({ classId: { type: 'string' } }),
      requiredPermissions: ['attendance.view'],
      humanStatus: 'Fetching attendance…',
      execute: async (ctx, args) =>
        s.attendance.listSessions(ctx, page({ classId: typeof args.classId === 'string' ? args.classId : undefined })) as Promise<unknown>,
    }),
    read({
      name: 'timetable_get',
      description: 'Timetable slots, optionally for one class.',
      inputSchema: z.object({ classId: z.string().uuid().optional() }),
      parameters: params({ classId: { type: 'string' } }),
      requiredPermissions: ['timetable.view'],
      humanStatus: 'Reading timetable…',
      execute: (ctx, args) =>
        s.timetable.list(ctx, page({ pageSize: 30, classId: typeof args.classId === 'string' ? args.classId : undefined })) as Promise<unknown>,
    }),
    read({
      name: 'exams_list',
      description: 'List exams and their status.',
      requiredPermissions: ['exams.view'],
      humanStatus: 'Listing exams…',
      execute: (ctx, args) => s.exams.list(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'gradebook_get_summary',
      description: 'Recent grade entries (optionally filtered by search).',
      requiredPermissions: ['gradebook.view'],
      humanStatus: 'Reading gradebook…',
      execute: (ctx, args) => s.gradebook.list(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'assignments_list',
      description: 'List assignments.',
      requiredPermissions: ['assignments.view'],
      humanStatus: 'Listing assignments…',
      execute: (ctx, args) => s.assignments.list(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'fees_get_status',
      description: 'Fee invoices (optionally for one student).',
      inputSchema: z.object({ studentId: z.string().uuid().optional() }),
      parameters: params({ studentId: { type: 'string' } }),
      requiredPermissions: ['fees.view'],
      humanStatus: 'Checking fees…',
      execute: (ctx, args) =>
        s.fees.listInvoices(ctx, page({ studentId: typeof args.studentId === 'string' ? args.studentId : undefined })) as Promise<unknown>,
    }),
    read({
      name: 'library_search',
      description: 'Search the library catalogue.',
      requiredPermissions: ['library.view'],
      humanStatus: 'Searching the library…',
      execute: (ctx, args) => s.library.listBooks(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'inventory_check_stock',
      description: 'Check inventory items and stock quantities.',
      requiredPermissions: ['inventory.view'],
      humanStatus: 'Checking stock…',
      execute: (ctx, args) => s.inventory.listItems(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'announcements_list',
      description: 'List recent announcements.',
      requiredPermissions: ['announcements.view'],
      humanStatus: 'Reading announcements…',
      execute: (ctx, args) => s.announcements.list(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'academics_get_structure',
      description: 'Academic structure: years, departments, grade levels, classes, subjects.',
      inputSchema: z.object({}),
      parameters: params({}),
      requiredPermissions: ['academics.view'],
      humanStatus: 'Reading academic structure…',
      execute: async (ctx) => {
        const wide = page({ pageSize: 50 });
        const [years, departments, grades, classes, subjects] = await Promise.all([
          s.academics.listAcademicYears(ctx, wide),
          s.academics.listDepartments(ctx, wide),
          s.academics.listGradeLevels(ctx, wide),
          s.academics.listClasses(ctx, wide),
          s.academics.listSubjects(ctx, wide),
        ]);
        return { years: years.items, departments: departments.items, gradeLevels: grades.items, classes: classes.items, subjects: subjects.items };
      },
    }),
    read({
      name: 'staff_search',
      description: 'Search teachers and non-teaching staff.',
      requiredPermissions: ['staff.view', 'teachers.view'],
      humanStatus: 'Searching staff…',
      execute: async (ctx, args) => {
        const [teachers, staff] = await Promise.all([
          s.people.listTeachers(ctx, page({ search: q(args) })),
          s.people.listStaff(ctx, page({ search: q(args) })),
        ]);
        return { teachers: teachers.items, staff: staff.items };
      },
    }),
    read({
      name: 'work_orders_list',
      description: 'List facilities work orders.',
      requiredPermissions: ['work_orders.manage'],
      humanStatus: 'Listing work orders…',
      execute: (ctx, args) => s.facilities.list('work-orders', ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'hostel_get_allocations',
      description: 'Current hostel residents (active allocations).',
      requiredPermissions: ['hostel.view'],
      humanStatus: 'Checking hostel allocations…',
      execute: (ctx, args) => s.hostel.listHostellers(ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'health_records_list',
      description: 'Student health records (medical — school nurse only).',
      requiredPermissions: ['health_records.view'],
      humanStatus: 'Reading health records…',
      execute: (ctx, args) => s.health.list('records', ctx, page({ search: q(args) })) as Promise<unknown>,
    }),
    read({
      name: 'counseling_cases_list',
      description: 'Counseling cases (counselor triage feed).',
      requiredPermissions: ['counseling_cases.manage'],
      humanStatus: 'Reading counseling cases…',
      execute: (ctx, args) => s.counseling.list('cases', ctx, page({ search: q(args) })) as Promise<unknown>,
    }),

    // ── Wave B: mutations (always confirm) ────────────────────────────────────
    {
      name: 'counseling_case_create',
      description:
        'Refer a student to counseling: opens a triage case for the counselors. State-changing — requires confirmation.',
      inputSchema: z.object({
        studentId: z.string().uuid().nullish(),
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().max(2000).nullish(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
      }),
      parameters: params(
        { studentId: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } },
        ['title'],
      ),
      requiredPermissions: ['counseling.refer'],
      capability: 'mutation',
      humanStatus: 'Preparing counseling referral…',
      impactPreview: async (_ctx, args) => ({
        summary: `Refer to counseling: "${String(args.title)}" (${String(args.priority ?? 'medium')} priority)`,
        targetType: 'counseling_case',
        dataChanges: { before: {}, after: { title: `Referral: ${String(args.title)}`, status: 'open' } },
        affectedUsers: 1,
        reversible: true,
      }),
      execute: (ctx, args) =>
        s.counseling.create('cases', ctx, {
          studentId: args.studentId ?? null,
          title: `Referral: ${String(args.title)}`,
          summary: args.summary ?? null,
          priority: args.priority ?? 'medium',
          status: 'open',
        }) as Promise<unknown>,
    },
    {
      name: 'work_order_create',
      description: 'Report a facilities/classroom issue: raises a triage work order. State-changing — requires confirmation.',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).nullish(),
        priority: z.enum(['low', 'medium', 'high']).default('medium'),
      }),
      parameters: params(
        { title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } },
        ['title'],
      ),
      requiredPermissions: ['facilities.report_issue'],
      capability: 'mutation',
      humanStatus: 'Raising a work order…',
      impactPreview: async (_ctx, args) => ({
        summary: `Report facilities issue: "${String(args.title)}"`,
        targetType: 'work_order',
        dataChanges: { before: {}, after: { title: args.title, priority: args.priority ?? 'medium', status: 'open' } },
        affectedUsers: 0,
        reversible: true,
      }),
      execute: (ctx, args) =>
        s.facilities.create('work-orders', ctx, {
          title: String(args.title),
          description: args.description ?? null,
          priority: args.priority ?? 'medium',
          status: 'open',
        }) as Promise<unknown>,
    },
    {
      name: 'announcement_draft',
      description: 'Create a DRAFT announcement (not published). State-changing — requires confirmation.',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().max(8000).nullish(),
        audience: z.enum(['all', 'teachers', 'students', 'parents', 'staff']).default('all'),
      }),
      parameters: params(
        { title: { type: 'string' }, body: { type: 'string' }, audience: { type: 'string', enum: ['all', 'teachers', 'students', 'parents', 'staff'] } },
        ['title'],
      ),
      requiredPermissions: ['announcements.send'],
      capability: 'mutation',
      humanStatus: 'Drafting announcement…',
      impactPreview: async (_ctx, args) => ({
        summary: `Create a draft announcement: "${String(args.title)}"`,
        targetType: 'announcement',
        dataChanges: { before: {}, after: { title: args.title, audience: args.audience ?? 'all', status: 'draft' } },
        affectedUsers: 0,
        reversible: true,
      }),
      execute: async (ctx, args) => {
        const row = await s.announcements.create(ctx, {
          title: String(args.title),
          body: typeof args.body === 'string' ? args.body : null,
          referenceCode: `AI-${Date.now().toString(36).toUpperCase()}`,
          audience: (args.audience ?? 'all') as never,
          category: 'petros',
          status: 'draft',
          pinned: false,
          publishAt: null,
        } as never);
        return { id: (row as { id: string }).id, status: 'draft' };
      },
    },
    {
      name: 'announcement_publish',
      description: 'Publish an existing draft announcement and notify its audience. State-changing — requires confirmation.',
      inputSchema: z.object({ announcementId: z.string().uuid() }),
      parameters: params({ announcementId: { type: 'string' } }, ['announcementId']),
      requiredPermissions: ['announcements.send'],
      capability: 'mutation',
      humanStatus: 'Publishing announcement…',
      impactPreview: async (_ctx, args) => ({
        summary: `Publish announcement ${String(args.announcementId)} and notify its audience`,
        targetType: 'announcement',
        dataChanges: { before: { status: 'draft' }, after: { status: 'published' } },
        reversible: false,
      }),
      execute: (ctx, args) => s.announcements.publish(ctx, String(args.announcementId), {} as never) as Promise<unknown>,
    },
    {
      name: 'attendance_mark_session',
      description: 'Create an attendance session for a class on a date. State-changing — requires confirmation.',
      inputSchema: z.object({
        classId: z.string().uuid(),
        date: z.string().min(8).max(30),
        period: z.string().trim().max(40).default('full_day'),
      }),
      parameters: params(
        { classId: { type: 'string' }, date: { type: 'string', description: 'ISO date' }, period: { type: 'string' } },
        ['classId', 'date'],
      ),
      requiredPermissions: ['attendance.manage'],
      capability: 'mutation',
      humanStatus: 'Creating attendance session…',
      impactPreview: async (_ctx, args) => ({
        summary: `Create an attendance session for ${String(args.date)}`,
        targetType: 'attendance_session',
        dataChanges: { before: {}, after: { classId: args.classId, date: args.date, period: args.period ?? 'full_day' } },
        reversible: true,
      }),
      execute: (ctx, args) =>
        s.attendance.createSession(ctx, {
          classId: String(args.classId),
          date: new Date(String(args.date)),
          period: String(args.period ?? 'full_day'),
          subjectId: null,
          takenById: null,
          notes: null,
        } as never) as Promise<unknown>,
    },
    {
      name: 'assignment_create',
      description: 'Create an assignment (draft by default). State-changing — requires confirmation.',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(160),
        classId: z.string().uuid(),
        instructions: z.string().trim().max(2000).nullish(),
        dueDate: z.string().min(8).max(30).nullish(),
        maxPoints: z.number().int().min(1).max(1000).default(100),
      }),
      parameters: params(
        {
          title: { type: 'string' },
          classId: { type: 'string' },
          instructions: { type: 'string' },
          dueDate: { type: 'string', description: 'ISO date' },
          maxPoints: { type: 'number' },
        },
        ['title', 'classId'],
      ),
      requiredPermissions: ['assignments.manage'],
      capability: 'mutation',
      humanStatus: 'Creating assignment…',
      impactPreview: async (_ctx, args) => ({
        summary: `Create assignment "${String(args.title)}" (draft)`,
        targetType: 'assignment',
        dataChanges: { before: {}, after: { title: args.title, status: 'draft', maxPoints: args.maxPoints ?? 100 } },
        reversible: true,
      }),
      execute: (ctx, args) =>
        s.assignments.create(ctx, {
          title: String(args.title),
          classId: String(args.classId),
          subjectId: null,
          teacherId: null,
          instructions: args.instructions ?? null,
          dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
          maxPoints: Number(args.maxPoints ?? 100),
          status: 'draft',
        } as never) as Promise<unknown>,
    },
    {
      name: 'exam_schedule_create',
      description: 'Create an exam (draft). State-changing — requires confirmation.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(120),
        examType: z.enum(['term', 'unit_test', 'final', 'entrance', 'other']).default('term'),
        startDate: z.string().min(8).max(30).nullish(),
        endDate: z.string().min(8).max(30).nullish(),
      }),
      parameters: params(
        { name: { type: 'string' }, examType: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' } },
        ['name'],
      ),
      requiredPermissions: ['exams.manage'],
      capability: 'mutation',
      humanStatus: 'Creating exam…',
      impactPreview: async (_ctx, args) => ({
        summary: `Create exam "${String(args.name)}" (draft)`,
        targetType: 'exam',
        dataChanges: { before: {}, after: { name: args.name, status: 'draft' } },
        reversible: true,
      }),
      execute: (ctx, args) =>
        s.exams.create(ctx, {
          name: String(args.name),
          examType: String(args.examType ?? 'term'),
          academicYearId: null,
          termLabel: null,
          startDate: args.startDate ? new Date(String(args.startDate)) : null,
          endDate: args.endDate ? new Date(String(args.endDate)) : null,
          status: 'draft',
          description: null,
        } as never) as Promise<unknown>,
    },
    {
      name: 'fee_invoice_draft',
      description: 'Draft a fee invoice for a student (pending status). State-changing — requires confirmation.',
      inputSchema: z.object({
        studentId: z.string().uuid(),
        invoiceNo: z.string().trim().min(1).max(60),
        amount: z.number().positive(),
        dueDate: z.string().min(8).max(30).nullish(),
        notes: z.string().trim().max(500).nullish(),
      }),
      parameters: params(
        {
          studentId: { type: 'string' },
          invoiceNo: { type: 'string' },
          amount: { type: 'number', description: 'Major currency units' },
          dueDate: { type: 'string' },
          notes: { type: 'string' },
        },
        ['studentId', 'invoiceNo', 'amount'],
      ),
      requiredPermissions: ['fees.manage'],
      capability: 'mutation',
      humanStatus: 'Drafting invoice…',
      impactPreview: async (_ctx, args) => ({
        summary: `Draft invoice ${String(args.invoiceNo)} for ${String(args.amount)}`,
        targetType: 'fee_invoice',
        dataChanges: { before: {}, after: { invoiceNo: args.invoiceNo, amount: args.amount, status: 'pending' } },
        financialImpactMinor: Math.round(Number(args.amount) * 100),
        reversible: true,
      }),
      execute: (ctx, args) =>
        s.fees.createInvoice(ctx, {
          invoiceNo: String(args.invoiceNo),
          studentId: String(args.studentId),
          feeStructureId: null,
          amount: Number(args.amount),
          issueDate: new Date(),
          dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
          status: 'pending',
          notes: args.notes ?? null,
        } as never) as Promise<unknown>,
    },
  ];
}
