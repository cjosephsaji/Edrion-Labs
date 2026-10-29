'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  PermissionDenied,
  type Column,
  type DetailSection,
  Select,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { RecordDetailDialog } from '@/components/common/record-detail-dialog';
import { usePermissions } from '@/lib/permissions';
import { useScope } from '@/lib/scope';
import { useAcademicList, useAcademicMutations, type ListParams } from '@/lib/academics';
import { formatPortalError } from '@/lib/portal-client';
import { ResourceForm, type FieldDef, type ResourceFormExtraApi } from './resource-form';

/** A toolbar facet dropdown; the chosen value is sent to the API as an extra list query param. */
export interface FilterDef {
  /** Query-param key sent to the API (e.g. "status", "submittedVia"). */
  key: string;
  /** Accessible label / placeholder ("All statuses"). */
  label: string;
  options: { value: string; label: string }[];
}

/** Per-action permission keys for a directory (academics collapses create/update/delete to `manage`). */
export interface ResourcePermissions {
  view: string;
  create: string;
  update: string;
  delete: string;
}

/**
 * A list hook: takes a resource segment + params, returns a react-query-shaped result. Items are
 * `unknown[]` here so a concrete generic hook (useAcademicList<T> / usePeopleList<T>) is assignable;
 * ResourceManager casts the rows back to its own TRow.
 */
export type ResourceListHook = (
  resource: string,
  params: ListParams,
) => { data?: { items: unknown[]; total: number } | undefined; isLoading: boolean; isError: boolean };

export interface MutationLike<TArgs> {
  mutateAsync: (args: TArgs) => Promise<unknown>;
  isPending: boolean;
}
/** A mutations hook bound to one resource (create/update/delete). */
export type ResourceMutationsHook = (resource: string) => {
  create: MutationLike<Record<string, unknown>>;
  update: MutationLike<{ id: string; body: Record<string, unknown> }>;
  remove: MutationLike<{ id: string; version: number }>;
};

const ACADEMICS_PERMISSIONS: ResourcePermissions = {
  view: 'academics.view',
  create: 'academics.manage',
  update: 'academics.manage',
  delete: 'academics.manage',
};

export interface ResourceManagerProps<TRow extends { id: string; version: number }> {
  resource: string;
  title: string;
  /** Page-specific panels inside the standard padded content area, below the topbar. */
  beforeList?: React.ReactNode;
  /** Singular noun for buttons/dialogs, e.g. "academic year". */
  noun: string;
  columns: Column<TRow>[];
  fields: FieldDef[];
  /** Extra fields shown only in the create drawer (e.g. createLogin, roleKeys on staff). */
  createFields?: FieldDef[];
  /** Initial form values when creating a row (merged into the create drawer). */
  createInitialValues?: Record<string, unknown>;
  defaultSortBy?: string;
  defaultSortDir?: 'asc' | 'desc';
  searchable?: boolean;
  /** Map a row to the form's initial values (for editing). */
  toFormValues: (row: TRow) => Record<string, unknown>;
  /** Extra per-row actions rendered before Edit/Delete (e.g. "Subjects" on a class). */
  extraActions?: (row: TRow) => React.ReactNode;
  /** Optional toolbar facet dropdowns; selected values are sent to the list hook as extra params. */
  filters?: FilterDef[];
  /** Controlled facet values (use with `onFilterChange` for cascading programme filters). */
  filterValues?: Record<string, string>;
  /** Controlled facet handler; when set, facet state is owned by the parent. */
  onFilterChange?: (key: string, value: string) => void;
  /** Always-applied facet values merged into list params (e.g. global academic context). */
  extraFilters?: Record<string, string | undefined>;
  /** Human label for a row in confirm dialogs. */
  rowLabel?: (row: TRow) => string;
  /** Permission keys gating view/create/update/delete. Defaults to the academics keys. */
  permissions?: ResourcePermissions;
  /** Data hooks. Default to the academics client; People injects its own (same shapes, /people/*). */
  useList?: ResourceListHook;
  useMutations?: ResourceMutationsHook;
  /**
   * Read-only detail shown on row click. When omitted, a sensible panel is auto-built from the
   * columns + remaining scalar fields, so every list gets "view without editing" for free; pages
   * pass `detail` to curate/group the fields. Set `disableDetail` to opt out entirely.
   */
  detail?: (row: TRow) => DetailSection[];
  /** Optional avatar/name header block above the detail sections. */
  detailHeader?: (row: TRow) => React.ReactNode;
  /** Title for the detail panel (defaults to `rowLabel` / the record's name). */
  detailTitle?: (row: TRow) => string;
  /**
   * Replace the built-in sliding {@link DetailPanel} shown on row click with a custom renderer
   * (e.g. the tabbed user-details popup). Always mounted like the panel is; the renderer returns
   * `null` while `open` is false. When set, `detail`/`detailHeader`/`detailTitle` are ignored.
   */
  renderDetail?: (ctx: {
    row: TRow | null;
    open: boolean;
    onClose: () => void;
    /** Close the popup and open the edit form for the current row (no-op if the user can't edit). */
    edit: () => void;
    canEdit: boolean;
  }) => React.ReactNode;
  /**
   * When set, "New" navigates here instead of opening the create drawer (e.g. `/exams/new`).
   */
  createHref?: string;
  /**
   * When set, row Edit navigates here instead of opening the edit drawer.
   */
  getEditHref?: (row: TRow) => string;
  /** Optional block below the standard fields in the edit drawer (e.g. guardians, role permissions). */
  renderFormExtra?: (ctx: { row: TRow; mode: 'edit' } & ResourceFormExtraApi) => React.ReactNode;
  /** Hint shown under the edit drawer title (e.g. scroll for portal access). */
  editFormDescription?: string;
  /** Wider drawer for forms with large embedded sections. */
  editDrawerClassName?: string;
  /** Optional block below the standard fields in the create drawer. */
  renderCreateExtra?: (api: ResourceFormExtraApi) => React.ReactNode;
  /**
   * When set, replaces the default POST-on-save for creates. Use to chain extra writes (e.g.
   * subject + curriculum placement) behind a single Save button.
   */
  onSubmitCreate?: (
    body: Record<string, unknown>,
    mutations: { create: MutationLike<Record<string, unknown>> },
  ) => Promise<void>;
  /** Rich content below detail sections in the row-click popup. */
  renderDetailExtra?: (ctx: { row: TRow }) => React.ReactNode;
  /** Extra header actions in the row-click popup (publish, mark read, …). */
  detailActions?: (ctx: { row: TRow }) => React.ReactNode;
  /**
   * When set, replaces the default PATCH-on-save for edits. Use to chain extra writes (e.g. user
   * profile + roles/access) behind a single Save button.
   */
  onSubmitUpdate?: (
    row: TRow,
    body: Record<string, unknown>,
    mutations: { update: MutationLike<{ id: string; body: Record<string, unknown> }> },
  ) => Promise<void>;
  /** When false, create-login validation does not require roleKeys (e.g. parents use a fixed role). */
  requireRoleKeysOnCreateLogin?: boolean;
  disableDetail?: boolean;
}

const INTERNAL_KEYS = new Set([
  'id',
  'version',
  'institutionId',
  'campusId',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
]);

const humanize = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

/** Fallback detail sections when a page doesn't supply `detail`: the columns, then leftover scalars. */
function autoDetail<TRow extends Record<string, unknown>>(row: TRow, columns: Column<TRow>[]): DetailSection[] {
  const shown = new Set(columns.map((c) => c.key));
  const overview: DetailSection = {
    title: 'Overview',
    fields: columns.map((c) => ({
      label: c.header,
      value: c.render ? c.render(row) : String(row[c.key as keyof TRow] ?? ''),
    })),
  };
  const rest = Object.entries(row)
    .filter(
      ([k, v]) =>
        !INTERNAL_KEYS.has(k) &&
        !shown.has(k) &&
        !k.endsWith('Id') && // raw FK UUIDs are never shown; their resolved sibling (e.g. `student`) is
        (v === null || ['string', 'number', 'boolean'].includes(typeof v)),
    )
    .map(([k, v]) => ({ label: humanize(k), value: v as React.ReactNode, full: typeof v === 'string' && v.length > 60 }));
  return rest.length > 0 ? [overview, { title: 'More', fields: rest }] : [overview];
}

const PAGE_SIZE = 20;

/**
 * The reusable directory: a scope-aware, server-paginated DataTable plus a create/edit Drawer form
 * and a delete confirm, driven by a field list + column list. Permissions and the data hooks are
 * injectable (default: academics), so the same component backs every Phase-2 academic screen AND
 * the Phase-4 people screens. The API re-checks every permission — hiding buttons is convenience
 * only.
 */
export function ResourceManager<TRow extends { id: string; version: number }>(props: ResourceManagerProps<TRow>) {
  const { can } = usePermissions();
  const { activeLabel } = useScope();
  const router = useRouter();
  const perms = props.permissions ?? ACADEMICS_PERMISSIONS;
  const useList = props.useList ?? (useAcademicList as unknown as ResourceListHook);
  const useMutations = props.useMutations ?? (useAcademicMutations as unknown as ResourceMutationsHook);
  const canCreate = can(perms.create);
  const canUpdate = can(perms.update);
  const canDelete = can(perms.delete);

  // Global search deep-links here with `?q=`, so the list opens pre-filtered to the picked record.
  const initialSearch = useSearchParams().get('q') ?? '';
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(props.defaultSortBy);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(props.defaultSortDir ?? 'asc');
  const [search, setSearch] = useState(initialSearch);
  const [internalFilterValues, setInternalFilterValues] = useState<Record<string, string>>({});
  const controlledFilters = props.onFilterChange !== undefined;
  const filterValues = controlledFilters ? (props.filterValues ?? {}) : internalFilterValues;

  const params: ListParams = {
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
    search: search || undefined,
    filters: props.filters || props.extraFilters
      ? { ...props.extraFilters, ...(props.filters ? filterValues : undefined) }
      : undefined,
  };
  const { data, isLoading, isError } = useList(props.resource, params);
  const { create, update, remove } = useMutations(props.resource);
  const rows = (data?.items ?? []) as TRow[];
  const total = data?.total ?? 0;

  const [editing, setEditing] = useState<TRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TRow | null>(null);
  const [viewing, setViewing] = useState<TRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const showDetail = !props.disableDetail;

  if (!can(perms.view)) {
    return (
      <>
        <Topbar title={props.title} />
        <div className="p-6">
          <PermissionDenied description={`You don’t have permission to view ${props.title.toLowerCase()}.`} />
        </div>
      </>
    );
  }

  function onSort(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  function errorMessage(err: unknown): string {
    return formatPortalError(err);
  }

  async function submitCreate(body: Record<string, unknown>) {
    setFormError(null);
    if (body.createLogin === true) {
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const roles = Array.isArray(body.roleKeys) ? body.roleKeys : [];
      if (!email) {
        setFormError('Email is required to create a portal login.');
        return;
      }
      if ((props.requireRoleKeysOnCreateLogin ?? true) && roles.length === 0) {
        setFormError('Select at least one portal role.');
        return;
      }
    }
    if ('roleKeys' in body && !('createLogin' in body)) {
      const roles = Array.isArray(body.roleKeys) ? body.roleKeys : [];
      if (roles.length === 0) {
        setFormError('Select at least one role.');
        return;
      }
    }
    try {
      if (props.onSubmitCreate) {
        await props.onSubmitCreate(body, { create });
      } else {
        await create.mutateAsync(body);
      }
      setCreating(false);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function submitUpdate(body: Record<string, unknown>) {
    if (!editing) return;
    setFormError(null);
    try {
      if (props.onSubmitUpdate) {
        await props.onSubmitUpdate(editing, body, { update });
      } else {
        await update.mutateAsync({ id: editing.id, body: { ...body, version: editing.version } });
      }
      setEditing(null);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setFormError(null);
    try {
      await remove.mutateAsync({ id: deleting.id, version: deleting.version });
      setDeleting(null);
    } catch (err) {
      setFormError(errorMessage(err));
      setDeleting(null);
    }
  }

  const columns = props.columns;

  return (
    <>
      <Topbar
        title={props.title}
        actions={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                if (props.createHref) {
                  router.push(props.createHref);
                  return;
                }
                setFormError(null);
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New {props.noun}
            </Button>
          ) : undefined
        }
      />

      <div className="page-enter flex flex-1 flex-col gap-4 p-5">
        {props.beforeList}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-text-secondary">
              Viewing <span className="font-medium text-text-primary">{activeLabel}</span>
            </p>
            {props.filters?.map((f) => (
              <Select
                key={f.key}
                aria-label={f.label}
                value={filterValues[f.key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (controlledFilters) props.onFilterChange!(f.key, v);
                  else setInternalFilterValues((prev) => ({ ...prev, [f.key]: v }));
                  setPage(1);
                }}
                className="h-9 w-auto min-w-[8rem]"
                options={[{ value: '', label: f.label }, ...f.options]}
              />
            ))}
          </div>
          {props.searchable !== false && (
            <div className="relative w-64 max-w-[60%]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={`Search ${props.title}…`}
                className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
              />
            </div>
          )}
        </div>

        {formError && !creating && !editing && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}

        <DataTable<TRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={showDetail ? (row) => setViewing(row) : undefined}
          emptyTitle={isError ? 'Couldn’t load this list' : `No ${props.title.toLowerCase()} yet`}
          emptyDescription={
            isError
              ? 'The portal API may be offline. Retry in a moment.'
              : canCreate
                ? `Create your first ${props.noun} to get started.`
                : undefined
          }
          rowActions={
            canUpdate || canDelete || props.extraActions
              ? (row) => (
                  <div className="flex items-center justify-end gap-1">
                    {props.extraActions?.(row)}
                    {canUpdate && (
                      <IconButton
                        label="Edit"
                        onClick={() => {
                          if (props.getEditHref) {
                            router.push(props.getEditHref(row));
                            return;
                          }
                          setFormError(null);
                          setEditing(row);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                    {canDelete && (
                      <IconButton label="Delete" danger onClick={() => setDeleting(row)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    )}
                  </div>
                )
              : undefined
          }
        />
      </div>

      {/* Create */}
      <ResourceForm
        open={creating}
        title={`New ${props.noun}`}
        fields={[...props.fields, ...(props.createFields ?? [])]}
        initial={{ ...(props.createInitialValues ?? {}), createLogin: false, roleKeys: [] }}
        submitting={create.isPending}
        error={formError}
        onSubmit={submitCreate}
        onClose={() => setCreating(false)}
        extra={props.renderCreateExtra ? (api) => props.renderCreateExtra!(api) : undefined}
      />

      {/* Edit */}
      <ResourceForm
        open={!!editing}
        title={`Edit ${props.noun}`}
        description={props.editFormDescription}
        drawerClassName={props.editDrawerClassName}
        fields={props.fields}
        initial={editing ? props.toFormValues(editing) : {}}
        resetKey={editing?.id}
        submitting={update.isPending}
        error={formError}
        onSubmit={submitUpdate}
        onClose={() => setEditing(null)}
        extra={editing && props.renderFormExtra
          ? (api) => props.renderFormExtra!({ row: editing, mode: 'edit', ...api })
          : undefined}
      />

      {/* Read-only detail (row click) — custom popup when provided, else the sliding panel. */}
      {showDetail && props.renderDetail
        ? props.renderDetail({
            row: viewing,
            open: !!viewing,
            onClose: () => setViewing(null),
            canEdit: canUpdate,
            edit: () => {
              if (!canUpdate || !viewing) return;
              const row = viewing;
              setViewing(null);
              if (props.getEditHref) {
                router.push(props.getEditHref(row));
                return;
              }
              setFormError(null);
              setEditing(row);
            },
          })
        : null}

      {showDetail && !props.renderDetail && viewing && (
        <RecordDetailDialog
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={
            props.detailTitle?.(viewing) ??
            props.rowLabel?.(viewing) ??
            (viewing as { name?: string }).name ??
            props.noun
          }
          header={props.detailHeader?.(viewing)}
          sections={props.detail?.(viewing) ?? autoDetail(viewing as Record<string, unknown>, columns as Column<Record<string, unknown>>[])}
          extra={props.renderDetailExtra?.({ row: viewing })}
          headerActions={props.detailActions?.({ row: viewing })}
          canEdit={canUpdate}
          onEdit={
            canUpdate
              ? () => {
                  const row = viewing;
                  setViewing(null);
                  if (props.getEditHref) {
                    router.push(props.getEditHref(row));
                    return;
                  }
                  setFormError(null);
                  setEditing(row);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        title={`Delete ${props.noun}?`}
        description={
          deleting ? (
            <>
              This permanently removes{' '}
              <span className="font-medium text-text-primary">
                {props.rowLabel ? props.rowLabel(deleting) : (deleting as { name?: string }).name ?? 'this record'}
              </span>
              . This can’t be undone.
            </>
          ) : undefined
        }
      />
    </>
  );
}

function IconButton({
  children,
  label,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        'rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary ' +
        (danger ? 'hover:text-danger' : 'hover:text-text-primary')
      }
    >
      {children}
    </button>
  );
}
