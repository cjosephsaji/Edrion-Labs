'use client';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from './cn';
import { TableSkeleton } from './skeleton';
import { EmptyState } from './states';

export type SortDir = 'asc' | 'desc';

export interface Column<T> {
  /** Stable id; also the `sortBy` value sent to the server when `sortable`. */
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Cell renderer. Defaults to `String((row as any)[key])`. */
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Server-driven sort state + change handler (toggles dir when the same key is clicked). */
  sortBy?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  /** Server pagination (1-based). */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  /** Trailing actions column (edit/delete). Rendered right-aligned, click-isolated. */
  rowActions?: (row: T) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Screen-reader caption describing the table (visually hidden). */
  caption?: string;
}

/**
 * Server-driven data table. Presentational only — sorting, paging and filtering are CONTROLLED
 * by the parent (which fetches the page from the API), so the same component backs every portal
 * directory regardless of the data source. No client-side data manipulation, no row-count lies.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  sortBy,
  sortDir,
  onSort,
  page,
  pageSize,
  total,
  onPageChange,
  onRowClick,
  rowActions,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  caption,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const align = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="text-left">
              {columns.map((c) => {
                const active = c.sortable && sortBy === c.key;
                const Icon = !c.sortable
                  ? null
                  : active
                    ? sortDir === 'asc'
                      ? ChevronUp
                      : ChevronDown
                    : ChevronsUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}
                    className={cn(
                      'h-table-header whitespace-nowrap border-b border-border bg-background-secondary/70 px-4 text-[11px] font-semibold uppercase tracking-wide text-text-muted first:pl-5 last:pr-5',
                      align(c.align),
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort?.(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-text-primary',
                          active && 'text-text-primary',
                        )}
                      >
                        {c.header}
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className="h-table-row w-10 px-4">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          {!loading && rows.length > 0 && (
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-[background-color,box-shadow] duration-100',
                    onRowClick && 'cursor-pointer hover:bg-primary-soft/45',
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'h-table-row border-b border-border/80 px-4 text-text-primary first:pl-5 last:pr-5',
                        align(c.align),
                        c.className,
                      )}
                    >
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                  {rowActions && (
                    <td
                      className="h-table-row border-b border-border/80 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {loading && <TableSkeleton rows={pageSize > 10 ? 10 : pageSize} cols={columns.length} />}
      {!loading && rows.length === 0 && (
        <div className="p-6">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}

      {/* Footer / pagination */}
      <nav
        aria-label="Table pagination"
        className="flex items-center justify-between gap-3 bg-surface px-4 py-3 text-sm text-text-muted"
      >
        <span aria-live="polite">
          {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <PagerButton disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
            Previous
          </PagerButton>
          <span className="px-2 tabular-nums">
            Page {page} / {totalPages}
          </span>
          <PagerButton disabled={page >= totalPages || loading} onClick={() => onPageChange(page + 1)}>
            Next
          </PagerButton>
        </div>
      </nav>
    </div>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border border-border bg-surface-elevated px-3 py-1 text-sm font-medium text-text-secondary transition-[background-color,color,border-color]',
        'hover:border-border-strong hover:bg-background-secondary hover:text-text-primary disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}
