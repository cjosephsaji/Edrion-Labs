import { Injectable } from '@nestjs/common';
import { can } from '@edrion/permissions';
import { resolveScopeFilter } from '@edrion/auth';
import type { PortalGlobalSearchQuery, PortalSearchGroup } from '@edrion/schemas';
import { PortalSearchRepository, type SearchHit } from './portal-search.repository';
import type { PortalActionContext } from './portal-action-context';

/** One searchable directory: the permission that unlocks it, the list route hits link to, and its query. */
interface SearchTarget {
  type: string;
  label: string;
  permission: string;
  /** Base list route; the matched label is appended as `?q=` so the page opens pre-filtered. */
  href: string;
  fetch: (institutionId: string, campusIds: string[] | null, term: string, limit: number) => Promise<SearchHit[]>;
}

/**
 * Global search across the institution portal. A single term fans out over every directory the
 * caller may view — the per-target `view` permission is re-checked here (the endpoint itself is
 * open to any authenticated portal user), so results never leak a module the user can't open.
 * Every query is confined to the principal's institution + active campus scope by the repository.
 */
@Injectable()
export class PortalSearchService {
  constructor(private readonly repo: PortalSearchRepository) {}

  private targets(): SearchTarget[] {
    const r = this.repo;
    return [
      { type: 'student', label: 'Students', permission: 'students.view', href: '/students', fetch: (i, c, t, l) => r.searchStudents(i, c, t, l) },
      { type: 'staff', label: 'Staff', permission: 'staff.view', href: '/staff', fetch: (i, c, t, l) => r.searchStaff(i, c, t, l) },
      { type: 'parent', label: 'Parents', permission: 'parents.view', href: '/parents', fetch: (i, c, t, l) => r.searchParents(i, c, t, l) },
      { type: 'class', label: 'Classes', permission: 'academics.view', href: '/academics/classes', fetch: (i, c, t, l) => r.searchClasses(i, c, t, l) },
      { type: 'subject', label: 'Subjects', permission: 'academics.view', href: '/academics/subjects', fetch: (i, c, t, l) => r.searchSubjects(i, c, t, l) },
      { type: 'department', label: 'Departments', permission: 'academics.view', href: '/academics/departments', fetch: (i, c, t, l) => r.searchDepartments(i, c, t, l) },
      { type: 'grade', label: 'Grades', permission: 'academics.view', href: '/academics/grades', fetch: (i, c, t, l) => r.searchGradeLevels(i, c, t, l) },
    ];
  }

  async search(ctx: PortalActionContext, q: PortalGlobalSearchQuery): Promise<{ groups: PortalSearchGroup[] }> {
    const { campusIds } = resolveScopeFilter(ctx.principal, ctx.scope);
    const allowed = this.targets().filter((t) => can(ctx.principal.permissions, t.permission));

    const groups = await Promise.all(
      allowed.map(async (t): Promise<PortalSearchGroup> => {
        const hits = await t.fetch(ctx.principal.institutionId, campusIds, q.q, q.limit);
        return {
          type: t.type,
          label: t.label,
          hits: hits.map((h) => ({
            ...h,
            href: `${t.href}?q=${encodeURIComponent(h.label)}`,
          })),
        };
      }),
    );

    return { groups: groups.filter((g) => g.hits.length > 0) };
  }
}
