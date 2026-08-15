'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Bell, ChevronRight, LayoutGrid, LogOut, RotateCcw, Settings, Star, UserRound, X } from 'lucide-react';
import { STUDENT_NAV, type NavItem } from '@/lib/nav';
import { useStudentLogout, useStudentMe, type StudentMe } from '@/lib/hooks';
import { useStudentPreferences } from '@/lib/preferences';
import { PetrosContextAssistant } from '@/components/petros/petros-context-assistant';

function canSee(me: StudentMe | undefined, permission?: string, surface?: string): boolean {
  if (!me) return !permission && !surface;
  if (permission && !me.permissions.includes(permission) && !me.permissions.includes('*')) return false;
  if (surface && me.surfaces[surface] === false) return false;
  return true;
}

function matchesPersona(me: StudentMe | undefined, href: string) {
  if (!me || me.kind === 'independent') return true;
  const college = Boolean(me.programmeName);
  if (college && (href === '/classes' || href === '/homework')) return false;
  if (!college && (href === '/courses' || href === '/assignments')) return false;
  return true;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function uniqueItems(items: Array<NavItem | undefined>) {
  const seen = new Set<string>();
  return items.filter((item): item is NavItem => {
    if (!item || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function PortalTab({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  const router = useRouter();

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const startTransition = (document as Document & { startViewTransition?: (callback: () => void) => void }).startViewTransition;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true';
    if (!startTransition || reduceMotion) {
      onNavigate?.();
      return;
    }
    event.preventDefault();
    startTransition.call(document, () => {
      onNavigate?.();
      router.push(item.href);
    });
  }

  return (
    <Link
      href={item.href}
      onClick={navigate}
      aria-current={active ? 'page' : undefined}
      className={`portal-tab ${active ? 'portal-tab-active' : ''}`}
    >
      {item.href === '/home' ? 'Portal' : item.label}
    </Link>
  );
}

function DirectoryLink({
  item,
  pathname,
  onNavigate,
  favorite,
  canFavorite,
  onToggleFavorite,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
  favorite: boolean;
  canFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <div className="portal-directory-link-row" data-current={active || undefined}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="portal-directory-link"
      >
        <span>{item.label}</span>
        {active ? <span className="portal-directory-current">Current</span> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
      </Link>
      <button
        type="button"
        className="portal-favorite-button"
        data-favorite={favorite || undefined}
        onClick={onToggleFavorite}
        disabled={!favorite && !canFavorite}
        aria-pressed={favorite}
        aria-label={`${favorite ? 'Remove' : 'Add'} ${item.label} ${favorite ? 'from' : 'to'} quick navigation`}
        title={!favorite && !canFavorite ? 'Quick navigation is full' : favorite ? 'Remove from quick navigation' : 'Add to quick navigation'}
      >
        <Star aria-hidden="true" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useStudentMe();
  const logout = useStudentLogout();
  const preferences = useStudentPreferences();
  const [menuPhase, setMenuPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [headerCompact, setHeaderCompact] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLElement>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuOpen = menuPhase === 'open';

  const sections = useMemo(
    () =>
      STUDENT_NAV.map((section) => ({
        ...section,
        items: section.items.filter((item) => canSee(me, item.permission, item.surface) && matchesPersona(me, item.href)),
      })).filter((section) => section.items.length > 0),
    [me],
  );

  const allItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const itemAt = (href: string) => allItems.find((item) => item.href === href);
  const workItem = itemAt('/homework') ?? itemAt('/assignments');
  const classItem = itemAt('/classes') ?? itemAt('/courses');
  const defaultQuickItems = uniqueItems([
    itemAt('/home'),
    classItem,
    workItem,
    itemAt('/timetable'),
    itemAt('/calendar'),
  ]);
  const selectedQuickHrefs = preferences.quickNav ?? defaultQuickItems.map((item) => item.href);
  const primaryTabs = selectedQuickHrefs
    .map((href) => itemAt(href))
    .filter((item): item is NavItem => Boolean(item));
  const visibleQuickHrefs = primaryTabs.map((item) => item.href);
  const mobileTabs = primaryTabs.slice(0, 4);

  const toggleFavorite = (href: string) => {
    const current = preferences.quickNav ? visibleQuickHrefs : defaultQuickItems.map((item) => item.href);
    preferences.setQuickNav(current.includes(href)
      ? current.filter((item) => item !== href)
      : [...current, href]);
  };
  useEffect(() => {
    const college = Boolean(me?.programmeName);
    document.documentElement.dataset.persona = me?.kind === 'independent' ? 'independent' : college ? 'college' : 'school';
  }, [me]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuPhase((phase) => phase === 'closed' ? phase : 'closing');
    if (menuCloseTimerRef.current) window.clearTimeout(menuCloseTimerRef.current);
    menuCloseTimerRef.current = setTimeout(() => {
      setMenuPhase('closed');
      if (restoreFocus) menuTriggerRef.current?.focus();
    }, 180);
  }, []);

  useEffect(() => {
    setMenuPhase('closed');
    if (menuCloseTimerRef.current) window.clearTimeout(menuCloseTimerRef.current);
  }, [pathname]);

  useEffect(() => () => {
    if (menuCloseTimerRef.current) window.clearTimeout(menuCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (menuPhase === 'closed') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = menuPanelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    if (menuPhase === 'open') focusable?.[0]?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (menuPhase !== 'open') return;
      if (event.key === 'Escape') {
        closeMenu(true);
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [closeMenu, menuPhase]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setHeaderCompact((compact) => (compact ? window.scrollY > 8 : window.scrollY > 56));
        frame = 0;
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const firstName = me?.fullName?.split(' ')[0] || 'Student';
  const initial = firstName.slice(0, 1).toUpperCase();
  const learnerLine = [me?.className, me?.sectionName, me?.termName].filter(Boolean).join(' · ');
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(today).toUpperCase();
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(today);
  const year = today.getFullYear();

  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    menuTriggerRef.current = event.currentTarget;
    if (menuCloseTimerRef.current) window.clearTimeout(menuCloseTimerRef.current);
    setMenuPhase('open');
  };

  return (
    <div className="student-shell min-h-screen bg-[var(--s-page)] text-[var(--s-ink)]">
      <header className={`portal-header sticky top-0 z-40 ${headerCompact ? 'is-compact' : ''}`}>
        <div className="portal-masthead">
          <div className="portal-brand-group">
            <Link href="/home" className="portal-brand" aria-label="Edrion student portal home">
              <span className="portal-brand-word">edrion</span>
            </Link>
            <span className="portal-brand-divider" aria-hidden="true" />
            <span className="portal-context">Student portal</span>
          </div>
          <div className="portal-date" suppressHydrationWarning aria-label={`${weekday}, ${day} ${month} ${year}`}>
            <span className="portal-date-weekday">{weekday}</span>
            <span className="portal-date-number">{day}</span>
            <span className="portal-date-unit">{month}</span>
            <span className="portal-date-year">{year}</span>
          </div>
        </div>

        <div className="portal-nav-row">
          <nav className="portal-tabs" aria-label="Student portal">
            {primaryTabs.map((item) => <PortalTab key={item.href} item={item} pathname={pathname} />)}
            <button type="button" onClick={openMenu} className="portal-tab portal-more" aria-expanded={menuOpen} aria-controls="portal-directory"><LayoutGrid className="h-4 w-4" aria-hidden="true" />Explore</button>
          </nav>
          <Link href="/profile" className="portal-identity">
            <span className="portal-avatar">{initial}</span>
            <span className="min-w-0">
              <span className="portal-identity-name">{me?.fullName ?? 'Student'}</span>
              <span className="portal-identity-meta">{learnerLine || me?.email || 'STUDENT ACCOUNT'}</span>
            </span>
          </Link>
        </div>
      </header>

      <main key={pathname} className="portal-main page-enter min-h-[calc(100vh-114px)] px-4 pb-24 pt-8 min-[921px]:px-10 min-[921px]:pb-16 min-[921px]:pt-12">
        {children}
      </main>

      <nav className="portal-mobile-nav min-[921px]:hidden" aria-label="Quick navigation">
        {mobileTabs.map((item) => <PortalTab key={item.href} item={item} pathname={pathname} />)}
        <button type="button" onClick={openMenu} className="portal-tab" aria-expanded={menuOpen} aria-controls="portal-directory"><LayoutGrid className="h-4 w-4" aria-hidden="true" />Explore</button>
      </nav>

      <PetrosContextAssistant route={pathname} />

      {menuPhase !== 'closed' ? (
        <div className="portal-directory-layer" data-state={menuPhase}>
          <button className="portal-directory-backdrop" onClick={() => closeMenu(true)} aria-label="Close portal directory" />
          <section ref={menuPanelRef} id="portal-directory" className="portal-menu" role="dialog" aria-modal="true" aria-labelledby="portal-directory-title">
            <div className="portal-menu-head">
              <div>
                <p className="portal-menu-kicker">Quick navigation · {primaryTabs.length}/5 starred</p>
                <h2 id="portal-directory-title" className="portal-menu-title">Portal directory</h2>
                <p className="portal-menu-description">Star up to five pages to keep them in your quick navigation.</p>
              </div>
              <div className="portal-menu-head-actions">
                {preferences.quickNav ? (
                  <button type="button" onClick={preferences.resetQuickNav} className="portal-menu-close" aria-label="Restore default quick navigation" title="Restore defaults"><RotateCcw className="h-4 w-4" /></button>
                ) : null}
                <button type="button" onClick={() => closeMenu(true)} className="portal-menu-close" aria-label="Close portal directory" title="Close"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="portal-menu-groups">
              {sections.map((section) => (
                <section key={section.id} className="portal-directory-group">
                  <p className="portal-menu-label">{section.label}</p>
                  <div className="portal-menu-links">
                    {section.items.map((item) => (
                      <DirectoryLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        onNavigate={() => closeMenu(false)}
                        favorite={visibleQuickHrefs.includes(item.href)}
                        canFavorite={visibleQuickHrefs.length < 5}
                        onToggleFavorite={() => toggleFavorite(item.href)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="portal-menu-foot">
              <div className="portal-menu-account">
                <span className="portal-menu-account-avatar">{initial}</span>
                <span><strong>{me?.fullName ?? 'Student'}</strong><small>{learnerLine || me?.email || 'Student account'}</small></span>
              </div>
              <div className="portal-menu-actions">
                <Link href="/profile" onClick={() => closeMenu(false)}><UserRound className="h-4 w-4" />Profile</Link>
                <Link href="/notifications" onClick={() => closeMenu(false)}><Bell className="h-4 w-4" />Notifications</Link>
                {itemAt('/settings') ? <Link href="/settings" onClick={() => closeMenu(false)}><Settings className="h-4 w-4" />Settings</Link> : null}
                <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut className="h-4 w-4" />{logout.isPending ? 'Signing out…' : 'Sign out'}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
