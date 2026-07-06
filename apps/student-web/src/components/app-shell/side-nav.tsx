'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStudentClient } from '@/lib/student-client';
import { usePersona, useStudentTerm } from '@/lib/persona';
import {
  coreNav,
  filterSurfaceNav,
  institutionalNav,
  youNav,
  type NavItem,
} from '@/lib/nav';
import { useT } from '@/i18n/use-t';

export function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href));
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? 'bg-st-accentDeep/10 text-st-accentDeep'
          : 'text-st-muted hover:bg-st-accentDeep/5 hover:text-st-ink'
      }`}
    >
      <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
      <span className="flex items-center gap-1">
        {item.label}
        {item.sparkle && <span className="text-st-amber">✦</span>}
      </span>
    </Link>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const { me } = usePersona();
  const terms = useStudentTerm();
  const { t } = useT();
  const router = useRouter();
  const client = useStudentClient();

  const instItems = me?.kind === 'institutional' ? institutionalNav(terms) : [];
  const surfaceItems = me?.kind === 'institutional' ? filterSurfaceNav(me.surfaces) : [];

  async function logout() {
    try {
      await client.post('/auth/logout');
    } catch {
      // redirect anyway
    }
    router.push('/login');
  }

  const sub =
    me?.kind === 'institutional'
      ? [me.student?.className, me.student?.curriculumLabel].filter(Boolean).join(' · ') ||
        me.institution?.name
      : t('shell.independentLearner');

  return (
    <aside className="hidden min-[921px]:flex w-[238px] shrink-0 flex-col border-r border-st-bd1 bg-st-surface2">
      <div className="border-b border-st-bd1 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-st-accent text-sm font-bold text-white">
            E
          </span>
          <div className="leading-tight">
            <p className="font-display text-base font-semibold text-st-ink">Edrion</p>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-st-faint">
              {t('shell.portalLabel')}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        <div className="space-y-1">
          {coreNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        {instItems.length > 0 && (
          <div>
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-st-faint">
              {terms.instLabel}
            </p>
            <div className="space-y-1">
              {[...instItems, ...surfaceItems].map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-st-faint">YOU</p>
          <div className="space-y-1">
            {youNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </nav>

      {me && (
        <div className="border-t border-st-bd1 p-3">
          <div className="rounded-xl bg-st-card p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-st-accentSoft text-sm font-bold text-st-accentDeep">
                {me.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-st-ink">{me.fullName}</p>
                <p className="truncate text-xs text-st-muted">{sub}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-3 w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-st-muted hover:bg-st-accentSoft/50 hover:text-st-ink"
            >
              {t('shell.logout')}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
