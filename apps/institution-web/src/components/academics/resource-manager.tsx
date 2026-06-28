'use client';
import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  PermissionDenied,
  type Column,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useScope } from '@/lib/scope';
import { useAcademicList, useAcademicMutations, type ListParams } from '@/lib/academics';
import { PortalClientError } from '@/lib/portal-client';
import { ResourceForm, type FieldDef } from './resource-form';

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

interface MutationLike<TArgs> {
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
  /** Singular noun for buttons/dialogs, e.g. "academic year". */
  noun: string;
  columns: Column<TRow>[];
  fields: FieldDef[];
  defaultSortBy?: string;
  defaultSortDir?: 'asc' | 'desc';
  searchable?: boolean;
  /** Map a row to the form's initial values (for editing). */
  toFormValues: (row: TRow) => Record<string, unknown>;
  /** Extra per-row actions rendered before Edit/Delete (e.g. "Subjects" on a class). */
  extraActions?: (row: TRow) => React.ReactNode;
  /** Human label for a row in confirm dialogs. */
  rowLabel?: (row: TRow) => string;
  /** Permission keys gating view/create/update/delete. Defaults to the academics keys. */
  permissions?: ResourcePermissions;
  /** Data hooks. Default to the academics client; People injects its own (same shapes, /people/*). */
  useList?: ResourceListHook;
  useMutations?: ResourceMutationsHook;
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
  const perms = props.permissions ?? ACADEMICS_PERMISSIONS;
  const useList = props.useList ?? (useAcademicList as unknown as ResourceListHook);
  const useMutations = props.useMutations ?? (useAcademicMutations as unknown as ResourceMutationsHook);
  const canCreate = can(perms.create);
  const canUpdate = can(perms.update);
  const canDelete = can(perms.delete);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(props.defaultSortBy);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(props.defaultSortDir ?? 'asc');
  const [search, setSearch] = useState('');

  const params: ListParams = { page, pageSize: PAGE_SIZE, sortBy, sortDir, search: search || undefined };
  const { data, isLoading, isError } = useList(props.resource, params);
  const { create, update, remove } = useMutations(props.resource);
  const rows = (data?.items ?? []) as TRow[];
  const total = data?.total ?? 0;

  const [editing, setEditing] = useState<TRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
    if (err instanceof PortalClientError) return err.message;
    return 'Something went wrong. Try again.';
  }

  async function submitCreate(body: Record<string, unknown>) {
    setFormError(null);
    try {
      await create.mutateAsync(body);
      setCreating(false);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function submitUpdate(body: Record<string, unknown>) {
    if (!editing) return;
    setFormError(null);
    try {
      await update.mutateAsync({ id: editing.id, body: { ...body, version: editing.version } });
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            Viewing <span className="font-medium text-text-primary">{activeLabel}</span>
          </p>
          {props.searchable !== false && (
            <div className="relative w-64 max-w-[60%]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={`Search ${props.title.toLowerCase()}…`}
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
                      <IconButton label="Edit" onClick={() => { setFormError(null); setEditing(row); }}>
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
        fields={props.fields}
        initial={{}}
        submitting={create.isPending}
        error={formError}
        onSubmit={submitCreate}
        onClose={() => setCreating(false)}
      />

      {/* Edit */}
      <ResourceForm
        open={!!editing}
        title={`Edit ${props.noun}`}
        fields={props.fields}
        initial={editing ? props.toFormValues(editing) : {}}
        submitting={update.isPending}
        error={formError}
        onSubmit={submitUpdate}
        onClose={() => setEditing(null)}
      />

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
