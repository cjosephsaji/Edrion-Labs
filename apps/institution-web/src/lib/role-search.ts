/** Search helpers for the portal role picker — aliases, tokenisation and relevance ranking. */

export interface RoleSearchable {
  key: string;
  name: string;
  description?: string | null;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function normalizeRoleSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim();
}

/** Informal names and abbreviations keyed by role key. */
const ROLE_ALIAS_TERMS: Record<string, readonly string[]> = {
  department_head: ['hod', 'head of department', 'dept head', 'department head', 'head of dept'],
  professor: ['prof', 'professor', 'faculty'],
  assistant_professor: ['assistant professor', 'asst prof', 'assistant prof'],
  teacher: ['teacher', 'teaching staff', 'class teacher', 'educator'],
  principal: ['principal', 'headmaster', 'headmistress', 'school head'],
  academic_coordinator: ['academic coordinator', 'academics coordinator', 'academic lead'],
  institution_admin: ['institution admin', 'inst admin', 'school admin'],
  campus_admin: ['campus admin'],
  institution_owner: ['owner', 'institution owner', 'school owner'],
  finance_manager: ['finance', 'finance manager', 'accounts', 'accountant', 'bursar'],
  hr_manager: ['hr', 'human resources', 'hr manager', 'personnel'],
  school_nurse: ['nurse', 'school nurse', 'medical'],
  counselor: ['counselor', 'counsellor', 'counseling'],
  lab_staff: ['lab', 'laboratory', 'lab staff', 'lab technician'],
  receptionist: ['reception', 'receptionist', 'front desk'],
  it_staff: ['it', 'it staff', 'tech support', 'technology'],
  maintenance_staff: ['maintenance', 'facilities', 'janitor'],
  security_staff: ['security', 'guard', 'security staff'],
  transport_manager: ['transport', 'bus'],
  librarian: ['librarian', 'library'],
  registrar: ['registrar', 'registration', 'enrollment'],
  hostel_warden: ['warden', 'hostel', 'hostel warden', 'dorm'],
  clerk: ['clerk', 'office clerk', 'administrative'],
  viewer: ['viewer', 'read only', 'readonly'],
  parent: ['parent', 'guardian'],
  student: ['student', 'pupil', 'learner'],
  phd_scholar: ['phd', 'scholar', 'research scholar', 'ta', 'teaching assistant'],
};

/** Typed abbreviations → extra phrases to try when scoring a single token. */
const SEARCH_TERM_HINTS: Record<string, readonly string[]> = {
  hod: ['department head', 'department_head', 'head of department'],
  prof: ['professor'],
  professor: ['professor'],
  hr: ['human resources', 'hr manager', 'hr_manager'],
  it: ['it staff', 'it_staff'],
  admin: ['institution admin', 'campus admin', 'institution_admin', 'campus_admin'],
  ta: ['phd scholar', 'teaching assistant', 'phd_scholar'],
};

/** Informal query terms → related role keys that should rank highly even without a literal text hit. */
const TERM_RELATED_ROLE_KEYS: Record<string, readonly string[]> = {
  professor: ['professor', 'assistant_professor', 'teacher', 'department_head'],
  prof: ['professor', 'assistant_professor', 'teacher', 'department_head'],
  hod: ['department_head', 'professor', 'teacher', 'assistant_professor'],
  teacher: ['teacher', 'professor', 'assistant_professor'],
  teaching: ['teacher', 'professor', 'assistant_professor'],
  faculty: ['professor', 'assistant_professor', 'teacher', 'department_head'],
};

const CONNECTOR_RE = /\s*(?:,|\/|&|\+|\band\b)\s*/gi;

/** Split a free-text query into independent search tokens (`Professor and HOD` → two terms). */
export function parseRoleSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return trimmed
    .split(CONNECTOR_RE)
    .map((part) => normalizeRoleSearchText(part))
    .filter(Boolean);
}

function aliasesForRole(key: string): string[] {
  return [...(ROLE_ALIAS_TERMS[key] ?? [])];
}

function expandedTerms(term: string): string[] {
  const hints = SEARCH_TERM_HINTS[term] ?? [];
  return [term, ...hints.map((h) => normalizeRoleSearchText(h))];
}

function scoreAgainstSingleTerm(role: RoleSearchable, rawTerm: string): number {
  const terms = expandedTerms(normalizeRoleSearchText(rawTerm));
  let best = 0;

  const name = normalizeRoleSearchText(role.name);
  const key = normalizeRoleSearchText(role.key);
  const keySpaced = key.replace(/_/g, ' ');
  const description = normalizeRoleSearchText(role.description ?? '');
  const aliases = aliasesForRole(role.key).map(normalizeRoleSearchText);

  for (const term of terms) {
    if (!term) continue;

    if (name === term) best = Math.max(best, 100);
    else if (name.startsWith(term)) best = Math.max(best, 85);
    else if (name.includes(term)) best = Math.max(best, 65);

    if (key === term || keySpaced === term) best = Math.max(best, 75);
    else if (key.includes(term) || keySpaced.includes(term)) best = Math.max(best, 55);

    for (const alias of aliases) {
      if (alias === term) best = Math.max(best, 80);
      else if (alias.includes(term) || term.includes(alias)) best = Math.max(best, 60);
    }

    if (description.includes(term)) best = Math.max(best, 35);

    const relatedKeys = TERM_RELATED_ROLE_KEYS[term] ?? [];
    const relatedIndex = relatedKeys.indexOf(role.key);
    if (relatedIndex >= 0) {
      // Earlier entries in the related list are stronger associations.
      best = Math.max(best, 70 - relatedIndex * 8);
    }
  }

  return best;
}

/** Higher scores mean a stronger match. Zero means no meaningful match for the active query. */
export function scoreRoleSearchMatch(role: RoleSearchable, query: string): number {
  const terms = parseRoleSearchTerms(query);
  if (terms.length === 0) return 0;

  const perTerm = terms.map((term) => scoreAgainstSingleTerm(role, term));
  const matched = perTerm.filter((score) => score > 0).length;
  const sum = perTerm.reduce((total, score) => total + score, 0);
  const allTermsBonus = matched === terms.length ? 40 * terms.length : 0;

  return sum + allTermsBonus;
}

/** Rank roles for the picker: best matches first, stable order for ties and empty queries. */
export function rankRolesForSearch<T extends RoleSearchable>(roles: readonly T[], query: string): T[] {
  const terms = parseRoleSearchTerms(query);
  if (terms.length === 0) return [...roles];

  const indexed = roles.map((role, index) => ({
    role,
    index,
    score: scoreRoleSearchMatch(role, query),
  }));

  indexed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.score > 0) return a.role.name.localeCompare(b.role.name);
    return a.index - b.index;
  });

  return indexed.map((entry) => entry.role);
}
