'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  cn,
  type NavigationLayout,
  type NomenclatureOverrides,
  type TermKey,
} from '@edrion/ui';
import { DragHandle, moveItem, setRowDragImage } from '@/components/common/drag-handle';
import { NAV } from '@/lib/nav';
import { draftToLayout, NAV_ALWAYS_VISIBLE } from '@/lib/resolve-nav';
import { formatPortalError } from '@/lib/portal-client';
import { useEffectiveSettings, useSaveNavigationLayout, useSaveNomenclatureOverrides } from '@/lib/settings';
import { useTerm } from '@/lib/term';

type DraftItem = {
  id: string;
  label: string;
  /** Label used when there is no custom override (nomenclature or registry). */
  baseLabel: string;
  termKey?: TermKey;
  termPlural?: boolean;
  hidden: boolean;
};

type DraftGroup = {
  id: string;
  label: string;
  baseLabel: string;
  items: DraftItem[];
};

function buildDraft(
  prefs: NavigationLayout | null | undefined,
  term: (k: TermKey) => string,
  termPlural: (k: TermKey) => string,
): DraftGroup[] {
  const hidden = new Set(prefs?.hiddenItems ?? []);
  const groupOrder = prefs?.groupOrder?.length
    ? [...prefs.groupOrder, ...NAV.map((g) => g.id).filter((id) => !prefs.groupOrder!.includes(id))]
    : NAV.map((g) => g.id);

  const groupsById = Object.fromEntries(NAV.map((g) => [g.id, g]));

  return groupOrder
    .map((gid) => groupsById[gid])
    .filter((group): group is (typeof NAV)[number] => !!group)
    .map((group) => {
      const preferred = prefs?.itemOrder?.[group.id];
      const itemOrder = preferred?.length
        ? [...preferred, ...group.items.map((i) => i.id).filter((id) => !preferred.includes(id))]
        : group.items.map((i) => i.id);
      const itemsById = Object.fromEntries(group.items.map((i) => [i.id, i]));

      const items: DraftItem[] = itemOrder
        .map((id) => itemsById[id])
        .filter((item): item is (typeof group.items)[number] => !!item)
        .map((item) => {
          const baseLabel = item.termKey
            ? item.termPlural
              ? termPlural(item.termKey)
              : term(item.termKey)
            : item.label;
          const override = prefs?.itemLabels?.[item.id]?.trim();
          return {
            id: item.id,
            baseLabel,
            label: override || baseLabel,
            termKey: item.termKey,
            termPlural: item.termPlural,
            hidden: !NAV_ALWAYS_VISIBLE.has(item.id) && hidden.has(item.id),
          };
        });

      const baseLabel = group.label;
      const groupOverride = prefs?.groupLabels?.[group.id]?.trim();
      return {
        id: group.id,
        baseLabel,
        label: groupOverride || baseLabel,
        items,
      };
    });
}

function toLayout(groups: DraftGroup[]): NavigationLayout {
  return draftToLayout(
    groups.map((g) => ({
      id: g.id,
      label: g.label,
      defaultLabel: g.baseLabel,
      items: g.items.map((i) => ({
        id: i.id,
        label: i.label,
        defaultLabel: i.baseLabel,
        hidden: i.hidden,
      })),
    })),
  );
}

function layoutJson(layout: NavigationLayout | null | undefined): string {
  return JSON.stringify(layout ?? {});
}

export function NavigationSection({ canManage }: { canManage: boolean }) {
  const { data, isLoading, isError, refetch } = useEffectiveSettings();
  const saveNav = useSaveNavigationLayout();
  const saveNom = useSaveNomenclatureOverrides();
  const { t, tp } = useTerm();

  const [groups, setGroups] = useState<DraftGroup[] | null>(null);
  const [baselineJson, setBaselineJson] = useState('{}');
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupDrag, setGroupDrag] = useState<number | null>(null);
  const [groupOver, setGroupOver] = useState<number | null>(null);
  const [itemDrag, setItemDrag] = useState<{ groupIdx: number; itemIdx: number } | null>(null);
  const [itemOver, setItemOver] = useState<{ groupIdx: number; itemIdx: number } | null>(null);
  const dirtyRef = useRef(false);
  const appliedServerJson = useRef<string | null>(null);
  const groupRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const itemRowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const serverNavJson = layoutJson(data?.navigation);

  const dirty = useMemo(() => {
    if (!groups) return false;
    return layoutJson(toLayout(groups)) !== baselineJson;
  }, [groups, baselineJson]);

  dirtyRef.current = dirty;

  // Hydrate from server only when saved navigation actually changes — never while editing.
  useEffect(() => {
    if (!data) return;
    if (appliedServerJson.current === serverNavJson) return;
    if (dirtyRef.current) return;
    appliedServerJson.current = serverNavJson;
    const draft = buildDraft(data.navigation ?? {}, t, tp);
    setGroups(draft);
    setBaselineJson(layoutJson(toLayout(draft)));
  }, [data, serverNavJson, t, tp]);

  if (isLoading || !groups) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Navigation</CardTitle>
          <CardDescription>Reorder, rename, or hide sidebar categories and links.</CardDescription>
        </CardHeader>
        <div className="space-y-3 p-5 pt-0">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Couldn’t load navigation settings"
        action={
          <Button type="button" size="sm" variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  function moveGroup(from: number, to: number) {
    if (to < 0 || !groups || to >= groups.length) return;
    setGroups(moveItem(groups, from, to));
    setSavedFlash(false);
  }

  function moveItemInGroup(groupIdx: number, from: number, to: number) {
    setGroups((prev) => {
      if (!prev) return prev;
      const items = prev[groupIdx]!.items;
      if (to < 0 || to >= items.length) return prev;
      const next = prev.slice();
      next[groupIdx] = { ...next[groupIdx]!, items: moveItem(items, from, to) };
      return next;
    });
    setSavedFlash(false);
  }

  function toggleItemHidden(groupIdx: number, itemIdx: number) {
    setGroups((prev) => {
      if (!prev) return prev;
      const item = prev[groupIdx]?.items[itemIdx];
      if (!item || NAV_ALWAYS_VISIBLE.has(item.id)) return prev;
      const next = prev.slice();
      const items = next[groupIdx]!.items.slice();
      items[itemIdx] = { ...items[itemIdx]!, hidden: !items[itemIdx]!.hidden };
      next[groupIdx] = { ...next[groupIdx]!, items };
      return next;
    });
    setSavedFlash(false);
  }

  function clearGroupDrag() {
    setGroupDrag(null);
    setGroupOver(null);
  }

  function clearItemDrag() {
    setItemDrag(null);
    setItemOver(null);
  }

  function dropGroup(toIdx: number) {
    if (groupDrag == null) {
      clearGroupDrag();
      return;
    }
    if (groupDrag !== toIdx) moveGroup(groupDrag, toIdx);
    clearGroupDrag();
  }

  function dropItem(groupIdx: number, toIdx: number) {
    if (!itemDrag || itemDrag.groupIdx !== groupIdx) {
      clearItemDrag();
      return;
    }
    if (itemDrag.itemIdx !== toIdx) moveItemInGroup(groupIdx, itemDrag.itemIdx, toIdx);
    clearItemDrag();
  }

  function resetDefaults() {
    const draft = buildDraft({}, t, tp);
    setGroups(draft);
    setSavedFlash(false);
    setError(null);
  }

  async function onSave() {
    if (!groups || !canManage) return;
    setError(null);
    setSavedFlash(false);

    // Always persist the editor's current order/labels. Never rebuild UI from a possibly-stale
    // server payload after save — that was snapping the list back to the previous order.
    const layout = toLayout(groups);

    const nom: NomenclatureOverrides = { ...(data?.nomenclatureOverrides ?? {}) };
    let nomChanged = false;
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.termKey) continue;
        const trimmed = item.label.trim();
        if (!trimmed || trimmed === item.baseLabel) continue;
        const prev = nom[item.termKey] ?? {};
        nom[item.termKey] = item.termPlural
          ? { singular: prev.singular, plural: trimmed }
          : { singular: trimmed, plural: prev.plural };
        nomChanged = true;
      }
    }

    try {
      if (nomChanged) await saveNom.mutateAsync(nom);
      await saveNav.mutateAsync(layout);
      const savedJson = layoutJson(layout);
      appliedServerJson.current = savedJson;
      setBaselineJson(savedJson);
      setSavedFlash(true);
    } catch (e) {
      setError(formatPortalError(e, 'Failed to save navigation'));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Navigation</CardTitle>
          <CardDescription>
            Drag to reorder, edit names, or hide links from the sidebar. Changes apply for everyone.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={resetDefaults} disabled={!canManage}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void onSave()}
            disabled={!canManage || !dirty || saveNav.isPending || saveNom.isPending}
            loading={saveNav.isPending || saveNom.isPending}
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </CardHeader>

      <div className="flex flex-col gap-3 px-5 pb-5">
        {error && <p className="text-sm text-danger">{error}</p>}
        {savedFlash && !dirty && <p className="text-sm text-success">Navigation saved — check the sidebar.</p>}
        {dirty && canManage && <p className="text-sm text-text-muted">Unsaved changes</p>}
        {!canManage && (
          <p className="text-sm text-text-muted">You can view the layout but need manage permission to change it.</p>
        )}

        {groups.map((group, gIdx) => (
          <div
            key={group.id}
            className={cn(
              'rounded-lg border border-border bg-surface-muted/30 transition-[opacity,border-color]',
              groupDrag === gIdx && 'opacity-40',
              groupOver === gIdx && groupDrag !== null && groupDrag !== gIdx && 'border-primary',
            )}
            onDragOver={(e) => {
              if (itemDrag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (groupOver !== gIdx) setGroupOver(gIdx);
            }}
            onDragLeave={() => {
              if (groupOver === gIdx) setGroupOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (itemDrag) return;
              dropGroup(gIdx);
            }}
          >
            <div
              ref={(el) => {
                groupRowRefs.current[gIdx] = el;
              }}
              className="flex items-center gap-2 border-b border-border/60 px-3 py-2"
            >
              <DragHandle
                disabled={!canManage}
                draggable={canManage}
                onDragStart={(e) => {
                  if (!canManage) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', `group:${gIdx}`);
                  setRowDragImage(e, groupRowRefs.current[gIdx]);
                  setGroupDrag(gIdx);
                  clearItemDrag();
                }}
                onDragEnd={clearGroupDrag}
              />
              <input
                value={group.label}
                disabled={!canManage}
                onChange={(e) => {
                  const label = e.target.value;
                  setSavedFlash(false);
                  setGroups((prev) => {
                    if (!prev) return prev;
                    const next = prev.slice();
                    next[gIdx] = { ...next[gIdx]!, label };
                    return next;
                  });
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-surface px-2 text-xs font-semibold uppercase tracking-wide text-text-secondary outline-none focus:border-primary"
                aria-label={`Category name for ${group.baseLabel}`}
              />
            </div>

            <ul className="flex flex-col gap-0.5 p-2">
              {group.items.map((item, iIdx) => {
                const rowKey = `${group.id}:${item.id}`;
                const lockedVisible = NAV_ALWAYS_VISIBLE.has(item.id);
                const dragging = itemDrag?.groupIdx === gIdx && itemDrag.itemIdx === iIdx;
                const over =
                  itemOver?.groupIdx === gIdx &&
                  itemOver.itemIdx === iIdx &&
                  itemDrag != null &&
                  !(itemDrag.groupIdx === gIdx && itemDrag.itemIdx === iIdx);
                return (
                  <li
                    key={item.id}
                    ref={(el) => {
                      itemRowRefs.current[rowKey] = el;
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-md bg-surface px-2 py-1.5 transition-[opacity,box-shadow]',
                      dragging && 'opacity-40',
                      over && 'ring-1 ring-primary',
                      item.hidden && 'opacity-60',
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      if (itemOver?.groupIdx !== gIdx || itemOver?.itemIdx !== iIdx) {
                        setItemOver({ groupIdx: gIdx, itemIdx: iIdx });
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dropItem(gIdx, iIdx);
                    }}
                  >
                    <DragHandle
                      disabled={!canManage}
                      draggable={canManage}
                      onDragStart={(e) => {
                        if (!canManage) {
                          e.preventDefault();
                          return;
                        }
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', `item:${gIdx}:${iIdx}`);
                        setRowDragImage(e, itemRowRefs.current[rowKey]);
                        setItemDrag({ groupIdx: gIdx, itemIdx: iIdx });
                        clearGroupDrag();
                      }}
                      onDragEnd={clearItemDrag}
                    />
                    <input
                      value={item.label}
                      disabled={!canManage}
                      onChange={(e) => {
                        const label = e.target.value;
                        setSavedFlash(false);
                        setGroups((prev) => {
                          if (!prev) return prev;
                          const next = prev.slice();
                          const items = next[gIdx]!.items.slice();
                          items[iIdx] = { ...items[iIdx]!, label };
                          next[gIdx] = { ...next[gIdx]!, items };
                          return next;
                        });
                      }}
                      className={cn(
                        'h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-surface px-2 text-sm text-text-primary outline-none focus:border-primary',
                        item.hidden && 'text-text-muted line-through',
                      )}
                      aria-label={`Nav label for ${item.baseLabel}`}
                    />
                    <button
                      type="button"
                      disabled={!canManage || lockedVisible}
                      onClick={() => toggleItemHidden(gIdx, iIdx)}
                      title={
                        lockedVisible
                          ? 'This link cannot be hidden'
                          : item.hidden
                            ? 'Show in sidebar'
                            : 'Hide from sidebar'
                      }
                      aria-label={
                        lockedVisible
                          ? `${item.baseLabel} cannot be hidden`
                          : item.hidden
                            ? `Show ${item.baseLabel}`
                            : `Hide ${item.baseLabel}`
                      }
                      className={cn(
                        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-text-secondary transition-colors',
                        'hover:bg-surface-muted hover:text-text-primary',
                        'disabled:cursor-not-allowed disabled:opacity-40',
                        item.hidden && 'border-warning/40 text-warning',
                      )}
                    >
                      {item.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
