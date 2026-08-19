import { describe, expect, it } from 'vitest';
import {
  PETROS_ROUTE_RULES,
  petrosCompanionBlockSchema,
  petrosCompanionTurnInputSchema,
  petrosPageContextSchema,
  resolvePetrosRoute,
} from './petros-companion';

/**
 * Every page that exists in apps/student-web/src/app/(app). Adding a route to the
 * portal without adding a rule here fails this test, which is the point: a new page
 * must never silently degrade to `/home`.
 */
const PORTAL_ROUTES = [
  '/home',
  '/timetable',
  '/attendance',
  '/classes',
  '/classes/abc',
  '/courses',
  '/courses/abc',
  '/calendar',
  '/assignments',
  '/assignments/abc',
  '/homework',
  '/homework/abc',
  '/materials',
  '/learning-path',
  '/progress',
  '/exams',
  '/exams/abc/attempt',
  '/results',
  '/report-cards',
  '/report-cards/abc',
  '/fees',
  '/fees/pay',
  '/announcements',
  '/notifications',
  '/requests',
  '/requests/new',
  '/requests/abc',
  '/documents',
  '/transport',
  '/hostel',
  '/profile',
  '/settings',
  '/petros',
  '/petros/artifacts',
  '/petros/session',
  '/design-system',
];

describe('Petros route support registry', () => {
  it('classifies every portal route explicitly', () => {
    const unclassified = PORTAL_ROUTES.filter(
      (route) => resolvePetrosRoute(route).surface === 'unknown' && !route.startsWith('/petros/session') && route !== '/design-system',
    );
    expect(unclassified).toEqual([]);
  });

  it('never rewrites a route it does not support', () => {
    for (const route of PORTAL_ROUTES) {
      expect(resolvePetrosRoute(route).route).toBe(route);
    }
  });

  it('prefers the longest matching prefix', () => {
    expect(resolvePetrosRoute('/fees/pay').support).toBe('hidden');
    expect(resolvePetrosRoute('/fees').support).toBe('unavailable');
    expect(resolvePetrosRoute('/petros/artifacts').support).toBe('supported');
    expect(resolvePetrosRoute('/petros/session').support).toBe('hidden');
    expect(resolvePetrosRoute('/petros').support).toBe('unavailable');
  });

  it('hides Petros inside an exam attempt but not on the exam list', () => {
    expect(resolvePetrosRoute('/exams/9f/attempt').support).toBe('hidden');
    expect(resolvePetrosRoute('/exams').support).toBe('supported');
  });

  it('strips query and hash before matching', () => {
    expect(resolvePetrosRoute('/results?focus=3#top').support).toBe('supported');
    expect(resolvePetrosRoute('/results?focus=3#top').route).toBe('/results');
  });

  it('gives every unavailable route a student-facing reason', () => {
    for (const rule of PETROS_ROUTE_RULES) {
      if (rule.support === 'unavailable') expect(rule.reason).toBeTruthy();
    }
  });

  it('falls back to unavailable, never to home', () => {
    const unknown = resolvePetrosRoute('/some-future-page');
    expect(unknown.support).toBe('unavailable');
    expect(unknown.route).toBe('/some-future-page');
  });
});

describe('Petros companion contracts', () => {
  it('rejects an unregistered action key', () => {
    const parsed = petrosCompanionBlockSchema.safeParse({
      type: 'action_proposal',
      proposalId: '00000000-0000-4000-8000-000000000000',
      actionKey: 'fees.pay',
      title: 'Pay it',
      preview: ['nope'],
      confirmationRequired: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects any destination that leaves the portal', () => {
    // `//host` is protocol-relative: browsers resolve it off-site even though it starts
    // with a slash, so a startsWith('/') check alone is an open redirect.
    for (const href of ['https://evil.example/steal', '//evil.example', '/\\evil.example']) {
      expect(
        petrosCompanionBlockSchema.safeParse({ type: 'navigation', label: 'Go', href }).success,
      ).toBe(false);
    }
    expect(
      petrosCompanionBlockSchema.safeParse({ type: 'navigation', label: 'Go', href: '/results' }).success,
    ).toBe(true);
  });

  it('requires an idempotency key on every turn', () => {
    const parsed = petrosCompanionTurnInputSchema.safeParse({
      message: 'hi',
      route: '/home',
      surface: 'home',
    });
    expect(parsed.success).toBe(false);
  });

  it('keeps candidate refs and entity types typed', () => {
    const parsed = petrosPageContextSchema.safeParse({
      route: '/assignments',
      surface: 'assignments',
      title: 'Assignments',
      candidates: [
        { ref: 'a3', entityType: 'assignment', entityId: 'abc', title: 'Photosynthesis', summary: 'Due Friday' },
      ],
      selectedRef: 'a3',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.candidates[0]?.availableActions).toEqual([]);
  });
});
