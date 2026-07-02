import { z } from 'zod';

/**
 * Institution-Portal GLOBAL SEARCH contract. A single free-text query fans out across every
 * directory the caller is allowed to see (students, teachers, staff, parents, and the academic
 * structure), matching names, codes, numbers, emails and phone numbers. Tenancy (institution_id)
 * and the active campus scope are derived from the principal + scope header, never the query.
 */
export const portalGlobalSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter a search term').max(160),
  /** Max hits per result group (students, teachers, …). */
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type PortalGlobalSearchQuery = z.infer<typeof portalGlobalSearchQuerySchema>;

/** One matched record. `href` deep-links to the module list pre-filtered by the match. */
export interface PortalSearchHit {
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
}

/** A group of hits of one kind (e.g. "Students"), returned only when the caller may view it. */
export interface PortalSearchGroup {
  type: string;
  label: string;
  hits: PortalSearchHit[];
}
