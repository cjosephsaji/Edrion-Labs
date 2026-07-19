'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, GraduationCap, LogOut, Rocket } from 'lucide-react';
import { cn } from '@edrion/ui';
import { usePortalMe } from '@/lib/hooks';
import { usePermissions } from '@/lib/permissions';
import { usePortalClient } from '@/lib/portal-client';
import { clearPortalSession } from '@/lib/portal-session';
import { isNavItemActive } from '@/lib/nav';
import { resolveNav } from '@/lib/resolve-nav';
import { useTerm } from '@/lib/term';

const COLLAPSE_KEY = 'edrion.portal.sidebar.collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const client = usePortalClient();
  const { data: me } = usePortalMe();
  const { can } = usePermissions();
  const { t, tp, type } = useTerm();
  const [collapsed, setCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  const navGroups = resolveNav(me?.navigation, {
    can,
    institutionType: type,
    term: t,
    termPlural: tp,
  });

  async function handleLogout() {
    try {
      await client.post('/portal/auth/logout', { mode: 'institution' }, {});
    } catch {
      // session already gone — proceed anyway
    }
    clearPortalSession(qc);
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

  const effectiveCollapsed = collapsed || isNarrow;

  // While the institution is still onboarding, admins get a pinned "Getting started" entry so
  // they can return to the setup wizard at any point. Disappears the moment they go live.
  const showOnboarding =
    !!me && me.onboardingStatus !== 'completed' && me.institutionStatus === 'onboarding' && can('institution_settings.manage');
  const onboardingActive = pathname === '/onboarding';

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-white/10 bg-sidebar text-sidebar-text shadow-lg transition-[width] duration-200 ease-standard',
        effectiveCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      {/* Brand */}
      <div className="flex h-topbar shrink-0 items-center gap-2.5 px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
          <GraduationCap className="h-5 w-5" />
        </span>
        {!effectiveCollapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-white">
              {me?.institutionName ?? 'Edrion'}
            </div>
            <div className="text-xs text-sidebar-muted">Education OS</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Primary" className="scrollbar-thin flex-1 overflow-y-auto px-2.5 py-3">
        {showOnboarding && (
          <div className="mb-3">
            <ul className="space-y-0.5">
              <li>
                <Link
                  href="/onboarding"
                  title={effectiveCollapsed ? 'Getting started' : undefined}
                  aria-current={onboardingActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-100',
                    onboardingActive
                      ? 'bg-sidebar-active text-sidebar shadow-sm'
                      : 'text-sidebar-text hover:bg-white/[0.08] hover:text-white',
                    effectiveCollapsed && 'justify-center px-0',
                  )}
                >
                  <Rocket className="h-[18px] w-[18px] shrink-0" />
                  {!effectiveCollapsed && <span className="truncate">Getting started</span>}
                </Link>
              </li>
            </ul>
          </div>
        )}
        {navGroups.map((group) => (
            <div key={group.id} className="mb-3">
              {!effectiveCollapsed && (
                <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const Icon = item.icon;
                  const label = item.displayLabel;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        title={effectiveCollapsed ? label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-100',
                          active
                            ? 'bg-sidebar-active text-sidebar shadow-sm'
                            : 'text-sidebar-text hover:bg-white/[0.08] hover:text-white',
                          effectiveCollapsed && 'justify-center px-0',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {!effectiveCollapsed && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </nav>

      {/* Profile + collapse */}
      <div className="relative shrink-0 border-t border-white/10 p-3">
        <div className={cn('rounded-xl bg-white/[0.06] p-2 ring-1 ring-white/10', effectiveCollapsed && 'bg-transparent p-0 ring-0')}>
        <div className={cn('flex items-center gap-3', effectiveCollapsed && 'justify-center')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
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
        </div>

        <button
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          className={cn(
            'mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/[0.08] hover:text-white',
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
