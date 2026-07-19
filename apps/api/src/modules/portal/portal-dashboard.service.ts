import { Injectable } from '@nestjs/common';
import {
  resolveScopeFilter,
  type InstitutionPrincipal,
  type InstitutionScope,
} from '@edrion/auth';
import { can } from '@edrion/permissions';
import {
  PERSONA_LABELS,
  PERSONA_ORDER,
  derivePersonas,
  type PersonaKey,
} from '@edrion/permissions/institution';
import { PortalRepository } from './portal.repository';
import { DashboardPrefsService } from './dashboard/dashboard-prefs.service';
import { entitledWidgets, type WidgetData, type WidgetSize } from './dashboard/widget-registry';

export interface DashboardWidgetDto {
  id: string;
  persona: PersonaKey;
  title: string;
  description?: string;
  size: WidgetSize;
  pinned: boolean;
  data: WidgetData;
}

export interface DashboardPersonaDto {
  key: PersonaKey;
  label: string;
  /** True when one of the user's roles maps to this persona (vs. it only appearing because a
   *  permission entitles them to a widget that lives under it). Drives tab ordering, nothing more. */
  fromRole: boolean;
}

export interface PortalDashboardDto {
  scopeLabel: string;
  personas: DashboardPersonaDto[];
  widgets: DashboardWidgetDto[];
  hidden: string[];
}

/**
 * Builds the dashboard by COMPOSING widgets, not by picking one of a few hardcoded variants.
 *
 * The old design chose a single "kind" from the user's first matching role, which meant a user with
 * two roles lost one of them, and a user with a custom tenant role got nothing at all. Here, every
 * widget the user's PERMISSIONS entitle them to is hydrated and returned; their roles only decide
 * which persona heading each widget sits under and in what order the headings appear.
 *
 * The permission check happens before hydration, so an unentitled widget's query never runs and its
 * data never enters the response. Personas and preferences are applied on top and can only ever
 * narrow that set.
 */
@Injectable()
export class PortalDashboardService {
  constructor(
    private readonly repo: PortalRepository,
    private readonly prefs: DashboardPrefsService,
  ) {}

  async build(principal: InstitutionPrincipal, scope: InstitutionScope): Promise<PortalDashboardDto> {
    const filter = resolveScopeFilter(principal, scope);
    const campusIds = filter.campusIds;

    // Teaching widgets key off the staff row behind the login. Resolve it once, up front, so the
    // registry can drop teaching widgets for logins that have no staff record rather than
    // hydrating them into confusing zeroes.
    const staffId = await this.repo.staffIdForUser(principal.institutionId, principal.institutionUserId);

    const [campuses, prefs] = await Promise.all([
      this.repo.listCampuses(principal.institutionId, campusIds),
      this.prefs.get(principal),
    ]);

    const entitled = entitledWidgets(principal, { scope, hasStaff: staffId !== null });
    const hidden = new Set(prefs.hidden);
    const pinned = new Set(prefs.pinned);
    const visible = entitled.filter((w) => !hidden.has(w.id));

    const ctx = {
      principal,
      scope,
      campusIds,
      staffId,
      repo: this.repo,
      // Widgets that render several independently-sensitive figures gate each one with this, so a
      // widget reached via ANY-of `requires` still can't show a figure the caller isn't cleared for.
      can: (key: string) => can(principal.permissions, key),
    };
    const all = await Promise.all(
      visible.map(async (w) => ({
        id: w.id,
        persona: w.persona,
        title: w.title,
        description: w.description,
        size: w.size,
        pinned: pinned.has(w.id),
        data: await w.hydrate(ctx),
      })),
    );

    // A stats widget whose every figure was gated away has nothing to say — drop it rather than
    // render an empty card.
    const hydrated = all.filter((w) => !(w.data.type === 'stats' && w.data.stats.length === 0));

    // Pinned first, then by persona order, then by the widget's own priority.
    const personaRank = new Map(PERSONA_ORDER.map((p, i) => [p, i]));
    const priority = new Map(entitled.map((w) => [w.id, w.priority]));
    hydrated.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const pa = personaRank.get(a.persona) ?? 99;
      const pb = personaRank.get(b.persona) ?? 99;
      if (pa !== pb) return pa - pb;
      return (priority.get(a.id) ?? 0) - (priority.get(b.id) ?? 0);
    });

    return {
      scopeLabel:
        scope.mode === 'institution'
          ? 'Entire Institution'
          : campuses.find((c) => c.id === scope.campusId)?.name ?? 'Campus',
      // Derived from what actually rendered, not merely what was entitled — a widget dropped for
      // having nothing to show must not leave an empty persona tab behind.
      personas: this.personasFor(principal, hydrated.map((w) => w.persona)),
      widgets: hydrated,
      // Returned so the web can offer "unhide" without a second round trip. Already filtered to
      // ids the user is entitled to by DashboardPrefsService.get().
      hidden: prefs.hidden,
    };
  }

  /**
   * Personas to render as tabs: those the user's roles imply, plus any persona that actually has an
   * entitled widget in it. A persona with no entitled widget is dropped, so an admin who lacks
   * `fees.view` never sees an empty Finance tab.
   */
  private personasFor(principal: InstitutionPrincipal, present: PersonaKey[]): DashboardPersonaDto[] {
    const fromRole = new Set(derivePersonas(principal.roleKeys));
    const withWidgets = new Set(present);
    return PERSONA_ORDER.filter((p) => withWidgets.has(p)).map((key) => ({
      key,
      label: PERSONA_LABELS[key],
      fromRole: fromRole.has(key),
    }));
  }
}
