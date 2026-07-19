import { describe, expect, it } from 'vitest';
import type { InstitutionPrincipal } from '@edrion/auth';
import { DASHBOARD_WIDGETS, entitledWidgetIds, entitledWidgets } from './widget-registry';

/**
 * These tests guard the security boundary of the dashboard: a widget is reachable ONLY through the
 * permission keys it declares. If one of these ever fails, some role can see data it shouldn't.
 */

function principal(permissions: string[], roleKeys: string[] = []): InstitutionPrincipal {
  const keys = new Set(permissions);
  return {
    institutionUserId: 'u1',
    institutionId: 'i1',
    email: 'u@example.com',
    fullName: 'Test User',
    roleKeys,
    permissions: { keys, hasWildcard: keys.has('*') },
    allowedCampusIds: [],
    isInstitutionWide: true,
    mfaEnrolled: false,
    lastAuthAt: new Date(),
  };
}

const ids = (p: InstitutionPrincipal) => entitledWidgets(p).map((w) => w.id);

describe('entitledWidgets', () => {
  it('does NOT give a teacher any finance widget', () => {
    // The requirement, stated as a test: a teacher must never see fee figures for her class or any
    // other. She holds teaching permissions and no fees.view.
    const teacher = principal(
      ['portal.dashboard.view', 'academics.teach', 'timetable.view', 'attendance.manage', 'homework.grade'],
      ['teacher'],
    );
    const got = ids(teacher);

    expect(got).not.toContain('finance.collections');
    expect(got).not.toContain('finance.payroll');
    expect(got.some((id) => id.startsWith('finance.'))).toBe(false);
    // …but she does get her own teaching cards.
    expect(got).toContain('teaching.my_load');
    expect(got).toContain('teaching.to_grade');
  });

  it('gives a finance manager the finance widgets and no teaching ones', () => {
    const finance = principal(['portal.dashboard.view', 'fees.view', 'payroll.view'], ['finance_manager']);
    const got = ids(finance);

    expect(got).toContain('finance.collections');
    expect(got).toContain('finance.payroll');
    expect(got.some((id) => id.startsWith('teaching.'))).toBe(false);
  });

  it('gives a multi-role user the UNION of both role’s widgets', () => {
    // The old pickKind() returned a single variant and dropped one of these entirely.
    const both = principal(
      ['portal.dashboard.view', 'fees.view', 'academics.teach', 'timetable.view'],
      ['finance_manager', 'teacher'],
    );
    const got = ids(both);

    expect(got).toContain('finance.collections');
    expect(got).toContain('teaching.my_load');
  });

  it('entitles a CUSTOM tenant role purely from its permissions', () => {
    // A bespoke "Bursar" role that exists only in this institution's institution_roles row. It
    // matches no persona mapping, but holding fees.view is all it takes.
    const bursar = principal(['portal.dashboard.view', 'fees.view'], ['bursar_level_2']);
    expect(ids(bursar)).toContain('finance.collections');
  });

  it('gives the wildcard everything', () => {
    const owner = principal(['*'], ['institution_owner']);
    expect(ids(owner).sort()).toEqual(DASHBOARD_WIDGETS.map((w) => w.id).sort());
  });

  it('respects a direct deny that removes a key the role granted', () => {
    // evaluatePermissions() subtracts directDenies before we ever see the set, so a denied fees.view
    // simply isn't in `keys` — the widget must drop out.
    const denied = principal(['portal.dashboard.view', 'payroll.view'], ['finance_manager']);
    expect(ids(denied)).not.toContain('finance.collections');
    expect(ids(denied)).toContain('finance.payroll');
  });

  it('drops institution-scope-only widgets when the caller is on a campus', () => {
    const admin = principal(['*'], ['institution_admin']);
    const onCampus = entitledWidgets(admin, { scope: { mode: 'campus', campusId: 'c1' } }).map((w) => w.id);
    expect(onCampus).not.toContain('leadership.campus_comparison');

    const institutionWide = entitledWidgets(admin, { scope: { mode: 'institution' } }).map((w) => w.id);
    expect(institutionWide).toContain('leadership.campus_comparison');
  });

  it('drops staff-dependent teaching widgets for a login with no staff record', () => {
    const admin = principal(['*'], ['institution_admin']);
    const noStaff = entitledWidgets(admin, { hasStaff: false }).map((w) => w.id);
    expect(noStaff).not.toContain('teaching.my_load');
    expect(noStaff).not.toContain('teaching.today');
    // attendance.attendance_todo works without a staff row (it just widens to the whole scope).
    expect(noStaff).toContain('teaching.attendance_todo');
  });

  it('gives a user with only portal.dashboard.view nothing but the attention widget', () => {
    const viewer = principal(['portal.dashboard.view'], ['viewer']);
    expect(ids(viewer)).toEqual(['core.attention']);
  });
});

describe('per-figure gating inside a widget', () => {
  // `requires` is ANY-of, so a widget can be REACHED on one key while rendering figures that need
  // others. Each figure must be gated separately or the widget over-discloses. This was a real bug:
  // leadership.headcount was reachable on students.view but rendered staff and portal-user counts,
  // so a teacher saw both.
  const headcount = DASHBOARD_WIDGETS.find((w) => w.id === 'leadership.headcount')!;

  const repo = {
    listCampuses: async () => [{ id: 'c1', name: 'Main', currentUserCount: 5 }],
    countUsers: async () => 42,
    moduleCounts: async () => ({
      students: 100,
      staff: 20,
      attendanceToday: 90,
      feesCollected: 0,
      openAdmissions: 0,
      payrollDue: 0,
    }),
  } as never;

  const hydrateFor = async (permissions: string[]) => {
    const p = principal(permissions);
    const data = await headcount.hydrate({
      principal: p,
      scope: { mode: 'institution' },
      campusIds: null,
      staffId: null,
      can: (k: string) => p.permissions.hasWildcard || p.permissions.keys.has(k),
      repo,
    });
    if (data.type !== 'stats') throw new Error('expected stats');
    return data.stats.map((s) => s.key);
  };

  it('shows a teacher the student count but NOT staff or portal-user counts', async () => {
    // The real teacher permission set: students.view and attendance.view, no staff.view/users.view.
    const keys = await hydrateFor(['portal.dashboard.view', 'students.view', 'attendance.view']);

    expect(keys).toContain('students');
    expect(keys).toContain('attendance');
    expect(keys).not.toContain('staff');
    expect(keys).not.toContain('users');
    expect(keys).not.toContain('campuses');
  });

  it('shows an owner every figure', async () => {
    const keys = await hydrateFor(['*']);
    expect(keys).toEqual(expect.arrayContaining(['students', 'staff', 'attendance', 'campuses', 'users']));
  });

  it('renders no figures at all for a principal holding none of them', async () => {
    // The service drops a stats widget with an empty list rather than rendering an empty card.
    expect(await hydrateFor(['portal.dashboard.view'])).toEqual([]);
  });
});

describe('entitledWidgetIds', () => {
  it('is permission-only — it does not narrow by scope, so prefs survive a campus switch', () => {
    const admin = principal(['*'], ['institution_admin']);
    expect(entitledWidgetIds(admin).has('leadership.campus_comparison')).toBe(true);
  });

  it('excludes what the principal cannot see — the set prefs writes are validated against', () => {
    const teacher = principal(['portal.dashboard.view', 'academics.teach'], ['teacher']);
    expect(entitledWidgetIds(teacher).has('finance.collections')).toBe(false);
  });
});

describe('registry hygiene', () => {
  it('has no duplicate widget ids', () => {
    const all = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('declares at least one required permission on every widget', () => {
    // An empty `requires` would make a widget visible to every authenticated user. Nothing in the
    // registry should need that today; if one ever does, this test should be a deliberate change.
    for (const w of DASHBOARD_WIDGETS) {
      expect(w.requires.length).toBeGreaterThan(0);
    }
  });
});
