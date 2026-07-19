import { canAny } from '@edrion/permissions';
import type { PersonaKey } from '@edrion/permissions/institution';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import type { PortalRepository } from '../portal.repository';

/**
 * The dashboard widget registry — the single source of truth for what can appear on a dashboard
 * and who is allowed to see it.
 *
 * THE SECURITY BOUNDARY IS `requires`. A widget is hydrated only if the caller holds one of its
 * permission keys, evaluated with the same `canAny` the NestJS guards use (so the `*` wildcard and
 * direct denies behave identically here). The query behind an unentitled widget never runs, so its
 * data never reaches the response — a teacher without `fees.view` cannot see fee figures even if
 * they craft the request by hand.
 *
 * `persona` is presentation only: it decides which heading the widget sits under. It grants
 * nothing. This is what makes CUSTOM tenant roles work — a bespoke "Bursar" role holding
 * `fees.view` gets the finance widgets with no code change here.
 */

export type WidgetSize = 'sm' | 'md' | 'lg';

/** A single number/label pair. `format: 'money'` means value is in MINOR units. */
export interface WidgetStat {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  format?: 'money';
}

/**
 * What a widget hands back. The web renders by `type`, so a new widget reusing an existing type
 * needs no frontend change at all.
 *
 * `attention` carries no server payload — the web already fetches /portal/attention via its own
 * hook (which is itself permission-filtered per category). The registry entry exists so the widget
 * participates in persona grouping and pin/hide like everything else.
 */
export type WidgetData =
  | { type: 'stats'; stats: WidgetStat[] }
  | { type: 'list'; items: Array<{ id: string; title: string; subtitle?: string; badge?: string }> }
  | { type: 'comparison'; rows: Array<{ id: string; name: string; value: number }> }
  | { type: 'activity'; items: Array<{ id: string; title: string; description: string; at: string }> }
  | { type: 'attention' };

export interface WidgetContext {
  principal: InstitutionPrincipal;
  scope: InstitutionScope;
  /** Campus narrowing from resolveScopeFilter(). null = institution-wide. */
  campusIds: string[] | null;
  /** The staff row behind this login, or null if they have none. Teaching widgets need it. */
  staffId: string | null;
  /**
   * Permission check for widgets that render several independently-sensitive figures.
   *
   * `requires` is ANY-of, so passing it is NOT a licence to render everything: a widget must gate
   * each figure it shows by the permission that figure needs. A teacher holds `students.view` but
   * not `staff.view`, and must therefore see the student count and no staff count.
   */
  can: (key: string) => boolean;
  repo: PortalRepository;
}

export interface DashboardWidgetDef {
  id: string;
  persona: PersonaKey;
  title: string;
  description?: string;
  /** ANY-of. Empty = available to every authenticated portal user. */
  requires: string[];
  size: WidgetSize;
  /** Lower renders first within a persona. */
  priority: number;
  /** Only meaningful at institution scope (e.g. cross-campus comparison). */
  institutionScopeOnly?: boolean;
  /** Needs a staff record to mean anything; skipped for logins without one. */
  needsStaff?: boolean;
  hydrate(ctx: WidgetContext): Promise<WidgetData>;
}

const money = (key: string, label: string, minor: number, hint?: string): WidgetStat => ({
  key,
  label,
  value: minor,
  hint,
  format: 'money',
});

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDef[] = [
  // --- everyone ---------------------------------------------------------------
  {
    id: 'core.attention',
    persona: 'general',
    title: 'Needs attention',
    description: 'Open items across the modules you have access to.',
    requires: ['portal.dashboard.view'],
    size: 'lg',
    priority: 0,
    hydrate: async () => ({ type: 'attention' }),
  },

  // --- leadership -------------------------------------------------------------
  {
    id: 'leadership.headcount',
    // `general`, not `leadership`: anyone with students.view reaches this (a teacher does), and
    // filing it under Leadership would give her a bogus "Leadership" tab containing one card.
    persona: 'general',
    title: 'Headcount',
    description: 'People across the selected scope.',
    // ANY-of: a teacher reaches this widget on students.view alone. Each figure below is then
    // gated separately, so she sees the student count and NOT the staff or portal-user counts.
    requires: ['students.view', 'staff.view', 'campuses.view', 'users.view'],
    size: 'lg',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds, can }) => {
      const needsCounts = can('students.view') || can('staff.view') || can('attendance.view');
      const [campuses, users, counts] = await Promise.all([
        can('campuses.view') ? repo.listCampuses(principal.institutionId, campusIds) : Promise.resolve(null),
        can('users.view') ? repo.countUsers(principal.institutionId) : Promise.resolve(null),
        needsCounts ? repo.moduleCounts(principal.institutionId, campusIds) : Promise.resolve(null),
      ]);

      const stats: WidgetStat[] = [];
      if (counts && can('students.view')) {
        stats.push({ key: 'students', label: 'Students enrolled', value: counts.students });
      }
      if (counts && can('staff.view')) {
        stats.push({ key: 'staff', label: 'Staff active', value: counts.staff });
      }
      if (counts && can('attendance.view')) {
        stats.push({ key: 'attendance', label: 'Present today', value: counts.attendanceToday });
      }
      if (campuses) stats.push({ key: 'campuses', label: 'Campuses', value: campuses.length });
      if (users !== null) stats.push({ key: 'users', label: 'Portal users', value: users });
      return { type: 'stats', stats };
    },
  },
  {
    id: 'leadership.campus_comparison',
    persona: 'leadership',
    title: 'Campus comparison',
    description: 'Portal users by campus.',
    requires: ['campuses.view'],
    size: 'md',
    priority: 20,
    institutionScopeOnly: true,
    hydrate: async ({ repo, principal, campusIds }) => {
      const campuses = await repo.listCampuses(principal.institutionId, campusIds);
      return {
        type: 'comparison',
        rows: campuses.map((c) => ({ id: c.id, name: c.name, value: c.currentUserCount })),
      };
    },
  },
  {
    id: 'leadership.activity',
    persona: 'leadership',
    title: 'Recent activity',
    description: 'Meaningful changes in the selected scope.',
    requires: ['audit.view'],
    size: 'md',
    priority: 30,
    hydrate: async ({ repo, principal, campusIds }) => {
      const rows = await repo.recentActivity(principal.institutionId, campusIds, 8);
      return {
        type: 'activity',
        items: rows.map((a) => ({
          id: a.id,
          title: humanizeAction(a.action),
          description: `${a.module}${a.actorName ? ` · ${a.actorName}` : ''}`,
          at: a.occurredAt.toISOString(),
        })),
      };
    },
  },

  // --- teaching ---------------------------------------------------------------
  {
    id: 'teaching.my_load',
    persona: 'teaching',
    title: 'Your teaching',
    description: 'Classes you own and subjects you teach.',
    requires: ['academics.teach'],
    size: 'md',
    priority: 10,
    needsStaff: true,
    hydrate: async ({ repo, principal, campusIds, staffId }) => {
      const load = await repo.teachingLoad(principal.institutionId, staffId!, campusIds);
      return {
        type: 'stats',
        stats: [
          { key: 'classes', label: 'Classes you lead', value: load.classesOwned },
          { key: 'subjects', label: 'Subjects assigned', value: load.subjectsTaught },
        ],
      };
    },
  },
  {
    id: 'teaching.today',
    persona: 'teaching',
    title: 'Today',
    description: 'Periods on your timetable today.',
    requires: ['timetable.view'],
    size: 'sm',
    priority: 20,
    needsStaff: true,
    hydrate: async ({ repo, staffId }) => ({
      type: 'stats',
      stats: [{ key: 'periods', label: 'Periods today', value: await repo.periodsToday(staffId!) }],
    }),
  },
  {
    id: 'teaching.to_grade',
    persona: 'teaching',
    title: 'Awaiting grading',
    description: 'Submissions handed in on your assignments.',
    requires: ['homework.grade', 'gradebook.manage'],
    size: 'sm',
    priority: 30,
    needsStaff: true,
    hydrate: async ({ repo, principal, staffId }) => ({
      type: 'stats',
      stats: [
        {
          key: 'to_grade',
          label: 'To grade',
          value: await repo.submissionsAwaitingGrade(principal.institutionId, staffId!),
        },
      ],
    }),
  },
  {
    id: 'teaching.attendance_todo',
    persona: 'teaching',
    title: 'Attendance to mark',
    description: "Today's sessions with nothing recorded yet.",
    requires: ['attendance.manage'],
    size: 'sm',
    priority: 40,
    hydrate: async ({ repo, principal, campusIds, staffId }) => ({
      type: 'stats',
      stats: [
        {
          key: 'unmarked',
          label: 'Sessions unmarked',
          value: await repo.attendanceSessionsUnmarked(principal.institutionId, campusIds, staffId),
        },
      ],
    }),
  },

  // --- finance ----------------------------------------------------------------
  {
    id: 'finance.collections',
    persona: 'finance',
    title: 'Fee collections',
    description: 'Collected against outstanding in the selected scope.',
    requires: ['fees.view'],
    size: 'md',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds }) => {
      const f = await repo.feeOverview(principal.institutionId, campusIds);
      return {
        type: 'stats',
        stats: [
          money('collected', 'Collected', f.collected),
          money('outstanding', 'Outstanding', f.outstanding),
          { key: 'overdue', label: 'Overdue invoices', value: f.overdueInvoices },
        ],
      };
    },
  },
  {
    id: 'finance.payroll',
    persona: 'finance',
    title: 'Payroll',
    description: 'Runs not yet completed.',
    requires: ['payroll.view'],
    size: 'sm',
    priority: 20,
    hydrate: async ({ repo, principal, campusIds }) => ({
      type: 'stats',
      stats: [
        { key: 'due', label: 'Runs due', value: await repo.payrollDue(principal.institutionId, campusIds) },
      ],
    }),
  },

  // --- people -----------------------------------------------------------------
  {
    id: 'people.staff',
    persona: 'people',
    title: 'Staff',
    description: 'Active staff in the selected scope.',
    requires: ['staff.view'],
    size: 'sm',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds }) => ({
      type: 'stats',
      stats: [
        { key: 'active', label: 'Active staff', value: await repo.staffCount(principal.institutionId, campusIds) },
      ],
    }),
  },

  // --- admissions -------------------------------------------------------------
  {
    id: 'admissions.pipeline',
    persona: 'admissions',
    title: 'Admissions pipeline',
    description: 'Open applications by stage.',
    requires: ['admissions.view'],
    size: 'md',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds }) => {
      const rows = await repo.admissionsPipeline(principal.institutionId, campusIds);
      return {
        type: 'stats',
        stats: rows.length
          ? rows.map((r) => ({ key: r.status, label: humanizeAction(r.status), value: r.count }))
          : [{ key: 'open', label: 'Open applications', value: 0 }],
      };
    },
  },

  // --- wellbeing --------------------------------------------------------------
  {
    id: 'wellbeing.open',
    persona: 'wellbeing',
    title: 'Health & wellbeing',
    description: 'Open incidents and outstanding follow-ups.',
    requires: ['health_records.view', 'medical_incidents.manage'],
    size: 'sm',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds, can }) => {
      const w = await repo.wellbeingOpen(principal.institutionId, campusIds);
      const stats: WidgetStat[] = [];
      if (can('medical_incidents.manage')) {
        stats.push({ key: 'incidents', label: 'Open incidents', value: w.openIncidents });
      }
      if (can('health_records.view')) {
        stats.push({ key: 'follow_ups', label: 'Follow-ups due', value: w.followUps });
      }
      return { type: 'stats', stats };
    },
  },

  // --- library ----------------------------------------------------------------
  {
    id: 'library.loans',
    persona: 'library',
    title: 'Library',
    description: 'Books on loan and overdue returns.',
    requires: ['library.view'],
    size: 'sm',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds }) => {
      const l = await repo.libraryLoans(principal.institutionId, campusIds);
      return {
        type: 'stats',
        stats: [
          { key: 'on_loan', label: 'On loan', value: l.onLoan },
          { key: 'overdue', label: 'Overdue', value: l.overdue },
        ],
      };
    },
  },

  // --- operations -------------------------------------------------------------
  {
    id: 'operations.transport',
    persona: 'operations',
    title: 'Transport',
    description: 'Active routes and assigned riders.',
    requires: ['transport.view'],
    size: 'sm',
    priority: 10,
    hydrate: async ({ repo, principal, campusIds }) => {
      const t = await repo.transportOverview(principal.institutionId, campusIds);
      return {
        type: 'stats',
        stats: [
          { key: 'routes', label: 'Active routes', value: t.activeRoutes },
          { key: 'riders', label: 'Riders assigned', value: t.ridersAssigned },
        ],
      };
    },
  },
];

const BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export function getWidget(id: string): DashboardWidgetDef | undefined {
  return BY_ID.get(id);
}

/**
 * THE gate. Every read and every write path must funnel through this — the dashboard build to
 * decide what to hydrate, and the prefs endpoint to decide what a user is even allowed to pin or
 * hide. Nothing else may decide entitlement.
 *
 * `scope` and `hasStaff` are applicability filters layered on top of the permission check; they
 * only ever remove widgets, never add one the permissions didn't already allow.
 */
export function entitledWidgets(
  principal: InstitutionPrincipal,
  opts: { scope?: InstitutionScope; hasStaff?: boolean } = {},
): DashboardWidgetDef[] {
  return DASHBOARD_WIDGETS.filter((w) => {
    if (w.requires.length > 0 && !canAny(principal.permissions, w.requires)) return false;
    if (w.institutionScopeOnly && opts.scope && opts.scope.mode !== 'institution') return false;
    if (w.needsStaff && opts.hasStaff === false) return false;
    return true;
  });
}

/** Widget ids a principal may see — used to validate pin/hide writes. Permission-only, no scope
 *  filtering: a user shouldn't lose a saved preference just because they switched campus today. */
export function entitledWidgetIds(principal: InstitutionPrincipal): Set<string> {
  return new Set(entitledWidgets(principal).map((w) => w.id));
}

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
