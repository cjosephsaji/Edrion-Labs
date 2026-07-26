import type { InstitutionType, TermKey } from '@edrion/shared-types';
import type { NavigationLayout } from '@edrion/schemas';
import { NAV, type NavGroup, type NavItem } from '@/lib/nav';

export interface ResolvedNavItem extends NavItem {
  /** Final display label after prefs + nomenclature. */
  displayLabel: string;
}

export interface ResolvedNavGroup {
  id: string;
  label: string;
  items: ResolvedNavItem[];
}

function orderByIds<T extends { id: string }>(items: T[], preferred?: string[]): T[] {
  if (!preferred?.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered: T[] = [];
  for (const id of preferred) {
    const hit = byId.get(id);
    if (hit) {
      ordered.push(hit);
      byId.delete(id);
    }
  }
  for (const rest of byId.values()) ordered.push(rest);
  return ordered;
}

/** Items that must stay visible so admins cannot lock themselves out of the portal. */
export const NAV_ALWAYS_VISIBLE = new Set(['dashboard', 'settings']);

/**
 * Apply tenant navigation layout prefs on top of the static NAV registry, then filter by
 * permission and institution type. Label resolution: itemLabels override → termKey → static label.
 */
export function resolveNav(
  prefs: NavigationLayout | null | undefined,
  opts: {
    can: (permission: string) => boolean;
    institutionType: InstitutionType;
    term: (key: TermKey) => string;
    termPlural: (key: TermKey) => string;
  },
): ResolvedNavGroup[] {
  const groups = orderByIds(NAV, prefs?.groupOrder);
  const hidden = new Set(prefs?.hiddenItems ?? []);

  return groups
    .map((group): ResolvedNavGroup | null => {
      const orderedItems = orderByIds(group.items, prefs?.itemOrder?.[group.id]);
      const items = orderedItems
        .filter(
          (item) =>
            !hidden.has(item.id) &&
            opts.can(item.permission) &&
            (!item.institutionTypes || item.institutionTypes.includes(opts.institutionType)),
        )
        .map((item): ResolvedNavItem => {
          const override = prefs?.itemLabels?.[item.id]?.trim();
          let displayLabel = item.label;
          if (override) {
            displayLabel = override;
          } else if (item.termKey) {
            displayLabel = item.termPlural ? opts.termPlural(item.termKey) : opts.term(item.termKey);
          }
          return { ...item, displayLabel };
        });

      if (items.length === 0) return null;

      const groupOverride = prefs?.groupLabels?.[group.id]?.trim();
      return {
        id: group.id,
        label: groupOverride || group.label,
        items,
      };
    })
    .filter((g): g is ResolvedNavGroup => g !== null);
}

/** Default editor draft from registry + saved prefs (includes items the user cannot see). */
export function navigationEditorDraft(prefs: NavigationLayout | null | undefined): {
  groups: Array<{ id: string; label: string; defaultLabel: string; items: Array<{ id: string; label: string; defaultLabel: string; href: string }> }>;
} {
  const groups = orderByIds(NAV, prefs?.groupOrder).map((group) => {
    const items = orderByIds(group.items, prefs?.itemOrder?.[group.id]).map((item) => ({
      id: item.id,
      href: item.href,
      defaultLabel: item.label,
      label: prefs?.itemLabels?.[item.id]?.trim() || item.label,
    }));
    return {
      id: group.id,
      defaultLabel: group.label,
      label: prefs?.groupLabels?.[group.id]?.trim() || group.label,
      items,
    };
  });
  return { groups };
}

export function draftToLayout(
  groups: Array<{
    id: string;
    label: string;
    defaultLabel: string;
    items: Array<{ id: string; label: string; defaultLabel: string; hidden?: boolean }>;
  }>,
): NavigationLayout {
  const groupOrder = groups.map((g) => g.id);
  const itemOrder: Record<string, string[]> = {};
  const groupLabels: Record<string, string> = {};
  const itemLabels: Record<string, string> = {};
  const hiddenItems: string[] = [];

  for (const group of groups) {
    itemOrder[group.id] = group.items.map((i) => i.id);
    if (group.label.trim() && group.label.trim() !== group.defaultLabel) {
      groupLabels[group.id] = group.label.trim();
    }
    for (const item of group.items) {
      if (item.label.trim() && item.label.trim() !== item.defaultLabel) {
        itemLabels[item.id] = item.label.trim();
      }
      if (item.hidden && !NAV_ALWAYS_VISIBLE.has(item.id)) {
        hiddenItems.push(item.id);
      }
    }
  }

  // Always persist explicit order so reorders are never dropped by "same as default" heuristics.
  const layout: NavigationLayout = {
    groupOrder,
    itemOrder,
  };
  if (Object.keys(groupLabels).length) layout.groupLabels = groupLabels;
  if (Object.keys(itemLabels).length) layout.itemLabels = itemLabels;
  if (hiddenItems.length) layout.hiddenItems = hiddenItems;
  return layout;
}

/** Used only to keep unused NavGroup import soft-referenced for type docs. */
export type { NavGroup };
