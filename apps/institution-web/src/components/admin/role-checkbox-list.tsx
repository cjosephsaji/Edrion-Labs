'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { rankRolesForSearch } from '@/lib/role-search';
import type { RoleSearchable } from '@/lib/role-search';

/** Searchable checkbox list for institution portal roles. */
export function RoleCheckboxList({
  roles,
  selected,
  onToggle,
  disabled,
  searchPlaceholder = 'Search roles — try "Professor and HOD"',
  emptyText = 'No roles available.',
  maxHeightClass = 'max-h-72',
}: {
  roles: readonly RoleSearchable[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  maxHeightClass?: string;
}) {
  const [query, setQuery] = useState('');
  const ranked = useMemo(() => rankRolesForSearch(roles, query), [roles, query]);

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-background-secondary/40 px-2.5">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          disabled={disabled}
          aria-label="Search portal roles"
          className="h-10 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
        />
      </div>

      {ranked.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-text-muted">{emptyText}</p>
      ) : (
        <ul className={`divide-y divide-border overflow-y-auto overscroll-contain ${maxHeightClass}`}>
          {ranked.map((role) => (
            <li key={role.key} className="flex items-start gap-2.5 px-3 py-2">
              <input
                type="checkbox"
                checked={selected.has(role.key)}
                onChange={() => onToggle(role.key)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{role.name}</p>
                <p className="text-xs text-text-muted">{role.description ?? role.key}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
