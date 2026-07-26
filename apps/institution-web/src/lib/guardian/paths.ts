/** Base path for the guardian (parent) experience inside institution-web. */
export const FAMILY_BASE = '/family';

export function familyPath(path = ''): string {
  if (!path || path === '/') return FAMILY_BASE;
  return `${FAMILY_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Map legacy parent-web deep links (and relative API paths) into /family routes. */
export function resolveGuardianDeepLink(link: string | null | undefined): string {
  if (!link) return FAMILY_BASE;
  if (link.startsWith('/family')) return link;
  if (link === '/fees' || /^\/child\/[^/]+\/fees$/.test(link)) return familyPath('/fees');
  if (link === '/inbox' || link.startsWith('/inbox')) return familyPath('/inbox');
  if (link.startsWith('/child/') || link.startsWith('/more')) return `/family${link}`;
  return familyPath(link);
}
