import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Database } from '@edrion/database';
import type { InstitutionPrincipal } from '@edrion/auth';
import { DashboardPrefsService } from './dashboard-prefs.service';

/**
 * Preferences may only ever SUBTRACT from what a user is entitled to see. The rejection test below
 * is the one that enforces "users can only hide/pin the cards they have permission to".
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

/** A db stub whose insert path records what would have been written. */
function fakeDb(row?: { hiddenWidgets: string[]; pinnedWidgets: string[]; activePersona: string | null }) {
  const written: unknown[] = [];
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        written.push(v);
        return { onConflictDoUpdate: () => Promise.resolve() };
      },
    }),
  } as unknown as Database;
  return { db, written };
}

const TEACHER = principal(
  ['portal.dashboard.view', 'academics.teach', 'timetable.view'],
  ['teacher'],
);

describe('DashboardPrefsService.save', () => {
  it('rejects hiding a widget the user is not entitled to see', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    // A teacher has no fees.view, so finance.collections is not hers to hide — even though hiding
    // is "harmless", accepting the id would mean storing state about a widget she can't see, and a
    // client that sends it is either buggy or probing.
    await expect(
      svc.save(TEACHER, { hidden: ['finance.collections'], pinned: [], activePersona: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects pinning a widget the user is not entitled to see', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    await expect(
      svc.save(TEACHER, { hidden: [], pinned: ['finance.collections'], activePersona: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('names the offending ids in the error so the client can self-correct', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    await expect(
      svc.save(TEACHER, { hidden: ['finance.payroll'], pinned: ['library.loans'], activePersona: null }),
    ).rejects.toMatchObject({
      response: {
        code: 'WIDGET_NOT_ENTITLED',
        widgetIds: expect.arrayContaining(['finance.payroll', 'library.loans']),
      },
    });
  });

  it('rejects an id that is not in the registry at all', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    await expect(
      svc.save(TEACHER, { hidden: ['../../etc/passwd'], pinned: [], activePersona: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts widgets the user IS entitled to', async () => {
    const { db, written } = fakeDb();
    const svc = new DashboardPrefsService(db);

    const result = await svc.save(TEACHER, {
      hidden: ['teaching.today'],
      pinned: ['teaching.my_load'],
      activePersona: 'teaching',
    });

    expect(result.hidden).toEqual(['teaching.today']);
    expect(result.pinned).toEqual(['teaching.my_load']);
    expect(written).toHaveLength(1);
  });

  it('lets hiding win over pinning when a widget is in both lists', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    const result = await svc.save(TEACHER, {
      hidden: ['teaching.today'],
      pinned: ['teaching.today'],
      activePersona: null,
    });

    expect(result.hidden).toEqual(['teaching.today']);
    expect(result.pinned).toEqual([]);
  });

  it('rejects an unknown persona', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    await expect(
      svc.save(TEACHER, {
        hidden: [],
        pinned: [],
        activePersona: 'superuser' as never,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('DashboardPrefsService.get', () => {
  it('drops a stored pref for a widget the user can no longer see', async () => {
    // The user pinned a finance card while they held finance_manager. The role was revoked. The
    // stale pref must not resurrect the widget.
    const { db } = fakeDb({
      hiddenWidgets: ['finance.payroll'],
      pinnedWidgets: ['finance.collections', 'teaching.my_load'],
      activePersona: 'teaching',
    });
    const svc = new DashboardPrefsService(db);

    const prefs = await svc.get(TEACHER);

    expect(prefs.pinned).toEqual(['teaching.my_load']);
    expect(prefs.hidden).toEqual([]);
    expect(prefs.activePersona).toBe('teaching');
  });

  it('returns empty prefs when the user has never saved any', async () => {
    const { db } = fakeDb();
    const svc = new DashboardPrefsService(db);

    expect(await svc.get(TEACHER)).toEqual({ hidden: [], pinned: [], activePersona: null });
  });

  it('ignores an unknown persona stored in the row', async () => {
    const { db } = fakeDb({ hiddenWidgets: [], pinnedWidgets: [], activePersona: 'bogus' });
    const svc = new DashboardPrefsService(db);

    expect((await svc.get(TEACHER)).activePersona).toBeNull();
  });
});
