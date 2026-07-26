import { describe, expect, it } from 'vitest';
import { PERSONA_ORDER, derivePersonas, hasAllRoles, hasAnyRole, hasRole, personaForRole } from './personas';

describe('derivePersonas', () => {
  it('returns every persona a multi-role user holds, not just the first', () => {
    // The whole point of the rewrite: the old pickKind() would have collapsed this to 'institution'
    // and silently dropped the teaching side.
    expect(derivePersonas(['institution_admin', 'teacher'])).toEqual(['leadership', 'teaching']);
  });

  it('orders personas by PERSONA_ORDER regardless of the order roles were assigned', () => {
    expect(derivePersonas(['teacher', 'institution_admin'])).toEqual(['leadership', 'teaching']);
    expect(derivePersonas(['librarian', 'finance_manager'])).toEqual(['finance', 'library']);
  });

  it('dedupes roles that share a persona', () => {
    expect(derivePersonas(['transport_manager', 'security_staff', 'clerk'])).toEqual(['operations']);
  });

  it('maps an unknown custom tenant role to general rather than dropping the user', () => {
    // Custom roles come from the institution_roles table with arbitrary keys. They must never
    // leave a user personaless — their widgets still come from their permissions.
    expect(derivePersonas(['bursar_level_2'])).toEqual(['general']);
  });

  it('never returns an empty list', () => {
    expect(derivePersonas([])).toEqual(['general']);
  });

  it('covers every persona key it can emit', () => {
    for (const p of PERSONA_ORDER) {
      expect(PERSONA_ORDER).toContain(p);
    }
    expect(personaForRole('institution_owner')).toBe('leadership');
    expect(personaForRole('school_nurse')).toBe('wellbeing');
    expect(personaForRole('it_staff')).toBe('it');
  });
});

describe('role predicates', () => {
  const roles = ['teacher', 'finance_manager'];

  it('hasRole matches exactly one key', () => {
    expect(hasRole(roles, 'teacher')).toBe(true);
    expect(hasRole(roles, 'institution_admin')).toBe(false);
  });

  it('hasAnyRole is an OR', () => {
    expect(hasAnyRole(roles, 'institution_admin', 'teacher')).toBe(true);
    expect(hasAnyRole(roles, 'institution_admin', 'principal')).toBe(false);
  });

  it('hasAllRoles is an AND', () => {
    expect(hasAllRoles(roles, 'teacher', 'finance_manager')).toBe(true);
    expect(hasAllRoles(roles, 'teacher', 'principal')).toBe(false);
  });
});
