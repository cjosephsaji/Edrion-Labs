'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, GraduationCap, LogOut } from 'lucide-react';
import { cn } from '@edrion/ui';
import { useApiClient, useCurrentEmployee } from '@edrion/api-client';
import { NAV } from '@/lib/nav';

const COLLAPSE_KEY = 'edrion.sidebar.collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const client = useApiClient();
  const { data: me } = useCurrentEmployee();
  const [collapsed, setCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  async function handleLogout() {
    try {
      await client.post('/auth/logout');
    } catch {
      // session already gone — proceed anyway
    }
    router.push('/login');
  }

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  // Auto icon-collapse below the md breakpoint so the sidebar never crowds a narrow viewport.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // On narrow screens collapse is forced; on md+ it follows the user's saved preference.
  const effectiveCollapsed = collapsed || isNarrow;

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const permitted = new Set(me?.permissions ?? []);
  const canSee = (perm: string) =>
    !me || permitted.has(perm) || me.roleKeys.includes('platform_owner');

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-sidebar text-sidebar-text transition-[width] duration-200 ease-standard',
        effectiveCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      {/* Brand */}
      <div className="flex h-topbar shrink-0 items-center gap-2.5 px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-active text-white">
          <GraduationCap className="h-5 w-5" />
        </span>
        {!effectiveCollapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Edrion</div>
            <div className="text-xs text-sidebar-muted">Super Admin</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
        {NAV.map((group) => {
          const items = group.items.filter((i) => canSee(i.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-3">
              {!effectiveCollapsed && (
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={effectiveCollapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-100',
                          active
                            ? 'bg-sidebar-active text-white'
                            : 'text-sidebar-text hover:bg-sidebar-hover',
                          effectiveCollapsed && 'justify-center px-0',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Profile + collapse */}
      <div className="relative shrink-0 border-t border-white/10 p-3">
        <div className={cn('flex items-center gap-3', effectiveCollapsed && 'justify-center')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-xs font-semibold text-white">
            {(me?.fullName ?? 'E A')
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </span>
          {!effectiveCollapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-white">{me?.fullName ?? '—'}</div>
              <div className="truncate text-xs text-sidebar-muted">{me?.email ?? ''}</div>
            </div>
          )}
          {/* Manual toggle only matters on md+; below md the sidebar is force-collapsed. */}
          {!isNarrow && (
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'text-sidebar-muted hover:text-white transition-colors duration-100',
                effectiveCollapsed
                  ? 'absolute -right-3 top-[28px] z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-sidebar shadow-md hover:bg-sidebar-hover'
                  : 'rounded-md p-1.5 hover:bg-sidebar-hover',
              )}
            >
              <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
            </button>
          )}
        </div>

        <button
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          className={cn(
            'mt-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white',
            effectiveCollapsed && 'justify-center px-0',
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!effectiveCollapsed && <span className="truncate">Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
