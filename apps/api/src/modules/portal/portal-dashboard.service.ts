import { Injectable } from '@nestjs/common';
import {
  resolveScopeFilter,
  type InstitutionPrincipal,
  type InstitutionScope,
} from '@edrion/auth';
import { PortalRepository, type ModuleCounts } from './portal.repository';

type DashboardKind = 'institution' | 'campus' | 'teacher' | 'parent' | 'student' | 'generic';

interface DashboardStat {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  pending?: boolean;
  /** 'money' → value is integer MINOR units; the web formats it in the institution's currency. */
  format?: 'money';
}
interface DashboardActivity {
  id: string;
  title: string;
  description: string;
  at: string;
}
interface CampusComparisonRow {
  campusId: string;
  name: string;
  users: number;
}
export interface PortalDashboardDto {
  kind: DashboardKind;
  scopeLabel: string;
  stats: DashboardStat[];
  pendingApprovals: number;
  recentActivity: DashboardActivity[];
  campusComparison?: CampusComparisonRow[];
}

/** A not-yet-built metric: rendered muted with a "coming soon" hint. Honest placeholder. */
const pending = (key: string, label: string): DashboardStat => ({ key, label, value: 0, pending: true });

/**
 * Builds the adaptive, scope-aware dashboard in a SINGLE request. The variant (kind) is derived
 * from the principal's roles; the scope (institution vs campus) narrows every query. Real metrics
 * (campuses, users, recent activity) come from live tables; modules not built yet are returned as
 * clearly-marked pending stats rather than fabricated numbers.
 */
@Injectable()
export class PortalDashboardService {
  constructor(private readonly repo: PortalRepository) {}

  async build(principal: InstitutionPrincipal, scope: InstitutionScope): Promise<PortalDashboardDto> {
    const kind = pickKind(principal.roleKeys);
    const filter = resolveScopeFilter(principal, scope);

    // Real module counts back the admin (institution/campus) dashboards; the per-user variants
    // (teacher/parent/student) still show clearly-marked pending stats until their own joins land.
    const wantsCounts = kind === 'institution' || kind === 'campus';
    const [campuses, userCount, activity, counts] = await Promise.all([
      this.repo.listCampuses(principal.institutionId, filter.campusIds),
      this.repo.countUsers(principal.institutionId),
      this.repo.recentActivity(principal.institutionId, filter.campusIds, 8),
      wantsCounts
        ? this.repo.moduleCounts(principal.institutionId, filter.campusIds)
        : Promise.resolve(null),
    ]);

    const scopeLabel =
      scope.mode === 'institution'
        ? 'Entire Institution'
        : campuses.find((c) => c.id === scope.campusId)?.name ?? 'Campus';

    const recentActivity: DashboardActivity[] = activity.map((a) => ({
      id: a.id,
      title: humanizeAction(a.action),
      description: `${a.module}${a.actorName ? ` · ${a.actorName}` : ''}`,
      at: a.occurredAt.toISOString(),
    }));

    const stats = this.statsFor(kind, campuses.length, userCount, counts);

    const dto: PortalDashboardDto = {
      kind,
      scopeLabel,
      stats,
      pendingApprovals: 0,
      recentActivity,
    };

    if (kind === 'institution' && scope.mode === 'institution') {
      dto.campusComparison = campuses.map((c) => ({
        campusId: c.id,
        name: c.name,
        users: c.currentUserCount,
      }));
    }
    return dto;
  }

  private statsFor(
    kind: DashboardKind,
    campusCount: number,
    userCount: number,
    counts: ModuleCounts | null,
  ): DashboardStat[] {
    const real = {
      campuses: { key: 'campuses', label: 'Campuses', value: campusCount },
      users: { key: 'users', label: 'Portal users', value: userCount },
    } satisfies Record<string, DashboardStat>;

    // Real, scope-aware module metrics (institution/campus dashboards). `feesCollected` is in MINOR
    // units; the web formats it in the institution's currency (format: 'money').
    const c = counts ?? { students: 0, staff: 0, attendanceToday: 0, feesCollected: 0, openAdmissions: 0, payrollDue: 0 };
    const m = {
      students: { key: 'students', label: 'Total students', value: c.students },
      staff: { key: 'staff', label: 'Total staff', value: c.staff },
      attendance: { key: 'attendance', label: 'Present today', value: c.attendanceToday },
      fees: { key: 'fees', label: 'Fees collected', value: c.feesCollected, format: 'money' as const },
      admissions: { key: 'admissions', label: 'Open admissions', value: c.openAdmissions },
      payroll: { key: 'payroll', label: 'Payroll runs due', value: c.payrollDue },
    } satisfies Record<string, DashboardStat>;

    switch (kind) {
      case 'institution':
        return [
          real.campuses,
          m.students,
          m.staff,
          real.users,
          m.attendance,
          m.fees,
          m.admissions,
          m.payroll,
        ];
      case 'campus':
        return [
          { ...m.students, label: 'Campus students' },
          { ...m.staff, label: 'Campus staff' },
          real.users,
          m.attendance,
          m.fees,
          m.admissions,
        ];
      case 'teacher':
        return [
          pending('classes', 'Assigned classes'),
          pending('today', 'Classes today'),
          pending('attendance', 'Attendance to mark'),
          pending('grading', 'Assignments to grade'),
        ];
      case 'parent':
        return [
          pending('children', 'Children'),
          pending('attendance', 'Attendance this week'),
          pending('fees', 'Fees due'),
          pending('announcements', 'New announcements'),
        ];
      case 'student':
        return [
          pending('classes', 'Classes'),
          pending('assignments', 'Assignments due'),
          pending('exams', 'Upcoming exams'),
          pending('grade', 'Average grade'),
        ];
      default:
        return [real.campuses, real.users];
    }
  }
}

/** Pick the dashboard variant from the user's roles (first match wins). */
function pickKind(roleKeys: string[]): DashboardKind {
  if (roleKeys.includes('institution_owner') || roleKeys.includes('institution_admin')) {
    return 'institution';
  }
  if (roleKeys.includes('campus_admin') || roleKeys.includes('principal')) return 'campus';
  if (roleKeys.includes('teacher')) return 'teacher';
  if (roleKeys.includes('parent')) return 'parent';
  if (roleKeys.includes('student')) return 'student';
  return 'generic';
}

function humanizeAction(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
