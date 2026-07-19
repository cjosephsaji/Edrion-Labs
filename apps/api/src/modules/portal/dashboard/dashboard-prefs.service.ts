import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import { PERSONA_ORDER, type PersonaKey } from '@edrion/permissions/institution';
import type { InstitutionPrincipal } from '@edrion/auth';
import { DATABASE } from '../../../common/tokens';
import { entitledWidgetIds } from './widget-registry';

export interface DashboardPrefs {
  hidden: string[];
  pinned: string[];
  activePersona: PersonaKey | null;
}

const EMPTY: DashboardPrefs = { hidden: [], pinned: [], activePersona: null };

/**
 * Per-user dashboard layout preferences.
 *
 * Preferences SUBTRACT from the user's entitled widget set; they can never add to it. Both halves
 * of that are enforced here:
 *
 *   - on write, an id the user isn't entitled to (or that isn't in the registry at all) is
 *     rejected outright rather than quietly dropped, so a crafted request can't stash a pin for a
 *     widget the caller was never allowed to see;
 *   - on read, ids are re-intersected with the CURRENT entitled set, so a preference saved while
 *     the user held a role survives harmlessly after that role is revoked instead of resurrecting
 *     the widget.
 *
 * The dashboard build applies prefs only AFTER computing entitlement, so even a corrupt row in
 * this table cannot cause an unentitled query to run.
 */
@Injectable()
export class DashboardPrefsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Raw stored prefs, filtered to what the principal may currently see. */
  async get(principal: InstitutionPrincipal): Promise<DashboardPrefs> {
    const t = schema.institutionUserDashboardPrefs;
    const [row] = await this.db
      .select()
      .from(t)
      .where(eq(t.institutionUserId, principal.institutionUserId))
      .limit(1);
    if (!row) return EMPTY;

    const allowed = entitledWidgetIds(principal);
    return {
      hidden: (row.hiddenWidgets ?? []).filter((id) => allowed.has(id)),
      pinned: (row.pinnedWidgets ?? []).filter((id) => allowed.has(id)),
      activePersona: asPersona(row.activePersona),
    };
  }

  async save(principal: InstitutionPrincipal, input: DashboardPrefs): Promise<DashboardPrefs> {
    const allowed = entitledWidgetIds(principal);

    // Reject rather than strip: a client sending an id the user can't see is either buggy or
    // probing, and silently accepting it would hide the problem.
    const offending = [...input.hidden, ...input.pinned].filter((id) => !allowed.has(id));
    if (offending.length > 0) {
      throw new BadRequestException({
        code: 'WIDGET_NOT_ENTITLED',
        message: 'Cannot pin or hide a widget you do not have permission to see.',
        widgetIds: [...new Set(offending)],
      });
    }
    if (input.activePersona && !PERSONA_ORDER.includes(input.activePersona)) {
      throw new BadRequestException({ code: 'UNKNOWN_PERSONA', message: 'Unknown persona.' });
    }

    const hidden = [...new Set(input.hidden)];
    // Hiding wins over pinning — a widget can't be both, and hiding is the more specific intent.
    const pinned = [...new Set(input.pinned)].filter((id) => !hidden.includes(id));

    const t = schema.institutionUserDashboardPrefs;
    await this.db
      .insert(t)
      .values({
        institutionUserId: principal.institutionUserId,
        hiddenWidgets: hidden,
        pinnedWidgets: pinned,
        activePersona: input.activePersona,
      })
      .onConflictDoUpdate({
        target: t.institutionUserId,
        set: {
          hiddenWidgets: hidden,
          pinnedWidgets: pinned,
          activePersona: input.activePersona,
          updatedAt: new Date(),
        },
      });

    return { hidden, pinned, activePersona: input.activePersona };
  }
}

function asPersona(value: string | null): PersonaKey | null {
  if (!value) return null;
  return PERSONA_ORDER.includes(value as PersonaKey) ? (value as PersonaKey) : null;
}
